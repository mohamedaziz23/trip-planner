/* Trip Planner service worker
 *
 * - App shell precached; every page the user opens is cached (network-first) so it reopens offline
 * - /_next/static assets: cache-first (file names are content-hashed)
 * - API reads: stale-while-revalidate for display-only endpoints; network-first for trip data
 *   (the app keeps its own IndexedDB copy, see src/lib/sync.ts)
 * - Forum: the last 50 posts the user opened are kept for offline reading
 * - Offline fallback page for unknown pages
 * - Web Push notifications
 * - Background Sync: replays the IndexedDB outbox written by the app
 */
const VERSION = 'v2';
const SHELL = `tp-shell-${VERSION}`;
const STATIC = `tp-static-${VERSION}`;
const API = `tp-api-${VERSION}`;
const FORUM = `tp-forum-${VERSION}`;
const IMAGES = `tp-img-${VERSION}`;
const CACHES = [SHELL, STATIC, API, FORUM, IMAGES];

const PRECACHE_PAGES = ['/', '/offline', '/trips', '/forum', '/login'];
const FORUM_LIMIT = 50;
const IMAGE_LIMIT = 400;

// ---------------------------------------------------------------- helpers
const pageKey = (url) => new URL(url, self.location.origin).pathname;

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Caches a page document and the hashed assets it references. */
async function cachePage(path) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return;
  const html = await response.clone().text();
  await (await caches.open(SHELL)).put(pageKey(path), response);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const staticCache = await caches.open(STATIC);
  await Promise.all(
    assets.map(async (asset) => {
      if (await staticCache.match(asset)) return;
      try {
        const res = await fetch(asset);
        if (res.ok) await staticCache.put(asset, res);
      } catch {
        // offline
      }
    }),
  );
}

// ---------------------------------------------------------------- lifecycle
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(PRECACHE_PAGES.map((p) => cachePage(p).catch(() => undefined)));
      const staticCache = await caches.open(STATIC);
      await staticCache.addAll(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png', '/manifest.webmanifest']).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('tp-') && !CACHES.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'CACHE_PAGE' && msg.url) event.waitUntil(cachePage(msg.url).catch(() => undefined));
  if (msg.type === 'CLEAR_USER_CACHES') event.waitUntil(Promise.all([caches.delete(API), caches.delete(FORUM)]));
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---------------------------------------------------------------- strategies
async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    if (limit) trim(cacheName, limit);
  }
  return response;
}

async function networkFirst(request, cacheName, key, limit) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(key || request, response.clone());
      if (limit) await trim(cacheName, limit);
    }
    return response;
  } catch (err) {
    const hit = await cache.match(key || request);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const network = fetch(event.request)
    .then(async (response) => {
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  const response = await network;
  return response || offlineJson();
}

function offlineJson() {
  return new Response(JSON.stringify({ data: null, message: 'You are offline', errors: null }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Offline': '1' },
  });
}

async function handleNavigation(request) {
  const key = pageKey(request.url);
  const shell = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      await shell.put(key, response.clone());
    }
    return response;
  } catch {
    return (await shell.match(key)) || (await shell.match('/offline')) || new Response('Offline', { status: 503 });
  }
}

// display-only reads: stale-while-revalidate is fine
const SWR_API = [/^\/api\/v1\/forum\/(posts|tags|categories)$/, /^\/api\/v1\/rates$/, /^\/api\/v1\/trips\/[a-f0-9]{24}\/(route|expenses\/summary)$/, /^\/api\/v1\/checklist\/templates$/, /^\/api\/v1\/share\//];
const FORUM_POST = /^\/api\/v1\/forum\/posts\/[a-f0-9]{24}$/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // OpenStreetMap tiles viewed by the user stay available offline
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(request, IMAGES, IMAGE_LIMIT));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(cacheFirst(request, IMAGES, IMAGE_LIMIT));
    return;
  }
  if (url.pathname.startsWith('/api/v1/')) {
    if (url.pathname.startsWith('/api/v1/auth/') || url.pathname.endsWith('/export')) return;
    if (FORUM_POST.test(url.pathname)) {
      event.respondWith(networkFirst(request, FORUM, undefined, FORUM_LIMIT).catch(() => offlineJson()));
      return;
    }
    if (SWR_API.some((rx) => rx.test(url.pathname))) {
      event.respondWith(staleWhileRevalidate(event, API));
      return;
    }
    // Trip data (/trips, /users/me...) goes straight to the network: offline, the
    // app reads its IndexedDB copy instead, which also holds unsynced changes.
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  }
  // RSC / prefetch requests go to the network; if it fails, Next.js falls back
  // to a full navigation, which is served from the page cache above.
});

// ---------------------------------------------------------------- Web Push
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Trip Planner', body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Trip Planner', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      data: { url: data.url || '/forum' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// ---------------------------------------------------------------- Background Sync (outbox replay)
const SEGMENTS = { places: 'places', expenses: 'expenses', checklist: 'checklist', journal: 'journal' };

function idb(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function openAppDb() {
  if (self.indexedDB.databases) {
    const list = await self.indexedDB.databases();
    if (!list.some((d) => d.name === 'trip-planner')) return null;
  }
  const db = await idb(self.indexedDB.open('trip-planner'));
  if (!db.objectStoreNames.contains('outbox')) {
    db.close();
    return null;
  }
  return db;
}

const store = (db, name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);

function endpointFor(op) {
  if (op.entity === 'trips') return op.op === 'create' ? '/api/v1/trips' : `/api/v1/trips/${op.docId}`;
  const base = `/api/v1/trips/${op.tripId}/${SEGMENTS[op.entity]}`;
  return op.op === 'create' ? base : `${base}/${op.docId}`;
}

async function refreshAccessToken() {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) return null;
  return (await res.json()).data.accessToken;
}

async function replayOutbox() {
  const db = await openAppDb();
  if (!db) return;
  try {
    const ops = (await idb(store(db, 'outbox').getAll())).sort((a, b) => a.id - b.id);
    if (!ops.length) return;
    const token = await refreshAccessToken(); // throws when offline -> the browser retries the sync later
    if (!token) return;
    for (const op of ops) {
      const method = op.op === 'create' ? 'POST' : op.op === 'update' ? 'PATCH' : 'DELETE';
      const body = op.op === 'update' ? { ...op.payload, clientUpdatedAt: op.at } : op.op === 'create' ? op.payload : undefined;
      const res = await fetch(endpointFor(op), {
        method,
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) return;
      if (res.status >= 500 || res.status === 429) throw new Error(`retry later (${res.status})`);
      const json = await res.json().catch(() => ({}));
      await idb(store(db, 'outbox', 'readwrite').delete(op.id));
      const remainingForDoc = await idb(store(db, 'outbox').index('docId').count(op.docId));
      if (res.ok) {
        if (op.op !== 'delete' && json.data && !remainingForDoc) await idb(store(db, op.entity, 'readwrite').put(json.data));
      } else if (res.status === 409 && json.data) {
        await idb(store(db, op.entity, 'readwrite').put(json.data));
      } else if (res.status === 404 || op.op === 'create') {
        await idb(store(db, op.entity, 'readwrite').delete(op.docId));
      }
    }
    const windows = await self.clients.matchAll({ type: 'window' });
    windows.forEach((c) => c.postMessage({ type: 'OUTBOX_SYNCED' }));
  } finally {
    db.close();
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'outbox') return;
  const run = () => replayOutbox();
  event.waitUntil(self.navigator.locks ? self.navigator.locks.request('trip-planner-outbox', run) : run());
});
