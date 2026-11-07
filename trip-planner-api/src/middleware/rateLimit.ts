import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Envelope } from '../lib/http';

const tooMany: Envelope<null> = { data: null, message: 'Too many requests, please try again later', errors: null };

/** Login / register / password reset: 20 attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

/** Trip invitations send emails: 20 per hour per IP so the API cannot be used to spam addresses. */
export const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

/** Each assistant turn is one call to the (free-tier) LLM: 40 turns per 15 minutes per IP. */
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

/** General API safety net. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

/** New captcha images: 30 per minute per IP. */
export const captchaLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

/** Generative AI (Trip Story): expensive, so keep it to 10 per hour per user. */
export const aiStoryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: tooMany,
});
