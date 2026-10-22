import mongoose from 'mongoose';
import { env } from './env';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  console.log(`[db] connected to ${mongoose.connection.name}`);
}

/**
 * Runs `fn` inside a transaction. Falls back to running without one when the
 * server is a standalone instance (transactions need a replica set).
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 20 = IllegalOperation: "Transaction numbers are only allowed on a replica set member or mongos"
    if (code === 20) {
      console.warn('[db] transactions unavailable (standalone server) - running without a transaction');
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
