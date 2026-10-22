import { rateLimit } from 'express-rate-limit';
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

/** General API safety net. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});
