'use client';

import { Crosshair, ImagePlus, MapPin, NotebookPen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTripContext } from '@/components/trips/TripContext';
import { useToast } from '@/components/Toaster';
import { Avatar, Button, EmptyState, Field, Input, LoadingBlock, Modal, Select, Textarea } from '@/components/ui';
import { errorMessage, uploadImages } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MOODS } from '@/lib/constants';
import { formatDate, imageUrl, toDateInput } from '@/lib/format';
import { useJournal, usePlaces } from '@/lib/hooks';
import { objectId } from '@/lib/objectId';
import { createDoc, deleteDoc, updateDoc, useSyncStatus } from '@/lib/sync';
import type { JournalEntry, Place, Trip, User } from '@/lib/types';

const authorOf = (e: JournalEntry) => (typeof e.author === 'string' ? { _id: e.author, name: '…', avatarUrl: null } : e.author);

function EntryForm({ trip, places, user, initial, onDone }: { trip: Trip; places: Place[]; user: User; initial?: JournalEntry; onDone: () => void }) {
  const toast = useToast();
  const { online } = useSyncStatus();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [date, setDate] = useState(toDateInput(initial?.date ?? new Date()));
  const [mood, setMood] = useState(initial?.mood ?? 'happy');
  const [place, setPlace] = useState<string>(initial?.place ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { urls } = await uploadImages([...files].slice(0, 6 - photos.length), 'journal');
      setPhotos((p) => [...p, ...urls]);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  function locate() {
    if (!navigator.geolocation) return toast('Location is not available on this device', 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setLocating(false);
      },
      () => {
        toast('Could not get your location', 'error');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError('Write something about your day');
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        date: new Date(date).toISOString(),
        mood,
        place: place || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        photos,
      };
      if (initial) {
        await updateDoc('journal', trip._id, initial._id, payload);
      } else {
        const id = objectId();
        await createDoc('journal', trip._id, { _id: id, trip: trip._id, author: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl }, ...payload } as JournalEntry, payload);
      }
      toast('Journal entry saved');
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Place (optional)">
          {(id) => (
            <Select id={id} value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">—</option>
              {places.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Title (optional)">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Your day" error={error ?? undefined}>
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Mood</legend>
        <div className="flex gap-2">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMood(m.value)}
              aria-pressed={mood === m.value}
              aria-label={m.label}
              title={m.label}
              className={`rounded-lg border px-2.5 py-1.5 text-xl ${mood === m.value ? 'border-brand bg-brand-light' : 'border-line bg-white'}`}
            >
              {m.emoji}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" loading={locating} onClick={locate} icon={<Crosshair className="size-4" aria-hidden />}>
          {coords ? 'Update location' : 'Add my location'}
        </Button>
        {coords && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5" aria-hidden /> {coords.lat}, {coords.lng}
            <button type="button" onClick={() => setCoords(null)} aria-label="Remove location" className="rounded p-0.5 hover:bg-surface">
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Photos</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(url, 200)} alt="" className="size-20 rounded-md object-cover" />
              <button type="button" onClick={() => setPhotos((p) => p.filter((x) => x !== url))} className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow" aria-label="Remove photo">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {photos.length < 6 &&
            (online ? (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line text-xs text-muted hover:border-brand">
                <ImagePlus className="size-5" aria-hidden />
                {uploading ? 'Uploading…' : 'Add'}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            ) : (
              <p className="self-center text-xs text-muted">Photos can be added once you are back online.</p>
            ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} disabled={uploading}>
          Save entry
        </Button>
      </div>
    </form>
  );
}

export default function JournalPage() {
  const { trip } = useTripContext();
  const { user } = useAuth();
  const toast = useToast();
  const entries = useJournal(trip._id);
  const places = usePlaces(trip._id) ?? [];
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);

  if (!entries || !user) return <LoadingBlock />;
  const placeName = (id: string | null) => places.find((p) => p._id === id)?.name;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Travel journal</h2>
        <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
          New entry
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={<NotebookPen className="size-8" />} title="No entries yet" action={<Button onClick={() => setEditing('new')}>Write the first entry</Button>}>
          Keep memories of each day — entries can be written offline and sync later.
        </EmptyState>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => {
            const author = authorOf(entry);
            const mood = MOODS.find((m) => m.value === entry.mood);
            const mine = author._id === user._id;
            return (
              <li key={entry._id}>
                <article className="rounded-xl border border-line bg-white p-5">
                  <header className="flex items-start gap-3">
                    <span className="text-2xl" role="img" aria-label={mood?.label ?? entry.mood}>
                      {mood?.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{entry.title || formatDate(entry.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                        {entry.place && placeName(entry.place) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden /> {placeName(entry.place)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Avatar name={author.name} url={author.avatarUrl} size={16} /> {author.name}
                        </span>
                      </p>
                    </div>
                    {mine && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setEditing(entry)} className="rounded p-1.5 text-muted hover:bg-surface" aria-label="Edit entry">
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Delete this journal entry?')) return;
                            await deleteDoc('journal', trip._id, entry._id);
                            toast('Entry deleted');
                          }}
                          className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-700"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </header>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{entry.body}</p>
                  {entry.photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {entry.photos.map((url, i) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl(url, 400)} alt={`Photo ${i + 1} of the entry`} loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New journal entry' : 'Edit entry'} wide>
        {editing && <EntryForm trip={trip} places={places} user={user} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
