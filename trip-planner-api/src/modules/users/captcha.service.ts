import crypto from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { env } from '../../config/env';
import { ApiError } from '../../lib/http';
import { sha256 } from '../../lib/tokens';

/**
 * Self-hosted image captcha: the API draws the characters as SVG paths (not
 * text, so a bot cannot read them from the markup) and keeps only a hash of
 * the answer. A challenge is valid 5 minutes and can be tried once.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 10_000;
const challenges = new Map<string, { answerHash: string; expiresAt: number }>();

function prune() {
  const now = Date.now();
  for (const [id, c] of challenges) if (c.expiresAt < now) challenges.delete(id);
  // hard cap against flooding: drop the oldest entries
  while (challenges.size > MAX_PENDING) challenges.delete(challenges.keys().next().value!);
}

const normalize = (answer: string) => answer.trim().toLowerCase();

export function createCaptcha() {
  prune();
  const { text, data } = svgCaptcha.create({
    size: 5,
    noise: 3,
    color: true,
    width: 180,
    height: 60,
    fontSize: 54,
    // no look-alike characters (0/O, 1/l/I...)
    ignoreChars: '0oO1lIiu',
    background: '#f0fdfa',
  });
  const captchaId = crypto.randomUUID();
  challenges.set(captchaId, { answerHash: sha256(normalize(text)), expiresAt: Date.now() + TTL_MS });
  return { captchaId, svg: data, expiresInSeconds: TTL_MS / 1000 };
}

/** Checks an answer (case-insensitive). The challenge is consumed whatever the result. */
export function verifyCaptcha(captchaId: string | undefined, answer: string | undefined): boolean {
  if (!captchaId || !answer) return false;
  const challenge = challenges.get(captchaId);
  challenges.delete(captchaId);
  if (!challenge || challenge.expiresAt < Date.now()) return false;
  const given = Buffer.from(sha256(normalize(answer)));
  const expected = Buffer.from(challenge.answerHash);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Throws 400 with a `captcha` field error (and `captchaRequired` in data) unless the answer is right. */
export function assertCaptcha(input: { captchaId?: string; captchaAnswer?: string }) {
  if (!env.captchaEnabled) return;
  if (!verifyCaptcha(input.captchaId, input.captchaAnswer)) {
    throw new ApiError(
      400,
      input.captchaAnswer ? 'The captcha answer is wrong or expired' : 'Please solve the captcha',
      [{ path: 'captcha', message: input.captchaAnswer ? 'Wrong or expired captcha' : 'Captcha required' }],
      { captchaRequired: true },
    );
  }
}

// ---------------------------------------------------------------- login protection
/**
 * After 3 failed logins for the same email within 15 minutes, the next attempts
 * must include a solved captcha. A successful login resets it. The counter is
 * keyed by email only: an attacker cannot reset it by changing (or forging) IP.
 */
const FAILURE_LIMIT = 3;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();
const key = (email: string) => email.toLowerCase();

export function loginNeedsCaptcha(email: string) {
  if (!env.captchaEnabled) return false;
  const f = failures.get(key(email));
  if (!f) return false;
  if (Date.now() - f.first > FAILURE_WINDOW_MS) {
    failures.delete(key(email));
    return false;
  }
  return f.count >= FAILURE_LIMIT;
}

export function recordLoginFailure(email: string) {
  const k = key(email);
  const f = failures.get(k);
  if (!f || Date.now() - f.first > FAILURE_WINDOW_MS) failures.set(k, { count: 1, first: Date.now() });
  else f.count++;
  if (failures.size > MAX_PENDING) failures.delete(failures.keys().next().value!);
}

export function clearLoginFailures(email: string) {
  failures.delete(key(email));
}
