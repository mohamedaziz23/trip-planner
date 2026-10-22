import type { Response } from 'express';

/** Every response uses the same envelope: { data, message, errors }. */
export interface Envelope<T> {
  data: T | null;
  message: string;
  errors: FieldError[] | null;
}

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldError[] | null = null,
    public data: unknown = null,
  ) {
    super(message);
  }

  static badRequest(message = 'Validation failed', errors: FieldError[] | null = null) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message: string, data: unknown = null) {
    return new ApiError(409, message, null, data);
  }
  static tooMany(message = 'Too many requests, please slow down') {
    return new ApiError(429, message);
  }
}

export function send<T>(res: Response, data: T, message = 'OK', status = 200) {
  const body: Envelope<T> = { data, message, errors: null };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, message = 'Created') {
  return send(res, data, message, 201);
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function paginated<T>(items: T[], page: number, limit: number, total: number): Paginated<T> {
  return { items, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
