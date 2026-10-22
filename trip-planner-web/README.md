# Trip Planner — web (PWA)

Next.js 16 (App Router, React 19, Tailwind 4) front end of the Trip Planner PWA. It talks only to the Express API, which Next.js proxies under `/api/v1` and `/uploads`, so the refresh cookie stays first-party and the service worker can cache API reads.

## Local setup

Start the API first (see `../trip-planner-api/README.md`), then:

```bash
cp .env.example .env.local    # API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:3000 (service worker disabled in dev)
```

To test the PWA features (service worker, offline, install, push), use a production build:

```bash
npm run build
npm start
```

Offline mode, installability and push work on `localhost` or over HTTPS. Regenerate the icons with `node scripts/generate-icons.mjs`.

## How offline works

- **IndexedDB (Dexie, `src/lib/db.ts`)** keeps a copy of every trip the user opened, with its places, expenses, checklist and journal. Pages read from it, so trips are fully readable with no network.
- **Outbox (`src/lib/sync.ts`)**: creates, updates and deletes are applied locally first and queued. The queue is replayed in order when the connection comes back (`online` event, a connectivity check every 15 s, or the sync button). Conflicts are last-write-wins: the API rejects a stale write with 409 and the server version is kept.
- **Service worker (`public/sw.js`)**:
  - precaches the app shell, caches each visited page (network-first) and `/_next/static` (cache-first)
  - stale-while-revalidate for display-only API reads, the last 50 opened forum posts, and viewed map tiles
  - offline fallback page, Web Push, and Background Sync that replays the same outbox when the app is closed (Chromium)
- The forum is read-only offline by design: posting needs the server for moderation and notifications.

## Structure

```
src/app/            routes: landing, auth, trips (+ itinerary, expenses, checklist, journal, settings), share, forum, profile, admin
src/components/     app shell, UI kit, map (Leaflet), trip forms, charts, forum widgets, install prompt, sync indicator
src/lib/            api client (token refresh), auth context, IndexedDB, sync engine, push, formatting
public/sw.js        service worker
```

## Platform notes

- **Install**: custom install button on Chrome, Edge and Android. On iOS Safari an "Add to Home Screen" guide is shown instead.
- **iOS limits**: push needs iOS 16.4+ and the installed app, and Background Sync is unavailable, so queued changes sync when the app is reopened.
- **Notifications**: permission is only requested after the user posts or follows a thread, or from the profile page, never on first load.
