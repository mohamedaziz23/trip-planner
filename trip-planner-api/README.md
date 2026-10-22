# Trip Planner — API

Express 5 + MongoDB (Mongoose 9) REST API for the Trip Planner PWA. Every endpoint lives under `/api/v1` and answers with the envelope `{ data, message, errors }`.

## Local setup

Requirements: Node 22+, Docker (for MongoDB).

```bash
cp .env.example .env          # then set JWT secrets
npm install
npm run vapid                 # prints VAPID keys for Web Push -> paste into .env
docker compose up -d          # MongoDB 7 as a single-node replica set (transactions)
npm run seed                  # checklist rule templates + admin account
npm run seed:demo             # optional: demo member, demo trip, forum posts
npm run dev                   # http://localhost:4000/api/v1
```

Seeded accounts (local only): `admin@tripplanner.local` / `Admin12345!` and, with `seed:demo`, `demo@tripplanner.local` / `Demo12345!`.

Other scripts: `npm run build` (compile to `dist/`), `npm start`, `npm run typecheck`.

## Structure

```
src/
  config/        env, MongoDB connection, transaction helper
  lib/           envelope + errors, zod helpers, tokens, uploads, push, mail, last-write-wins check
  middleware/    auth (JWT), trip membership, rate limits, error handler
  modules/       one folder per module = one collection + its routes
    users/       users          auth, profile, push subscription, admin
    trips/       trips          CRUD, members, share link, PDF export, cascade delete
    places/      places         CRUD, reorder, route (OSRM), geocoding (Nominatim)
    expenses/    expenses       CRUD, exchange rates, budget summary
    checklist/   checklist_items + checklist_templates   rule-based generator
    journal/     journal_entries
    forum/       forum_posts + forum_replies   search, votes, reports, moderation, Web Push
  seed/          rule templates and seed script
```

## Endpoints

| Module | Method & path | Notes |
|---|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | access token 15 min (Bearer), refresh token 7 days in an httpOnly cookie, rotated on use |
| | `POST /auth/forgot-password`, `/auth/reset-password` | link printed in the console when SMTP is not configured |
| Users | `GET/PATCH/DELETE /users/me` | delete anonymises forum posts and deletes owned trips |
| | `POST /users/me/avatar` (multipart `avatar`), `PATCH /users/me/password`, `PATCH /users/me/notifications` | |
| | `POST/DELETE /users/me/push-subscription`, `GET /push/public-key` | |
| Admin | `GET /admin/users`, `PATCH /admin/users/:id`, `GET /admin/stats` | admin role |
| Trips | `GET/POST /trips`, `GET/PATCH/DELETE /trips/:tripId` | creation generates the checklist; preference changes regenerate it |
| | `GET /trips/:tripId/full` | trip + all children, used for offline copies |
| | `POST /trips/:tripId/cover`, `POST /trips/:tripId/members`, `DELETE /trips/:tripId/members/:userId` | |
| | `POST/DELETE /trips/:tripId/share`, `GET /share/:token` (public) | 32-byte random token, revocable |
| | `GET /trips/:tripId/export` | itinerary as PDF |
| Places | `GET/POST /trips/:tripId/places`, `GET/PATCH/DELETE /trips/:tripId/places/:placeId` | list paginated at 50 |
| | `PUT /trips/:tripId/places/reorder`, `GET /trips/:tripId/route?day=N`, `GET /geocode?q=` | |
| Expenses | `GET/POST /trips/:tripId/expenses`, `GET/PATCH/DELETE …/expenses/:expenseId` | stored in original + base currency |
| | `GET /trips/:tripId/expenses/summary`, `GET /rates?base=EUR` (public) | rates cached daily, fallback table offline |
| Checklist | `GET/POST /trips/:tripId/checklist`, `PATCH/DELETE …/checklist/:itemId` | |
| | `POST /trips/:tripId/checklist/generate`, `GET /checklist/templates` | |
| Journal | `GET/POST /trips/:tripId/journal`, `GET/PATCH/DELETE …/journal/:entryId` | author-only edits |
| Uploads | `POST /uploads?folder=receipts\|journal` (multipart `files`) | Cloudinary when configured, else `./uploads` |
| Forum | `GET /forum/posts?q&category&tag&sort&page`, `GET /forum/posts/:postId`, `GET /forum/tags`, `GET /forum/categories` | public reads, MongoDB text index |
| | `POST /forum/posts`, `PATCH/DELETE /forum/posts/:postId`, `POST …/vote`, `POST/DELETE …/follow`, `POST …/report` | |
| | `POST /forum/posts/:postId/replies`, `PATCH/DELETE /forum/replies/:replyId`, `POST …/vote`, `POST …/report` | one reply per minute, comments one level, 500 chars |
| | `GET /forum/moderation`, `POST /forum/moderation/posts/:postId`, `POST /forum/moderation/replies/:replyId` | admin: hide, unhide, lock, unlock, delete, dismiss |

### Offline sync contract

Creates accept a client-generated `_id`, so a replayed create is idempotent. Updates accept `clientUpdatedAt`; when the server copy changed after that moment the API answers `409` with the current document in `data` (last-write-wins). Deletes are idempotent.

## Not implemented yet (deferred)

AI itinerary generator, weather-based season rules, CI pipeline, automated tests.
