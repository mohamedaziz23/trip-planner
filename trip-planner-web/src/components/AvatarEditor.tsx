'use client';

import clsx from 'clsx';
import { Camera, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSyncStatus } from '@/lib/sync';
import type { User } from '@/lib/types';
import { Avatar, Button } from './ui';
import { useToast } from './Toaster';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const SIZE = 256; // stored avatar: 256 x 256

/** Crops the centre square of an image and resizes it to SIZE px (WebP, JPEG fallback). */
async function toSquareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!jpeg) throw new Error('Could not process the image');
  return jpeg;
}

/** Profile photo: choose or drop an image, preview the square crop, save or remove. */
export function AvatarEditor({ user }: { user: User }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const { online } = useSyncStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [dragging, setDragging] = useState(false);

  // release the object URL of the preview
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError('Choose a JPEG, PNG, WebP, GIF or AVIF image.');
    if (file.size > MAX_BYTES) return setError('The image must be 5 MB or less.');
    try {
      const blob = await toSquareAvatar(file);
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError('This image could not be read. Try another one.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function save() {
    if (!preview) return;
    setBusy('save');
    try {
      const form = new FormData();
      form.append('avatar', preview.blob, preview.blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
      setUser(await api<User>('/users/me/avatar', { method: 'POST', form }));
      setPreview(null);
      toast('Profile photo updated');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm('Remove your profile photo?')) return;
    setBusy('remove');
    try {
      setUser(await api<User>('/users/me/avatar', { method: 'DELETE' }));
      toast('Profile photo removed');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-medium text-ink">Profile photo</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'flex flex-wrap items-center gap-5 rounded-xl border border-dashed p-4 transition-colors',
          dragging ? 'border-brand bg-brand-light/40' : 'border-line',
        )}
      >
        <div className="relative">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="New profile photo preview" width={96} height={96} className="size-24 rounded-full object-cover ring-2 ring-brand" />
          ) : (
            <Avatar name={user.name} url={user.avatarUrl} size={96} />
          )}
          {!preview && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!online}
              className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-brand p-1.5 text-white shadow hover:bg-brand-dark disabled:opacity-50"
              aria-label="Choose a new profile photo"
            >
              <Camera className="size-4" />
            </button>
          )}
        </div>

        <div className="min-w-48 flex-1 space-y-2">
          {preview ? (
            <>
              <p className="text-sm text-muted">This is how your photo will look. Save it?</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={save} loading={busy === 'save'}>
                  Save photo
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPreview(null)} disabled={busy !== null}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                {online ? 'Drop an image here or choose one. It is cropped to a square — JPEG, PNG, WebP, GIF or AVIF, 5 MB max.' : 'Changing the photo needs a connection.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={!online} icon={<Upload className="size-4" aria-hidden />}>
                  {user.avatarUrl ? 'Change photo' : 'Upload a photo'}
                </Button>
                {user.avatarUrl && (
                  <Button size="sm" variant="ghost" onClick={remove} loading={busy === 'remove'} disabled={!online} icon={<Trash2 className="size-4" aria-hidden />}>
                    Remove photo
                  </Button>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPTED.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}
