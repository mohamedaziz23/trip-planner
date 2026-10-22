'use client';

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { AlertTriangle, ArrowRight, Paperclip, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTripContext } from '@/components/trips/TripContext';
import { useToast } from '@/components/Toaster';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, Modal, Select } from '@/components/ui';
import { errorMessage, uploadImages } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CURRENCIES, EXPENSE_CATEGORIES } from '@/lib/constants';
import { capitalize, formatDate, formatMoney, toDateInput } from '@/lib/format';
import { useExpenses } from '@/lib/hooks';
import { objectId } from '@/lib/objectId';
import { createDoc, deleteDoc, estimateInBase, loadRates, updateDoc, useSyncStatus } from '@/lib/sync';
import type { Expense, Trip } from '@/lib/types';

const CategoryChart = dynamic(() => import('@/components/trips/ExpenseCharts').then((m) => m.CategoryChart), { ssr: false });
const DailyChart = dynamic(() => import('@/components/trips/ExpenseCharts').then((m) => m.DailyChart), { ssr: false });

const payerId = (e: Expense) => (typeof e.paidBy === 'string' ? e.paidBy : e.paidBy._id);
const round = (n: number) => Math.round(n * 100) / 100;

/** Same computation as GET /trips/:id/expenses/summary, done locally so it works offline. */
function summarize(trip: Trip, expenses: Expense[]) {
  const spent = expenses.reduce((s, e) => s + e.amountInBase, 0);
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  const balances = new Map<string, number>(trip.members.map((m) => [m.user._id, 0]));
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountInBase);
    const day = e.date.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + e.amountInBase);
    const split = e.splitBetween.length ? e.splitBetween : [...balances.keys()];
    balances.set(payerId(e), (balances.get(payerId(e)) ?? 0) + e.amountInBase);
    for (const id of split) balances.set(id, (balances.get(id) ?? 0) - e.amountInBase / split.length);
  }
  const names = new Map(trip.members.map((m) => [m.user._id, m.user.name]));
  const debtors = [...balances].filter(([, b]) => b < -0.01).map(([id, b]) => ({ id, amount: -b })).sort((a, b) => b.amount - a.amount);
  const creditors = [...balances].filter(([, b]) => b > 0.01).map(([id, b]) => ({ id, amount: b })).sort((a, b) => b.amount - a.amount);
  const settlements: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    settlements.push({ from: names.get(debtors[i].id) ?? 'Former participant', to: names.get(creditors[j].id) ?? 'Former participant', amount: round(pay) });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  const percent = trip.budget > 0 ? (spent / trip.budget) * 100 : 0;
  return {
    spent: round(spent),
    percent,
    alert: trip.budget > 0 && percent >= 80,
    byCategory: [...byCategory].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total),
    byDay: [...byDay].map(([date, total]) => ({ date, total: round(total) })).sort((a, b) => a.date.localeCompare(b.date)),
    balances: [...balances].map(([id, b]) => ({ id, name: names.get(id) ?? 'Former participant', balance: round(b) })),
    settlements,
  };
}

interface FormState {
  label: string;
  amount: string;
  currency: string;
  category: string;
  date: string;
  paidBy: string;
  splitBetween: string[];
  receiptUrl: string | null;
}

function ExpenseForm({ trip, initial, onDone }: { trip: Trip; initial?: Expense; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { online } = useSyncStatus();
  const memberIds = trip.members.map((m) => m.user._id);
  const [f, setF] = useState<FormState>({
    label: initial?.label ?? '',
    amount: initial ? String(initial.amount) : '',
    currency: initial?.currency ?? trip.baseCurrency,
    category: initial?.category ?? 'food',
    date: toDateInput(initial?.date ?? new Date()),
    paidBy: initial ? payerId(initial) : user?._id ?? memberIds[0],
    splitBetween: initial?.splitBetween?.length ? initial.splitBetween : memberIds,
    receiptUrl: initial?.receiptUrl ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onReceipt(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { urls } = await uploadImages([file], 'receipts');
      setF((x) => ({ ...x, receiptUrl: urls[0] }));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(f.amount);
    const errs: Record<string, string> = {};
    if (!f.label.trim()) errs.label = 'What was it for?';
    if (!(amount > 0)) errs.amount = 'Enter an amount greater than 0';
    if (!f.splitBetween.length) errs.split = 'Split between at least one person';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = {
        label: f.label.trim(),
        amount,
        currency: f.currency,
        category: f.category,
        date: new Date(f.date).toISOString(),
        paidBy: f.paidBy,
        splitBetween: f.splitBetween,
        receiptUrl: f.receiptUrl,
      };
      const conversion = await estimateInBase(amount, f.currency, trip.baseCurrency);
      const payer = trip.members.find((m) => m.user._id === f.paidBy)?.user;
      const local = {
        ...payload,
        amountInBase: conversion.amountInBase,
        rateUsed: conversion.rateUsed,
        paidBy: payer ? { _id: payer._id, name: payer.name } : f.paidBy,
        pendingConversion: conversion.estimated,
      };
      if (initial) {
        await updateDoc('expenses', trip._id, initial._id, payload, { amountInBase: local.amountInBase, rateUsed: local.rateUsed, paidBy: local.paidBy, pendingConversion: local.pendingConversion });
        toast('Expense updated');
      } else {
        const id = objectId();
        await createDoc('expenses', trip._id, { _id: id, trip: trip._id, ...local } as Expense, payload);
        toast('Expense added');
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Description" error={errors.label}>
        {(id, d) => <Input id={id} aria-describedby={d} placeholder="Dinner at the harbour" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" error={errors.amount}>
          {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
        </Field>
        <Field label="Currency" hint={f.currency !== trip.baseCurrency ? `Converted to ${trip.baseCurrency}` : undefined}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Category">
          {(id) => (
            <Select id={id} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Date">
          {(id) => <Input id={id} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}
        </Field>
      </div>
      <Field label="Paid by">
        {(id) => (
          <Select id={id} value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })}>
            {trip.members.map((m) => (
              <option key={m.user._id} value={m.user._id}>
                {m.user.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Split between</legend>
        <div className="flex flex-wrap gap-3">
          {trip.members.map((m) => (
            <label key={m.user._id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={f.splitBetween.includes(m.user._id)}
                onChange={(e) =>
                  setF({ ...f, splitBetween: e.target.checked ? [...f.splitBetween, m.user._id] : f.splitBetween.filter((x) => x !== m.user._id) })
                }
              />
              {m.user.name}
            </label>
          ))}
        </div>
        {errors.split && <p className="mt-1 text-xs text-red-700">{errors.split}</p>}
      </fieldset>
      <div>
        <p className="mb-1 text-sm font-medium">Receipt photo</p>
        {f.receiptUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.receiptUrl} alt="Receipt" className="h-16 w-16 rounded-md object-cover" />
            <Button size="sm" variant="ghost" onClick={() => setF({ ...f, receiptUrl: null })}>
              Remove
            </Button>
          </div>
        ) : online ? (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface">
            <Paperclip className="size-4" aria-hidden /> {uploading ? 'Uploading…' : 'Attach a photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onReceipt(e.target.files?.[0])} />
          </label>
        ) : (
          <p className="text-xs text-muted">Photos can be attached once you are back online.</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} disabled={uploading}>
          {initial ? 'Save' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}

export default function ExpensesPage() {
  const { trip } = useTripContext();
  const toast = useToast();
  const expenses = useExpenses(trip._id);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [category, setCategory] = useState('');

  useEffect(() => {
    void loadRates(trip.baseCurrency);
  }, [trip.baseCurrency]);

  const summary = useMemo(() => summarize(trip, expenses ?? []), [trip, expenses]);
  if (!expenses) return <LoadingBlock />;

  const shown = category ? expenses.filter((e) => e.category === category) : expenses;
  const cur = trip.baseCurrency;

  return (
    <div className="space-y-6">
      {summary.alert && (
        <Alert tone={summary.percent >= 100 ? 'error' : 'warn'}>
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            {summary.percent >= 100 ? 'Budget exceeded' : 'You have used more than 80% of the budget'} ({Math.round(summary.percent)}%)
          </span>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <p className="text-sm text-muted">Spent</p>
          <p className="text-3xl font-bold">{formatMoney(summary.spent, cur)}</p>
          {trip.budget > 0 ? (
            <>
              <div
                className="mt-3 h-3 overflow-hidden rounded-full bg-surface"
                role="progressbar"
                aria-valuenow={Math.round(summary.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Budget used"
              >
                <div
                  className={clsx('h-full rounded-full', summary.percent >= 100 ? 'bg-red-700' : summary.percent >= 80 ? 'bg-amber-600' : 'bg-brand')}
                  style={{ width: `${Math.min(100, summary.percent)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted">
                {Math.round(summary.percent)}% of {formatMoney(trip.budget, cur)} · {formatMoney(trip.budget - summary.spent, cur)} left
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No budget set — add one in Settings.</p>
          )}
          {summary.settlements.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold">To settle up</h3>
              <ul className="space-y-1.5 text-sm">
                {summary.settlements.map((s, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {s.from} <ArrowRight className="size-3.5 text-muted" aria-label="pays" /> {s.to}
                    <span className="ml-auto font-medium">{formatMoney(s.amount, cur)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold">By category</h3>
          {summary.byCategory.length ? <CategoryChart data={summary.byCategory} currency={cur} /> : <p className="py-10 text-center text-sm text-muted">No data yet</p>}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold">By day</h3>
          {summary.byDay.length ? <DailyChart data={summary.byDay} currency={cur} /> : <p className="py-10 text-center text-sm text-muted">No data yet</p>}
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Expenses ({expenses.length})</h2>
        <div className="flex gap-2">
          <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-40 text-xs">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {capitalize(c)}
              </option>
            ))}
          </Select>
          <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            Add expense
          </Button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <EmptyState icon={<Receipt className="size-8" />} title="No expenses yet" action={<Button onClick={() => setEditing('new')}>Log the first expense</Button>}>
          Log what you spend in any currency; it is converted to {cur} with the day&apos;s exchange rate.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {shown.map((e) => (
            <li key={e._id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {e.label}
                  {e.receiptUrl && (
                    <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-brand-dark" aria-label="View receipt">
                      <Receipt className="size-3.5" />
                    </a>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {formatDate(e.date)} · {capitalize(e.category)} · paid by {typeof e.paidBy === 'string' ? '…' : e.paidBy.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatMoney(e.amountInBase, cur)}</p>
                {e.currency !== cur && (
                  <p className="text-xs text-muted">
                    {formatMoney(e.amount, e.currency)}
                    {e.pendingConversion && <Badge tone="warn" className="ml-1">estimate</Badge>}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setEditing(e)} className="rounded p-1.5 text-muted hover:bg-surface" aria-label={`Edit ${e.label}`}>
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Delete "${e.label}"?`)) return;
                  await deleteDoc('expenses', trip._id, e._id);
                  toast('Expense deleted');
                }}
                className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-700"
                aria-label={`Delete ${e.label}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New expense' : 'Edit expense'}>
        {editing && <ExpenseForm trip={trip} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
