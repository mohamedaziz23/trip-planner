'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { countryName, dayColor } from '@/lib/constants';
import { dayDate, formatDate, formatMinutes, imageUrl, tripDays } from '@/lib/format';
import type { Place } from '@/lib/types';

const TripMap = dynamic(() => import('@/components/map/TripMap'), { ssr: false });

interface SharedTrip {
  trip: { title: string; destination: string; country: string; startDate: string; endDate: string; coverUrl: string | null; members: { name: string }[] };
  places: Place[];
}

export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedTrip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SharedTrip>(`/share/${token}`, { auth: false })
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  if (error) {
    return (
      <EmptyState title="This link is not available" action={<Link href="/" className="text-sm font-medium text-brand-dark hover:underline">Discover Trip Planner</Link>}>
        {error}
      </EmptyState>
    );
  }
  if (!data) return <LoadingBlock label="Loading itinerary…" />;

  const { trip, places } = data;
  const days = tripDays(trip.startDate, trip.endDate);

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white">
        {trip.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(trip.coverUrl, 1200)} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        )}
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Shared itinerary · read only</p>
          <h1 className="mt-2 text-3xl font-bold">{trip.title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-teal-50">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden /> {trip.destination}, {countryName(trip.country)}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4" aria-hidden /> {trip.members.map((m) => m.name).join(', ')}
            </span>
          </p>
        </div>
      </header>

      <TripMap places={places} routes={[]} />

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
          const list = places.filter((p) => p.day === day);
          return (
            <section key={day} className="rounded-xl border border-line bg-white p-4" aria-labelledby={`d${day}`}>
              <h2 id={`d${day}`} className="mb-2 flex items-center gap-2 font-semibold">
                <span className="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: dayColor(day) }}>
                  {day}
                </span>
                {formatDate(dayDate(trip.startDate, day), { weekday: 'long', day: 'numeric', month: 'long', year: undefined })}
              </h2>
              {list.length ? (
                <ol className="space-y-2">
                  {list.map((p) => (
                    <li key={p._id} className="text-sm">
                      <p className="font-medium">
                        {p.startTime && <span className="mr-2 text-muted">{p.startTime}</span>}
                        {p.name}
                      </p>
                      <p className="text-xs text-muted">
                        {[p.address, p.durationMin ? formatMinutes(p.durationMin) : null].filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">Free day</p>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">
        Planned with <Link href="/" className="font-medium text-brand-dark hover:underline">Trip Planner</Link>
      </p>
    </div>
  );
}
