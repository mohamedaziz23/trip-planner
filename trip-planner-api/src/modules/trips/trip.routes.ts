import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../../config/db';
import { ApiError, created, paginated, send } from '../../lib/http';
import { assertNotStale } from '../../lib/sync';
import { randomToken } from '../../lib/tokens';
import { imageUpload, storeImage } from '../../lib/upload';
import { assertObjectId, body, clientUpdatedAt, escapeRegex, listQuery, objectId, query, toSort } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { isOwner, loadTripForMember, loadTripForOwner } from '../../middleware/tripAccess';
import { UserModel } from '../users/user.model';
import { PlaceModel } from '../places/place.model';
import { ExpenseModel } from '../expenses/expense.model';
import { ChecklistItemModel } from '../checklist/checklist.model';
import { JournalEntryModel } from '../journal/journal.model';
import { syncChecklist } from '../checklist/generator';
import { ACCOMMODATIONS, ACTIVITIES, SPECIAL_NEEDS, TRANSPORTS, TRIP_TYPES, TripModel, type TripDoc } from './trip.model';
import { TRIP_POPULATE, deleteTripCascade } from './trip.service';
import { renderTripPdf } from './export.pdf';

const router = Router();

const preferencesSchema = z.object({
  tripType: z.enum(TRIP_TYPES),
  activities: z.array(z.enum(ACTIVITIES)).default([]),
  accommodation: z.enum(ACCOMMODATIONS),
  transport: z.enum(TRANSPORTS),
  travellers: z.object({
    adults: z.number().int().min(0).max(50),
    children: z.number().int().min(0).max(50),
    infants: z.number().int().min(0).max(50),
  }),
  specialNeeds: z.array(z.enum(SPECIAL_NEEDS)).default([]),
});

const tripFields = {
  title: z.string().trim().min(2).max(120),
  destination: z.string().trim().min(2).max(120),
  country: z.string().length(2).toUpperCase(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  budget: z.number().min(0).max(10_000_000),
  baseCurrency: z.string().length(3).toUpperCase(),
  preferences: preferencesSchema,
};

const createSchema = z
  .object({ _id: objectId.optional(), ...tripFields, budget: tripFields.budget.default(0) })
  .refine((t) => t.endDate >= t.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

const updateSchema = z
  .object({ ...tripFields, clientUpdatedAt })
  .partial()
  .refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

async function ownerHomeCountry(trip: TripDoc) {
  const owner = await UserModel.findById(trip.owner).select('homeCountry').lean();
  return owner?.homeCountry ?? null;
}

async function tripJson(trip: TripDoc) {
  await trip.populate(TRIP_POPULATE);
  return trip.toJSON();
}

// ---------------------------------------------------------------- public share page
router.get('/share/:token', async (req, res) => {
  const token = String(req.params.token ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw ApiError.notFound('This share link is invalid or was revoked');
  const trip = await TripModel.findOne({ shareToken: token })
    .select('title destination country startDate endDate coverUrl baseCurrency members')
    .populate({ path: 'members.user', select: 'name' });
  if (!trip) throw ApiError.notFound('This share link is invalid or was revoked');
  const places = await PlaceModel.find({ trip: trip._id })
    .select('name lat lng address category day startTime durationMin notes order')
    .sort({ day: 1, order: 1 })
    .lean();
  const json = trip.toJSON() as Record<string, unknown>;
  json.members = trip.members.map((m) => ({ name: (m.user as unknown as { name?: string })?.name ?? 'Traveller' }));
  send(res, { trip: json, places });
});

// ---------------------------------------------------------------- authenticated
router.use('/trips', requireAuth);

router.get('/trips', async (req, res) => {
  const { page, limit, q, sort } = query(req, listQuery);
  const filter: Record<string, unknown> = { 'members.user': currentUser(req).id };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { destination: rx }];
  }
  const [items, total] = await Promise.all([
    TripModel.find(filter)
      .sort(toSort(sort, ['startDate', 'createdAt', 'updatedAt', 'title'], { startDate: -1 }))
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(TRIP_POPULATE),
    TripModel.countDocuments(filter),
  ]);
  send(res, paginated(items.map((t) => t.toJSON()), page, limit, total));
});

router.post('/trips', async (req, res) => {
  const input = body(req, createSchema);
  const userId = currentUser(req).id;

  // Idempotent replay from the offline queue: the client chose the id.
  if (input._id) {
    const existing = await TripModel.findById(input._id);
    if (existing) {
      if (!existing.members.some((m) => m.user.toString() === userId)) throw ApiError.conflict('Id already in use');
      return send(res, await tripJson(existing), 'Trip already exists');
    }
  }

  const me = await UserModel.findById(userId).select('homeCountry');
  const trip = await withTransaction(async (session) => {
    const doc = new TripModel({ ...input, owner: userId, members: [{ user: userId, role: 'owner' }] });
    await doc.save(session ? { session } : {});
    await syncChecklist(doc, me?.homeCountry, session);
    return doc;
  });
  created(res, await tripJson(trip), 'Trip created and checklist generated');
});

router.get('/trips/:tripId', async (req, res) => {
  const trip = await loadTripForMember(req);
  send(res, await tripJson(trip));
});

/** Trip plus all its children in one response - used to make a trip readable offline. */
router.get('/trips/:tripId/full', async (req, res) => {
  const trip = await loadTripForMember(req);
  const [places, expenses, checklist, journal] = await Promise.all([
    PlaceModel.find({ trip: trip._id }).sort({ day: 1, order: 1 }).lean(),
    ExpenseModel.find({ trip: trip._id }).sort({ date: -1 }).populate('paidBy', 'name').lean(),
    ChecklistItemModel.find({ trip: trip._id }).sort({ category: 1, label: 1 }).lean(),
    JournalEntryModel.find({ trip: trip._id }).sort({ date: -1 }).populate('author', 'name avatarUrl').lean(),
  ]);
  send(res, { trip: await tripJson(trip), places, expenses, checklist, journal });
});

router.patch('/trips/:tripId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const { clientUpdatedAt: at, ...input } = body(req, updateSchema);
  assertNotStale(trip, at);

  const start = input.startDate ?? trip.startDate;
  const end = input.endDate ?? trip.endDate;
  if (end < start) throw ApiError.badRequest('End date must be on or after the start date', [
    { path: 'endDate', message: 'End date must be on or after the start date' },
  ]);

  const affectsChecklist = Boolean(input.preferences || input.startDate || input.endDate || input.country);
  trip.set(input);
  await trip.save();
  let checklist = null;
  if (affectsChecklist) checklist = await syncChecklist(trip, await ownerHomeCountry(trip));
  send(res, { ...(await tripJson(trip)), checklistSync: checklist && { added: checklist.added, updated: checklist.updated, removed: checklist.removed } }, 'Trip updated');
});

router.delete('/trips/:tripId', async (req, res) => {
  const trip = await loadTripForOwner(req);
  await withTransaction((session) => deleteTripCascade(trip._id, session));
  send(res, { _id: trip._id }, 'Trip and all its content deleted');
});

router.post('/trips/:tripId/cover', imageUpload.single('cover'), async (req, res) => {
  const trip = await loadTripForMember(req);
  if (!req.file) throw ApiError.badRequest('An image file named "cover" is required');
  trip.coverUrl = await storeImage(req.file, 'covers');
  await trip.save();
  send(res, await tripJson(trip), 'Cover updated');
});

// ---------------------------------------------------------------- members
router.post('/trips/:tripId/members', async (req, res) => {
  const trip = await loadTripForOwner(req);
  const { email } = body(req, z.object({ email: z.email().toLowerCase() }));
  const invitee = await UserModel.findOne({ email, isActive: true }).select('_id');
  if (!invitee) throw ApiError.notFound('No member account uses this email - ask them to register first');
  if (trip.members.some((m) => m.user.toString() === invitee._id.toString())) {
    throw ApiError.conflict('This person is already a participant');
  }
  trip.members.push({ user: invitee._id, role: 'editor', joinedAt: new Date() });
  await trip.save();
  send(res, await tripJson(trip), 'Participant added');
});

/** Owner removes a participant, or a participant leaves the trip. */
router.delete('/trips/:tripId/members/:userId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const me = currentUser(req).id;
  const target = assertObjectId(req.params.userId as string, 'user');
  if (target !== me && !isOwner(trip, me)) throw ApiError.forbidden('Only the trip owner can remove participants');
  if (target === trip.owner.toString()) throw ApiError.badRequest('The owner cannot leave their own trip - delete it instead');
  trip.members = trip.members.filter((m) => m.user.toString() !== target) as typeof trip.members;
  await trip.save();
  send(res, await tripJson(trip), target === me ? 'You left the trip' : 'Participant removed');
});

// ---------------------------------------------------------------- share link & export
router.post('/trips/:tripId/share', async (req, res) => {
  const trip = await loadTripForOwner(req);
  if (!trip.shareToken) {
    trip.shareToken = randomToken();
    await trip.save();
  }
  send(res, { shareToken: trip.shareToken }, 'Share link enabled');
});

router.delete('/trips/:tripId/share', async (req, res) => {
  const trip = await loadTripForOwner(req);
  trip.shareToken = undefined;
  await trip.save();
  send(res, null, 'Share link revoked');
});

router.get('/trips/:tripId/export', async (req, res) => {
  const trip = await loadTripForMember(req);
  const places = await PlaceModel.find({ trip: trip._id }).sort({ day: 1, order: 1 }).lean();
  await trip.populate(TRIP_POPULATE);
  const filename = `${trip.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'trip'}-itinerary.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  renderTripPdf(trip, places, res);
});

export default router;
