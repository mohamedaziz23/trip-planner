'use client';

import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/AppShell';
import { TripForm, type TripFormValues } from '@/components/trips/TripForm';
import { Card, PageHeader } from '@/components/ui';
import { useToast } from '@/components/Toaster';
import { useAuth } from '@/lib/auth';
import { objectId } from '@/lib/objectId';
import { createDoc, useSyncStatus } from '@/lib/sync';
import type { Trip } from '@/lib/types';

function NewTrip() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { online } = useSyncStatus();

  async function create(values: TripFormValues) {
    if (!user) return;
    const id = objectId();
    const payload = {
      ...values,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
    };
    const doc: Trip = {
      _id: id,
      ...payload,
      coverUrl: null,
      owner: user._id,
      members: [{ user: { _id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }, role: 'owner', joinedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await createDoc('trips', id, doc, payload);
    toast(online ? 'Trip created — your packing list is being generated' : 'Trip saved offline — it will sync when you reconnect');
    router.push(`/trips/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Plan a new trip" subtitle="You can change everything later." />
      <Card className="p-6">
        <TripForm submitLabel="Create trip" defaults={{ baseCurrency: user?.baseCurrency }} onSubmit={create} />
      </Card>
    </div>
  );
}

export default function NewTripPage() {
  return (
    <RequireAuth>
      <NewTrip />
    </RequireAuth>
  );
}
