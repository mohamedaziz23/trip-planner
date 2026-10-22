import type { Request } from 'express';
import { ApiError } from '../lib/http';
import { assertObjectId } from '../lib/validate';
import { TripModel, type TripDoc } from '../modules/trips/trip.model';
import { currentUser } from './auth';

export function isMember(trip: TripDoc, userId: string) {
  return trip.members.some((m) => m.user.toString() === userId);
}

export function isOwner(trip: TripDoc, userId: string) {
  return trip.owner.toString() === userId;
}

/**
 * Loads the trip from `req.params.tripId` (or `id`) and checks that the
 * current user is in its member list. Every child resource goes through this,
 * so a permission check costs one lookup (spec rule 3).
 */
export async function loadTripForMember(req: Request, param = 'tripId'): Promise<TripDoc> {
  const user = currentUser(req);
  const id = assertObjectId(req.params[param] as string | undefined, 'trip');
  const trip = await TripModel.findById(id);
  if (!trip) throw ApiError.notFound('Trip not found');
  if (!isMember(trip, user.id)) throw ApiError.forbidden('You are not a member of this trip');
  return trip;
}

export async function loadTripForOwner(req: Request, param = 'tripId'): Promise<TripDoc> {
  const trip = await loadTripForMember(req, param);
  if (!isOwner(trip, currentUser(req).id)) throw ApiError.forbidden('Only the trip owner can do this');
  return trip;
}
