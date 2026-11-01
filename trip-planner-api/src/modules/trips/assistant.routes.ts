import { Router } from 'express';
import { z } from 'zod';
import { aiEnabled } from '../../lib/llm';
import { ApiError, send } from '../../lib/http';
import { body } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimit';
import { UserModel } from '../users/user.model';
import { runAssistantTurn } from './assistant.service';

const router = Router();

/** Public: lets the front end grey out the AI option when no model is configured. */
router.get('/ai/status', (_req, res) => {
  send(res, { enabled: aiEnabled });
});

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(30),
  // what the assistant understood so far; re-validated field by field on the server
  draft: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One turn of the trip assistant. Stateless: the client sends the conversation and
 * the current draft, the server answers with the next question and the updated draft.
 * It never creates the trip - the user confirms in the front end.
 */
router.post('/ai/trip-assistant', requireAuth, aiLimiter, async (req, res) => {
  const input = body(req, chatSchema);
  const user = await UserModel.findById(currentUser(req).id).select('baseCurrency homeCountry').lean();
  if (!user) throw ApiError.unauthorized();
  const result = await runAssistantTurn({
    messages: input.messages,
    draft: input.draft ?? {},
    user: { baseCurrency: user.baseCurrency ?? 'EUR', homeCountry: user.homeCountry ?? null },
  });
  send(res, result);
});

export default router;
