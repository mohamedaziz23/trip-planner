import { Router } from 'express';
import { z } from 'zod';
import { ApiError, created, send } from '../../lib/http';
import { assertNotStale } from '../../lib/sync';
import { assertObjectId, body, clientUpdatedAt, objectId, query } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { loadTripForMember } from '../../middleware/tripAccess';
import { UserModel } from '../users/user.model';
import { CHECKLIST_CATEGORIES, ChecklistItemModel, ChecklistTemplateModel } from './checklist.model';
import { buildContext, syncChecklist } from './generator';

const router = Router();
router.use(['/trips', '/checklist'], requireAuth);

/** Read-only view of the seeded rule templates. */
router.get('/checklist/templates', async (_req, res) => {
  const templates = await ChecklistTemplateModel.find().sort({ key: 1 }).lean();
  send(res, templates);
});

router.get('/trips/:tripId/checklist', async (req, res) => {
  const trip = await loadTripForMember(req);
  const q = query(req, z.object({ category: z.enum(CHECKLIST_CATEGORIES).optional(), packed: z.enum(['true', 'false']).optional() }));
  const filter: Record<string, unknown> = { trip: trip._id };
  if (q.category) filter.category = q.category;
  if (q.packed) filter.isPacked = q.packed === 'true';
  const items = await ChecklistItemModel.find(filter).sort({ category: 1, label: 1 });
  const owner = await UserModel.findById(trip.owner).select('homeCountry').lean();
  const ctx = buildContext(trip, owner?.homeCountry);
  send(res, {
    items: items.map((i) => i.toJSON()),
    context: { season: ctx.season, duration: ctx.duration, isAbroad: ctx.isAbroad },
  });
});

/** (Re)generate from the trip preferences. Never removes items the user edited or ticked. */
router.post('/trips/:tripId/checklist/generate', async (req, res) => {
  const trip = await loadTripForMember(req);
  const owner = await UserModel.findById(trip.owner).select('homeCountry').lean();
  const result = await syncChecklist(trip, owner?.homeCountry);
  const items = await ChecklistItemModel.find({ trip: trip._id }).sort({ category: 1, label: 1 });
  send(
    res,
    { added: result.added, updated: result.updated, removed: result.removed, items: items.map((i) => i.toJSON()) },
    `Checklist regenerated: ${result.added} added, ${result.updated} updated, ${result.removed} removed`,
  );
});

router.post('/trips/:tripId/checklist', async (req, res) => {
  const trip = await loadTripForMember(req);
  const input = body(
    req,
    z.object({
      _id: objectId.optional(),
      label: z.string().trim().min(1).max(120),
      quantity: z.number().int().min(1).max(999).default(1),
      category: z.enum(CHECKLIST_CATEGORIES).default('other'),
      isPacked: z.boolean().default(false),
    }),
  );
  if (input._id) {
    const existing = await ChecklistItemModel.findById(input._id);
    if (existing) {
      if (existing.trip.toString() !== trip._id.toString()) throw ApiError.conflict('Id already in use');
      return send(res, existing.toJSON(), 'Item already exists');
    }
  }
  const item = await ChecklistItemModel.create({ ...input, trip: trip._id, source: 'manual' });
  created(res, item.toJSON(), 'Item added');
});

router.patch('/trips/:tripId/checklist/:itemId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const item = await ChecklistItemModel.findOne({ _id: assertObjectId(req.params.itemId as string, 'item'), trip: trip._id });
  if (!item) throw ApiError.notFound('Item not found');
  const { clientUpdatedAt: at, ...input } = body(
    req,
    z
      .object({
        label: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(999),
        category: z.enum(CHECKLIST_CATEGORIES),
        isPacked: z.boolean(),
        clientUpdatedAt,
      })
      .partial(),
  );
  assertNotStale(item, at);
  const contentChanged =
    (input.label !== undefined && input.label !== item.label) ||
    (input.quantity !== undefined && input.quantity !== item.quantity) ||
    (input.category !== undefined && input.category !== item.category);
  item.set(input);
  if (contentChanged && item.source === 'generated') item.isEdited = true;
  await item.save();
  send(res, item.toJSON(), 'Item updated');
});

router.delete('/trips/:tripId/checklist/:itemId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const id = assertObjectId(req.params.itemId as string, 'item');
  await ChecklistItemModel.deleteOne({ _id: id, trip: trip._id });
  send(res, { _id: id }, 'Item deleted');
});

export default router;
