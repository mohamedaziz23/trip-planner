'use client';

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Car, Footprints, GripVertical, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTripContext } from '@/components/trips/TripContext';
import { PlaceForm, type PlaceValues } from '@/components/trips/PlaceForm';
import { useToast } from '@/components/Toaster';
import { Button, Chip, EmptyState, LoadingBlock, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { dayColor } from '@/lib/constants';
import { capitalize, dayDate, formatDate, formatMinutes, tripDays } from '@/lib/format';
import { usePlaces } from '@/lib/hooks';
import { objectId } from '@/lib/objectId';
import { createDoc, deleteDoc, updateDoc, useSyncStatus } from '@/lib/sync';
import type { DayRoute, Place } from '@/lib/types';
import type { MapRoute } from '@/components/map/TripMap';

const TripMap = dynamic(() => import('@/components/map/TripMap'), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl bg-surface text-sm text-muted">Loading map…</div>,
});

type Leg = DayRoute['legs'][number];

/** Straight-line estimate used offline (same rule as the API fallback). */
function estimateLegs(stops: Place[]): Leg[] {
  const legs: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(s));
    legs.push({ from: a._id, to: b._id, distanceKm: Math.round(km * 13) / 10, driveMin: Math.round(((km * 1.3) / 40) * 60), walkMin: Math.round(((km * 1.25) / 4.5) * 60) });
  }
  return legs;
}

function LegInfo({ leg, estimated }: { leg: Leg; estimated: boolean }) {
  return (
    <div className="ml-9 flex items-center gap-3 border-l-2 border-dashed border-line py-1 pl-4 text-xs text-muted">
      <span className="flex items-center gap-1">
        <Car className="size-3.5" aria-hidden /> {formatMinutes(leg.driveMin)}
      </span>
      <span className="flex items-center gap-1">
        <Footprints className="size-3.5" aria-hidden /> {formatMinutes(leg.walkMin)}
      </span>
      <span>{leg.distanceKm} km</span>
      {estimated && <span className="italic">estimate</span>}
    </div>
  );
}

function PlaceRow({ place, index, days, onEdit, onDelete, onMove, onFocus }: {
  place: Place;
  index: number;
  days: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (day: number | null) => void;
  onFocus: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place._id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('flex items-center gap-2 rounded-lg border border-line bg-white p-2', isDragging && 'relative z-10 shadow-lg')}
    >
      <button type="button" className="cursor-grab touch-none rounded p-1 text-muted hover:bg-surface" aria-label={`Reorder ${place.name}`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: dayColor(place.day) }}>
        {place.day ? index + 1 : '•'}
      </span>
      <button type="button" onClick={onFocus} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{place.name}</p>
        <p className="truncate text-xs text-muted">
          {[place.startTime, place.durationMin ? formatMinutes(place.durationMin) : null, capitalize(place.category)].filter(Boolean).join(' · ')}
        </p>
      </button>
      <select
        aria-label={`Move ${place.name} to another day`}
        value={place.day ?? ''}
        onChange={(e) => onMove(e.target.value ? Number(e.target.value) : null)}
        className="hidden h-8 rounded-md border border-line bg-white px-1 text-xs sm:block"
      >
        <option value="">Unscheduled</option>
        {Array.from({ length: days }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            Day {i + 1}
          </option>
        ))}
      </select>
      <button type="button" onClick={onEdit} className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label={`Edit ${place.name}`}>
        <Pencil className="size-4" />
      </button>
      <button type="button" onClick={onDelete} className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${place.name}`}>
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export default function ItineraryPage() {
  const { trip } = useTripContext();
  const toast = useToast();
  const { online } = useSyncStatus();
  const places = usePlaces(trip._id);
  const days = tripDays(trip.startDate, trip.endDate);
  const [filter, setFilter] = useState<'all' | 'unscheduled' | number>('all');
  const [editing, setEditing] = useState<{ place?: Place; day: number | null } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [routes, setRoutes] = useState<Record<number, DayRoute>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const byDay = useMemo(() => {
    const map = new Map<number | null, Place[]>();
    for (const p of places ?? []) {
      if (!map.has(p.day)) map.set(p.day, []);
      map.get(p.day)!.push(p);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [places]);

  // Fetch the road route of each day (OSRM through the API); recomputed when stops change.
  const routeKey = [...byDay.entries()]
    .filter(([d, l]) => d && l.length > 1)
    .map(([d, l]) => `${d}:${l.map((p) => `${p._id}@${p.lat},${p.lng}`).join(';')}`)
    .join('|');
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const wanted = [...byDay.entries()].filter(([d, l]) => d && l.length > 1).map(([d]) => d as number);
    Promise.all(wanted.map((day) => api<DayRoute>(`/trips/${trip._id}/route?day=${day}`).catch(() => null))).then((list) => {
      if (cancelled) return;
      const next: Record<number, DayRoute> = {};
      list.forEach((r) => r && (next[r.day] = r));
      setRoutes(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, online, trip._id]);

  if (!places) return <LoadingBlock />;

  const visible = places.filter((p) => (filter === 'all' ? true : filter === 'unscheduled' ? p.day === null : p.day === filter));
  const mapRoutes: MapRoute[] = [...byDay.entries()]
    .filter(([d, l]) => d && l.length > 1 && (filter === 'all' || filter === d))
    .map(([d, l]) => {
      const r = routes[d as number];
      const fresh = r && r.legs.length === l.length - 1 && r.legs.every((leg, i) => leg.from === l[i]._id && leg.to === l[i + 1]._id);
      return { day: d as number, geometry: fresh ? r.geometry : l.map((p) => [p.lat, p.lng] as [number, number]) };
    });

  function legsFor(day: number, list: Place[]) {
    const r = routes[day];
    const fresh = r && r.legs.length === list.length - 1 && r.legs.every((leg, i) => leg.from === list[i]._id && leg.to === list[i + 1]._id);
    return { legs: fresh ? r.legs : estimateLegs(list), estimated: !fresh };
  }

  async function save(values: PlaceValues) {
    if (editing?.place) {
      const changes: Record<string, unknown> = { ...values };
      if (values.day !== editing.place.day) changes.order = (byDay.get(values.day)?.length ?? 0);
      await updateDoc('places', trip._id, editing.place._id, changes);
      toast('Place saved');
    } else {
      const id = objectId();
      const order = byDay.get(values.day)?.length ?? 0;
      const payload = { ...values, order };
      await createDoc('places', trip._id, { _id: id, trip: trip._id, ...payload } as Place, payload);
      toast('Place added');
    }
    setEditing(null);
  }

  async function remove(place: Place) {
    if (!confirm(`Delete "${place.name}" from the itinerary?`)) return;
    await deleteDoc('places', trip._id, place._id);
    toast('Place deleted');
  }

  async function move(place: Place, day: number | null) {
    await updateDoc('places', trip._id, place._id, { day, order: byDay.get(day)?.length ?? 0 });
  }

  async function onDragEnd(day: number | null, event: DragEndEvent) {
    const list = byDay.get(day) ?? [];
    const from = list.findIndex((p) => p._id === event.active.id);
    const to = list.findIndex((p) => p._id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(list, from, to);
    await Promise.all(next.map((p, i) => (p.order !== i ? updateDoc('places', trip._id, p._id, { order: i }) : null)));
  }

  const dayList: (number | null)[] = [...Array.from({ length: days }, (_, i) => i + 1), null];
  const shownDays = dayList.filter((d) => filter === 'all' || (filter === 'unscheduled' ? d === null : d === filter));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the map by day">
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
            All days
          </Chip>
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <Chip key={d} selected={filter === d} onClick={() => setFilter(d)}>
              <span className="mr-1 inline-block size-2 rounded-full" style={{ background: dayColor(d) }} aria-hidden />
              Day {d}
            </Chip>
          ))}
          <Chip selected={filter === 'unscheduled'} onClick={() => setFilter('unscheduled')}>
            Unscheduled
          </Chip>
        </div>
        <TripMap places={visible} routes={mapRoutes} focus={focus} onSelect={(p) => setEditing({ place: p, day: p.day })} />
        {!online && <p className="text-xs text-muted">Offline: map tiles you already viewed are available; travel times are straight-line estimates.</p>}
      </div>

      <div className="min-w-0 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Itinerary</h2>
          <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ day: typeof filter === 'number' ? filter : 1 })}>
            Add place
          </Button>
        </div>

        {places.length === 0 && (
          <EmptyState icon={<MapPin className="size-8" />} title="No places yet" action={<Button onClick={() => setEditing({ day: 1 })}>Add the first place</Button>}>
            Search for a landmark or click on the map, then assign it to a day.
          </EmptyState>
        )}

        {places.length > 0 &&
          shownDays.map((day) => {
            const list = byDay.get(day) ?? [];
            if (day === null && list.length === 0) return null;
            const { legs, estimated } = day ? legsFor(day, list) : { legs: [], estimated: true };
            const total = list.reduce((s, p) => s + (p.durationMin || 0), 0) + legs.reduce((s, l) => s + Math.min(l.walkMin, l.driveMin), 0);
            return (
              <section key={day ?? 'none'} aria-labelledby={`day-${day ?? 'none'}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 id={`day-${day ?? 'none'}`} className="flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-block size-3 rounded-full" style={{ background: dayColor(day) }} aria-hidden />
                    {day ? `Day ${day}` : 'Not scheduled'}
                    {day && <span className="font-normal text-muted">· {formatDate(dayDate(trip.startDate, day), { weekday: 'short', day: 'numeric', month: 'short', year: undefined })}</span>}
                  </h3>
                  {day && list.length > 0 && <span className="text-xs text-muted">≈ {formatMinutes(total)}</span>}
                </div>
                {list.length === 0 ? (
                  <button type="button" onClick={() => setEditing({ day })} className="w-full rounded-lg border border-dashed border-line py-3 text-sm text-muted hover:border-brand hover:text-brand-dark">
                    + Add a place to this day
                  </button>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(day, e)}>
                    <SortableContext items={list.map((p) => p._id)} strategy={verticalListSortingStrategy}>
                      <div>
                        {list.map((place, i) => (
                          <div key={place._id}>
                            <PlaceRow
                              place={place}
                              index={i}
                              days={days}
                              onEdit={() => setEditing({ place, day: place.day })}
                              onDelete={() => remove(place)}
                              onMove={(d) => move(place, d)}
                              onFocus={() => setFocus({ lat: place.lat, lng: place.lng })}
                            />
                            {legs[i] && <LegInfo leg={legs[i]} estimated={estimated} />}
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </section>
            );
          })}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.place ? 'Edit place' : 'Add a place'} wide>
        {editing && (
          <PlaceForm
            initial={editing.place}
            days={days}
            defaultDay={editing.day}
            currency={trip.baseCurrency}
            existing={places}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
