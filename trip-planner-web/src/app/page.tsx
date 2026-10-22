import { LandingActions } from '@/components/LandingActions';
import { CloudOff, ListChecks, Map, MessagesSquare, NotebookPen, Wallet } from 'lucide-react';

const features = [
  { icon: Map, title: 'Itinerary on a map', text: 'Add places, drag them into days, and see each day’s route with travel times.' },
  { icon: Wallet, title: 'Shared budget', text: 'Log expenses in any currency, converted automatically, with alerts at 80% of the budget.' },
  { icon: ListChecks, title: 'Smart packing list', text: 'A checklist generated from your trip type, activities, season and travellers.' },
  { icon: NotebookPen, title: 'Travel journal', text: 'Write dated entries with photos and moods, even with no connection.' },
  { icon: CloudOff, title: 'Works offline', text: 'Every trip you opened stays readable; changes sync when you reconnect.' },
  { icon: MessagesSquare, title: 'Community forum', text: 'Ask other travellers and get a notification when someone answers.' },
];

export default function LandingPage() {
  return (
    <div className="space-y-12">
      <section className="rounded-3xl bg-gradient-to-br from-brand to-brand-dark px-6 py-14 text-white sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">Trip Planner</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">Plan the whole trip together, in one app that works offline.</h1>
        <p className="mt-4 max-w-xl text-base text-teal-50 sm:text-lg">
          Itinerary, budget, packing list and memories for your group — installable on your phone and available even when roaming is not.
        </p>
        <LandingActions />
      </section>

      <section aria-labelledby="features">
        <h2 id="features" className="mb-6 text-xl font-bold">
          Everything for one trip, in one place
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-xl border border-line bg-white p-5">
              <Icon className="size-6 text-brand" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
