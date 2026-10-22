import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ApiError, type Envelope } from '../lib/http';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Internal server error';
  let errors: Envelope<unknown>['errors'] = null;
  let data: unknown = null;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    errors = err.errors;
    data = err.data;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 404;
    message = 'Resource not found';
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.message;
  } else if ((err as { code?: number }).code === 11000) {
    status = 409;
    message = 'Duplicate value';
    const keys = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    errors = keys.map((k) => ({ path: k, message: `${k} already exists` }));
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) console.error('[error]', err);

  const body: Envelope<unknown> = {
    data,
    message: status >= 500 && env.isProd ? 'Internal server error' : message,
    errors,
  };
  res.status(status).json(body);
};
