import { Schema, model, type InferSchemaType } from 'mongoose';

export const CHECKLIST_CATEGORIES = [
  'documents',
  'clothing',
  'toiletries',
  'health',
  'electronics',
  'gear',
  'baby',
  'money',
  'other',
] as const;

const checklistItemSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, default: 1, min: 1 },
    category: { type: String, enum: CHECKLIST_CATEGORIES, default: 'other' },
    isPacked: { type: Boolean, default: false },
    source: { type: String, enum: ['generated', 'manual'], default: 'manual' },
    // key of the rule template that produced the item (generated items only)
    templateKey: { type: String, default: null },
    // true once the user changed a generated item: regeneration never touches it again
    isEdited: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'checklist_items', toJSON: { versionKey: false } },
);

export type ChecklistItem = InferSchemaType<typeof checklistItemSchema>;
export type ChecklistItemDoc = InstanceType<typeof ChecklistItemModel>;
export const ChecklistItemModel = model('ChecklistItem', checklistItemSchema);

/**
 * A rule condition. Conditions are plain data so templates stay data-driven:
 *  { always: true }
 *  { field: 'tripType', op: 'eq', value: 'beach' }
 *  { field: 'activities', op: 'includes', value: 'hiking' }
 *  { field: 'travellers.infants', op: 'gt', value: 0 }
 *  { any: [cond, cond] } / { all: [cond, cond] }
 */
const templateItemSchema = new Schema(
  {
    label: { type: String, required: true },
    category: { type: String, enum: CHECKLIST_CATEGORIES, default: 'other' },
    isCountable: { type: Boolean, default: false },
  },
  { _id: false },
);

const checklistTemplateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    condition: { type: Schema.Types.Mixed, required: true },
    items: { type: [templateItemSchema], default: [] },
    // template-level default; an item can override it
    isCountable: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'checklist_templates', toJSON: { versionKey: false } },
);

export type ChecklistTemplate = InferSchemaType<typeof checklistTemplateSchema>;
export const ChecklistTemplateModel = model('ChecklistTemplate', checklistTemplateSchema);
