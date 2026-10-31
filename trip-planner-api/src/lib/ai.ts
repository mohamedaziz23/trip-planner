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
