import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError, created, paginated, send } from '../../lib/http';
import { assertNotStale } from '../../lib/sync';
import { assertObjectId, body, clientUpdatedAt, objectId, query } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { aiStoryLimiter } from '../../middleware/rateLimit';
import { loadTripForMember } from '../../middleware/tripAccess';
import { gemini, STORY_MODEL, toAiError, withAiRetry } from '../../lib/ai';
import { buildStoryBook, type PopulatedEntry } from './book';
import { renderStoryBookPdf } from './export.book.pdf';
import { renderStoryBookPptx } from './export.book.pptx';
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

/**
 * Streams a continuous travel narrative written by Claude from the trip's
 * entries. Read-only: nothing is persisted. Server-side only — the API key
 * never leaves this process. Tightly rate limited on top of the global limiter.
 */
router.post('/trips/:tripId/journal/story', aiStoryLimiter, async (req, res, next) => {
  const trip = await loadTripForMember(req);
  const entries = await JournalEntryModel.find({ trip: trip._id })
    .sort({ date: 1, createdAt: 1 })
    .populate<{ author: { name: string } }>('author', 'name')
    .populate<{ place: { name: string } | null }>('place', 'name');
  if (!entries.length) throw ApiError.badRequest('There are no journal entries to turn into a story yet');

  const days = entries
    .map((e) => {
      const date = e.date.toISOString().slice(0, 10);
      const place = e.place?.name ? `, at ${e.place.name}` : '';
      const head = `${date} — ${e.author.name} (feeling ${e.mood})${place}${e.title ? ` — ${e.title}` : ''}`;
      return `${head}\n${e.body}`;
    })
    .join('\n\n');
  const prompt =
    `Here are the journal entries from a trip called "${trip.title}", in order.\n\n${days}\n\n` +
    'Weave these into one flowing, warm travel narrative that reads as a single story of the trip. ' +
    'Follow the days in order, keep the real places, moods and who did what, and do not invent events that are not in the entries.';

  // Headers are only flushed on the first write, so an error before streaming
  // (bad key, model failure) can still fall through to the JSON error handler.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  try {
    const stream = await withAiRetry(() =>
      gemini().models.generateContentStream({
        model: STORY_MODEL,
        contents: prompt,
        config: {
          systemInstruction: 'You are a travel writer who turns a group trip journal into a vivid, heartfelt story.',
          maxOutputTokens: 8000,
        },
      }),
    );
    for await (const chunk of stream) {
      if (chunk.text) res.write(chunk.text);
    }
    res.end();
  } catch (err) {
    // Before any byte is written we can still answer with a clean JSON error.
    if (!res.headersSent) return next(toAiError(err));
    res.end();
  }
});

/**
 * Corrects spelling/grammar and gently polishes a draft entry with Claude's help
 * (here, Gemini). Read-only editing aid — returns improved text, saves nothing.
 * Server-side key only; same tight per-user AI limit.
 */
router.post('/trips/:tripId/journal/enhance', aiStoryLimiter, async (req, res) => {
  await loadTripForMember(req);
  const input = body(
    req,
    z.object({
      title: z.string().trim().max(120).default(''),
      body: z.string().trim().min(1).max(10000),
    }),
  );
  const schema = {
    type: 'object',
    properties: { title: { type: 'string' }, body: { type: 'string' } },
    required: ['title', 'body'],
  };
  const resp = await withAiRetry(() =>
    gemini().models.generateContent({
      model: STORY_MODEL,
      contents: `Title: ${input.title || '(none)'}\n\nEntry:\n${input.body}`,
      config: {
        systemInstruction:
          'You are an editor for a personal travel journal. Correct spelling and grammar and gently polish the wording so it reads clearly and vividly, while keeping the author\'s first-person voice, tone and facts. Do not invent events, places or details, and keep it about the same length. Return an improved title (short; empty string if there was none) and the improved entry body.',
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens: 4000,
      },
    }),
  );
  let out = { title: input.title, body: input.body };
  try {
    const parsed = JSON.parse(resp.text ?? '{}');
    if (parsed && typeof parsed.body === 'string' && parsed.body.trim()) {
      out = { title: typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 120) : input.title, body: parsed.body.trim().slice(0, 10000) };
    }
  } catch {
    // keep the original text if the model returns unparseable output
  }
  send(res, out, 'Entry enhanced');
});

/**
 * Downloads all the trip's entries as an AI-written photo story book, either a
 * PDF ("book") or a PPTX (editable slides). Read-only; same per-user AI limit.
 */
router.get('/trips/:tripId/journal/book', aiStoryLimiter, async (req, res) => {
  const trip = await loadTripForMember(req);
  const { format } = query(req, z.object({ format: z.enum(['pdf', 'pptx']).default('pdf') }));
  const entries = await JournalEntryModel.find({ trip: trip._id })
    .sort({ date: 1, createdAt: 1 })
    .populate<{ author: { name: string } }>('author', 'name')
    .populate<{ place: { name: string } | null }>('place', 'name');
  if (!entries.length) throw ApiError.badRequest('There are no journal entries to turn into a story book yet');

  const book = await buildStoryBook(trip, entries as unknown as PopulatedEntry[]);
  const base = trip.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'trip';

  if (format === 'pptx') {
    const buffer = await renderStoryBookPptx(book);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${base}-story.pptx"`);
    return res.send(buffer);
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${base}-story.pdf"`);
  renderStoryBookPdf(book, res);
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
