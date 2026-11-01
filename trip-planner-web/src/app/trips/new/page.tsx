'use client';

import { ArrowLeft, Pencil, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { RequireAuth } from '@/components/AppShell';
import { TripAssistant } from '@/components/trips/TripAssistant';
import { TripForm, type TripFormValues } from '@/components/trips/TripForm';
import { Button, Card, PageHeader } from '@/components/ui';
import { useToast } from '@/components/Toaster';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { objectId } from '@/lib/objectId';
import { createDoc, useSyncStatus } from '@/lib/sync';
import type { Trip } from '@/lib/types';

type Mode = 'choose' | 'ai' | 'manual';

function Choice({ icon, title, text, note, disabled, onClick }: { icon: ReactNode; title: string; text: string; note?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-2 rounded-xl border border-line bg-white p-6 text-left shadow-sm transition-shadow enabled:hover:border-brand enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-light text-brand-dark">{icon}</span>
      <span className="text-lg font-semibold">{title}</span>
      <span className="text-sm text-muted">{text}</span>
      {note && <span className="text-xs font-medium text-amber-800">{note}</span>}
    </button>
  );
}

function NewTrip() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { online } = useSyncStatus();
  const [mode, setMode] = useState<Mode>('choose');
  const [prefill, setPrefill] = useState<TripFormValues | undefined>();
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ enabled: boolean }>('/ai/status', { auth: false })
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => setAiEnabled(false));
  }, [online]);

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

  const back = (
    <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => setMode('choose')} className="mb-3">
      Back
    </Button>
  );

  if (mode === 'ai') {
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <PageHeader title="Plan with the AI assistant" subtitle="Describe your trip, I will ask for what is missing. Nothing is created until you confirm." />
        <TripAssistant
          onCreate={create}
          onEdit={(values) => {
            setPrefill(values);
            setMode('manual');
          }}
        />
      </div>
    );
  }

  if (mode === 'manual') {
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <PageHeader title="Plan a new trip" subtitle={prefill ? 'Review what the assistant understood, then create the trip.' : 'You can change everything later.'} />
        <Card className="p-6">
          <TripForm prefill={prefill} submitLabel="Create trip" defaults={{ baseCurrency: user?.baseCurrency }} onSubmit={create} />
        </Card>
      </div>
    );
  }

  const aiNote = !online ? 'Needs a connection' : aiEnabled === false ? 'Not configured on this server' : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Plan a new trip" subtitle="How would you like to start?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice
          icon={<Sparkles className="size-5" aria-hidden />}
          title="With the AI assistant"
          text="Tell me about your trip in your own words. I ask for what is missing, then you confirm."
          note={aiNote}
          disabled={!online || aiEnabled !== true}
          onClick={() => setMode('ai')}
        />
        <Choice
          icon={<Pencil className="size-5" aria-hidden />}
          title="Manually"
          text="Fill in the form yourself: destination, dates, budget and preferences."
          onClick={() => {
            setPrefill(undefined);
            setMode('manual');
          }}
        />
      </div>
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
