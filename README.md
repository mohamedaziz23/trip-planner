# Trip Planner PWA

Collaborative trip-planning Progressive Web App that keeps working offline: day-by-day itinerary on a map, shared multi-currency budget, packing checklist generated from the trip preferences, travel journal and a community forum with push notifications.

| Folder | Content |
|---|---|
| [`trip-planner-api/`](trip-planner-api/README.md) | REST API — Node 22, Express 5, MongoDB / Mongoose 9, zod, JWT |
| [`trip-planner-web/`](trip-planner-web/README.md) | Front end — Next.js 16, React 19, Tailwind 4, Dexie (IndexedDB), service worker, Leaflet |
| [`docs/`](docs) | Module sheets per team member (PDF) |

## Quick start

```bash
# API
cd trip-planner-api
cp .env.example .env        # then set secrets, run `npm run vapid` for push keys
npm install
docker compose up -d        # MongoDB replica set
npm run seed:demo           # rule templates, admin + demo accounts, demo data
npm run dev                 # http://localhost:4000/api/v1

# Front end (second terminal)
cd trip-planner-web
cp .env.example .env.local
npm install
npm run build && npm start  # http://localhost:3000 (PWA features need a production build)
```

Local accounts created by the seed: `admin@tripplanner.local` / `Admin12345!` and `demo@tripplanner.local` / `Demo12345!`.

## Modules

| # | Module | Collection | Advanced feature |
|---|---|---|---|
| 1 | Users | `users` | PDF export and public share links |
| 2 | Trips | `trips` | Offline-first synchronisation |
| 3 | Places and itinerary | `places` | Interactive map with daily route |
| 4 | Expenses | `expenses` | Multi-currency conversion and budget charts |
| 5 | Checklist | `checklist_items` | Checklist generated from trip preferences |
| 6 | Journal | `journal_entries` | AI itinerary generator (to do) |
| 7 | Forum | `forum_posts` | Full-text search and push notifications |
