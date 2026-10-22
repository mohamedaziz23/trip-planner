'use client';

import { createContext, useContext } from 'react';
import type { Trip } from '@/lib/types';

export interface TripContextValue {
  trip: Trip;
  isOwner: boolean;
  refresh: () => Promise<unknown>;
}

export const TripContext = createContext<TripContextValue | null>(null);

export function useTripContext() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTripContext must be used inside a trip page');
  return ctx;
}
