import { Router } from 'express';
import { z } from 'zod';
import { ApiError, created } from '../../lib/http';
import { query } from '../../lib/validate';
import { imageUpload, storeImage } from '../../lib/upload';
import { requireAuth } from '../../middleware/auth';

const router = Router();

/**
 * Generic image upload (receipts, journal photos). Returns the stored URLs,
 * which the client then saves on its own resource.
 */
router.post('/uploads', requireAuth, imageUpload.array('files', 6), async (req, res) => {
  const { folder } = query(req, z.object({ folder: z.enum(['receipts', 'journal', 'misc']).default('misc') }));
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw ApiError.badRequest('Attach at least one image in the "files" field');
  const urls = await Promise.all(files.map((f) => storeImage(f, folder)));
  created(res, { urls }, `${urls.length} image(s) uploaded`);
});

export default router;
