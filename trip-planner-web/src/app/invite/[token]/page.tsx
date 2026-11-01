'use client';

import { CalendarDays, MapPin, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toaster';
import { Alert, Button, ButtonLink, Card, EmptyState, LoadingBlock } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/constants';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';
import type { Trip } from '@/lib/types';

interface InvitationPreview {
  email: string;
  expiresAt: string;
  invitedBy: string;
  trip: { title: string; destination: string; country: string; startDate: string; endDate: string };
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [invite, setInvite] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    api<InvitationPreview>(`/invitations/${token}`, { auth: false })
      .then(setInvite)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  if (error) {
    return (
      <EmptyState title="This invitation is not available" action={<Link href="/" className="text-sm font-medium text-brand-dark hover:underline">Go to Trip Planner</Link>}>
        {error}. Ask the person who invited you to send a new one.
      </EmptyState>
    );
  }
  if (!invite || status === 'loading') return <LoadingBlock label="Loading invitation…" />;

  const next = encodeURIComponent(`/invite/${token}`);
  const sameEmail = user?.email.toLowerCase() === invite.email;

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      const trip = await api<Trip>(`/invitations/${token}/accept`, { method: 'POST' });
      await db.trips.put(trip);
      toast('You joined the trip');
      router.push(`/trips/${trip._id}`);
    } catch (err) {
      setJoinError(errorMessage(err));
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-light text-brand-dark">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold">You are invited</h1>
            <p className="text-sm text-muted">{invite.invitedBy} wants to plan a trip with you.</p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="font-semibold">{invite.trip.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-4" aria-hidden /> {invite.trip.destination}, {countryName(invite.trip.country)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <CalendarDays className="size-4" aria-hidden /> {formatDate(invite.trip.startDate)} – {formatDate(invite.trip.endDate)}
          </p>
        </div>

        {status === 'authenticated' && user ? (
          sameEmail ? (
            <div className="space-y-3">
              {joinError && <Alert tone="error">{joinError}</Alert>}
              <Button className="w-full" loading={joining} onClick={join}>
                Join this trip
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert tone="warn">
                This invitation was sent to <strong>{invite.email}</strong>, but you are logged in as <strong>{user.email}</strong>.
              </Alert>
              <Button className="w-full" variant="secondary" onClick={() => void logout()}>
                Log out and use {invite.email}
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Create an account with <strong>{invite.email}</strong> to join, or log in if you already have one.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ButtonLink href={`/register?next=${next}&email=${encodeURIComponent(invite.email)}`}>Create my account</ButtonLink>
              <ButtonLink href={`/login?next=${next}`} variant="secondary">
                I already have an account
              </ButtonLink>
            </div>
          </div>
        )}
        <p className="text-xs text-muted">This invitation is valid until {formatDate(invite.expiresAt)}.</p>
      </Card>
    </div>
  );
}
