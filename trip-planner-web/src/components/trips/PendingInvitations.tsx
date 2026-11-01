'use client';

import { Mail, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toaster';
import { Button, Modal } from '@/components/ui';
import { api, errorMessage, request } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSyncStatus } from '@/lib/sync';

interface Invitation {
  _id: string;
  email: string;
  expiresAt: string;
}

/**
 * Owner only: invitations emailed to people without an account, still waiting to be accepted.
 * Shown as one compact line; the full list (with Resend / Cancel) opens in a dialog.
 */
export function PendingInvitations({ tripId, refreshKey }: { tripId: string; refreshKey: number }) {
  const toast = useToast();
  const { online } = useSyncStatus();
  const [items, setItems] = useState<Invitation[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    api<Invitation[]>(`/trips/${tripId}/invitations`)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        if (list.length === 0) setOpen(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tripId, online, refreshKey, version]);

  async function cancel(invitation: Invitation) {
    setBusy(invitation._id);
    try {
      await api(`/trips/${tripId}/invitations/${invitation._id}`, { method: 'DELETE' });
      toast('Invitation cancelled');
      setVersion((v) => v + 1);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function resend(invitation: Invitation) {
    setBusy(invitation._id);
    try {
      const { message } = await request(`/trips/${tripId}/members`, { method: 'POST', body: { email: invitation.email } });
      toast(message);
      setVersion((v) => v + 1);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  const more = items.length - 1;

  return (
    <>
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-line px-3 py-2">
        <Mail className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {items.length} pending invitation{items.length > 1 && 's'}
          </p>
          <p className="truncate text-xs text-muted">
            {items[0].email}
            {more > 0 && ` and ${more} more`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {items.length > 1 ? 'View all' : 'Manage'}
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Pending invitations (${items.length})`}>
        <p className="mb-3 text-sm text-muted">Sent by email. These people join the trip once they create an account with that address.</p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((i) => (
            <li key={i._id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.email}</p>
                <p className="text-xs text-muted">Link valid until {formatDate(i.expiresAt)}</p>
              </div>
              <Button size="sm" variant="ghost" disabled={!online || busy === i._id} onClick={() => resend(i)} icon={<RefreshCw className="size-4" aria-hidden />}>
                Resend
              </Button>
              <Button size="sm" variant="ghost" disabled={!online || busy === i._id} onClick={() => cancel(i)} icon={<X className="size-4" aria-hidden />}>
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
