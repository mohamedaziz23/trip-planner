'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Modal } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Browser facts read once on the client: "standalone|ios|dismissed" as 0/1 flags ("ssr" on the server). */
function readClientInfo() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('tp:install-dismissed') === '1';
  } catch {
    // storage unavailable
  }
  return `${+standalone}|${+ios}|${+dismissed}`;
}
const noSubscribe = () => () => undefined;

/**
 * Custom install button: uses `beforeinstallprompt` on Chrome / Edge / Android,
 * and shows "Add to Home Screen" instructions on iOS Safari (no install API there).
 */
export function InstallPrompt() {
  const info = useSyncExternalStore(noSubscribe, readClientInfo, () => 'ssr');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [flagStandalone, flagIOS, flagDismissed] = info === 'ssr' ? ['1', '0', '1'] : info.split('|');
  const standalone = flagStandalone === '1' || installed;
  const isIOS = flagIOS === '1';
  const dismissed = flagDismissed === '1' || hidden;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || dismissed || (!deferred && !isIOS)) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem('tp:install-dismissed', '1');
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          icon={<Download className="size-4" aria-hidden />}
          onClick={async () => {
            if (deferred) {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === 'accepted') setDeferred(null);
            } else {
              setShowIOSHelp(true);
            }
          }}
        >
          <span className="hidden md:inline">Install app</span>
          <span className="md:hidden">Install</span>
        </Button>
        <button type="button" onClick={dismiss} className="rounded p-1 text-muted hover:bg-surface" aria-label="Hide install button">
          <X className="size-4" />
        </button>
      </div>
      <Modal open={showIOSHelp} onClose={() => setShowIOSHelp(false)} title="Install on iPhone or iPad">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Tap the <Share className="inline size-4" aria-label="Share" /> Share button in Safari&apos;s toolbar.
          </li>
          <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open Trip Planner from your home screen to use it full screen and offline.</li>
        </ol>
        <p className="mt-4 text-xs text-muted">
          iOS limits: installation only works from Safari, push notifications require iOS 16.4 or later and the installed app, and
          Background Sync is not available (queued changes sync the next time you open the app).
        </p>
      </Modal>
    </>
  );
}
