'use client';

import { useSyncExternalStore } from 'react';
import type { Table } from 'dexie';
import { ApiError, NetworkError, api, request } from './api';
import { db, getMeta, setMeta, type Entity, type OutboxOp } from './db';
import type { ChecklistItem, Expense, JournalEntry, Place, Trip } from './types';

// ------------------------------------------------------------------ status store
export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  needsLogin: boolean;
}

let status: SyncStatus = {
  online: true,
  syncing: false,
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
  needsLogin: false,
};
const statusListeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}
const SERVER_STATUS = status;

export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
    () => SERVER_STATUS,
  );
}

type Notice = { kind: 'info' | 'error' | 'conflict'; message: string };
const noticeListeners = new Set<(n: Notice) => void>();
export function onSyncNotice(listener: (n: Notice) => void) {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}
const notify = (n: Notice) => noticeListeners.forEach((l) => l(n));

async function refreshPending() {
  setStatus({ pending: await db.outbox.count() });
}

// ------------------------------------------------------------------ helpers
const SEGMENT: Record<Exclude<Entity, 'trips'>, string> = {
  places: 'places',
  expenses: 'expenses',
  checklist: 'checklist',
  journal: 'journal',
};

function tableOf(entity: Entity): Table<{ _id: string }, string> {
  return db[entity] as unknown as Table<{ _id: string }, string>;
}

function endpoint(op: OutboxOp) {
  if (op.entity === 'trips') return op.op === 'create' ? '/trips' : `/trips/${op.docId}`;
  const base = `/trips/${op.tripId}/${SEGMENT[op.entity]}`;
  return op.op === 'create' ? base : `${base}/${op.docId}`;
}

async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } } | undefined)?.sync;
    await sync?.register('outbox');
  } catch {
    // Background Sync unsupported (Firefox/Safari): the app flushes on reconnect instead
  }
}

// ------------------------------------------------------------------ local writes
const nowIso = () => new Date().toISOString();

async function enqueue(op: Omit<OutboxOp, 'id' | 'attempts' | 'at'>) {
  await db.outbox.add({ ...op, at: nowIso(), attempts: 0 });
  await refreshPending();
  void registerBackgroundSync();
  void flushOutbox();
}

/** Creates a document locally and queues it for the API. */
export async function createDoc<T extends { _id: string }>(entity: Entity, tripId: string, doc: T, payload: Record<string, unknown>) {
  const now = nowIso();
  await tableOf(entity).put({ createdAt: now, updatedAt: now, ...doc });
  await enqueue({ entity, op: 'create', tripId, docId: doc._id, payload: { _id: doc._id, ...payload } });
}

/** Applies changes locally and queues a PATCH with last-write-wins timestamp. */
export async function updateDoc(entity: Entity, tripId: string, id: string, changes: Record<string, unknown>, localExtra: Record<string, unknown> = {}) {
  await tableOf(entity).update(id, { ...changes, ...localExtra, updatedAt: nowIso() } as never);
  await enqueue({ entity, op: 'update', tripId, docId: id, payload: changes });
}

export async function deleteDoc(entity: Entity, tripId: string, id: string) {
  await tableOf(entity).delete(id);
  if (entity === 'trips') await removeTripLocally(id, false);
  await enqueue({ entity, op: 'delete', tripId, docId: id });
}

async function removeTripLocally(tripId: string, includeTrip = true) {
  await db.transaction('rw', [db.trips, db.places, db.expenses, db.checklist, db.journal], async () => {
    if (includeTrip) await db.trips.delete(tripId);
    await db.places.where('trip').equals(tripId).delete();
    await db.expenses.where('trip').equals(tripId).delete();
    await db.checklist.where('trip').equals(tripId).delete();
    await db.journal.where('trip').equals(tripId).delete();
  });
}

// ------------------------------------------------------------------ replay
async function withLock(fn: () => Promise<void>) {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks) return locks.request('trip-planner-outbox', { ifAvailable: true }, async (lock) => (lock ? fn() : undefined));
  return fn();
}

let flushing: Promise<void> | null = null;

/**
 * Replays queued writes in order. Stops at the first network failure (retried
 * later); drops writes the API rejects; on 409 keeps the server version
 * (last-write-wins). The service worker runs the same algorithm on Background Sync.
 */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = withLock(async () => {
    const ops = await db.outbox.orderBy('id').toArray();
    if (!ops.length) return;
    setStatus({ syncing: true, lastError: null });
    const createdTrips: string[] = [];
    for (const op of ops) {
      try {
        const method = op.op === 'create' ? 'POST' : op.op === 'update' ? 'PATCH' : 'DELETE';
        const body = op.op === 'update' ? { ...op.payload, clientUpdatedAt: op.at } : op.op === 'create' ? op.payload : undefined;
        const { data } = await request<{ _id: string } | null>(endpoint(op), { method, body });
        await db.outbox.delete(op.id!);
        const stillPending = await db.outbox.where('docId').equals(op.docId).count();
        if (op.op !== 'delete' && data && !stillPending) await tableOf(op.entity).put(data);
        if (op.entity === 'trips' && op.op === 'create') createdTrips.push(op.docId);
        setStatus({ online: true, needsLogin: false });
      } catch (err) {
        if (err instanceof NetworkError) {
          await db.outbox.update(op.id!, { attempts: op.attempts + 1, lastError: err.message });
          setStatus({ online: false, lastError: err.message });
          break;
        }
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setStatus({ needsLogin: true, lastError: 'Session expired - log in again to sync' });
            break;
          }
          if (err.status >= 500 || err.status === 429) {
            await db.outbox.update(op.id!, { attempts: op.attempts + 1, lastError: err.message });
            setStatus({ lastError: err.message });
            break;
          }
          await db.outbox.delete(op.id!);
          if (err.status === 409 && err.data && typeof err.data === 'object') {
            await tableOf(op.entity).put(err.data as { _id: string });
            notify({ kind: 'conflict', message: 'Someone changed this item more recently - their version was kept' });
          } else if (err.status === 404) {
            await tableOf(op.entity).delete(op.docId);
          } else {
            if (op.op === 'create') await tableOf(op.entity).delete(op.docId);
            notify({ kind: 'error', message: `A change could not be saved: ${err.message}` });
          }
          continue;
        }
        throw err;
      }
    }
    // the server generates the checklist of a new trip: fetch it
    for (const id of createdTrips) await pullTrip(id).catch(() => undefined);
    const remaining = await db.outbox.count();
    setStatus({ syncing: false, pending: remaining, ...(remaining === 0 && { lastSyncedAt: nowIso() }) });
  }).finally(() => {
    setStatus({ syncing: false });
    flushing = null;
  });
  return flushing;
}

// ------------------------------------------------------------------ pull from the API
function markOffline(err: unknown): never {
  if (err instanceof NetworkError) setStatus({ online: false });
  throw err;
}

/** Cheap request that bypasses the service worker caches: tells whether the API is reachable. */
async function checkConnectivity() {
  try {
    const res = await fetch('/api/v1/push/public-key', { cache: 'no-store' });
    if (res.ok) {
      setStatus({ online: true });
      void flushOutbox();
    }
  } catch {
    // still offline
  }
}
interface TripBundle {
  trip: Trip;
  places: Place[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  journal: JournalEntry[];
}

async function pendingDocIds(tripId?: string) {
  const ops = tripId ? await db.outbox.where('tripId').equals(tripId).toArray() : await db.outbox.toArray();
  return new Set(ops.map((o) => o.docId));
}

/** Downloads a trip with all its children so it stays fully readable offline. */
export async function pullTrip(tripId: string) {
  const bundle = await api<TripBundle>(`/trips/${tripId}/full`).catch(markOffline);
  await db.transaction('rw', [db.trips, db.places, db.expenses, db.checklist, db.journal, db.outbox], async () => {
    const pending = await pendingDocIds(tripId);
    if (!pending.has(tripId)) await db.trips.put(bundle.trip);
    const pairs: [Table<{ _id: string; trip: string }, string>, { _id: string }[]][] = [
      [db.places as never, bundle.places],
      [db.expenses as never, bundle.expenses],
      [db.checklist as never, bundle.checklist],
      [db.journal as never, bundle.journal],
    ];
    for (const [table, docs] of pairs) {
      const serverIds = new Set(docs.map((d) => d._id));
      const local = await table.where('trip').equals(tripId).primaryKeys();
      await table.bulkDelete(local.filter((id) => !serverIds.has(id) && !pending.has(id)));
      await table.bulkPut(docs.filter((d) => !pending.has(d._id)) as never);
    }
  });
  await setMeta(`trip:${tripId}:pulledAt`, nowIso());
  return bundle;
}

/** Refreshes the list of trips the user belongs to. */
export async function pullTrips() {
  const page = await api<{ items: Trip[] }>('/trips?limit=100&sort=-startDate').catch(markOffline);
  const pending = await pendingDocIds();
  const serverIds = new Set(page.items.map((t) => t._id));
  const local = await db.trips.toCollection().primaryKeys();
  for (const id of local) {
    if (!serverIds.has(id) && !pending.has(id)) await removeTripLocally(id);
  }
  await db.trips.bulkPut(page.items.filter((t) => !pending.has(t._id)));
  setStatus({ online: true });
  return page.items;
}

// ------------------------------------------------------------------ exchange rates (for offline estimates)
interface RateTable {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

export async function loadRates(base: string): Promise<RateTable | undefined> {
  const key = `rates:${base}`;
  try {
    const table = await api<RateTable>(`/rates?base=${base}`, { auth: false });
    await setMeta(key, table);
    return table;
  } catch {
    return getMeta<RateTable>(key);
  }
}

/** Offline estimate of a conversion, using the last cached rates. */
export async function estimateInBase(amount: number, currency: string, base: string) {
  if (currency === base) return { amountInBase: amount, rateUsed: 1, estimated: false };
  const table = await getMeta<RateTable>(`rates:${base}`);
  const per = table?.rates[currency];
  if (!per) return { amountInBase: amount, rateUsed: 1, estimated: true };
  const rate = 1 / per;
  return { amountInBase: Math.round(amount * rate * 100) / 100, rateUsed: rate, estimated: true };
}

// ------------------------------------------------------------------ lifecycle
let started = false;

/** Wires connectivity events, periodic retries and service-worker messages. Call once. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  setStatus({ online: navigator.onLine });
  void refreshPending();
  window.addEventListener('online', () => {
    setStatus({ online: true });
    void flushOutbox();
  });
  window.addEventListener('offline', () => setStatus({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushOutbox();
  });
  setInterval(() => {
    if (!status.online) void checkConnectivity();
    else if (status.pending > 0) void flushOutbox();
  }, 15_000);
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'FLUSH_OUTBOX') void flushOutbox();
    if (event.data?.type === 'OUTBOX_SYNCED') {
      void refreshPending();
      setStatus({ lastSyncedAt: nowIso() });
    }
  });
  void flushOutbox();
}
