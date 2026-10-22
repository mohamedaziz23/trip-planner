import type { ClientSession, Types } from 'mongoose';
import { PlaceModel } from '../places/place.model';
import { ExpenseModel } from '../expenses/expense.model';
import { ChecklistItemModel } from '../checklist/checklist.model';
import { JournalEntryModel } from '../journal/journal.model';
import { TripModel } from './trip.model';

/** Deletes a trip and all of its children (places, expenses, checklist, journal). */
export async function deleteTripCascade(tripId: Types.ObjectId | string, session: ClientSession | null) {
  const opts = session ? { session } : {};
  // sequential: operations sharing one transaction session must not run in parallel
  await PlaceModel.deleteMany({ trip: tripId }, opts);
  await ExpenseModel.deleteMany({ trip: tripId }, opts);
  await ChecklistItemModel.deleteMany({ trip: tripId }, opts);
  await JournalEntryModel.deleteMany({ trip: tripId }, opts);
  await TripModel.deleteOne({ _id: tripId }, opts);
}

/** Populates member names for API responses (`owner` stays an id). */
export const TRIP_POPULATE = { path: 'members.user', select: 'name email avatarUrl' };
