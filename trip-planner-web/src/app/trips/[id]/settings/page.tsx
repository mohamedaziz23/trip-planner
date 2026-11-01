'use client';

import { useRouter } from 'next/navigation';
import { Copy, ImagePlus, Link2, Link2Off, LogOut, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { InviteForm } from '@/components/trips/InviteForm';
import { PendingInvitations } from '@/components/trips/PendingInvitations';
import { useTripContext } from '@/components/trips/TripContext';
import { TripForm, type TripFormValues } from '@/components/trips/TripForm';
import { useToast } from '@/components/Toaster';
import { Alert, Avatar, Badge, Button, Card, Input, Modal } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/constants';
import { db } from '@/lib/db';
import { formatDate, formatMoney, tripDays } from '@/lib/format';
import { deleteDoc, pullTrip, updateDoc, useSyncStatus } from '@/lib/sync';
import type { Trip } from '@/lib/types';

export default function TripSettingsPage() {
  const { trip, isOwner } = useTripContext();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { online } = useSyncStatus();
  const [shareBusy, setShareBusy] = useState(false);
  const [invitesKey, setInvitesKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  const shareUrl = trip.shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${trip.shareToken}` : null;

  async function save(values: TripFormValues) {
    await updateDoc('trips', trip._id, trip._id, {
      ...values,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
    });
    toast(online ? 'Trip saved — the checklist was updated for the new preferences' : 'Saved on this device — will sync later');
    if (online) setTimeout(() => void pullTrip(trip._id).catch(() => undefined), 800);
    setEditOpen(false);
  }

  /** Online-only actions return the updated trip: store it locally too. */
  async function applyServerTrip(next: Trip) {
    await db.trips.put(next);
  }

  async function removeMember(userId: string, name: string) {
    const self = userId === user?._id;
    if (!confirm(self ? 'Leave this trip? You will lose access to it.' : `Remove ${name} from the trip?`)) return;
    try {
      const next = await api<Trip>(`/trips/${trip._id}/members/${userId}`, { method: 'DELETE' });
      if (self) {
        await db.trips.delete(trip._id);
        router.push('/trips');
      } else await applyServerTrip(next);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function toggleShare(enable: boolean) {
    setShareBusy(true);
    try {
      if (enable) {
        const { shareToken } = await api<{ shareToken: string }>(`/trips/${trip._id}/share`, { method: 'POST' });
        await db.trips.update(trip._id, { shareToken });
      } else {
        await api(`/trips/${trip._id}/share`, { method: 'DELETE' });
        await db.trips.update(trip._id, { shareToken: undefined });
        toast('Share link revoked');
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setShareBusy(false);
    }
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('cover', file);
    try {
      await applyServerTrip(await api<Trip>(`/trips/${trip._id}/cover`, { method: 'POST', form }));
      toast('Cover updated');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function removeTrip() {
    if (!confirm(`Delete "${trip.title}" with all its places, expenses, checklist and journal? This cannot be undone.`)) return;
    await deleteDoc('trips', trip._id, trip._id);
    toast('Trip deleted');
    router.push('/trips');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Trip details</h2>
            <p className="text-sm text-muted">The essentials. Open the full form to change dates, budget and preferences.</p>
          </div>
          <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditOpen(true)}>
            See more &amp; edit
          </Button>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Destination</dt>
            <dd className="font-medium">
              {trip.destination}, {countryName(trip.country)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Dates</dt>
            <dd className="font-medium">
              {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days
            </dd>
          </div>
          <div>
            <dt className="text-muted">Budget</dt>
            <dd className="font-medium">{trip.budget > 0 ? formatMoney(trip.budget, trip.baseCurrency) : 'No budget set'}</dd>
          </div>
          <div>
            <dt className="text-muted">Currency</dt>
            <dd className="font-medium">{trip.baseCurrency}</dd>
          </div>
        </dl>
      </Card>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Trip details" wide>
        <TripForm initial={trip} submitLabel="Save changes" onSubmit={save} />
      </Modal>

      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold">Cover image</h2>
        <p className="mb-3 text-sm text-muted">Shown on your trip list and header.</p>
        <label className={`inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm ${online ? 'cursor-pointer hover:bg-surface' : 'opacity-60'}`}>
          <ImagePlus className="size-4" aria-hidden /> {online ? 'Upload an image' : 'Needs a connection'}
          <input type="file" accept="image/*" className="sr-only" disabled={!online} onChange={(e) => uploadCover(e.target.files?.[0])} />
        </label>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-lg font-semibold">Participants</h2>
        <ul className="mb-4 divide-y divide-line">
          {trip.members.map((m) => (
            <li key={m.user._id} className="flex items-center gap-3 py-2">
              <Avatar name={m.user.name} url={m.user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.user.name}</p>
                <p className="truncate text-xs text-muted">{m.user.email}</p>
              </div>
              {m.role === 'owner' ? (
                <Badge tone="brand">Owner</Badge>
              ) : (
                (isOwner || m.user._id === user?._id) && (
                  <Button size="sm" variant="ghost" disabled={!online} onClick={() => removeMember(m.user._id, m.user.name)} icon={m.user._id === user?._id ? <LogOut className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}>
                    {m.user._id === user?._id ? 'Leave' : 'Remove'}
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <>
            <InviteForm trip={trip} onInvited={() => setInvitesKey((k) => k + 1)} />
            <PendingInvitations tripId={trip._id} refreshKey={invitesKey} />
          </>
        )}
      </Card>

      {isOwner && (
        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold">Public share link</h2>
          <p className="mb-3 text-sm text-muted">Anyone with the link can see the itinerary (read-only), without an account. Expenses and the journal stay private.</p>
          {shareUrl ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} aria-label="Share link" onFocus={(e) => e.target.select()} />
                <Button
                  variant="secondary"
                  icon={<Copy className="size-4" aria-hidden />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    toast('Link copied');
                  }}
                >
                  Copy
                </Button>
              </div>
              <Button variant="secondary" loading={shareBusy} disabled={!online} onClick={() => toggleShare(false)} icon={<Link2Off className="size-4" aria-hidden />}>
                Revoke link
              </Button>
            </div>
          ) : (
            <Button loading={shareBusy} disabled={!online} onClick={() => toggleShare(true)} icon={<Link2 className="size-4" aria-hidden />}>
              Create share link
            </Button>
          )}
        </Card>
      )}

      {isOwner && (
        <Card className="border-red-200 p-6">
          <h2 className="mb-1 text-lg font-semibold text-red-800">Delete trip</h2>
          <p className="mb-3 text-sm text-muted">Deletes the trip and all of its places, expenses, checklist items and journal entries for every participant.</p>
          {!online && <div className="mb-3"><Alert tone="info">Offline: the deletion will be applied when you reconnect.</Alert></div>}
          <Button variant="danger" onClick={removeTrip} icon={<Trash2 className="size-4" aria-hidden />}>
            Delete this trip
          </Button>
        </Card>
      )}
    </div>
  );
}
