'use client';

import clsx from 'clsx';
import { Check, Pencil, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Card, Chip, Input, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { countryName } from '@/lib/constants';
import { capitalize, formatDate, formatMoney, tripDays } from '@/lib/format';
import { useSyncStatus } from '@/lib/sync';
import type { TripFormValues } from './TripForm';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantReply {
  reply: string;
  draft: Record<string, unknown>;
  ready: boolean;
  trip: TripFormValues | null;
  quickReplies: string[];
}

const GREETING = 'Where is your trip? Tell me where you are going and what you have in mind.';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Summary({ trip }: { trip: TripFormValues }) {
  const p = trip.preferences;
  const t = p.travellers;
  const people = [
    t.adults > 0 && `${t.adults} adult${t.adults > 1 ? 's' : ''}`,
    t.children > 0 && `${t.children} child${t.children > 1 ? 'ren' : ''}`,
    t.infants > 0 && `${t.infants} infant${t.infants > 1 ? 's' : ''}`,
  ].filter(Boolean);
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <Row label="Title">{trip.title}</Row>
      <Row label="Destination">
        {trip.destination}, {countryName(trip.country)}
      </Row>
      <Row label="Dates">
        {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {tripDays(trip.startDate, trip.endDate)} days
      </Row>
      <Row label="Budget">{trip.budget > 0 ? formatMoney(trip.budget, trip.baseCurrency) : `No budget (${trip.baseCurrency})`}</Row>
      <Row label="Type">{capitalize(p.tripType)}</Row>
      <Row label="Travellers">{people.join(', ')}</Row>
      <Row label="Stay">{capitalize(p.accommodation)}</Row>
      <Row label="Transport">{capitalize(p.transport)}</Row>
      {p.activities.length > 0 && <Row label="Activities">{p.activities.map(capitalize).join(', ')}</Row>}
      {p.specialNeeds.length > 0 && <Row label="Special needs">{p.specialNeeds.map(capitalize).join(', ')}</Row>}
    </dl>
  );
}

/**
 * Conversation that fills the trip form: the assistant asks only for what is missing and
 * finally shows a summary. Nothing is created until the user presses "Create trip".
 */
export function TripAssistant({ onCreate, onEdit }: { onCreate: (values: TripFormValues) => Promise<void>; onEdit: (values: TripFormValues) => void }) {
  const { online } = useSyncStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: GREETING }]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [trip, setTrip] = useState<TripFormValues | null>(null);
  const [quick, setQuick] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, thinking, trip]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || thinking) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setQuick([]);
    setError(null);
    setThinking(true);
    try {
      const res = await api<AssistantReply>('/ai/trip-assistant', { method: 'POST', body: { messages: next.slice(-30), draft } });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      setDraft(res.draft);
      setTrip(res.trip);
      setQuick(res.quickReplies);
    } catch (err) {
      // keep the message in the box so the user can send it again
      setMessages(messages);
      setInput(text);
      setError(errorMessage(err));
    } finally {
      setThinking(false);
    }
  }

  async function create() {
    if (!trip) return;
    setCreating(true);
    try {
      await onCreate(trip);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="log" aria-live="polite" aria-label="Conversation with the trip assistant" className="max-h-[50vh] min-h-48 space-y-3 overflow-y-auto rounded-xl border border-line bg-white p-4">
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <p className={clsx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm', m.role === 'user' ? 'bg-brand text-white' : 'bg-surface text-ink')}>
              {m.role === 'assistant' && <Sparkles className="mr-1.5 inline size-4 text-brand" aria-hidden />}
              {m.content}
            </p>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start" role="status">
            <p className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-2 text-sm text-muted">
              <Spinner className="size-4" /> Thinking…
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {trip && (
        <Card className="space-y-3 border-brand p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Check className="size-5 text-brand" aria-hidden /> Your trip is ready to review
          </p>
          <Summary trip={trip} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button loading={creating} disabled={!online} onClick={create} icon={<Check className="size-4" aria-hidden />}>
              Create trip
            </Button>
            <Button variant="secondary" onClick={() => onEdit(trip)} icon={<Pencil className="size-4" aria-hidden />}>
              Edit in the form
            </Button>
          </div>
          <p className="text-xs text-muted">Something is wrong? Just tell me below and I will update it.</p>
        </Card>
      )}

      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested answers">
          {quick.map((q) => (
            <Chip key={q} selected={false} onClick={() => void send(q)}>
              {q}
            </Chip>
          ))}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {!online && <Alert tone="warn">The assistant needs a connection. You can still fill the form manually.</Alert>}

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          autoFocus
          aria-label="Your message"
          placeholder={trip ? 'Anything to change?' : 'Type your answer…'}
          disabled={thinking || !online}
        />
        <Button type="submit" disabled={!input.trim() || !online} loading={thinking} icon={<Send className="size-4" aria-hidden />}>
          Send
        </Button>
      </form>
    </div>
  );
}
