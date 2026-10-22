import { Router } from 'express';
import { z } from 'zod';
import { ApiError, created, paginated, send } from '../../lib/http';
import { assertNotStale } from '../../lib/sync';
import { assertObjectId, body, clientUpdatedAt, objectId, query, toSort } from '../../lib/validate';
import { currentUser, requireAuth } from '../../middleware/auth';
import { loadTripForMember } from '../../middleware/tripAccess';
import type { TripDoc } from '../trips/trip.model';
import { EXPENSE_CATEGORIES, ExpenseModel } from './expense.model';
import { convert, getRates } from './rates.service';

const router = Router();

/** Public: exchange rates for a base currency (cached daily server side). */
router.get('/rates', async (req, res) => {
  const { base } = query(req, z.object({ base: z.string().length(3).toUpperCase().default('EUR') }));
  try {
    send(res, await getRates(base));
  } catch {
    throw ApiError.badRequest(`Unsupported currency ${base}`);
  }
});

router.use('/trips', requireAuth);

const expenseFields = {
  label: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(10_000_000),
  currency: z.string().length(3).toUpperCase(),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  date: z.coerce.date(),
  paidBy: objectId.optional(),
  receiptUrl: z.string().max(500).nullable().optional(),
  splitBetween: z.array(objectId).optional(),
};

const createSchema = z.object({ _id: objectId.optional(), ...expenseFields });
const updateSchema = z
  .object({
    label: expenseFields.label,
    amount: expenseFields.amount,
    currency: expenseFields.currency,
    category: z.enum(EXPENSE_CATEGORIES),
    date: z.coerce.date(),
    paidBy: objectId,
    receiptUrl: z.string().max(500).nullable(),
    splitBetween: z.array(objectId),
    clientUpdatedAt,
  })
  .partial();

function memberIds(trip: TripDoc) {
  return trip.members.map((m) => m.user.toString());
}

function assertParticipants(trip: TripDoc, ids: string[]) {
  const members = new Set(memberIds(trip));
  const outsider = ids.find((id) => !members.has(id));
  if (outsider) throw ApiError.badRequest('Payer and split participants must be members of the trip');
}

async function convertOrFail(amount: number, currency: string, base: string) {
  try {
    return await convert(amount, currency, base);
  } catch {
    throw ApiError.badRequest(`Unsupported currency ${currency}`, [{ path: 'currency', message: 'Unsupported currency' }]);
  }
}

router.get('/trips/:tripId/expenses', async (req, res) => {
  const trip = await loadTripForMember(req);
  const q = query(
    req,
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      sort: z.string().optional(),
      category: z.enum(EXPENSE_CATEGORIES).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  );
  const filter: Record<string, unknown> = { trip: trip._id };
  if (q.category) filter.category = q.category;
  if (q.from || q.to) filter.date = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  const [items, total] = await Promise.all([
    ExpenseModel.find(filter)
      .sort(toSort(q.sort, ['date', 'amountInBase', 'createdAt'], { date: -1 }))
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('paidBy', 'name'),
    ExpenseModel.countDocuments(filter),
  ]);
  send(res, paginated(items.map((e) => e.toJSON()), q.page, q.limit, total));
});

router.post('/trips/:tripId/expenses', async (req, res) => {
  const trip = await loadTripForMember(req);
  const input = body(req, createSchema);
  if (input._id) {
    const existing = await ExpenseModel.findById(input._id);
    if (existing) {
      if (existing.trip.toString() !== trip._id.toString()) throw ApiError.conflict('Id already in use');
      return send(res, existing.toJSON(), 'Expense already exists');
    }
  }
  const paidBy = input.paidBy ?? currentUser(req).id;
  const splitBetween = input.splitBetween?.length ? input.splitBetween : memberIds(trip);
  assertParticipants(trip, [paidBy, ...splitBetween]);
  const conversion = await convertOrFail(input.amount, input.currency, trip.baseCurrency);
  const expense = await ExpenseModel.create({ ...input, ...conversion, paidBy, splitBetween, trip: trip._id });
  await expense.populate('paidBy', 'name');
  created(res, expense.toJSON(), 'Expense added');
});

/** Budget dashboard: totals, by category, by day, alert at 80 %, and who owes whom. */
router.get('/trips/:tripId/expenses/summary', async (req, res) => {
  const trip = await loadTripForMember(req);
  await trip.populate({ path: 'members.user', select: 'name' });
  const expenses = await ExpenseModel.find({ trip: trip._id }).lean();

  const spent = expenses.reduce((sum, e) => sum + e.amountInBase, 0);
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  const balances = new Map<string, number>();
  for (const m of trip.members) {
    const u = m.user as unknown as { _id: { toString(): string } };
    balances.set(u._id.toString(), 0);
  }

  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountInBase);
    const day = e.date.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + e.amountInBase);
    const split = e.splitBetween.length ? e.splitBetween.map(String) : [...balances.keys()];
    const share = e.amountInBase / split.length;
    balances.set(String(e.paidBy), (balances.get(String(e.paidBy)) ?? 0) + e.amountInBase);
    for (const id of split) balances.set(id, (balances.get(id) ?? 0) - share);
  }

  const names = new Map(
    trip.members.map((m) => {
      const u = m.user as unknown as { _id: { toString(): string }; name: string };
      return [u._id.toString(), u.name];
    }),
  );

  // greedy settlement: biggest debtor pays biggest creditor
  const debtors = [...balances].filter(([, b]) => b < -0.01).map(([id, b]) => ({ id, amount: -b })).sort((a, b) => b.amount - a.amount);
  const creditors = [...balances].filter(([, b]) => b > 0.01).map(([id, b]) => ({ id, amount: b })).sort((a, b) => b.amount - a.amount);
  const settlements: { from: string; fromName: string; to: string; toName: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i]!.amount, creditors[j]!.amount);
    settlements.push({
      from: debtors[i]!.id,
      fromName: names.get(debtors[i]!.id) ?? 'Former participant',
      to: creditors[j]!.id,
      toName: names.get(creditors[j]!.id) ?? 'Former participant',
      amount: Math.round(pay * 100) / 100,
    });
    debtors[i]!.amount -= pay;
    creditors[j]!.amount -= pay;
    if (debtors[i]!.amount < 0.01) i++;
    if (creditors[j]!.amount < 0.01) j++;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const percentUsed = trip.budget > 0 ? round((spent / trip.budget) * 100) : 0;
  send(res, {
    baseCurrency: trip.baseCurrency,
    budget: trip.budget,
    spent: round(spent),
    remaining: round(trip.budget - spent),
    percentUsed,
    alert: trip.budget > 0 && percentUsed >= 80,
    count: expenses.length,
    byCategory: [...byCategory].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total),
    byDay: [...byDay].map(([date, total]) => ({ date, total: round(total) })).sort((a, b) => a.date.localeCompare(b.date)),
    balances: [...balances].map(([user, balance]) => ({ user, name: names.get(user) ?? 'Former participant', balance: round(balance) })),
    settlements,
  });
});

router.get('/trips/:tripId/expenses/:expenseId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const expense = await ExpenseModel.findOne({ _id: assertObjectId(req.params.expenseId as string, 'expense'), trip: trip._id }).populate('paidBy', 'name');
  if (!expense) throw ApiError.notFound('Expense not found');
  send(res, expense.toJSON());
});

router.patch('/trips/:tripId/expenses/:expenseId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const expense = await ExpenseModel.findOne({ _id: assertObjectId(req.params.expenseId as string, 'expense'), trip: trip._id });
  if (!expense) throw ApiError.notFound('Expense not found');
  const { clientUpdatedAt: at, ...input } = body(req, updateSchema);
  assertNotStale(expense, at);
  assertParticipants(trip, [input.paidBy ?? String(expense.paidBy), ...(input.splitBetween ?? [])]);
  expense.set(input);
  if (input.amount !== undefined || input.currency !== undefined) {
    Object.assign(expense, await convertOrFail(expense.amount, expense.currency, trip.baseCurrency));
  }
  await expense.save();
  await expense.populate('paidBy', 'name');
  send(res, expense.toJSON(), 'Expense updated');
});

router.delete('/trips/:tripId/expenses/:expenseId', async (req, res) => {
  const trip = await loadTripForMember(req);
  const id = assertObjectId(req.params.expenseId as string, 'expense');
  await ExpenseModel.deleteOne({ _id: id, trip: trip._id });
  send(res, { _id: id }, 'Expense deleted');
});

export default router;
