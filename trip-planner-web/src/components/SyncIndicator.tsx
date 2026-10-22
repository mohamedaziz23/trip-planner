'use client';

import clsx from 'clsx';
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { flushOutbox, useSyncStatus } from '@/lib/sync';
import { relativeTime } from '@/lib/format';

/** Visible sync state: offline / pending changes / syncing / synced. */
export function SyncIndicator() {
  const s = useSyncStatus();

  let tone = 'text-green-800 bg-green-100';
  let icon = <CheckCircle2 className="size-4" aria-hidden />;
  let label = 'Synced';
  let detail = s.lastSyncedAt ? `Last sync ${relativeTime(s.lastSyncedAt)}` : 'All changes saved';

  if (!s.online) {
    tone = 'text-amber-900 bg-amber-100';
    icon = <CloudOff className="size-4" aria-hidden />;
    label = s.pending ? `Offline · ${s.pending} pending` : 'Offline';
    detail = 'Changes are saved on this device and will sync when you reconnect';
  } else if (s.needsLogin) {
    tone = 'text-red-800 bg-red-100';
    icon = <AlertTriangle className="size-4" aria-hidden />;
    label = 'Log in to sync';
    detail = s.lastError ?? '';
  } else if (s.syncing) {
    tone = 'text-sky-900 bg-sky-100';
    icon = <RefreshCw className="size-4 animate-spin" aria-hidden />;
    label = 'Syncing…';
  } else if (s.pending) {
    tone = 'text-amber-900 bg-amber-100';
    icon = <RefreshCw className="size-4" aria-hidden />;
    label = `${s.pending} pending`;
    detail = s.lastError ? `Will retry: ${s.lastError}` : 'Waiting to sync';
  }

  return (
    <button
      type="button"
      onClick={() => void flushOutbox()}
      title={detail}
      aria-label={`${label}. ${detail}. Activate to sync now.`}
      className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', tone)}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
