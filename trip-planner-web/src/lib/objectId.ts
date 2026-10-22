/**
 * Client-side MongoDB ObjectId generator. Records created offline get their
 * final id immediately, so queued writes can reference each other and the API
 * treats a replayed create as idempotent.
 */
let counter = Math.floor(Math.random() * 0xffffff);
const random = Array.from(crypto.getRandomValues(new Uint8Array(5)))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

export function objectId(): string {
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  counter = (counter + 1) % 0xffffff;
  return time + random + counter.toString(16).padStart(6, '0');
}
