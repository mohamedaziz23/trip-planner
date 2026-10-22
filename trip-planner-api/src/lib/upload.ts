import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { ApiError } from './http';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const useCloudinary = Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);
if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/** Multer instance keeping files in memory (max 5 MB, images only). */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter(_req, file, cb) {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'Only JPEG, PNG, WebP, GIF or AVIF images are allowed'));
  },
});

/**
 * Stores an image and returns its public URL. Uses Cloudinary when configured
 * (served as WebP with automatic quality); otherwise writes to ./uploads.
 */
export async function storeImage(file: Express.Multer.File, folder: string): Promise<string> {
  if (useCloudinary) {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `trip-planner/${folder}`, resource_type: 'image', format: 'webp' },
        (err, res) => (err || !res ? reject(err) : resolve(res)),
      );
      stream.end(file.buffer);
    });
    return result.secure_url;
  }
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const name = `${folder}-${crypto.randomBytes(12).toString('hex')}${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/${name}`;
}
