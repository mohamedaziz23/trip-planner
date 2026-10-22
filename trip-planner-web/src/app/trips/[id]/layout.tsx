'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { CalendarDays, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/AppShell';
import { TripContext } from '@/components/trips/TripContext';
import { Alert, ButtonLink, EmptyState, LoadingBlock } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/constants';
import { formatDate, imageUrl, tripDays } from '@/lib/format';
import { useTrip } from '@/lib/hooks';

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/itinerary', label: 'Itinerary' },
  { href: '/expenses', label: 'Budget' },
  { href: '/checklist', label: 'Checklist' },
  { href: '/journal', label: 'Journal' },
  { href: '/settings', label: 'Settings' },
];

function TripWorkspace({ id, children }: { id: string; children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { trip, state, refresh } = useTrip(id);

  if (!trip) {
    if (state === 'loading') return <LoadingBlock label="Loading trip…" />;
    if (state === 'offline')
      return (
        <EmptyState title="This trip is not available offline" action={<ButtonLink href="/trips">Back to my trips</ButtonLink>}>
          It has not been opened on this device yet. Reconnect to download it.
        </EmptyState>
      );
    return (
      <EmptyState title="Trip not found" action={<ButtonLink href="/trips">Back to my trips</ButtonLink>}>
        It may have been deleted, or you are no longer a participant.
      </EmptyState>
    );
  }

  const base = `/trips/${id}`;
  return (
    <TripContext.Provider value={{ trip, isOwner: trip.owner === user?._id, refresh }}>
      <div className="relative -mx-4 -mt-6 mb-4 overflow-hidden bg-gradient-to-br from-brand to-brand-dark px-4 pb-0 pt-6 text-white sm:mx-0 sm:rounded-2xl sm:px-6">
        {trip.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(trip.coverUrl, 1200)} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        )}
        <div className="relative">
          <h1 className="text-2xl font-bold sm:text-3xl">{trip.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-teal-50">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden /> {trip.destination}, {countryName(trip.country)}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> {formatDate(trip.startDate)} – {formatDate(trip.endDate)} ({tripDays(trip.startDate, trip.endDate)} days)
            </span>
          </p>
          <nav aria-label="Trip sections" className="-mx-1 mt-5 flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const href = base + tab.href;
              const active = tab.href === '' ? pathname === base : pathname.startsWith(href);
              return (
                <Link
                  key={tab.label}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium',
                    active ? 'bg-canvas text-ink' : 'text-teal-50 hover:bg-white/10',
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {state === 'offline' && (
        <div className="mb-4">
          <Alert tone="warn">Offline copy — changes you make are saved on this device and synced later.</Alert>
        </div>
      )}
      {children}
    </TripContext.Provider>
  );
}

export default function TripLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <TripWorkspace id={id}>{children}</TripWorkspace>
    </RequireAuth>
  );
}
