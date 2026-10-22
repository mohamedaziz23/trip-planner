import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction } from '../../config/db';
import { ApiError, send } from '../../lib/http';
import { body } from '../../lib/validate';
import { clearRefreshCookie } from '../../lib/tokens';
import { imageUpload, storeImage } from '../../lib/upload';
import { env } from '../../config/env';
import { pushEnabled } from '../../lib/push';
import { currentUser, requireAuth } from '../../middleware/auth';
import { TripModel } from '../trips/trip.model';
import { deleteTripCascade } from '../trips/trip.service';
import { ForumPostModel, ForumReplyModel } from '../forum/forum.model';
import { BCRYPT_COST, passwordSchema } from './auth.routes';
import { UserModel } from './user.model';

const router = Router();

/** Public: VAPID key the browser needs to subscribe to Web Push. */
router.get('/push/public-key', (_req, res) => {
  send(res, { publicKey: pushEnabled ? env.vapid.publicKey : null });
});

router.use('/users/me', requireAuth);

async function loadMe(id: string) {
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

router.get('/users/me', async (req, res) => {
  send(res, (await loadMe(currentUser(req).id)).toJSON());
});

router.patch('/users/me', async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      baseCurrency: z.string().length(3).toUpperCase().optional(),
      language: z.string().min(2).max(10).optional(),
      homeCountry: z.string().length(2).toUpperCase().nullable().optional(),
    }),
  );
  const user = await loadMe(currentUser(req).id);
  Object.assign(user, input);
  await user.save();
  send(res, user.toJSON(), 'Profile updated');
});

router.post('/users/me/avatar', imageUpload.single('avatar'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file named "avatar" is required');
  const user = await loadMe(currentUser(req).id);
  user.avatarUrl = await storeImage(req.file, 'avatars');
  await user.save();
  send(res, user.toJSON(), 'Avatar updated');
});

router.patch('/users/me/password', async (req, res) => {
  const input = body(req, z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }));
  const user = await loadMe(currentUser(req).id);
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect', [
      { path: 'currentPassword', message: 'Incorrect password' },
    ]);
  }
  user.passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
  await user.save();
  send(res, null, 'Password changed');
});

router.patch('/users/me/notifications', async (req, res) => {
  const input = body(req, z.object({ forumReplies: z.boolean() }));
  const user = await loadMe(currentUser(req).id);
  user.notificationPrefs!.forumReplies = input.forumReplies;
  await user.save();
  send(res, user.toJSON(), 'Notification preferences saved');
});

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

router.post('/users/me/push-subscription', async (req, res) => {
  const sub = body(req, z.object({ subscription: subscriptionSchema })).subscription;
  const userId = currentUser(req).id;
  await UserModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
  await UserModel.updateOne({ _id: userId }, { $push: { pushSubscriptions: { ...sub, createdAt: new Date() } } });
  send(res, { pushEnabled: true }, 'Push notifications enabled on this device');
});

router.delete('/users/me/push-subscription', async (req, res) => {
  const { endpoint } = body(req, z.object({ endpoint: z.url() }));
  await UserModel.updateOne({ _id: currentUser(req).id }, { $pull: { pushSubscriptions: { endpoint } } });
  send(res, null, 'Push notifications disabled on this device');
});

/**
 * Account deletion. Owned trips are deleted with their children, the user is
 * removed from other trips, and forum content is anonymised (spec rule 2).
 */
router.delete('/users/me', async (req, res) => {
  const { password } = body(req, z.object({ password: z.string().min(1) }));
  const user = await loadMe(currentUser(req).id);
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.badRequest('Password is incorrect', [{ path: 'password', message: 'Incorrect password' }]);
  }
  await withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const owned = await TripModel.find({ owner: user._id }).select('_id').session(session);
    for (const trip of owned) await deleteTripCascade(trip._id, session);
    await TripModel.updateMany({ 'members.user': user._id }, { $pull: { members: { user: user._id } } }, opts);
    await ForumPostModel.updateMany({ author: user._id }, { $set: { author: null } }, opts);
    await ForumReplyModel.updateMany({ author: user._id }, { $set: { author: null } }, opts);
    await ForumPostModel.updateMany({ followers: user._id }, { $pull: { followers: user._id } }, opts);
    await UserModel.deleteOne({ _id: user._id }, opts);
  });
  clearRefreshCookie(res);
  send(res, null, 'Account deleted');
});

export default router;
