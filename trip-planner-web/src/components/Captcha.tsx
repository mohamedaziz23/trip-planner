'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Input } from './ui';

export interface CaptchaValue {
  captchaId: string;
  captchaAnswer: string;
}

interface Challenge {
  captchaId: string;
  svg: string;
}

/**
 * Image captcha served by the API (GET /auth/captcha). Change `refreshKey`
 * to load a new challenge (each challenge can only be tried once).
 */
export function Captcha({ value, onChange, refreshKey = 0, error }: { value: CaptchaValue | null; onChange: (v: CaptchaValue | null) => void; refreshKey?: number; error?: string }) {
  const id = useId();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    api<Challenge>('/auth/captcha', { auth: false })
      .then((c) => {
        if (cancelled) return;
        setChallenge(c);
        setLoadError(null);
        onChange(null);
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
    // onChange is a state setter from the parent form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, nonce]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Security check
      </label>
      <div className="flex items-center gap-2">
        <div className="flex h-[60px] w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-brand-light/40">
          {challenge ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(challenge.svg)}`} alt="Captcha: type the 5 characters shown" width={180} height={60} />
          ) : (
            <span className="text-xs text-muted">{loadError ?? 'Loading…'}</span>
          )}
        </div>
        <button type="button" onClick={reload} className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Show another captcha">
          <RefreshCw className="size-4" />
        </button>
      </div>
      <Input
        id={id}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={10}
        placeholder="Type the characters"
        aria-describedby={error ? `${id}-error` : undefined}
        value={value?.captchaAnswer ?? ''}
        disabled={!challenge}
        onChange={(e) => challenge && onChange({ captchaId: challenge.captchaId, captchaAnswer: e.target.value })}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
