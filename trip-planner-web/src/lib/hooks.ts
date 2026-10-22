'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { ChecklistItem, Expense, JournalEntry, Place, Trip } from './types';
import { pullTrip, useSyncStatus } from './sync';
import { NetworkError } from './api';

/** Live local copy of a trip (IndexedDB), refreshed from the API when online. */
export function useTrip(tripId: string) {
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId]);
  // pull again when the connection comes back
  const { online } = useSyncStatus();
  // result of the last pull, tagged with the trip it belongs to
  const [result, setResult] = useState<{ id: string; state: 'idle' | 'offline' | 'error' | 'notfound' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    pullTrip(tripId)
      .then(() => !cancelled && setResult({ id: tripId, state: 'idle' }))
      .catch((err) => {
        if (cancelled) return;
        const status = (err as { status?: number }).status;
        const state = err instanceof NetworkError ? 'offline' : status === 404 || status === 403 ? 'notfound' : 'error';
        setResult({ id: tripId, state });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, online]);

  const state = result?.id === tripId ? result.state : 'loading';
  return { trip: trip as Trip | undefined, loaded: trip !== undefined, state, refresh: () => pullTrip(tripId) };
}

export function usePlaces(tripId: string) {
  return useLiveQuery(
    async () => (await db.places.where('trip').equals(tripId).toArray()).sort((a, b) => (a.day ?? 999) - (b.day ?? 999) || a.order - b.order),
    [tripId],
  ) as Place[] | undefined;
}

export function useExpenses(tripId: string) {
  return useLiveQuery(
    async () => (await db.expenses.where('trip').equals(tripId).toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [tripId],
  ) as Expense[] | undefined;
}

export function useChecklist(tripId: string) {
  return useLiveQuery(() => db.checklist.where('trip').equals(tripId).toArray(), [tripId]) as ChecklistItem[] | undefined;
}

export function useJournal(tripId: string) {
  return useLiveQuery(
    async () => (await db.journal.where('trip').equals(tripId).toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [tripId],
  ) as JournalEntry[] | undefined;
}

export function usePendingCount(tripId?: string) {
  return useLiveQuery(() => (tripId ? db.outbox.where('tripId').equals(tripId).count() : db.outbox.count()), [tripId]) ?? 0;
}
