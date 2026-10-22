import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError, created, paginated, send } from '../../lib/http';
import { assertObjectId, body, objectId, query } from '../../lib/validate';
import { sendPushToUsers } from '../../lib/push';
import { currentUser, optionalAuth, requireAdmin, requireAuth } from '../../middleware/auth';
import { UserModel } from '../users/user.model';
import { FORUM_CATEGORIES, ForumPostModel, ForumReplyModel, type ForumPostDoc } from './forum.model';

const router = Router();
router.use('/forum', optionalAuth);

const EDIT_GRACE_MS = 30 * 60 * 1000;
const REPLY_COOLDOWN_MS = 60 * 1000;
const AUTHOR = { path: 'author', select: 'name avatarUrl' };

type Votable = { _id: Types.ObjectId; voters?: Types.ObjectId[]; author?: unknown; reports?: unknown[]; followers?: Types.ObjectId[] };

/** Removes private arrays and adds per-viewer flags. */
function shape<T extends Votable>(doc: T, viewerId?: string) {
  const { voters = [], followers, reports, ...rest } = doc as T & Record<string, unknown>;
  const out: Record<string, unknown> = {
    ...rest,
    author: rest.author ?? { _id: null, name: 'Deleted user', avatarUrl: null },
    hasVoted: viewerId ? voters.some((v) => v.toString() === viewerId) : false,
  };
  if (followers) out.isFollowing = viewerId ? followers.some((f) => f.toString() === viewerId) : false;
  void reports;
  return out;
}

function uniqTags(tags: string[]) {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5);
}

async function loadPost(req: Request, param = 'postId'): Promise<ForumPostDoc> {
  const post = await ForumPostModel.findById(assertObjectId(req.params[param] as string, 'post'));
  if (!post) throw ApiError.notFound('Post not found');
  const viewer = req.user;
  if (post.status === 'hidden' && viewer?.role !== 'admin' && post.author?.toString() !== viewer?.id) {
    throw ApiError.notFound('Post not found');
  }
  return post;
}

// ---------------------------------------------------------------- public reads
router.get('/forum/categories', (_req, res) => send(res, FORUM_CATEGORIES));

router.get('/forum/tags', async (_req, res) => {
  const tags = await ForumPostModel.aggregate([
    { $match: { status: 'published' } },
    { $unwind: '$destinationTags' },
    { $group: { _id: '$destinationTags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
  ]);
  send(res, tags.map((t) => ({ tag: t._id, count: t.count })));
});

/** Full-text search on title and body, filtered by category and destination tag. */
router.get('/forum/posts', async (req, res) => {
  const q = query(
    req,
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      q: z.string().trim().max(200).optional(),
      category: z.enum(FORUM_CATEGORIES).optional(),
      tag: z.string().trim().toLowerCase().max(60).optional(),
      sort: z.enum(['relevance', 'recent', 'top', 'active']).optional(),
      mine: z.enum(['true', 'false']).optional(),
    }),
  );
  const filter: Record<string, unknown> = { status: 'published' };
  if (q.q) filter.$text = { $search: q.q };
  if (q.category) filter.category = q.category;
  if (q.tag) filter.destinationTags = q.tag;
  if (q.mine === 'true' && req.user) filter.author = req.user.id;

  const sortKey = q.sort ?? (q.q ? 'relevance' : 'recent');
  const sort: Record<string, 1 | -1 | { $meta: 'textScore' }> =
    sortKey === 'relevance' && q.q
      ? { score: { $meta: 'textScore' }, createdAt: -1 }
      : sortKey === 'top'
        ? { upvotes: -1, createdAt: -1 }
        : sortKey === 'active'
          ? { lastActivityAt: -1 }
          : { createdAt: -1 };

  const projection = q.q ? { score: { $meta: 'textScore' }, reports: 0 } : { reports: 0 };
  const [items, total] = await Promise.all([
    ForumPostModel.find(filter, projection)
      .sort(sort as Record<string, 1 | -1>)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate(AUTHOR)
      .lean(),
    ForumPostModel.countDocuments(filter),
  ]);
  send(res, paginated(items.map((p) => shape(p, req.user?.id)), q.page, q.limit, total));
});

/** A post with its replies, each reply carrying its comments (one level). */
router.get('/forum/posts/:postId', async (req, res) => {
  const post = await loadPost(req);
  await post.populate(AUTHOR);
  const isAdmin = req.user?.role === 'admin';
  const replies = await ForumReplyModel.find({ post: post._id, ...(isAdmin ? {} : { status: 'published' }) })
    .sort({ createdAt: 1 })
    .select('-reports')
    .populate(AUTHOR)
    .lean();
  const top = replies.filter((r) => !r.parentReply).map((r) => ({ ...shape(r, req.user?.id), comments: [] as unknown[] }));
  const byId = new Map(top.map((r) => [String((r as Record<string, unknown>)._id), r]));
  for (const c of replies.filter((r) => r.parentReply)) byId.get(String(c.parentReply))?.comments.push(shape(c, req.user?.id));
  const viewer = req.user?.id;
  const json = shape(post.toObject() as unknown as Votable, viewer);
  if (viewer) {
    const me = await UserModel.findById(viewer).select('notificationPrefs').lean();
    json.isMuted = Boolean(me?.notificationPrefs?.mutedPosts?.some((p) => p.toString() === post._id.toString()));
  }
  send(res, { post: json, replies: top });
});

// ---------------------------------------------------------------- member writes (online only)
router.post('/forum/posts', requireAuth, async (req, res) => {
  const input = body(
    req,
    z.object({
      title: z.string().trim().min(10, 'Title must be 10 to 120 characters').max(120, 'Title must be 10 to 120 characters'),
      body: z.string().trim().min(20, 'Body must be 20 to 5000 characters').max(5000, 'Body must be 20 to 5000 characters'),
      category: z.enum(FORUM_CATEGORIES),
      destinationTags: z.array(z.string().trim().min(1).max(60)).min(1, 'Add at least one destination tag').max(5),
    }),
  );
  const me = currentUser(req).id;
  const post = await ForumPostModel.create({ ...input, destinationTags: uniqTags(input.destinationTags), author: me, followers: [me] });
  await post.populate(AUTHOR);
  created(res, shape(post.toObject() as unknown as Votable, me), 'Post published');
});

router.patch('/forum/posts/:postId', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  const me = currentUser(req).id;
  if (post.author?.toString() !== me) throw ApiError.forbidden('Only the author can edit this post');
  if (post.isLocked) throw ApiError.forbidden('This thread is locked');
  const input = body(
    req,
    z
      .object({
        title: z.string().trim().min(10).max(120),
        body: z.string().trim().min(20).max(5000),
        category: z.enum(FORUM_CATEGORIES),
        destinationTags: z.array(z.string().trim().min(1).max(60)).min(1).max(5),
      })
      .partial(),
  );
  post.set({ ...input, ...(input.destinationTags && { destinationTags: uniqTags(input.destinationTags) }) });
  // edits after the 30-minute grace period carry a visible "edited" marker
  if (Date.now() - post.createdAt.getTime() > EDIT_GRACE_MS) post.editedAt = new Date();
  await post.save();
  await post.populate(AUTHOR);
  send(res, shape(post.toObject() as unknown as Votable, me), 'Post updated');
});

router.delete('/forum/posts/:postId', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  const user = currentUser(req);
  if (post.author?.toString() !== user.id && user.role !== 'admin') throw ApiError.forbidden();
  await ForumReplyModel.deleteMany({ post: post._id });
  await post.deleteOne();
  send(res, { _id: post._id }, 'Post deleted');
});

async function toggleVote(model: typeof ForumPostModel | typeof ForumReplyModel, id: Types.ObjectId, userId: string) {
  const uid = new Types.ObjectId(userId);
  // add the vote if absent, otherwise remove it (one vote per member, reversible)
  const added = await (model as typeof ForumPostModel).findOneAndUpdate(
    { _id: id, voters: { $ne: uid } },
    { $addToSet: { voters: uid }, $inc: { upvotes: 1 } },
    { new: true },
  );
  if (added) return { upvotes: added.upvotes, hasVoted: true };
  const removed = await (model as typeof ForumPostModel).findOneAndUpdate(
    { _id: id, voters: uid },
    { $pull: { voters: uid }, $inc: { upvotes: -1 } },
    { new: true },
  );
  return { upvotes: removed?.upvotes ?? 0, hasVoted: false };
}

router.post('/forum/posts/:postId/vote', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  send(res, await toggleVote(ForumPostModel, post._id, currentUser(req).id));
});

router.post('/forum/posts/:postId/follow', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  const me = new Types.ObjectId(currentUser(req).id);
  await ForumPostModel.updateOne({ _id: post._id }, { $addToSet: { followers: me } });
  await UserModel.updateOne({ _id: me }, { $pull: { 'notificationPrefs.mutedPosts': post._id } });
  send(res, { isFollowing: true, isMuted: false }, 'You will be notified of new replies');
});

/** Unfollow = disable notifications for this thread (also stops auto-follow on future replies). */
router.delete('/forum/posts/:postId/follow', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  const me = new Types.ObjectId(currentUser(req).id);
  await ForumPostModel.updateOne({ _id: post._id }, { $pull: { followers: me } });
  await UserModel.updateOne({ _id: me }, { $addToSet: { 'notificationPrefs.mutedPosts': post._id } });
  send(res, { isFollowing: false, isMuted: true }, 'Notifications disabled for this thread');
});

const reportSchema = z.object({ reason: z.string().trim().min(3).max(500) });

router.post('/forum/posts/:postId/report', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  const { reason } = body(req, reportSchema);
  const me = currentUser(req).id;
  if (post.reports.some((r) => r.reporter.toString() === me && !r.resolved)) throw ApiError.conflict('You already reported this post');
  post.reports.push({ reporter: new Types.ObjectId(me), reason, createdAt: new Date(), resolved: false });
  post.openReports = post.reports.filter((r) => !r.resolved).length;
  await post.save();
  send(res, null, 'Thanks, a moderator will review this post');
});

// ---------------------------------------------------------------- replies & comments
router.post('/forum/posts/:postId/replies', requireAuth, async (req, res) => {
  const post = await loadPost(req);
  if (post.status !== 'published') throw ApiError.forbidden('This post is not open for replies');
  if (post.isLocked) throw ApiError.forbidden('This thread is locked');
  const input = body(req, z.object({ body: z.string().trim().min(1).max(5000), parentReply: objectId.nullable().optional() }));
  const me = currentUser(req).id;

  // one reply per minute per member
  const recent = await ForumReplyModel.exists({ author: me, createdAt: { $gt: new Date(Date.now() - REPLY_COOLDOWN_MS) } });
  if (recent) throw ApiError.tooMany('You can post one reply per minute - please wait a moment');

  let parent = null;
  if (input.parentReply) {
    parent = await ForumReplyModel.findOne({ _id: input.parentReply, post: post._id });
    if (!parent) throw ApiError.badRequest('The reply you are commenting on does not exist');
    if (parent.parentReply) throw ApiError.badRequest('Comments are limited to one level');
    if (input.body.length > 500) throw ApiError.badRequest('Comments are limited to 500 characters', [{ path: 'body', message: 'Max 500 characters' }]);
  }

  const reply = await ForumReplyModel.create({ post: post._id, parentReply: parent?._id ?? null, author: me, body: input.body });

  const meDoc = await UserModel.findById(me).select('name notificationPrefs');
  const muted = meDoc?.notificationPrefs?.mutedPosts?.some((p) => p.toString() === post._id.toString());
  await ForumPostModel.updateOne(
    { _id: post._id },
    { $inc: { replyCount: 1 }, $set: { lastActivityAt: new Date() }, ...(!muted && { $addToSet: { followers: new Types.ObjectId(me) } }) },
  );

  // Web Push to followers (except the author of this reply) who did not disable it
  const recipients = await UserModel.find({
    _id: { $in: post.followers.filter((f) => f.toString() !== me) },
    'notificationPrefs.forumReplies': { $ne: false },
    'notificationPrefs.mutedPosts': { $ne: post._id },
  }).select('_id');
  void sendPushToUsers(
    recipients.map((r) => r._id.toString()),
    {
      title: `New reply on "${post.title.slice(0, 60)}"`,
      body: `${meDoc?.name ?? 'Someone'}: ${input.body.slice(0, 120)}`,
      url: `/forum/${post._id}#reply-${reply._id}`,
      tag: `post-${post._id}`,
    },
  ).catch((err) => console.warn('[push]', err));

  await reply.populate(AUTHOR);
  created(res, { ...shape(reply.toObject() as unknown as Votable, me), comments: [] }, 'Reply posted');
});

async function loadReply(req: Request) {
  const reply = await ForumReplyModel.findById(assertObjectId(req.params.replyId as string, 'reply'));
  if (!reply) throw ApiError.notFound('Reply not found');
  return reply;
}

router.patch('/forum/replies/:replyId', requireAuth, async (req, res) => {
  const reply = await loadReply(req);
  const me = currentUser(req).id;
  if (reply.author?.toString() !== me) throw ApiError.forbidden('Only the author can edit this reply');
  const max = reply.parentReply ? 500 : 5000;
  const input = body(req, z.object({ body: z.string().trim().min(1).max(max) }));
  reply.body = input.body;
  if (Date.now() - reply.createdAt.getTime() > EDIT_GRACE_MS) reply.editedAt = new Date();
  await reply.save();
  await reply.populate(AUTHOR);
  send(res, shape(reply.toObject() as unknown as Votable, me), 'Reply updated');
});

async function deleteReplyTree(reply: InstanceType<typeof ForumReplyModel>) {
  const children = reply.parentReply ? 0 : (await ForumReplyModel.deleteMany({ parentReply: reply._id })).deletedCount;
  await reply.deleteOne();
  await ForumPostModel.updateOne({ _id: reply.post }, { $inc: { replyCount: -(1 + children) } });
}

router.delete('/forum/replies/:replyId', requireAuth, async (req, res) => {
  const reply = await loadReply(req);
  const user = currentUser(req);
  if (reply.author?.toString() !== user.id && user.role !== 'admin') throw ApiError.forbidden();
  await deleteReplyTree(reply);
  send(res, { _id: reply._id }, 'Reply deleted');
});

router.post('/forum/replies/:replyId/vote', requireAuth, async (req, res) => {
  const reply = await loadReply(req);
  send(res, await toggleVote(ForumReplyModel, reply._id, currentUser(req).id));
});

router.post('/forum/replies/:replyId/report', requireAuth, async (req, res) => {
  const reply = await loadReply(req);
  const { reason } = body(req, reportSchema);
  const me = currentUser(req).id;
  if (reply.reports.some((r) => r.reporter.toString() === me && !r.resolved)) throw ApiError.conflict('You already reported this reply');
  reply.reports.push({ reporter: new Types.ObjectId(me), reason, createdAt: new Date(), resolved: false });
  reply.openReports = reply.reports.filter((r) => !r.resolved).length;
  await reply.save();
  send(res, null, 'Thanks, a moderator will review this reply');
});

// ---------------------------------------------------------------- moderation (admin)
router.get('/forum/moderation', requireAuth, requireAdmin, async (_req, res) => {
  const reporter = { path: 'reports.reporter', select: 'name' };
  const [posts, replies] = await Promise.all([
    ForumPostModel.find({ openReports: { $gt: 0 } }).sort({ openReports: -1, updatedAt: -1 }).populate(AUTHOR).populate(reporter).lean(),
    ForumReplyModel.find({ openReports: { $gt: 0 } }).sort({ openReports: -1, updatedAt: -1 }).populate(AUTHOR).populate(reporter).populate('post', 'title').lean(),
  ]);
  const strip = <T extends { reports: { resolved: boolean }[]; voters?: unknown; followers?: unknown }>(d: T) => {
    const { voters, followers, ...rest } = d;
    void voters;
    void followers;
    return { ...rest, reports: d.reports.filter((r) => !r.resolved) };
  };
  send(res, { posts: posts.map(strip), replies: replies.map(strip) });
});

function resolveReports(doc: { reports: { resolved: boolean }[]; openReports: number }) {
  doc.reports.forEach((r) => (r.resolved = true));
  doc.openReports = 0;
}

router.post('/forum/moderation/posts/:postId', requireAuth, requireAdmin, async (req, res) => {
  const post = await loadPost(req);
  const { action } = body(req, z.object({ action: z.enum(['hide', 'unhide', 'lock', 'unlock', 'delete', 'dismiss']) }));
  if (action === 'delete') {
    await ForumReplyModel.deleteMany({ post: post._id });
    await post.deleteOne();
    return send(res, { _id: post._id }, 'Post deleted');
  }
  if (action === 'hide') post.status = 'hidden';
  if (action === 'unhide') post.status = 'published';
  if (action === 'lock') post.isLocked = true;
  if (action === 'unlock') post.isLocked = false;
  if (action !== 'unlock' && action !== 'unhide') resolveReports(post);
  await post.save();
  send(res, { _id: post._id, status: post.status, isLocked: post.isLocked }, `Post ${action === 'dismiss' ? 'reports dismissed' : action + (action.endsWith('e') ? 'd' : 'ed')}`);
});

router.post('/forum/moderation/replies/:replyId', requireAuth, requireAdmin, async (req, res) => {
  const reply = await loadReply(req);
  const { action } = body(req, z.object({ action: z.enum(['hide', 'unhide', 'delete', 'dismiss']) }));
  if (action === 'delete') {
    await deleteReplyTree(reply);
    return send(res, { _id: reply._id }, 'Reply deleted');
  }
  if (action === 'hide') reply.status = 'hidden';
  if (action === 'unhide') reply.status = 'published';
  if (action !== 'unhide') resolveReports(reply);
  await reply.save();
  send(res, { _id: reply._id, status: reply.status }, 'Moderation applied');
});

export default router;
