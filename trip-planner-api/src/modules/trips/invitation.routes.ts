import { Router } from 'express';
import { ApiError, send } from '../../lib/http';
import { sha256 } from '../../lib/tokens';
import { assertObjectId } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { isMember, loadTripForOwner } from '../../middleware/tripAccess';
import { UserModel } from '../users/user.model';
import { TripInvitationModel } from './invitation.model';
import { TripModel } from './trip.model';
import { TRIP_POPULATE } from './trip.service';

const router = Router();

const INVALID = 'This invitation is invalid or has expired';

async function findValid(rawToken: string | undefined) {
  const token = String(rawToken ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw ApiError.notFound(INVALID);
  const invitation = await TripInvitationModel.findOne({
    tokenHash: sha256(token),
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
  if (!invitation) throw ApiError.notFound(INVALID);
  return invitation;
}

// ---------------------------------------------------------------- invitee side
/** Public: what the invitation link points to (the token itself is the secret). */
router.get('/invitations/:token', async (req, res) => {
  const invitation = await findValid(req.params.token as string);
  const [trip, inviter] = await Promise.all([
    TripModel.findById(invitation.trip).select('title destination country startDate endDate').lean(),
    UserModel.findById(invitation.invitedBy).select('name').lean(),
  ]);
  if (!trip) throw ApiError.notFound(INVALID);
  send(res, {
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    invitedBy: inviter?.name ?? 'A traveller',
    trip: { title: trip.title, destination: trip.destination, country: trip.country, startDate: trip.startDate, endDate: trip.endDate },
  });
});

/** The logged-in user joins the trip. Their account email must be the invited one. */
router.post('/invitations/:token/accept', requireAuth, async (req, res) => {
  const invitation = await findValid(req.params.token as string);
  const user = await UserModel.findById(currentUser(req).id).select('email');
  if (!user) throw ApiError.unauthorized();
  if (user.email !== invitation.email) {
    throw ApiError.forbidden(`This invitation was sent to ${invitation.email}. Log in with that address to accept it.`);
  }
  const trip = await TripModel.findById(invitation.trip);
  if (!trip) throw ApiError.notFound('This trip no longer exists');
  if (!isMember(trip, user._id.toString())) {
    trip.members.push({ user: user._id, role: 'editor', joinedAt: new Date() });
    await trip.save();
  }
  invitation.status = 'accepted';
  await invitation.save();
  await trip.populate(TRIP_POPULATE);
  send(res, trip.toJSON(), 'You joined the trip');
});

// ---------------------------------------------------------------- owner side
router.get('/trips/:tripId/invitations', requireAuth, async (req, res) => {
  const trip = await loadTripForOwner(req);
  const items = await TripInvitationModel.find({ trip: trip._id, status: 'pending', expiresAt: { $gt: new Date() } })
    .select('-tokenHash')
    .sort({ createdAt: -1 });
  send(res, items.map((i) => i.toJSON()));
});

router.delete('/trips/:tripId/invitations/:invitationId', requireAuth, async (req, res) => {
  const trip = await loadTripForOwner(req);
  const id = assertObjectId(req.params.invitationId as string, 'invitation');
  await TripInvitationModel.deleteOne({ _id: id, trip: trip._id });
  send(res, { _id: id }, 'Invitation cancelled');
});

export default router;
