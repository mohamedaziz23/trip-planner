import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../lib/http';
import { verifyAccessToken } from '../lib/tokens';
import { UserModel } from '../modules/users/user.model';

export interface AuthUser {
  id: string;
  role: 'member' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

async function resolveUser(token: string): Promise<AuthUser> {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Access token is missing, invalid or expired');
  }
  // One light lookup so deactivated accounts and role changes take effect immediately.
  const user = await UserModel.findById(payload.sub).select('role isActive').lean();
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or deactivated');
  return { id: payload.sub, role: user.role as AuthUser['role'] };
}

export const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const token = readBearer(req);
  if (!token) return next(ApiError.unauthorized());
  req.user = await resolveUser(token);
  next();
};

/** Attaches the user when a valid token is present, otherwise continues as a visitor. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = readBearer(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      // visitors with a stale token are treated as anonymous
    }
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'admin') return next(ApiError.forbidden('Administrator role required'));
  next();
};

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
