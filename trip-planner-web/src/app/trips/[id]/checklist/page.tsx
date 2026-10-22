'use client';

import clsx from 'clsx';
import { ListChecks, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTripContext } from '@/components/trips/TripContext';
import { useToast } from '@/components/Toaster';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, LoadingBlock, Modal, Select } from '@/components/ui';
import { api, errorMessage, request } from '@/lib/api';
import { CHECKLIST_CATEGORIES } from '@/lib/constants';
import { capitalize } from '@/lib/format';
import { useChecklist } from '@/lib/hooks';
import { objectId } from '@/lib/objectId';
import { createDoc, deleteDoc, flushOutbox, pullTrip, updateDoc, useSyncStatus } from '@/lib/sync';
import type { ChecklistItem } from '@/lib/types';

interface Context {
  season: string;
  duration: number;
  isAbroad: boolean;
}

function EditItem({ item, onSave, onClose }: { item: ChecklistItem; onSave: (c: { label: string; quantity: number; category: string }) => Promise<void>; onClose: () => void }) {
  const [label, setLabel] = useState(item.label);
  const [quantity, setQuantity] = useState(item.quantity);
  const [category, setCategory] = useState(item.category);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!label.trim()) return;
        await onSave({ label: label.trim(), quantity: Math.max(1, quantity), category });
      }}
      className="space-y-4"
    >
      {item.source === 'generated' && <p className="text-sm text-muted">Edited items are kept when the list is regenerated.</p>}
      <Field label="Item">{(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity">{(id) => <Input id={id} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />}</Field>
        <Field label="Category">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CHECKLIST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

export default function ChecklistPage() {
  const { trip } = useTripContext();
  const toast = useToast();
  const { online } = useSyncStatus();
  const items = useChecklist(trip._id);
  const [filter, setFilter] = useState<'all' | 'todo' | 'packed'>('all');
  const [newLabel, setNewLabel] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newCategory, setNewCategory] = useState('other');
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [context, setContext] = useState<Context | null>(null);

  useEffect(() => {
    if (!online) return;
    api<{ context: Context }>(`/trips/${trip._id}/checklist`)
      .then((r) => setContext(r.context))
      .catch(() => undefined);
  }, [online, trip._id, trip.updatedAt]);

  const grouped = useMemo(() => {
    const list = (items ?? []).filter((i) => (filter === 'all' ? true : filter === 'packed' ? i.isPacked : !i.isPacked));
    const map = new Map<string, ChecklistItem[]>();
    for (const c of CHECKLIST_CATEGORIES) map.set(c, []);
    for (const i of list) map.get(i.category)?.push(i);
    for (const l of map.values()) l.sort((a, b) => Number(a.isPacked) - Number(b.isPacked) || a.label.localeCompare(b.label));
    return [...map].filter(([, l]) => l.length);
  }, [items, filter]);

  if (!items) return <LoadingBlock />;

  const packed = items.filter((i) => i.isPacked).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const id = objectId();
    const payload = { label: newLabel.trim(), quantity: Math.max(1, newQty), category: newCategory, isPacked: false };
    await createDoc('checklist', trip._id, { _id: id, trip: trip._id, ...payload, source: 'manual', templateKey: null, isEdited: false } as ChecklistItem, payload);
    setNewLabel('');
    setNewQty(1);
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      await flushOutbox();
      const res = await request<{ added: number; updated: number; removed: number }>(`/trips/${trip._id}/checklist/generate`, { method: 'POST' });
      await pullTrip(trip._id);
      toast(res.message);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-48 flex-1">
            <p className="text-sm text-muted">Packed</p>
            <p className="text-2xl font-bold">
              {packed} / {items.length}
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Items packed">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button variant="secondary" size="sm" loading={regenerating} disabled={!online} onClick={regenerate} icon={<RefreshCw className="size-4" aria-hidden />}>
              Regenerate from preferences
            </Button>
            <p className="text-xs text-muted">{online ? 'Adds new items; never removes the ones you edited or ticked.' : 'Regeneration needs a connection.'}</p>
          </div>
        </div>
        {context && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Sparkles className="size-3.5 text-brand" aria-hidden /> Generated for:
            <Badge>{capitalize(context.season)}</Badge>
            <Badge>{context.duration} days</Badge>
            <Badge>{capitalize(trip.preferences.tripType)}</Badge>
            {context.isAbroad && <Badge>Abroad</Badge>}
            {trip.preferences.activities.map((a) => (
              <Badge key={a}>{capitalize(a)}</Badge>
            ))}
          </p>
        )}
      </Card>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-white p-3">
        <Field label="Add an item" className="min-w-48 flex-1">
          {(id) => <Input id={id} placeholder="e.g. Snorkel" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />}
        </Field>
        <Field label="Qty" className="w-20">
          {(id) => <Input id={id} type="number" min={1} value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} />}
        </Field>
        <Field label="Category" className="w-40">
          {(id) => (
            <Select id={id} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CHECKLIST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" icon={<Plus className="size-4" aria-hidden />}>
          Add
        </Button>
      </form>

      <div className="flex gap-2" role="group" aria-label="Filter items">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </Chip>
        <Chip selected={filter === 'todo'} onClick={() => setFilter('todo')}>
          To pack
        </Chip>
        <Chip selected={filter === 'packed'} onClick={() => setFilter('packed')}>
          Packed
        </Chip>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-8" />} title="The checklist is empty">
          {online ? 'Use “Regenerate from preferences” or add your own items.' : 'It will be generated by the server once this trip syncs.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {grouped.map(([category, list]) => (
            <section key={category} className="rounded-xl border border-line bg-white" aria-labelledby={`cat-${category}`}>
              <h3 id={`cat-${category}`} className="border-b border-line px-4 py-2 text-sm font-semibold capitalize">
                {category} <span className="font-normal text-muted">({list.length})</span>
              </h3>
              <ul className="divide-y divide-line">
                {list.map((item) => (
                  <li key={item._id} className="flex items-center gap-3 px-4 py-2">
                    <input
                      id={`item-${item._id}`}
                      type="checkbox"
                      className="size-5 shrink-0 accent-brand"
                      checked={item.isPacked}
                      onChange={(e) => updateDoc('checklist', trip._id, item._id, { isPacked: e.target.checked })}
                    />
                    <label htmlFor={`item-${item._id}`} className={clsx('flex-1 text-sm', item.isPacked && 'text-muted line-through')}>
                      {item.label}
                      {item.quantity > 1 && <span className="ml-1 text-muted">×{item.quantity}</span>}
                    </label>
                    {item.source === 'generated' && <Badge tone={item.isEdited ? 'neutral' : 'brand'}>{item.isEdited ? 'edited' : 'auto'}</Badge>}
                    <button type="button" onClick={() => setEditing(item)} className="rounded p-1 text-muted hover:bg-surface" aria-label={`Edit ${item.label}`}>
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" onClick={() => deleteDoc('checklist', trip._id, item._id)} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${item.label}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit item">
        {editing && (
          <EditItem
            item={editing}
            onClose={() => setEditing(null)}
            onSave={async (changes) => {
              await updateDoc('checklist', trip._id, editing._id, changes, editing.source === 'generated' ? { isEdited: true } : {});
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
