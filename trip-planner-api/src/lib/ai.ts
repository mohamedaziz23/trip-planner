import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { ApiError } from './http';

let client: GoogleGenAI | null = null;

/** Lazily builds the Gemini client, so a missing key fails per-request, not at boot. */
export function gemini(): GoogleGenAI {
  if (!env.geminiApiKey) throw new ApiError(503, 'AI features are not configured on this server');
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

/** Model used for generative features. A free-tier Gemini Flash model. */
export const STORY_MODEL = env.geminiModel;

/** HTTP statuses worth retrying: rate limits, overload and gateway hiccups. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maps a raw Gemini SDK error to a clean ApiError the client can show. */
export function toAiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 503) return new ApiError(503, 'The AI service is busy right now. Please try again in a moment.');
  if (status === 401 || status === 403) return new ApiError(503, 'AI features are not configured correctly on this server.');
  return new ApiError(502, 'The AI service could not generate a response. Please try again.');
}

/**
 * Runs an AI call, retrying transient failures (free-tier Gemini 503s are
 * common) with exponential backoff, and mapping whatever remains to an ApiError.
 */
export async function withAiRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const status = (err as { status?: number })?.status;
      if (attempt === tries - 1 || !status || !TRANSIENT.has(status)) break;
      await delay(600 * 2 ** attempt); // 0.6s, 1.2s
    }
  }
  throw toAiError(last);
}
