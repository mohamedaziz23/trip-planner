import type { Request } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from './http';

function toFieldErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Parses `input` with `schema`, throwing a 400 ApiError with field errors on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.badRequest('Validation failed', toFieldErrors(result.error));
  return result.data;
}

export const body = <S extends z.ZodType>(req: Request, schema: S) => parse(schema, req.body ?? {});
export const query = <S extends z.ZodType>(req: Request, schema: S) => parse(schema, req.query ?? {});

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export function assertObjectId(id: string | undefined, label = 'id'): string {
  if (!id || !mongoose.isValidObjectId(id) || !/^[a-f0-9]{24}$/i.test(id)) {
    throw ApiError.notFound(`Unknown ${label}`);
  }
  return id;
}

/** Common list query: page, limit, sort, q (spec section 7). */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(40).optional(),
  q: z.string().trim().max(200).optional(),
});

export const isoDate = z.coerce.date();

/** Optional ISO timestamp sent by offline clients for last-write-wins. */
export const clientUpdatedAt = z.coerce.date().optional();

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a "field" / "-field" sort parameter into a Mongo sort object,
 * restricted to an allow-list of fields.
 */
export function toSort(sort: string | undefined, allowed: string[], fallback: Record<string, 1 | -1>) {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!allowed.includes(field)) return fallback;
  return { [field]: desc ? -1 : 1 } as Record<string, 1 | -1>;
}
