'use client';

import { useRouter } from 'next/navigation';
import { Copy, ImagePlus, Link2, Link2Off, LogOut, Trash2, UserPlus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTripContext } from '@/components/trips/TripContext';
import { TripForm, type TripFormValues } from '@/components/trips/TripForm';
import { useToast } from '@/components/Toaster';
import { Alert, Avatar, Badge, Button, Card, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteDoc, pullTrip, updateDoc, useSyncStatus } from '@/lib/sync';
import type { Trip } from '@/lib/types';

export default function TripSettingsPage() {
  const { trip, isOwner } = useTripContext();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { online } = useSyncStatus();
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const shareUrl = trip.shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${trip.shareToken}` : null;

  async function save(values: TripFormValues) {
    await updateDoc('trips', trip._id, trip._id, {
      ...values,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
    });
    toast(online ? 'Trip saved — the checklist was updated for the new preferences' : 'Saved on this device — will sync later');
    if (online) setTimeout(() => void pullTrip(trip._id).catch(() => undefined), 800);
  }

  /** Online-only actions return the updated trip: store it locally too. */
  async function applyServerTrip(next: Trip) {
    await db.trips.put(next);
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    try {
      await applyServerTrip(await api<Trip>(`/trips/${trip._id}/members`, { method: 'POST', body: { email } }));
      setEmail('');
      toast('Participant added');
    } catch (err) {
      setInviteError(errorMessage(err));
    } finally {
      setInviting(false);
    }
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
        <h2 className="mb-4 text-lg font-semibold">Trip details</h2>
        <TripForm initial={trip} submitLabel="Save changes" onSubmit={save} />
      </Card>

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
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <Field label="Invite by email" className="min-w-56 flex-1" error={inviteError ?? undefined} hint="They need a Trip Planner account">
              {(id, d) => <Input id={id} aria-describedby={d} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />}
            </Field>
            <Button type="submit" loading={inviting} disabled={!online || !email} icon={<UserPlus className="size-4" aria-hidden />}>
              Invite
            </Button>
          </form>
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
