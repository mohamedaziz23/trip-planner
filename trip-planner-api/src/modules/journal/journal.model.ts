import { Schema, model, type InferSchemaType } from 'mongoose';

export const MOODS = ['amazing', 'happy', 'neutral', 'tired', 'sad'] as const;

const journalEntrySchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    place: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
    title: { type: String, default: '', trim: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 10000 },
    photos: [{ type: String }],
    date: { type: Date, required: true },
    mood: { type: String, enum: MOODS, default: 'happy' },
    lat: { type: Number, default: null, min: -90, max: 90 },
    lng: { type: Number, default: null, min: -180, max: 180 },
  },
  { timestamps: true, collection: 'journal_entries', toJSON: { versionKey: false } },
);

journalEntrySchema.index({ trip: 1, date: -1 });

export type JournalEntry = InferSchemaType<typeof journalEntrySchema>;
export type JournalEntryDoc = InstanceType<typeof JournalEntryModel>;
export const JournalEntryModel = model('JournalEntry', journalEntrySchema);
