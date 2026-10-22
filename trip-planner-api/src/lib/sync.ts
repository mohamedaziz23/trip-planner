import { ApiError } from './http';

/**
 * Last-write-wins check for writes replayed from an offline queue.
 * The client sends the time at which the user made the change (`clientUpdatedAt`).
 * If the server copy was modified after that moment, the queued write is stale:
 * we reject it with 409 and return the current server document so the client
 * can replace its local copy.
 */
export function assertNotStale(
  current: { updatedAt?: Date; toJSON(): unknown },
  clientUpdatedAt: Date | undefined,
) {
  if (!clientUpdatedAt || !current.updatedAt) return;
  if (current.updatedAt.getTime() > clientUpdatedAt.getTime()) {
    throw ApiError.conflict('A newer version exists on the server', current.toJSON());
  }
}
