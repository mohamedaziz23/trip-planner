'use client';

import { BellRing, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { currentSubscription, enablePush, pushSupported } from '@/lib/push';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toaster';

/**
 * In-context permission request: shown only after the user posted or replied
 * (never on first load), explaining why notifications are useful.
 */
export function PushOptIn({ reason }: { reason: string }) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !pushSupported() || Notification.permission === 'denied') return;
    currentSubscription().then((sub) => setVisible(!sub || !user.pushEnabled));
  }, [user]);

  if (!visible) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-light/60 px-4 py-3 text-sm" role="region" aria-label="Notifications">
      <BellRing className="size-5 text-brand-dark" aria-hidden />
      <p className="flex-1">{reason}</p>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await enablePush();
            if (result === 'enabled') {
              toast('Notifications enabled on this device');
              if (user) setUser({ ...user, pushEnabled: true });
              setVisible(false);
            } else if (result === 'denied') {
              toast('Notifications are blocked in your browser settings', 'error');
              setVisible(false);
            } else {
              toast('Notifications are not available here (install the app or use HTTPS)', 'error');
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        Turn on notifications
      </Button>
      <button type="button" onClick={() => setVisible(false)} className="rounded p-1 hover:bg-white/60" aria-label="Not now">
        <X className="size-4" />
      </button>
    </div>
  );
}
