'use client';

import clsx from 'clsx';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onSyncNotice } from '@/lib/sync';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  useEffect(
    () =>
      onSyncNotice((n) => {
        push(n.message, n.kind === 'error' ? 'error' : 'info');
      }),
    [push],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={clsx(
              'pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm text-white shadow-lg',
              t.tone === 'success' && 'bg-green-800',
              t.tone === 'error' && 'bg-red-800',
              t.tone === 'info' && 'bg-gray-800',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
