import { env } from '../../config/env';
import { ApiError } from '../../lib/http';
import { sendMail } from '../../lib/mailer';
import { randomToken, sha256 } from '../../lib/tokens';
import { UserModel } from '../users/user.model';
import { TripInvitationModel } from './invitation.model';
import type { TripDoc } from './trip.model';

export const INVITATION_TTL_DAYS = 7;
const MAX_PENDING_PER_TRIP = 20;

const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Creates (or refreshes) the invitation of `email` to `trip` and emails the
 * join link. Without SMTP the mailer prints the link in the API console.
 */
export async function sendTripInvitation(trip: TripDoc, inviterId: string, email: string) {
  const now = new Date();
  const known = await TripInvitationModel.exists({ trip: trip._id, email });
  if (!known) {
    const pending = await TripInvitationModel.countDocuments({ trip: trip._id, status: 'pending', expiresAt: { $gt: now } });
    if (pending >= MAX_PENDING_PER_TRIP) {
      throw ApiError.badRequest(`This trip already has ${MAX_PENDING_PER_TRIP} pending invitations - cancel some first`);
    }
  }

  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 3600 * 1000);
  await TripInvitationModel.findOneAndUpdate(
    { trip: trip._id, email },
    { $set: { invitedBy: inviterId, tokenHash: sha256(token), status: 'pending', expiresAt } },
    { upsert: true, setDefaultsOnInsert: true },
  );

  const inviter = await UserModel.findById(inviterId).select('name').lean();
  const inviterName = inviter?.name ?? 'A traveller';
  const link = `${env.clientOrigin}/invite/${token}`;
  const text = [
    `Hello,`,
    ``,
    `${inviterName} invited you to plan a trip together on Trip Planner:`,
    ``,
    `  ${trip.title}`,
    `  ${trip.destination} - ${fmt(trip.startDate)} to ${fmt(trip.endDate)}`,
    ``,
    `Create your account (or log in) with this email address to join:`,
    link,
    ``,
    `The link works for ${INVITATION_TTL_DAYS} days. If you do not know ${inviterName}, ignore this email.`,
  ].join('\n');

  try {
    await sendMail(email, `${inviterName} invited you to "${trip.title}" on Trip Planner`, text);
  } catch (err) {
    console.error('[invite] email could not be sent', err);
    throw new ApiError(502, 'The invitation was saved but the email could not be sent - try again later');
  }
}
