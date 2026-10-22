'use client';

import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { PLACE_CATEGORIES } from '@/lib/constants';
import { useSyncStatus } from '@/lib/sync';
import type { Place } from '@/lib/types';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';

const TripMap = dynamic(() => import('@/components/map/TripMap'), { ssr: false });

export interface PlaceValues {
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: string;
  day: number | null;
  startTime: string | null;
  durationMin: number;
  estimatedCost: number;
  notes: string;
}

interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function PlaceForm({
  initial,
  days,
  defaultDay,
  currency,
  existing,
  onSubmit,
  onCancel,
}: {
  initial?: Place;
  days: number;
  defaultDay: number | null;
  currency: string;
  existing: Place[];
  onSubmit: (values: PlaceValues) => Promise<void>;
  onCancel: () => void;
}) {
  const { online } = useSyncStatus();
  const [v, setV] = useState<PlaceValues>({
    name: initial?.name ?? '',
    lat: initial?.lat ?? NaN,
    lng: initial?.lng ?? NaN,
    address: initial?.address ?? '',
    category: initial?.category ?? 'sight',
    day: initial ? initial.day : defaultDay,
    startTime: initial?.startTime ?? null,
    durationMin: initial?.durationMin ?? 60,
    estimatedCost: initial?.estimatedCost ?? 0,
    notes: initial?.notes ?? '',
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PlaceValues>(k: K, value: PlaceValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const hasCoords = Number.isFinite(v.lat) && Number.isFinite(v.lng);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await api<GeoResult[]>(`/geocode?q=${encodeURIComponent(query.trim())}`));
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.name.trim()) errs.name = 'Give the place a name';
    if (!hasCoords) errs.coords = 'Search for the place or click on the map to set its location';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await onSubmit({ ...v, name: v.name.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            aria-label="Search a place"
            placeholder={online ? 'Search an address or landmark' : 'Search needs a connection — click the map instead'}
            value={query}
            disabled={!online}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
          <Button variant="secondary" onClick={search} loading={searching} disabled={!online} icon={<Search className="size-4" aria-hidden />}>
            Search
          </Button>
        </div>
        {searchError && <Alert tone="error">{searchError}</Alert>}
        {results.length > 0 && (
          <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface"
                  onClick={() => {
                    setV((x) => ({ ...x, lat: r.lat, lng: r.lng, address: r.address, name: x.name || r.name }));
                    setResults([]);
                  }}
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted">{r.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <TripMap
          places={existing.filter((p) => p._id !== initial?._id)}
          routes={[]}
          draft={hasCoords ? { lat: v.lat, lng: v.lng } : null}
          focus={hasCoords ? { lat: v.lat, lng: v.lng } : null}
          onPick={(lat, lng) => setV((x) => ({ ...x, lat, lng }))}
          className="h-56 w-full rounded-lg"
        />
        <p className={errors.coords ? 'text-xs text-red-700' : 'text-xs text-muted'} role={errors.coords ? 'alert' : undefined}>
          {errors.coords ?? (hasCoords ? `Location: ${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} — click the map to adjust` : 'Click on the map to place the marker')}
        </p>
      </div>

      <Field label="Name" error={errors.name}>
        {(id, d) => <Input id={id} aria-describedby={d} value={v.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <Field label="Address">
        {(id) => <Input id={id} value={v.address} onChange={(e) => set('address', e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Category">
          {(id) => (
            <Select id={id} value={v.category} onChange={(e) => set('category', e.target.value)} className="capitalize">
              {PLACE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Day">
          {(id) => (
            <Select id={id} value={v.day ?? ''} onChange={(e) => set('day', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Not scheduled</option>
              {Array.from({ length: days }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Day {i + 1}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Start time">
          {(id) => <Input id={id} type="time" value={v.startTime ?? ''} onChange={(e) => set('startTime', e.target.value || null)} />}
        </Field>
        <Field label="Duration (min)">
          {(id) => <Input id={id} type="number" min={0} step={15} value={v.durationMin} onChange={(e) => set('durationMin', Math.max(0, Number(e.target.value)))} />}
        </Field>
        <Field label={`Estimated cost (${currency})`}>
          {(id) => <Input id={id} type="number" min={0} step="0.5" value={v.estimatedCost} onChange={(e) => set('estimatedCost', Math.max(0, Number(e.target.value)))} />}
        </Field>
      </div>
      <Field label="Notes">
        {(id) => <Textarea id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {initial ? 'Save place' : 'Add place'}
        </Button>
      </div>
    </form>
  );
}
