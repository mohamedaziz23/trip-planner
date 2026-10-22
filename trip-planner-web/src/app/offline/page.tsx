import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <WifiOff className="size-10 text-muted" aria-hidden />
      <h1 className="text-xl font-bold">You are offline</h1>
      <p className="text-sm text-muted">
        This page has not been opened on this device yet, so it is not available without a connection. Trips you already opened are
        still readable.
      </p>
      <Link href="/trips" className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
        Go to my trips
      </Link>
    </div>
  );
}
