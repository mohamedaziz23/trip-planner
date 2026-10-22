'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, MapPin, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/AppShell';
import { Alert, Badge, ButtonLink, EmptyState, LoadingBlock, PageHeader } from '@/components/ui';
import { NetworkError } from '@/lib/api';
import { countryName } from '@/lib/constants';
import { db } from '@/lib/db';
import { formatDate, imageUrl, tripDays } from '@/lib/format';
import { pullTrips } from '@/lib/sync';
import type { Trip } from '@/lib/types';

function tripPhase(trip: Trip) {
  const today = new Date().toISOString().slice(0, 10);
  if (trip.endDate.slice(0, 10) < today) return { label: 'Past', tone: 'neutral' as const };
  if (trip.startDate.slice(0, 10) <= today) return { label: 'Ongoing', tone: 'success' as const };
  return { label: 'Upcoming', tone: 'brand' as const };
}

function TripCard({ trip, pending }: { trip: Trip; pending: boolean }) {
  const phase = tripPhase(trip);
  return (
    <Link href={`/trips/${trip._id}`} className="group block overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative h-32 bg-gradient-to-br from-brand to-teal-400">
        {trip.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(trip.coverUrl, 600)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge tone={phase.tone}>{phase.label}</Badge>
          {pending && <Badge tone="warn">Not synced</Badge>}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        <h2 className="font-semibold text-ink group-hover:text-brand-dark">{trip.title}</h2>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-4" aria-hidden /> {trip.destination}, {countryName(trip.country)}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden /> {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Users className="size-4" aria-hidden /> {trip.members?.length ?? 1} participant{(trip.members?.length ?? 1) > 1 ? 's' : ''}
        </p>
      </div>
    </Link>
  );
}

function TripsList() {
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').reverse().toArray(), []);
  const pendingIds = useLiveQuery(async () => new Set((await db.outbox.toArray()).map((o) => o.tripId)), []);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pullTrips()
      .catch((err) => setOffline(err instanceof NetworkError))
      .finally(() => setLoading(false));
  }, []);

  if (!trips || (loading && trips.length === 0)) return <LoadingBlock label="Loading your trips…" />;

  return (
    <>
      <PageHeader
        title="My trips"
        subtitle="Every trip you open is saved on this device for offline use."
        actions={<ButtonLink href="/trips/new" icon={<Plus className="size-4" aria-hidden />}>New trip</ButtonLink>}
      />
      {offline && (
        <div className="mb-4">
          <Alert tone="warn">Offline — showing the trips saved on this device.</Alert>
        </div>
      )}
      {trips.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-8" />}
          title="No trips yet"
          action={<ButtonLink href="/trips/new" icon={<Plus className="size-4" aria-hidden />}>Plan your first trip</ButtonLink>}
        >
          Create a trip, answer a few questions about it, and get an itinerary map, a shared budget and a packing list ready to go.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <li key={trip._id}>
              <TripCard trip={trip} pending={Boolean(pendingIds?.has(trip._id))} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TripsPage() {
  return (
    <RequireAuth>
      <TripsList />
    </RequireAuth>
  );
}
