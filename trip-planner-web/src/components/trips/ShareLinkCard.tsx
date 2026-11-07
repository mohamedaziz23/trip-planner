'use client';

import { Copy, ExternalLink, FileDown, Link2, Link2Off } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { db } from '@/lib/db';
import { useSyncStatus } from '@/lib/sync';
import type { Trip } from '@/lib/types';
import { Button, Card, Input } from '@/components/ui';
import { useToast } from '@/components/Toaster';

interface ShareInfo {
  shareToken: string;
  url: string;
  qrSvg: string;
}

/**
 * Module 1 — public share link of a trip (owner only): create, copy, show as a
 * QR code, open, download the public PDF, revoke.
 */
export function ShareLinkCard({ trip }: { trip: Trip }) {
  const toast = useToast();
  const { online } = useSyncStatus();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [busy, setBusy] = useState(false);

  // load the link + QR code when the trip already has one
  useEffect(() => {
    if (!trip.shareToken || !online) return;
    let cancelled = false;
    api<ShareInfo>(`/trips/${trip._id}/share`)
      .then((i) => !cancelled && setInfo(i))
      .catch((err) => {
        // revoked from another device: forget the local token
        if (!cancelled && err instanceof ApiError && err.status === 404) void db.trips.update(trip._id, { shareToken: undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [trip._id, trip.shareToken, online]);

  async function enable() {
    setBusy(true);
    try {
      const next = await api<ShareInfo>(`/trips/${trip._id}/share`, { method: 'POST' });
      await db.trips.update(trip._id, { shareToken: next.shareToken });
      setInfo(next);
      toast('Share link created');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Revoke the link? People who have it will no longer be able to open the itinerary.')) return;
    setBusy(true);
    try {
      await api(`/trips/${trip._id}/share`, { method: 'DELETE' });
      await db.trips.update(trip._id, { shareToken: undefined });
      setInfo(null);
      toast('Share link revoked');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const active = Boolean(trip.shareToken);

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold">Public share link</h2>
      <p className="mb-4 text-sm text-muted">
        Anyone with the link can see the itinerary read-only, without an account, and download it as a PDF. The budget, expenses and journal stay private.
      </p>

      {!active ? (
        <Button loading={busy} disabled={!online} onClick={enable} icon={<Link2 className="size-4" aria-hidden />}>
          Create share link
        </Button>
      ) : !info ? (
        <p className="text-sm text-muted">{online ? 'Loading the link…' : 'The link is active. Reconnect to see it.'}</p>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(info.qrSvg)}`}
            alt="QR code of the share link"
            width={140}
            height={140}
            className="rounded-lg border border-line bg-white p-1"
          />
          <div className="min-w-60 flex-1 space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={info.url} aria-label="Share link" onFocus={(e) => e.target.select()} />
              <Button
                variant="secondary"
                icon={<Copy className="size-4" aria-hidden />}
                onClick={async () => {
                  await navigator.clipboard.writeText(info.url);
                  toast('Link copied');
                }}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted">Scan the QR code with a phone, or send the link to family and friends. It is also printed on the exported PDF.</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={info.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-surface"
              >
                <ExternalLink className="size-4" aria-hidden /> Open
              </a>
              <a
                href={`/api/v1/share/${info.shareToken}/export`}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-surface"
              >
                <FileDown className="size-4" aria-hidden /> Public PDF
              </a>
              <Button size="sm" variant="ghost" loading={busy} disabled={!online} onClick={revoke} icon={<Link2Off className="size-4" aria-hidden />}>
                Revoke link
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
