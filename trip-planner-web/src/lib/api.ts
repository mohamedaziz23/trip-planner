import type { User } from './types';

export const API_BASE = '/api/v1';

export interface FieldError {
  path: string;
  message: string;
}

/** Error returned by the API (it answered with a 4xx/5xx envelope). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldError[] | null = null,
    public data: unknown = null,
  ) {
    super(message);
  }

  fieldError(path: string) {
    return this.errors?.find((e) => e.path === path)?.message;
  }
}

/** The request never reached the API (offline, DNS, timeout...). */
export class NetworkError extends Error {
  constructor() {
    super('You appear to be offline');
  }
}

// ------------------------------------------------------------------ access token (memory only)
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
type AuthListener = (session: { user: User; accessToken: string } | null) => void;
const listeners = new Set<AuthListener>();

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function onSessionChange(listener: AuthListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 * Single-flight: concurrent callers share the same request.
 * Returns null when the session is gone; throws NetworkError when offline.
 */
export function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      } catch {
        throw new NetworkError();
      }
      if (!res.ok) {
        if (res.status >= 500) throw new NetworkError();
        accessToken = null;
        listeners.forEach((l) => l(null));
        return null;
      }
      const body = (await res.json()) as { data: { user: User; accessToken: string } };
      accessToken = body.data.accessToken;
      listeners.forEach((l) => l(body.data));
      return accessToken;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// ------------------------------------------------------------------ request helper
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** multipart upload */
  form?: FormData;
  /** false for public endpoints; 'optional' sends the token when there is a session (forum) */
  auth?: boolean | 'optional';
  signal?: AbortSignal;
}

export interface ApiResult<T> {
  data: T;
  message: string;
}

async function send(path: string, opts: RequestOptions, token: string | null) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError();
  }
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  let body: { data: T; message: string; errors: FieldError[] | null } | null = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (proxy error page)
  }
  if (!res.ok) {
    // the service worker answers 503 + X-Offline when it has nothing cached
    if (res.headers.get('X-Offline')) throw new NetworkError();
    // no JSON envelope on a 5xx = the API itself is unreachable (proxy error page)
    if (res.status >= 500 && !body) throw new NetworkError();
    throw new ApiError(res.status, body?.message ?? `Request failed (${res.status})`, body?.errors ?? null, body?.data ?? null);
  }
  return { data: body?.data as T, message: body?.message ?? '' };
}

/** Calls the API and returns `{ data, message }`; retries once after refreshing an expired token. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
  if (opts.auth === 'optional') {
    const token = accessToken ?? (refreshing ? await refreshing.catch(() => null) : null);
    return parse<T>(await send(path, opts, token));
  }
  const auth = opts.auth !== false;
  let token = auth ? accessToken : null;
  if (auth && !token) token = await refreshSession();
  let res = await send(path, opts, token);
  if (res.status === 401 && auth) {
    token = await refreshSession();
    if (token) res = await send(path, opts, token);
  }
  return parse<T>(res);
}

/** Shortcut returning only `data`. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await request<T>(path, opts)).data;
}

/** Downloads a binary response (PDF export) with the access token. */
export async function download(path: string, filename: string) {
  let token = accessToken ?? (await refreshSession());
  let res = await send(path, {}, token);
  if (res.status === 401) {
    token = await refreshSession();
    res = await send(path, {}, token);
  }
  if (!res.ok) await parse(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function uploadImages(files: File[], folder: 'receipts' | 'journal' | 'misc') {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return api<{ urls: string[] }>(`/uploads?folder=${folder}`, { method: 'POST', form });
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return 'Something went wrong';
}
