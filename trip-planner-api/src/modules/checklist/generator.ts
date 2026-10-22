import type { ClientSession } from 'mongoose';
import { durationInDays, seasonOf, type Season } from '../../lib/countries';
import type { TripDoc } from '../trips/trip.model';
import { ChecklistItemModel, ChecklistTemplateModel } from './checklist.model';

/** Everything a rule condition can look at. */
export interface RuleContext {
  tripType: string;
  activities: string[];
  accommodation: string;
  transport: string;
  travellers: { adults: number; children: number; infants: number };
  specialNeeds: string[];
  season: Season;
  duration: number;
  isAbroad: boolean;
  country: string;
}

export type Condition =
  | { always: true }
  | { any: Condition[] }
  | { all: Condition[] }
  | { field: string; op: 'eq' | 'neq' | 'in' | 'includes' | 'gt' | 'gte' | 'lt'; value: unknown };

export interface GeneratedItem {
  label: string;
  category: string;
  quantity: number;
  templateKey: string;
}

function readField(ctx: RuleContext, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), ctx);
}

export function evaluate(condition: Condition, ctx: RuleContext): boolean {
  if ('always' in condition) return condition.always === true;
  if ('any' in condition) return condition.any.some((c) => evaluate(c, ctx));
  if ('all' in condition) return condition.all.every((c) => evaluate(c, ctx));
  const actual = readField(ctx, condition.field);
  const expected = condition.value;
  switch (condition.op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'includes':
      return Array.isArray(actual) && actual.includes(expected);
    case 'gt':
      return typeof actual === 'number' && actual > Number(expected);
    case 'gte':
      return typeof actual === 'number' && actual >= Number(expected);
    case 'lt':
      return typeof actual === 'number' && actual < Number(expected);
    default:
      return false;
  }
}

/** Builds the rule context from a trip: preferences plus the derived season, duration and abroad flag. */
export function buildContext(trip: TripDoc, homeCountry: string | null | undefined): RuleContext {
  const prefs = trip.preferences ?? ({} as NonNullable<TripDoc['preferences']>);
  return {
    tripType: prefs.tripType ?? 'city break',
    activities: [...(prefs.activities ?? [])] as string[],
    accommodation: prefs.accommodation ?? 'hotel',
    transport: prefs.transport ?? 'plane',
    travellers: {
      adults: prefs.travellers?.adults ?? 1,
      children: prefs.travellers?.children ?? 0,
      infants: prefs.travellers?.infants ?? 0,
    },
    specialNeeds: [...(prefs.specialNeeds ?? [])] as string[],
    season: seasonOf(trip.startDate, trip.country),
    duration: durationInDays(trip.startDate, trip.endDate),
    // unknown home country: assume the trip is abroad (better to remind the passport)
    isAbroad: homeCountry ? homeCountry.toUpperCase() !== trip.country.toUpperCase() : true,
    country: trip.country,
  };
}

/** Quantity rule: countable items get min(duration + 1, 10) per adult traveller, others 1. */
export function quantityFor(isCountable: boolean, ctx: RuleContext): number {
  if (!isCountable) return 1;
  return Math.min(ctx.duration + 1, 10) * Math.max(1, ctx.travellers.adults);
}

/** Runs every template against the context and returns the de-duplicated item list. */
export async function computeItems(ctx: RuleContext): Promise<GeneratedItem[]> {
  const templates = await ChecklistTemplateModel.find().sort({ key: 1 }).lean();
  const byLabel = new Map<string, GeneratedItem>();
  for (const template of templates) {
    if (!evaluate(template.condition as Condition, ctx)) continue;
    for (const item of template.items) {
      const key = item.label.trim().toLowerCase();
      if (byLabel.has(key)) continue;
      byLabel.set(key, {
        label: item.label,
        category: item.category ?? 'other',
        quantity: quantityFor(item.isCountable || template.isCountable, ctx),
        templateKey: template.key,
      });
    }
  }
  return [...byLabel.values()];
}

/**
 * Generates or regenerates the checklist of a trip (server side, so every device gets the same list).
 * - adds items that are missing (a manual item with the same label counts as present)
 * - updates quantity/category of generated items the user never touched
 * - removes generated items that no longer match, unless they were edited or ticked
 */
export async function syncChecklist(trip: TripDoc, homeCountry: string | null | undefined, session: ClientSession | null = null) {
  const ctx = buildContext(trip, homeCountry);
  const wanted = await computeItems(ctx);
  const wantedByLabel = new Map(wanted.map((i) => [i.label.toLowerCase(), i]));
  const existing = await ChecklistItemModel.find({ trip: trip._id }).session(session);
  const existingLabels = new Set(existing.map((i) => i.label.toLowerCase()));

  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const item of existing) {
    if (item.source !== 'generated' || item.isEdited || item.isPacked) continue;
    const target = wantedByLabel.get(item.label.toLowerCase());
    if (!target) {
      await item.deleteOne({ session });
      removed++;
    } else if (item.quantity !== target.quantity || item.category !== target.category) {
      item.quantity = target.quantity;
      item.category = target.category as typeof item.category;
      await item.save({ session });
      updated++;
    }
  }

  const toInsert = wanted
    .filter((i) => !existingLabels.has(i.label.toLowerCase()))
    .map((i) => ({ ...i, trip: trip._id, source: 'generated' as const }));
  if (toInsert.length) {
    await ChecklistItemModel.insertMany(toInsert, session ? { session } : {});
    added = toInsert.length;
  }

  return { added, updated, removed, context: ctx };
}
