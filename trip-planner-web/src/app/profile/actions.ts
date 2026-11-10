'use server';

import { z } from 'zod';
import { COUNTRIES, CURRENCIES } from '@/lib/constants';
import type { User } from '@/lib/types';

/**
 * Server Action (module 1): saves the profile form on the server.
 *
 * It runs inside the Next.js server, never in the browser:
 *  1. validates the submitted fields with zod (untrusted input),
 *  2. forwards the change to the Express API with the user's access token, so
 *     authentication, authorisation and persistence stay in the API (spec rule:
 *     every call goes through the Express API),
 *  3. returns a small state object rendered by useActionState.
 * API_URL is a server-only variable: the browser never learns where the API lives.
 */

export interface ProfileFormState {
  status: 'idle' | 'success' | 'error';
  message: string;
  fieldErrors: Partial<Record<'name' | 'baseCurrency' | 'homeCountry' | 'language', string>>;
  /** true when the access token was missing or rejected: the client refreshes it and retries */
  unauthorized?: boolean;
  user?: User;
}

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const COUNTRY_CODES = COUNTRIES.map(([code]) => code);

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be 80 characters or less'),
  baseCurrency: z.string().refine((c) => CURRENCIES.includes(c), 'Choose a currency from the list'),
  homeCountry: z
    .string()
    .refine((c) => c === '' || COUNTRY_CODES.includes(c), 'Choose a country from the list')
    .transform((c) => c || null),
  language: z.enum(['en', 'fr', 'ar'], { error: 'Choose a language from the list' }),
});

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
};

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const token = field(formData, 'accessToken');
  if (!token) return { status: 'error', message: 'Your session has expired, please try again.', fieldErrors: {}, unauthorized: true };

  const parsed = profileSchema.safeParse({
    name: field(formData, 'name'),
    baseCurrency: field(formData, 'baseCurrency'),
    homeCountry: field(formData, 'homeCountry'),
    language: field(formData, 'language'),
  });
  if (!parsed.success) {
    const fieldErrors: ProfileFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ProfileFormState['fieldErrors'];
      fieldErrors[key] ??= issue.message;
    }
    return { status: 'error', message: 'Please correct the highlighted fields.', fieldErrors };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch {
    return { status: 'error', message: 'The API is unreachable, try again in a moment.', fieldErrors: {} };
  }

  const body = (await res.json().catch(() => null)) as { data: User | null; message: string; errors: { path: string; message: string }[] | null } | null;
  if (res.status === 401) return { status: 'error', message: 'Your session has expired, please try again.', fieldErrors: {}, unauthorized: true };
  if (!res.ok || !body?.data) {
    const fieldErrors: ProfileFormState['fieldErrors'] = {};
    for (const e of body?.errors ?? []) fieldErrors[e.path as keyof ProfileFormState['fieldErrors']] ??= e.message;
    return { status: 'error', message: body?.message ?? `The API answered ${res.status}`, fieldErrors };
  }

  // only what the page renders goes back to the client
  return { status: 'success', message: 'Profile saved on the server (Server Action).', fieldErrors: {}, user: body.data };
}
