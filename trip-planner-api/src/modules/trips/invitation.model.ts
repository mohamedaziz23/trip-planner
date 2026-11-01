import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Invitation sent by email to someone who has no account yet. The token itself
 * is only in the email; we keep its SHA-256 hash. One invitation per trip and
 * email: inviting again refreshes the token and the expiry (resend).
 */
const invitationSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'trip_invitations', toJSON: { versionKey: false } },
);

invitationSchema.index({ trip: 1, email: 1 }, { unique: true });
// MongoDB removes the document once it has expired
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type TripInvitation = InferSchemaType<typeof invitationSchema>;
export type TripInvitationDoc = InstanceType<typeof TripInvitationModel>;
export const TripInvitationModel = model('TripInvitation', invitationSchema);
