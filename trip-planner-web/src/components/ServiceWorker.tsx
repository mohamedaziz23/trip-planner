'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { startSync } from '@/lib/sync';

const SW_ENABLED = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

/**
 * Registers /sw.js, starts the sync engine, and asks the service worker to keep
 * a copy of every page the user visits so it can be reopened offline.
 */
export function ServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    startSync();
    if (!SW_ENABLED || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }, []);

  useEffect(() => {
    if (!SW_ENABLED || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: 'CACHE_PAGE', url: pathname });
    });
  }, [pathname]);

  return null;
}
