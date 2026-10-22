import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { ApiError, created, paginated, send } from '../../lib/http';
import { assertNotStale } from '../../lib/sync';
import { assertObjectId, body, clientUpdatedAt, escapeRegex, objectId, query } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { loadTripForMember } from '../../middleware/tripAccess';
import { PLACE_CATEGORIES, PlaceModel } from './place.model';
import { routeFor } from './route.service';

const router = Router();
router.use(['/trips', '/geocode'], requireAuth);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

const placeFields = {
  name: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(300).default(''),
  category: z.enum(PLACE_CATEGORIES).default('sight'),
  day: z.number().int().min(1).max(365).nullable().default(null),
  startTime: time.nullable().default(null),
  durationMin: z.number().int().min(0).max(24 * 60).default(60),
  estimatedCost: z.number().min(0).max(1_000_000).default(0),
  notes: z.string().max(2000).default(''),
};

const createSchema = z.object({ _id: objectId.optional(), ...placeFields, order: z.number().int().min(0).optional() });
const updateSchema = z
  .object({
    name: placeFields.name,
    lat: placeFields.lat,
    lng: placeFields.lng,
    address: z.string().trim().max(300),
    category: z.enum(PLACE_CATEGORIES),
    day: z.number().int().min(1).max(365).nullable(),
    startTime: time.nullable(),
    durationMin: z.number().int().min(0).max(24 * 60),
    estimatedCost: z.number().min(0).max(1_000_000),
    notes: z.string().max(2000),
    order: z.number().int().min(0),
    clientUpdatedAt,
  })
  .partial();

async function nextOrder(tripId: Types.ObjectId, day: number | null) {
  const last = await PlaceModel.findOne({ trip: tripId, day }).sort({ order: -1 }).select('order').lean();
  return last ? (last.order ?? 0) + 1 : 0;
}

/** List places - paginated at 50 (spec), filterable by day and category, searchable by name. */
router.get('/trips/:tripId/places', async (req, res) => {
  const trip = await loadTripForMember(req);
  const q = query(
    req,
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(50),
      day: z.union([z.literal('unscheduled'), z.coerce.number().int().min(1)]).optional(),
      category: z.enum(PLACE_CATEGORIES).optional(),
      q: z.string().trim().max(100).optional(),
    }),
  );
  const filter: Record<string, unknown> = { trip: trip._id };
  if (q.day !== undefined) filter.day = q.day === 'unscheduled' ? null : q.day;
  if (q.category) filter.category = q.category;
  if (q.q) filter.name = new RegExp(escapeRegex(q.q), 'i');
  const [items, total] = await Promise.all([
    PlaceModel.find(filter).sort({ day: 1, order: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    PlaceModel.countDocuments(filter),
  ]);
  send(res, paginated(items.map((p) => p.toJSON()), q.page, q.limit, total));
});

router.post('/trips/:tripId/places', async (req, res) => {
  const trip = await loadTripForMember(req);
  const input = body(req, createSchema);
  if (input._id) {
    const existing = await PlaceModel.findById(input._id);
    if (existing) {
      if (existing.trip.toString() !== trip._id.toString()) throw ApiError.conflict('Id already in use');
      return send(res, existing.toJSON(), 'Place already exists');
    }
  }
  const order = input.order ?? (await nextOrder(trip._id, input.day));
  const place = await PlaceModel.create({ ...input, order, trip: trip._id, createdBy: currentUser(req).id });
  created(res, place.toJSON(), 'Place added');
});

/** Reorder the places of one day (drag and drop). `orderedIds` is the new order. */
router.put('/trips/:tripId/places/reorder', async (req, res) => {
  const trip = await loadTripForMember(req);
  const input = body(
    req,
    z.object({ day: z.number().int().min(1).nullable(), orderedIds: z.array(objectId).max(500) }),
  );
  const places = await PlaceModel.find({ _id: { $in: input.orderedIds }, trip: trip._id });
  if (places.length !== input.orderedIds.length) throw ApiError.badRequest('Some places do not belong to this trip');
  await PlaceModel.bulkWrite(
    input.orderedIds.map((id, index) => ({
      updateOne: { filter: { _id: id, trip: trip._id }, update: { $set: { order: index, day: input.day } } },
    })),
  );
  const items = await PlaceModel.find({ trip: trip._id, day: input.day }).sort({ order: 1 });
  send(res, items.map((p) => p.toJSON()), 'Order saved');
});

/** Route and travel time between consecutive stops of a day. */
router.get('/trips/:tripId/route', async (req, res) => {
  const trip = await loadTripForMember(req);
  const { day } = query(req, z.object({ day: z.coerce.number().int().min(1) }));
  const stops = await PlaceModel.find({ trip: trip._id, day }).sort({ order: 1 }).select('name lat lng').lean();
  const route = await routeFor(stops.map((s) => ({ _id: s._id.toString(), name: s.name, lat: s.lat, lng: s.lng })));
  send(res, { day, ...route });
});

router.get('/trips/:tripId/places/:placeId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const place = await PlaceModel.findOne({ _id: assertObjectId(req.params.placeId as string, 'place'), trip: trip._id });
  if (!place) throw ApiError.notFound('Place not found');
  send(res, place.toJSON());
});

router.patch('/trips/:tripId/places/:placeId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const place = await PlaceModel.findOne({ _id: assertObjectId(req.params.placeId as string, 'place'), trip: trip._id });
  if (!place) throw ApiError.notFound('Place not found');
  const { clientUpdatedAt: at, ...input } = body(req, updateSchema);
  assertNotStale(place, at);
  if (input.day !== undefined && input.day !== place.day && input.order === undefined) {
    input.order = await nextOrder(trip._id, input.day);
  }
  place.set(input);
  await place.save();
  send(res, place.toJSON(), 'Place updated');
});

router.delete('/trips/:tripId/places/:placeId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const id = assertObjectId(req.params.placeId as string, 'place');
  await PlaceModel.deleteOne({ _id: id, trip: trip._id });
  // deleting twice (offline replay) is not an error
  send(res, { _id: id }, 'Place deleted');
});

// ---------------------------------------------------------------- geocoding proxy
const geoCache = new Map<string, unknown>();

router.get('/geocode', async (req, res) => {
  const { q } = query(req, z.object({ q: z.string().trim().min(2).max(200) }));
  const key = q.toLowerCase();
  if (geoCache.has(key)) return send(res, geoCache.get(key));
  const url = `${env.nominatimUrl}/search?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { 'User-Agent': 'TripPlannerPWA/1.0 (student project)', 'Accept-Language': 'en' },
  }).catch(() => null);
  if (!response?.ok) throw new ApiError(502, 'Geocoding service unavailable, place the marker on the map instead');
  const json = (await response.json()) as { display_name: string; name?: string; lat: string; lon: string; category?: string; type?: string }[];
  const results = json.map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    address: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    type: r.type ?? r.category ?? null,
  }));
  geoCache.set(key, results);
  send(res, results);
});

export default router;
