'use client';

import Link from 'next/link';
import { FileDown, ListChecks, Map, NotebookPen, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTripContext } from '@/components/trips/TripContext';
import { useToast } from '@/components/Toaster';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { download, errorMessage } from '@/lib/api';
import { dayColor } from '@/lib/constants';
import { capitalize, dayDate, formatDate, formatMoney, tripDays } from '@/lib/format';
import { useChecklist, useExpenses, useJournal, usePlaces } from '@/lib/hooks';

export default function TripOverviewPage() {
  const { trip } = useTripContext();
  const toast = useToast();
  const places = usePlaces(trip._id) ?? [];
  const expenses = useExpenses(trip._id) ?? [];
  const checklist = useChecklist(trip._id) ?? [];
  const journal = useJournal(trip._id) ?? [];
  const [exporting, setExporting] = useState(false);

  const days = tripDays(trip.startDate, trip.endDate);
  const spent = expenses.reduce((s, e) => s + e.amountInBase, 0);
  const pct = trip.budget > 0 ? Math.round((spent / trip.budget) * 100) : 0;
  const packed = checklist.filter((i) => i.isPacked).length;
  const p = trip.preferences;

  async function exportPdf() {
    setExporting(true);
    try {
      await download(`/trips/${trip._id}/export`, `${trip.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-itinerary.pdf`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  }

  const stats = [
    { href: 'itinerary', icon: Map, label: 'Places', value: `${places.length}`, sub: `${places.filter((x) => x.day).length} scheduled over ${days} days` },
    {
      href: 'expenses',
      icon: Wallet,
      label: 'Spent',
      value: formatMoney(spent, trip.baseCurrency),
      sub: trip.budget ? `${pct}% of ${formatMoney(trip.budget, trip.baseCurrency)}` : 'No budget set',
      warn: trip.budget > 0 && pct >= 80,
    },
    { href: 'checklist', icon: ListChecks, label: 'Packed', value: `${packed}/${checklist.length}`, sub: 'checklist items' },
    { href: 'journal', icon: NotebookPen, label: 'Journal', value: `${journal.length}`, sub: 'entries' },
  ];

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ href, icon: Icon, label, value, sub, warn }) => (
          <li key={label}>
            <Link href={`/trips/${trip._id}/${href}`} className="block rounded-xl border border-line bg-white p-4 hover:border-brand">
              <p className="flex items-center gap-2 text-sm text-muted">
                <Icon className="size-4" aria-hidden /> {label}
              </p>
              <p className="mt-1 text-xl font-bold">{value}</p>
              <p className={warn ? 'text-xs font-medium text-red-700' : 'text-xs text-muted'}>{sub}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Day by day</h2>
            <Button size="sm" variant="secondary" loading={exporting} icon={<FileDown className="size-4" aria-hidden />} onClick={exportPdf}>
              Export PDF
            </Button>
          </div>
          <ol className="space-y-3">
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
              const list = places.filter((x) => x.day === day);
              return (
                <li key={day} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: dayColor(day) }}>
                    {day}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(dayDate(trip.startDate, day), { weekday: 'long', day: 'numeric', month: 'long', year: undefined })}</p>
                    <p className="truncate text-sm text-muted">{list.length ? list.map((x) => x.name).join(' → ') : 'Nothing planned yet'}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Participants</h2>
            <ul className="space-y-2">
              {trip.members.map((m) => (
                <li key={m.user._id} className="flex items-center gap-2 text-sm">
                  <Avatar name={m.user.name ?? '?'} url={m.user.avatarUrl} size={28} />
                  <span className="flex-1 truncate">{m.user.name}</span>
                  {m.role === 'owner' && <Badge tone="brand">Owner</Badge>}
                </li>
              ))}
            </ul>
            <Link href={`/trips/${trip._id}/settings`} className="mt-3 inline-block text-sm font-medium text-brand-dark hover:underline">
              Invite people →
            </Link>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Preferences</h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">Type</dt>
              <dd>{capitalize(p.tripType)}</dd>
              <dt className="text-muted">Stay</dt>
              <dd>{capitalize(p.accommodation)}</dd>
              <dt className="text-muted">Transport</dt>
              <dd>{capitalize(p.transport)}</dd>
              <dt className="text-muted">Travellers</dt>
              <dd>
                {p.travellers.adults} adult{p.travellers.adults !== 1 && 's'}
                {p.travellers.children > 0 && `, ${p.travellers.children} child.`}
                {p.travellers.infants > 0 && `, ${p.travellers.infants} inf.`}
              </dd>
              {p.activities.length > 0 && (
                <>
                  <dt className="text-muted">Activities</dt>
                  <dd className="capitalize">{p.activities.join(', ')}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
