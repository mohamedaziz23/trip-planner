'use client';

import { useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { FORUM_CATEGORIES } from '@/lib/constants';
import { capitalize } from '@/lib/format';
import type { ForumPost } from '@/lib/types';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';

export interface PostValues {
  title: string;
  body: string;
  category: string;
  destinationTags: string[];
}

export function PostEditor({ initial, submitLabel, onSubmit, onCancel }: { initial?: ForumPost; submitLabel: string; onSubmit: (v: PostValues) => Promise<void>; onCancel?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'destinations');
  const [tags, setTags] = useState(initial?.destinationTags.join(', ') ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const destinationTags = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const errs: Record<string, string> = {};
    if (title.trim().length < 10 || title.trim().length > 120) errs.title = 'Title must be 10 to 120 characters';
    if (body.trim().length < 20 || body.trim().length > 5000) errs.body = 'Body must be 20 to 5000 characters';
    if (!destinationTags.length) errs.destinationTags = 'Add at least one destination';
    if (destinationTags.length > 5) errs.destinationTags = 'Five destinations at most';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), body: body.trim(), category, destinationTags });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Title" error={errors.title} hint={`${title.trim().length}/120`}>
        {(id, d) => <Input id={id} aria-describedby={d} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Is three days enough for Lisbon?" />}
      </Field>
      <Field label="Your question or tip" error={errors.body} hint={`${body.trim().length}/5000`}>
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={8} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              {FORUM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Destinations" error={errors.destinationTags} hint="Comma separated, e.g. lisbon, portugal">
          {(id, d) => <Input id={id} aria-describedby={d} value={tags} onChange={(e) => setTags(e.target.value)} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
