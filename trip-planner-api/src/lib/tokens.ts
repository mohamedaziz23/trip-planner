import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../config/env';
import type { UserDoc } from '../modules/users/user.model';

export interface AccessPayload {
  sub: string;
  role: 'member' | 'admin';
}

interface RefreshPayload {
  sub: string;
  jti: string;
}

export const REFRESH_COOKIE = 'tp_refresh';
/** A rotated refresh token is still accepted for this long, so two tabs refreshing at once don't log the user out. */
const ROTATION_GRACE_MS = 15_000;

export function signAccessToken(user: Pick<UserDoc, '_id' | 'role'>): string {
  const payload: AccessPayload = { sub: user._id.toString(), role: user.role as AccessPayload['role'] };
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.accessTokenTtl as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as RefreshPayload;
}

/** Creates a refresh token, records its id on the user (caller saves) and returns the JWT. */
export function issueRefreshToken(user: UserDoc): string {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 3600 * 1000);
  // drop expired / long-rotated entries
  const now = Date.now();
  user.refreshTokens = user.refreshTokens.filter(
    (t) => t.expiresAt.getTime() > now && (!t.rotatedAt || now - t.rotatedAt.getTime() < ROTATION_GRACE_MS),
  ) as typeof user.refreshTokens;
  user.refreshTokens.push({ jti, expiresAt, rotatedAt: null });
  return jwt.sign({ sub: user._id.toString(), jti } satisfies RefreshPayload, env.jwtRefreshSecret, {
    expiresIn: `${env.refreshTokenTtlDays}d`,
  });
}

/**
 * Validates a presented refresh token id against the user's list.
 * - unknown id                -> reuse of a revoked token: revoke everything
 * - rotated within grace      -> accepted (concurrent refresh)
 * - rotated after grace       -> reuse: revoke everything
 */
export function consumeRefreshToken(user: UserDoc, jti: string): 'ok' | 'reuse' {
  const entry = user.refreshTokens.find((t) => t.jti === jti);
  if (!entry || entry.expiresAt.getTime() < Date.now()) return 'reuse';
  if (entry.rotatedAt) {
    return Date.now() - entry.rotatedAt.getTime() < ROTATION_GRACE_MS ? 'ok' : 'reuse';
  }
  entry.rotatedAt = new Date();
  return 'ok';
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/api/v1/auth',
    maxAge: env.refreshTokenTtlDays * 24 * 3600 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth', sameSite: env.cookieSameSite, secure: env.cookieSecure });
}

/** Random 32-byte value, hex encoded (share links, password reset). */
export function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
