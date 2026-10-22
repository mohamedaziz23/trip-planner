import { Router } from 'express';
import { z } from 'zod';
import { ApiError, paginated, send } from '../../lib/http';
import { assertObjectId, body, escapeRegex, listQuery, query } from '../../lib/validate';
import { currentUser, requireAdmin, requireAuth } from '../../middleware/auth';
import { TripModel } from '../trips/trip.model';
import { PlaceModel } from '../places/place.model';
import { ExpenseModel } from '../expenses/expense.model';
import { ChecklistItemModel } from '../checklist/checklist.model';
import { JournalEntryModel } from '../journal/journal.model';
import { ForumPostModel, ForumReplyModel } from '../forum/forum.model';
import { UserModel } from './user.model';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res) => {
  const { page, limit, q } = query(req, listQuery);
  const filter = q
    ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }] }
    : {};
  const [items, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    UserModel.countDocuments(filter),
  ]);
  send(res, paginated(items.map((u) => u.toJSON()), page, limit, total));
});

/** Deactivate / reactivate an account, or change its role. */
router.patch('/users/:id', async (req, res) => {
  const id = assertObjectId(req.params.id, 'user');
  const input = body(req, z.object({ isActive: z.boolean().optional(), role: z.enum(['member', 'admin']).optional() }));
  if (id === currentUser(req).id) throw ApiError.badRequest('You cannot change your own account here');
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (input.isActive !== undefined) {
    user.isActive = input.isActive;
    if (!input.isActive) user.refreshTokens = [] as unknown as typeof user.refreshTokens;
  }
  if (input.role) user.role = input.role;
  await user.save();
  send(res, user.toJSON(), 'User updated');
});

/** Usage statistics for the admin dashboard. */
router.get('/stats', async (_req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [users, activeUsers, newUsers, trips, places, expenses, checklistItems, journalEntries, posts, replies, reported] =
    await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ lastLoginAt: { $gte: weekAgo } }),
      UserModel.countDocuments({ createdAt: { $gte: weekAgo } }),
      TripModel.countDocuments(),
      PlaceModel.countDocuments(),
      ExpenseModel.countDocuments(),
      ChecklistItemModel.countDocuments(),
      JournalEntryModel.countDocuments(),
      ForumPostModel.countDocuments(),
      ForumReplyModel.countDocuments(),
      Promise.all([
        ForumPostModel.countDocuments({ openReports: { $gt: 0 } }),
        ForumReplyModel.countDocuments({ openReports: { $gt: 0 } }),
      ]).then(([a, b]) => a + b),
    ]);
  const topDestinations = await TripModel.aggregate([
    { $group: { _id: '$country', trips: { $sum: 1 } } },
    { $sort: { trips: -1 } },
    { $limit: 5 },
  ]);
  send(res, {
    users,
    activeUsersLast7Days: activeUsers,
    newUsersLast7Days: newUsers,
    trips,
    places,
    expenses,
    checklistItems,
    journalEntries,
    forumPosts: posts,
    forumReplies: replies,
    openReports: reported,
    topDestinations: topDestinations.map((d) => ({ country: d._id, trips: d.trips })),
  });
});

export default router;
