import { Schema, model, type InferSchemaType } from 'mongoose';

export const PLACE_CATEGORIES = [
  'sight',
  'museum',
  'restaurant',
  'cafe',
  'hotel',
  'nature',
  'beach',
  'shopping',
  'nightlife',
  'transport',
  'other',
] as const;

const placeSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    address: { type: String, default: '', maxlength: 300 },
    category: { type: String, enum: PLACE_CATEGORIES, default: 'sight' },
    // 1-based day of the trip; null = not yet scheduled
    day: { type: Number, default: null, min: 1 },
    startTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    durationMin: { type: Number, default: 60, min: 0 },
    estimatedCost: { type: Number, default: 0, min: 0 },
    order: { type: Number, default: 0 },
    notes: { type: String, default: '', maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'places', toJSON: { versionKey: false } },
);

placeSchema.index({ trip: 1, day: 1, order: 1 });

export type Place = InferSchemaType<typeof placeSchema>;
export type PlaceDoc = InstanceType<typeof PlaceModel>;
export const PlaceModel = model('Place', placeSchema);
