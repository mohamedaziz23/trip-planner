import { Schema, model, type InferSchemaType } from 'mongoose';

export const FORUM_CATEGORIES = [
  'destinations',
  'budget and tips',
  'transport',
  'accommodation',
  'food',
  'safety',
  'equipment',
  'trip reports',
] as const;

// Reports are stored on the reported document; the moderation queue lists
// documents that have open reports.
const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
  },
  { _id: true },
);

const forumPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 10, maxlength: 120 },
    body: { type: String, required: true, trim: true, minlength: 20, maxlength: 5000 },
    category: { type: String, enum: FORUM_CATEGORIES, required: true },
    destinationTags: [{ type: String, trim: true, lowercase: true, maxlength: 60 }],
    // null once the author deleted their account (anonymised)
    author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
    isLocked: { type: Boolean, default: false },
    upvotes: { type: Number, default: 0 },
    voters: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    replyCount: { type: Number, default: 0 },
    followers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reports: { type: [reportSchema], default: [] },
    openReports: { type: Number, default: 0 },
    editedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'forum_posts', toJSON: { versionKey: false } },
);

forumPostSchema.index({ title: 'text', body: 'text' }, { weights: { title: 3, body: 1 }, name: 'post_text' });
forumPostSchema.index({ category: 1 });
forumPostSchema.index({ destinationTags: 1 });
forumPostSchema.index({ status: 1, createdAt: -1 });

const forumReplySchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'ForumPost', required: true },
    // null = reply to the post; set = comment on a reply (one level only)
    parentReply: { type: Schema.Types.ObjectId, ref: 'ForumReply', default: null },
    author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
    upvotes: { type: Number, default: 0 },
    voters: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reports: { type: [reportSchema], default: [] },
    openReports: { type: Number, default: 0 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'forum_replies', toJSON: { versionKey: false } },
);

forumReplySchema.index({ post: 1, createdAt: 1 });
forumReplySchema.index({ author: 1, createdAt: -1 });

export type ForumPost = InferSchemaType<typeof forumPostSchema>;
export type ForumPostDoc = InstanceType<typeof ForumPostModel>;
export type ForumReply = InferSchemaType<typeof forumReplySchema>;
export const ForumPostModel = model('ForumPost', forumPostSchema);
export const ForumReplyModel = model('ForumReply', forumReplySchema);
