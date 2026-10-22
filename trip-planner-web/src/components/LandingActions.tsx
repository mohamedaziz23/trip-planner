'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export function LandingActions() {
  const { user } = useAuth();
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link href={user ? '/trips' : '/register'} className="rounded-lg bg-white px-5 py-2.5 font-semibold text-brand-dark hover:bg-brand-light">
        {user ? 'Go to my trips' : 'Create a free account'}
      </Link>
      <Link href="/forum" className="rounded-lg border border-white/60 px-5 py-2.5 font-semibold text-white hover:bg-white/10">
        Browse the forum
      </Link>
    </div>
  );
}
