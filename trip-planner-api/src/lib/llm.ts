import { env } from '../config/env';
import { ApiError } from './http';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Defaults per provider; AI_MODEL and AI_BASE_URL override them. */
const PROVIDERS: Record<string, { baseUrl: string; model: string }> = {
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.5-flash-lite' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  'openai-compatible': { baseUrl: '', model: '' },
};

const provider = env.ai.provider;
const defaults = PROVIDERS[provider];
const baseUrl = (env.ai.baseUrl || defaults?.baseUrl || '').replace(/\/+$/, '');
const model = env.ai.model || defaults?.model || '';

export const aiEnabled = Boolean(defaults && baseUrl && model && (provider === 'ollama' || env.ai.apiKey));

if (!aiEnabled) {
  console.warn('[ai] trip assistant disabled - set AI_PROVIDER and AI_API_KEY in .env (see .env.example)');
}

const TIMEOUT_MS = 30_000;

/** Statuses worth one more try: free tiers sometimes answer a one-off 403 or a 5xx on a valid request. */
const TRANSIENT = new Set([403, 500, 502, 503, 504]);

async function send(url: string, headers: Record<string, string>, body: unknown): Promise<Response | Error> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return err as Error;
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let attempt = await send(url, headers, body);
  if (attempt instanceof Error || TRANSIENT.has(attempt.status)) {
    console.warn('[ai] transient failure, retrying once:', attempt instanceof Error ? attempt.message : attempt.status);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempt = await send(url, headers, body);
  }
  if (attempt instanceof Error) {
    console.warn('[ai] request failed:', attempt.message);
    throw new ApiError(502, 'The AI service is unreachable, try again in a moment');
  }
  const res = attempt;
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.warn(`[ai] ${provider} answered ${res.status}: ${detail}`);
    if (res.status === 429) throw ApiError.tooMany('The AI service is busy (free quota reached) - try again in a minute');
    if (res.status === 401 || res.status === 403) throw new ApiError(502, 'The AI service denied the request - check AI_API_KEY and its permissions');
    if (res.status === 400 || res.status === 404) throw new ApiError(502, `The AI service rejected the request - check AI_MODEL ("${model}")`);
    throw new ApiError(502, 'The AI service failed, try again later');
  }
  return res.json();
}

async function viaGemini(system: string, messages: LlmMessage[]): Promise<string> {
  const json = (await post(
    `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': env.ai.apiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: 'application/json' },
    },
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

async function viaOpenAiCompatible(system: string, messages: LlmMessage[]): Promise<string> {
  const json = (await post(
    `${baseUrl}/chat/completions`,
    env.ai.apiKey ? { Authorization: `Bearer ${env.ai.apiKey}` } : {},
    {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      // some free OpenRouter models do not support JSON mode: the prompt asks for JSON anyway
      ...(provider !== 'openrouter' && { response_format: { type: 'json_object' } }),
    },
  )) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? '';
}

/** Sends a conversation to the configured LLM and returns its raw text answer (JSON is requested). */
export async function completeJson(system: string, messages: LlmMessage[]): Promise<string> {
  if (!aiEnabled) throw new ApiError(503, 'The AI assistant is not configured on this server');
  const text = provider === 'gemini' ? await viaGemini(system, messages) : await viaOpenAiCompatible(system, messages);
  if (!text.trim()) throw new ApiError(502, 'The AI service returned an empty answer, please try again');
  return text;
}
