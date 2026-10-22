import { Schema, model, type InferSchemaType } from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'accommodation',
  'transport',
  'food',
  'activities',
  'shopping',
  'health',
  'other',
] as const;

const expenseSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    // Amount converted to the trip's base currency, and the rate used (1 currency = rateUsed base)
    amountInBase: { type: Number, required: true },
    rateUsed: { type: Number, required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'other' },
    date: { type: Date, required: true },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiptUrl: { type: String, default: null },
    splitBetween: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, collection: 'expenses', toJSON: { versionKey: false } },
);

expenseSchema.index({ trip: 1, date: 1 });
expenseSchema.index({ trip: 1, category: 1 });

export type Expense = InferSchemaType<typeof expenseSchema>;
export type ExpenseDoc = InstanceType<typeof ExpenseModel>;
export const ExpenseModel = model('Expense', expenseSchema);
