/**
 * Seeds the checklist rule templates and an administrator account.
 *   npm run seed        -> templates + admin
 *   npm run seed:demo   -> also a demo member, a demo trip and forum posts
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { UserModel } from '../modules/users/user.model';
import { ChecklistTemplateModel } from '../modules/checklist/checklist.model';
import { TripModel } from '../modules/trips/trip.model';
import { PlaceModel } from '../modules/places/place.model';
import { ExpenseModel } from '../modules/expenses/expense.model';
import { JournalEntryModel } from '../modules/journal/journal.model';
import { ForumPostModel, ForumReplyModel } from '../modules/forum/forum.model';
import { syncChecklist } from '../modules/checklist/generator';
import { BCRYPT_COST } from '../modules/users/auth.routes';
import { CHECKLIST_TEMPLATES } from './templates';

const DEMO_EMAIL = 'demo@tripplanner.local';
const DEMO_PASSWORD = 'Demo12345!';
const TEST_EMAIL = 'test@tripplanner.local';
const TEST_PASSWORD = 'Test12345!';

async function seedTemplates() {
  await ChecklistTemplateModel.deleteMany({ key: { $nin: CHECKLIST_TEMPLATES.map((t) => t.key) } });
  for (const t of CHECKLIST_TEMPLATES) {
    await ChecklistTemplateModel.updateOne({ key: t.key }, { $set: t }, { upsert: true });
  }
  console.log(`[seed] ${CHECKLIST_TEMPLATES.length} checklist templates`);
}

async function upsertUser(email: string, password: string, data: Record<string, unknown>) {
  const existing = await UserModel.findOne({ email });
  if (existing) return existing;
  return UserModel.create({ email, passwordHash: await bcrypt.hash(password, BCRYPT_COST), ...data });
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@tripplanner.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin12345!';
  const admin = await upsertUser(email, password, { name: 'Administrator', role: 'admin', homeCountry: 'TN', baseCurrency: 'EUR' });
  console.log(`[seed] admin account: ${email}`);
  return admin;
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}

type SeedUser = Awaited<ReturnType<typeof upsertUser>>;

/**
 * Adds a spread of journal entries across the trip — varied moods, three
 * authors, some with places/coordinates and photos — so the AI story, book
 * export and mood chart all have realistic data. Idempotent: skips if entries
 * already exist.
 */
async function seedJournal(trip: Awaited<ReturnType<typeof TripModel.findOne>>, users: { demo: SeedUser; admin: SeedUser; test: SeedUser }) {
  if (!trip) return;
  if ((await JournalEntryModel.countDocuments({ trip: trip._id })) >= 3) return;

  const places = await PlaceModel.find({ trip: trip._id });
  const placeId = (name: string) => places.find((p) => p.name === name)?._id ?? null;
  const { demo, admin, test } = users;
  const start = trip.startDate;

  const entries = [
    {
      author: demo._id, date: addDays(start, 0), mood: 'amazing',
      title: 'Belém and far too many pastéis',
      body: 'What an incredible first day! Belém Tower was breathtaking in the morning light and the Jerónimos Monastery left us speechless. We ate three pastéis de nata each — absolutely delicious. I am thrilled we finally made it to Lisbon.',
      place: placeId('Belém Tower'), lat: 38.6916, lng: -9.216,
      photos: ['https://picsum.photos/seed/lisbon-belem/900/600', 'https://picsum.photos/seed/lisbon-nata/900/600'],
    },
    {
      author: admin._id, date: addDays(start, 0), mood: 'tired',
      title: 'Jet-lagged but smiling',
      body: 'A long day of travelling and my feet are aching after all that walking. Exhausted and ready for a nap, but still a lovely evening wandering along the river.',
      place: null, lat: null, lng: null, photos: [] as string[],
    },
    {
      author: test._id, date: addDays(start, 1), mood: 'happy',
      title: 'Castle views over Alfama',
      body: 'Really enjoyed the climb up to São Jorge Castle — the views over Alfama are beautiful and the weather was sunny. A pleasant, relaxing morning.',
      place: placeId('São Jorge Castle'), lat: 38.7139, lng: -9.1335,
      photos: ['https://picsum.photos/seed/lisbon-alfama/900/600'],
    },
    {
      author: demo._id, date: addDays(start, 1), mood: 'neutral',
      title: 'Lunch at the market',
      body: 'Grabbed lunch at the Time Out Market. It was fine — a bit crowded and pricey, nothing special, but it did the job.',
      place: placeId('Time Out Market'), lat: null, lng: null, photos: [] as string[],
    },
    {
      author: admin._id, date: addDays(start, 2), mood: 'happy',
      title: 'Night out in Bairro Alto',
      body: 'So much fun tonight! Bairro Alto was buzzing, great music, and we met some cheerful locals. A proper Lisbon night out.',
      place: placeId('Bairro Alto'), lat: 38.7134, lng: -9.1458, photos: [] as string[],
    },
    {
      author: test._id, date: addDays(start, 2), mood: 'amazing',
      title: 'Fairytale Sintra',
      body: 'Sintra was magical — the palaces felt straight out of a fairytale. Honestly one of the most unforgettable day trips I have ever done.',
      place: placeId('Sintra day trip'), lat: 38.7976, lng: -9.3906,
      photos: ['https://picsum.photos/seed/sintra/900/600'],
    },
    {
      author: demo._id, date: addDays(start, 3), mood: 'sad',
      title: 'Leaving already',
      body: 'Last morning and I am sad to be going home. I will miss the trams, the light and the pastries. Feeling a little homesick for a city that was not even home.',
      place: null, lat: null, lng: null, photos: [] as string[],
    },
  ];

  await JournalEntryModel.insertMany(entries.map((e) => ({ ...e, trip: trip._id })));
  console.log(`[seed] ${entries.length} journal entries (moods: amazing, happy, neutral, tired, sad)`);
}

async function seedDemo(admin: Awaited<ReturnType<typeof seedAdmin>>) {
  const demo = await upsertUser(DEMO_EMAIL, DEMO_PASSWORD, { name: 'Demo Traveller', homeCountry: 'TN', baseCurrency: 'EUR' });
  console.log(`[seed] demo account: ${DEMO_EMAIL}`);
  const test = await upsertUser(TEST_EMAIL, TEST_PASSWORD, { name: 'Test User', homeCountry: 'TN', baseCurrency: 'EUR' });
  console.log(`[seed] test account: ${TEST_EMAIL}`);

  let trip = await TripModel.findOne({ owner: demo._id, title: 'Long weekend in Lisbon' });
  if (!trip) {
    const start = addDays(new Date(new Date().toISOString().slice(0, 10)), 30);
    trip = await TripModel.create({
      title: 'Long weekend in Lisbon',
      destination: 'Lisbon',
      country: 'PT',
      startDate: start,
      endDate: addDays(start, 3),
      budget: 1200,
      baseCurrency: 'EUR',
      owner: demo._id,
      members: [
        { user: demo._id, role: 'owner' },
        { user: admin._id, role: 'editor' },
        { user: test._id, role: 'editor' },
      ],
      preferences: {
        tripType: 'city break',
        activities: ['photography', 'museums', 'nightlife'],
        accommodation: 'apartment',
        transport: 'plane',
        travellers: { adults: 2, children: 0, infants: 0 },
        specialNeeds: [],
      },
    });
    const places = [
      { name: 'Belém Tower', lat: 38.6916, lng: -9.216, category: 'sight', day: 1, startTime: '10:00', durationMin: 90, estimatedCost: 8 },
      { name: 'Jerónimos Monastery', lat: 38.6979, lng: -9.2068, category: 'museum', day: 1, startTime: '12:00', durationMin: 120, estimatedCost: 12 },
      { name: 'Pastéis de Belém', lat: 38.6975, lng: -9.2032, category: 'cafe', day: 1, startTime: '14:30', durationMin: 45, estimatedCost: 6 },
      { name: 'São Jorge Castle', lat: 38.7139, lng: -9.1335, category: 'sight', day: 2, startTime: '09:30', durationMin: 120, estimatedCost: 15 },
      { name: 'Alfama viewpoint (Miradouro de Santa Luzia)', lat: 38.7118, lng: -9.1302, category: 'sight', day: 2, startTime: '12:00', durationMin: 30, estimatedCost: 0 },
      { name: 'Time Out Market', lat: 38.7069, lng: -9.1459, category: 'restaurant', day: 2, startTime: '13:30', durationMin: 75, estimatedCost: 25 },
      { name: 'LX Factory', lat: 38.7036, lng: -9.1789, category: 'shopping', day: 3, startTime: '11:00', durationMin: 120, estimatedCost: 20 },
      { name: 'Bairro Alto', lat: 38.7134, lng: -9.1458, category: 'nightlife', day: 3, startTime: '21:00', durationMin: 180, estimatedCost: 40 },
      { name: 'Sintra day trip', lat: 38.7976, lng: -9.3906, category: 'nature', day: null, durationMin: 480, estimatedCost: 30 },
    ];
    const order: Record<string, number> = {};
    const tripId = trip._id;
    await PlaceModel.insertMany(
      places.map((p) => {
        const k = String(p.day);
        order[k] = (order[k] ?? -1) + 1;
        return { ...p, trip: tripId, order: order[k], address: 'Lisbon, Portugal', createdBy: demo._id };
      }),
    );
    await ExpenseModel.insertMany([
      { trip: trip._id, label: 'Flights TUN-LIS', amount: 420, currency: 'EUR', amountInBase: 420, rateUsed: 1, category: 'transport', date: start, paidBy: demo._id, splitBetween: [demo._id, admin._id] },
      { trip: trip._id, label: 'Apartment (3 nights)', amount: 360, currency: 'EUR', amountInBase: 360, rateUsed: 1, category: 'accommodation', date: start, paidBy: admin._id, splitBetween: [demo._id, admin._id] },
      { trip: trip._id, label: 'Dinner in Alfama', amount: 58, currency: 'EUR', amountInBase: 58, rateUsed: 1, category: 'food', date: addDays(start, 1), paidBy: demo._id, splitBetween: [demo._id, admin._id] },
      { trip: trip._id, label: 'Souvenirs', amount: 120, currency: 'TND', amountInBase: 35.6, rateUsed: 0.296736, category: 'shopping', date: addDays(start, 2), paidBy: demo._id, splitBetween: [demo._id] },
    ]);
    await syncChecklist(trip, demo.homeCountry);
    console.log('[seed] demo trip "Long weekend in Lisbon"');
  } else if (!trip.members.some((m) => m.user.toString() === test._id.toString())) {
    trip.members.push({ user: test._id, role: 'editor' });
    await trip.save();
    console.log('[seed] added test user to the demo trip');
  }

  await seedJournal(trip, { demo, admin, test });

  if ((await ForumPostModel.countDocuments()) === 0) {
    const post1 = await ForumPostModel.create({
      title: 'Is a 3-day weekend enough for Lisbon?',
      body: 'We are planning a long weekend in Lisbon next month. Is three days enough to see Belém, Alfama and do a day trip to Sintra, or should we drop something?',
      category: 'destinations',
      destinationTags: ['lisbon', 'portugal'],
      author: demo._id,
      followers: [demo._id, admin._id],
      replyCount: 1,
    });
    const reply = await ForumReplyModel.create({
      post: post1._id,
      author: admin._id,
      body: 'Three days works if you keep Sintra as a full day on its own. Go early to beat the queues at Pena Palace.',
    });
    void reply;
    await ForumPostModel.create({
      title: 'Cheapest way to get around Tunis without a car',
      body: 'Looking for tips on public transport in Tunis: metro léger, louages, taxis. Which one do you recommend for a first visit and roughly how much should we budget per day?',
      category: 'transport',
      destinationTags: ['tunis', 'tunisia'],
      author: admin._id,
      followers: [admin._id],
    });
    await ForumPostModel.create({
      title: 'Packing list for a winter hike in the Alps',
      body: 'What would you add to a winter hiking checklist beyond thermal layers, gloves and a headlamp? We will stay in mountain huts for four nights.',
      category: 'equipment',
      destinationTags: ['alps', 'switzerland'],
      author: demo._id,
      followers: [demo._id],
    });
    console.log('[seed] forum posts');
  }
}

async function main() {
  await connectDb();
  await Promise.all([UserModel, ChecklistTemplateModel, TripModel, PlaceModel, ExpenseModel, JournalEntryModel, ForumPostModel, ForumReplyModel].map((m) => m.syncIndexes()));
  await seedTemplates();
  const admin = await seedAdmin();
  if (process.argv.includes('--demo')) await seedDemo(admin);
  await mongoose.disconnect();
  console.log('[seed] done');
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
