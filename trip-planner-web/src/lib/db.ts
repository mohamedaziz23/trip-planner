import Dexie, { type EntityTable } from 'dexie';
import type { ChecklistItem, Expense, JournalEntry, Place, Trip } from './types';

export type Entity = 'trips' | 'places' | 'expenses' | 'checklist' | 'journal';

/** A write made by the user, waiting to be replayed against the API. */
export interface OutboxOp {
  id?: number;
  entity: Entity;
  op: 'create' | 'update' | 'delete';
  tripId: string;
  docId: string;
  payload?: Record<string, unknown>;
  /** time of the user's change - sent as clientUpdatedAt for last-write-wins */
  at: string;
  attempts: number;
  lastError?: string;
}

export interface Meta {
  key: string;
  value: unknown;
}

/**
 * Local copy of every trip the user opened, plus the outbox queue.
 * The service worker (public/sw.js) opens the same database to replay the
 * outbox during Background Sync, so table and key names must stay in sync.
 */
class TripPlannerDB extends Dexie {
  trips!: EntityTable<Trip, '_id'>;
  places!: EntityTable<Place, '_id'>;
  expenses!: EntityTable<Expense, '_id'>;
  checklist!: EntityTable<ChecklistItem, '_id'>;
  journal!: EntityTable<JournalEntry, '_id'>;
  outbox!: EntityTable<OutboxOp, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor() {
    super('trip-planner');
    this.version(1).stores({
      trips: '_id, startDate, updatedAt',
      places: '_id, trip, [trip+day]',
      expenses: '_id, trip, date',
      checklist: '_id, trip',
      journal: '_id, trip, date',
      outbox: '++id, tripId, docId',
      meta: 'key',
    });
  }
}

export const db = new TripPlannerDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/** Wipes everything local (logout / account switch). */
export async function clearLocalData() {
  await Promise.all([db.trips, db.places, db.expenses, db.checklist, db.journal, db.outbox, db.meta].map((t) => t.clear()));
}
