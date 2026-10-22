'use client';

import { useState, type FormEvent } from 'react';
import { ACCOMMODATIONS, ACTIVITIES, COUNTRIES, CURRENCIES, SPECIAL_NEEDS, TRANSPORTS, TRIP_TYPES } from '@/lib/constants';
import { toDateInput } from '@/lib/format';
import type { Trip, TripPreferences } from '@/lib/types';
import { Button, Chip, Field, Input, Select } from '@/components/ui';

export interface TripFormValues {
  title: string;
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  budget: number;
  baseCurrency: string;
  preferences: TripPreferences;
}

const DEFAULT_PREFS: TripPreferences = {
  tripType: 'city break',
  activities: [],
  accommodation: 'hotel',
  transport: 'plane',
  travellers: { adults: 1, children: 0, infants: 0 },
  specialNeeds: [],
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function TripForm({
  initial,
  defaults,
  submitLabel,
  onSubmit,
}: {
  initial?: Trip;
  defaults?: { baseCurrency?: string };
  submitLabel: string;
  onSubmit: (values: TripFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TripFormValues>(() => ({
    title: initial?.title ?? '',
    destination: initial?.destination ?? '',
    country: initial?.country ?? 'FR',
    startDate: toDateInput(initial?.startDate),
    endDate: toDateInput(initial?.endDate),
    budget: initial?.budget ?? 0,
    baseCurrency: initial?.baseCurrency ?? defaults?.baseCurrency ?? 'EUR',
    preferences: initial?.preferences ? { ...DEFAULT_PREFS, ...initial.preferences } : DEFAULT_PREFS,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const setPref = <K extends keyof TripPreferences>(key: K, value: TripPreferences[K]) =>
    setValues((v) => ({ ...v, preferences: { ...v.preferences, [key]: value } }));
  const setTravellers = (key: keyof TripPreferences['travellers'], value: number) =>
    setPref('travellers', { ...values.preferences.travellers, [key]: Math.max(0, Math.min(50, value || 0)) });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (values.title.trim().length < 2) errs.title = 'Give the trip a name';
    if (values.destination.trim().length < 2) errs.destination = 'Where are you going?';
    if (!values.startDate) errs.startDate = 'Choose a start date';
    if (!values.endDate) errs.endDate = 'Choose an end date';
    if (values.startDate && values.endDate && values.endDate < values.startDate) errs.endDate = 'The end date must be after the start date';
    if (values.budget < 0) errs.budget = 'The budget cannot be negative';
    if (values.preferences.travellers.adults + values.preferences.travellers.children < 1) errs.travellers = 'At least one traveller';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await onSubmit({ ...values, title: values.title.trim(), destination: values.destination.trim() });
    } finally {
      setSaving(false);
    }
  }

  const p = values.preferences;

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-semibold">The trip</legend>
        <Field label="Trip name" error={errors.title}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="Summer in Crete" value={values.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destination" error={errors.destination}>
            {(id, d) => <Input id={id} aria-describedby={d} placeholder="Heraklion" value={values.destination} onChange={(e) => set('destination', e.target.value)} />}
          </Field>
          <Field label="Country">
            {(id) => (
              <Select id={id} value={values.country} onChange={(e) => set('country', e.target.value)}>
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Start date" error={errors.startDate}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />}
          </Field>
          <Field label="End date" error={errors.endDate}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" min={values.startDate} value={values.endDate} onChange={(e) => set('endDate', e.target.value)} />}
          </Field>
          <Field label="Total budget" error={errors.budget} hint="0 = no budget tracking">
            {(id, d) => <Input id={id} aria-describedby={d} type="number" min={0} step="10" value={values.budget} onChange={(e) => set('budget', Number(e.target.value))} />}
          </Field>
          <Field label="Base currency" hint="Every expense is converted to it">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={values.baseCurrency} onChange={(e) => set('baseCurrency', e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold">Trip preferences</legend>
        <p className="-mt-3 text-sm text-muted">Your packing checklist is generated from these answers.</p>

        <div role="radiogroup" aria-label="Trip type">
          <p className="mb-2 text-sm font-medium">Trip type</p>
          <div className="flex flex-wrap gap-2">
            {TRIP_TYPES.map((t) => (
              <Chip key={t} selected={p.tripType === t} onClick={() => setPref('tripType', t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Activities</p>
          <div className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => (
              <Chip key={a} selected={p.activities.includes(a)} onClick={() => setPref('activities', toggle(p.activities, a))}>
                {a}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Accommodation">
            {(id) => (
              <Select id={id} value={p.accommodation} onChange={(e) => setPref('accommodation', e.target.value)} className="capitalize">
                {ACCOMMODATIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Transport">
            {(id) => (
              <Select id={id} value={p.transport} onChange={(e) => setPref('transport', e.target.value)} className="capitalize">
                {TRANSPORTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Travellers</p>
          <div className="grid grid-cols-3 gap-3">
            {(['adults', 'children', 'infants'] as const).map((k) => (
              <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                {(id) => <Input id={id} type="number" min={0} max={50} value={p.travellers[k]} onChange={(e) => setTravellers(k, Number(e.target.value))} />}
              </Field>
            ))}
          </div>
          {errors.travellers && <p className="mt-1 text-xs text-red-700">{errors.travellers}</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Special needs</p>
          <div className="flex flex-wrap gap-2">
            {SPECIAL_NEEDS.map((s) => (
              <Chip key={s} selected={p.specialNeeds.includes(s)} onClick={() => setPref('specialNeeds', toggle(p.specialNeeds, s))}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
