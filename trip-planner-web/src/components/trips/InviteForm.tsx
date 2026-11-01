'use client';

import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/Toaster';
import { Button, Field, Input } from '@/components/ui';
import { errorMessage, request } from '@/lib/api';
import { db } from '@/lib/db';
import { useSyncStatus } from '@/lib/sync';
import type { Trip } from '@/lib/types';

/** "Invite by email" form: needs a connection, stores the updated trip locally on success. */
export function InviteForm({ trip, onInvited }: { trip: Trip; onInvited?: () => void }) {
  const toast = useToast();
  const { online } = useSyncStatus();
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const { data, message } = await request<Trip>(`/trips/${trip._id}/members`, { method: 'POST', body: { email } });
      await db.trips.put(data);
      setEmail('');
      toast(message);
      onInvited?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  return (
    <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
      <Field label="Invite by email" className="min-w-56 flex-1" error={error ?? undefined} hint="No account yet? They get an email with a link to join">
        {(id, d) => <Input id={id} aria-describedby={d} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />}
      </Field>
      <Button type="submit" loading={inviting} disabled={!online || !email} icon={<UserPlus className="size-4" aria-hidden />}>
        Invite
      </Button>
    </form>
  );
}
