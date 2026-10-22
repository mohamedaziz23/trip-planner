import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError, created, paginated, send } from '../../lib/http';
import { assertNotStale } from '../../lib/sync';
import { assertObjectId, body, clientUpdatedAt, objectId, query } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { loadTripForMember } from '../../middleware/tripAccess';
import { PlaceModel } from '../places/place.model';
import { MOODS, JournalEntryModel } from './journal.model';

const router = Router();
router.use('/trips', requireAuth);

const fields = {
  title: z.string().trim().max(120),
  body: z.string().trim().min(1).max(10000),
  photos: z.array(z.string().max(500)).max(12),
  date: z.coerce.date(),
  mood: z.enum(MOODS),
  place: objectId.nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
};

async function assertPlaceInTrip(placeId: string | null | undefined, tripId: Types.ObjectId) {
  if (!placeId) return;
  if (!(await PlaceModel.exists({ _id: placeId, trip: tripId }))) {
    throw ApiError.badRequest('The place does not belong to this trip', [{ path: 'place', message: 'Unknown place' }]);
  }
}

router.get('/trips/:tripId/journal', async (req, res) => {
  const trip = await loadTripForMember(req);
  const q = query(
    req,
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      place: objectId.optional(),
    }),
  );
  const filter: Record<string, unknown> = { trip: trip._id };
  if (q.place) filter.place = q.place;
  const [items, total] = await Promise.all([
    JournalEntryModel.find(filter).sort({ date: -1, createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('author', 'name avatarUrl'),
    JournalEntryModel.countDocuments(filter),
  ]);
  send(res, paginated(items.map((e) => e.toJSON()), q.page, q.limit, total));
});

router.post('/trips/:tripId/journal', async (req, res) => {
  const trip = await loadTripForMember(req);
  const input = body(
    req,
    z.object({
      _id: objectId.optional(),
      ...fields,
      title: fields.title.default(''),
      photos: fields.photos.default([]),
      mood: fields.mood.default('happy'),
      place: fields.place.default(null),
      lat: fields.lat.default(null),
      lng: fields.lng.default(null),
    }),
  );
  if (input._id) {
    const existing = await JournalEntryModel.findById(input._id);
    if (existing) {
      if (existing.trip.toString() !== trip._id.toString()) throw ApiError.conflict('Id already in use');
      return send(res, existing.toJSON(), 'Entry already exists');
    }
  }
  await assertPlaceInTrip(input.place, trip._id);
  const entry = await JournalEntryModel.create({ ...input, trip: trip._id, author: currentUser(req).id });
  await entry.populate('author', 'name avatarUrl');
  created(res, entry.toJSON(), 'Journal entry saved');
});

router.get('/trips/:tripId/journal/:entryId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const entry = await JournalEntryModel.findOne({ _id: assertObjectId(req.params.entryId as string, 'entry'), trip: trip._id }).populate('author', 'name avatarUrl');
  if (!entry) throw ApiError.notFound('Entry not found');
  send(res, entry.toJSON());
});

/** Only the author edits or deletes their entry. */
router.patch('/trips/:tripId/journal/:entryId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const entry = await JournalEntryModel.findOne({ _id: assertObjectId(req.params.entryId as string, 'entry'), trip: trip._id });
  if (!entry) throw ApiError.notFound('Entry not found');
  if (entry.author.toString() !== currentUser(req).id) throw ApiError.forbidden('Only the author can edit this entry');
  const { clientUpdatedAt: at, ...input } = body(req, z.object({ ...fields, clientUpdatedAt }).partial());
  assertNotStale(entry, at);
  await assertPlaceInTrip(input.place, trip._id);
  entry.set(input);
  await entry.save();
  await entry.populate('author', 'name avatarUrl');
  send(res, entry.toJSON(), 'Journal entry updated');
});

router.delete('/trips/:tripId/journal/:entryId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const id = assertObjectId(req.params.entryId as string, 'entry');
  const entry = await JournalEntryModel.findOne({ _id: id, trip: trip._id });
  if (entry && entry.author.toString() !== currentUser(req).id) throw ApiError.forbidden('Only the author can delete this entry');
  if (entry) await entry.deleteOne();
  send(res, { _id: id }, 'Journal entry deleted');
});

export default router;
