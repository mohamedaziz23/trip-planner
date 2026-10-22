import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { send } from './lib/http';
import { UPLOAD_DIR } from './lib/upload';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';
import authRoutes from './modules/users/auth.routes';
import userRoutes from './modules/users/user.routes';
import adminRoutes from './modules/users/admin.routes';
import tripRoutes from './modules/trips/trip.routes';
import placeRoutes from './modules/places/place.routes';
import expenseRoutes from './modules/expenses/expense.routes';
import checklistRoutes from './modules/checklist/checklist.routes';
import journalRoutes from './modules/journal/journal.routes';
import forumRoutes from './modules/forum/forum.routes';
import uploadRoutes from './modules/uploads/upload.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

  app.get('/health', (_req, res) => send(res, { status: 'ok', time: new Date().toISOString() }));

  const api = express.Router();
  api.use(apiLimiter);
  api.use('/auth', authRoutes);
  api.use('/admin', adminRoutes);
  api.use(userRoutes);
  api.use(tripRoutes);
  api.use(placeRoutes);
  api.use(expenseRoutes);
  api.use(checklistRoutes);
  api.use(journalRoutes);
  api.use(forumRoutes);
  api.use(uploadRoutes);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
