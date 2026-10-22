import { Schema, model, type InferSchemaType } from 'mongoose';

export const TRIP_TYPES = ['beach', 'mountain', 'city break', 'road trip', 'camping', 'business', 'pilgrimage'] as const;
export const ACTIVITIES = ['hiking', 'swimming', 'diving', 'photography', 'skiing', 'nightlife', 'museums'] as const;
export const ACCOMMODATIONS = ['hotel', 'hostel', 'apartment', 'tent', 'family'] as const;
export const TRANSPORTS = ['plane', 'car', 'train', 'bus'] as const;
export const SPECIAL_NEEDS = ['with a baby', 'formal event', 'driving abroad', 'modest dress required'] as const;

const preferencesSchema = new Schema(
  {
    tripType: { type: String, enum: TRIP_TYPES, default: 'city break' },
    activities: [{ type: String, enum: ACTIVITIES }],
    accommodation: { type: String, enum: ACCOMMODATIONS, default: 'hotel' },
    transport: { type: String, enum: TRANSPORTS, default: 'plane' },
    travellers: {
      adults: { type: Number, min: 0, default: 1 },
      children: { type: Number, min: 0, default: 0 },
      infants: { type: Number, min: 0, default: 0 },
    },
    specialNeeds: [{ type: String, enum: SPECIAL_NEEDS }],
  },
  { _id: false },
);

const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor'], default: 'editor' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    destination: { type: String, required: true, trim: true, maxlength: 120 },
    // ISO 3166-1 alpha-2 code
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    budget: { type: Number, min: 0, default: 0 },
    baseCurrency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    coverUrl: { type: String, default: null },
    preferences: { type: preferencesSchema, default: () => ({}) },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: { type: [memberSchema], default: [] },
    shareToken: { type: String, default: undefined },
  },
  { timestamps: true, collection: 'trips', toJSON: { versionKey: false } },
);

tripSchema.index({ 'members.user': 1 });
tripSchema.index({ shareToken: 1 }, { unique: true, sparse: true });

export type Trip = InferSchemaType<typeof tripSchema>;
export type TripDoc = InstanceType<typeof TripModel>;
export type TripPreferences = InferSchemaType<typeof preferencesSchema>;
export const TripModel = model('Trip', tripSchema);
