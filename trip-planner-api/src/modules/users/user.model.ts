import { Schema, model, type InferSchemaType } from 'mongoose';

const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const refreshTokenSchema = new Schema(
  {
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    // Set when the token was exchanged for a new one (rotation).
    rotatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    baseCurrency: { type: String, default: 'EUR', uppercase: true, minlength: 3, maxlength: 3 },
    language: { type: String, default: 'en' },
    // ISO 3166-1 alpha-2 - used by the checklist rule "destination differs from home country".
    homeCountry: { type: String, default: null, uppercase: true },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    isActive: { type: Boolean, default: true },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },
    notificationPrefs: {
      forumReplies: { type: Boolean, default: true },
      mutedPosts: [{ type: Schema.Types.ObjectId, ref: 'ForumPost' }],
    },
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'users',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.refreshTokens;
        delete ret.resetTokenHash;
        delete ret.resetTokenExpires;
        const subs = ret.pushSubscriptions as unknown[] | undefined;
        ret.pushEnabled = Array.isArray(subs) && subs.length > 0;
        delete ret.pushSubscriptions;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = InstanceType<typeof UserModel>;
export const UserModel = model('User', userSchema);

/** Minimal public projection used when populating authors / members. */
export const PUBLIC_USER_FIELDS = 'name avatarUrl';
