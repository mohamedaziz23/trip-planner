'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Map, MessagesSquare, Shield, User as UserIcon, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useSyncStatus } from '@/lib/sync';
import { Avatar } from './ui';
import { InstallPrompt } from './InstallPrompt';
import { SyncIndicator } from './SyncIndicator';

function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium sm:flex-row sm:gap-2 sm:text-sm',
        active ? 'bg-brand-light text-brand-dark' : 'text-muted hover:bg-surface hover:text-ink',
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full p-0.5 hover:bg-surface"
        aria-label="Account menu"
      >
        <Avatar name={user.name} url={user.avatarUrl} size={32} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-white py-1 shadow-lg">
          <div className="border-b border-line px-4 py-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface">
            <UserIcon className="size-4" aria-hidden /> Profile & settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              router.push('/');
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-surface"
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, status, offlineSession } = useAuth();
  const sync = useSyncStatus();
  const pathname = usePathname();
  const bare = pathname.startsWith('/share/');

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href={user ? '/trips' : '/'} className="flex items-center gap-2 font-bold text-brand-dark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
            <span>Trip Planner</span>
          </Link>
          {!bare && (
            <nav aria-label="Main" className="ml-4 hidden items-center gap-1 sm:flex">
              {user && <NavLink href="/trips" icon={<Map className="size-4" aria-hidden />}>Trips</NavLink>}
              <NavLink href="/forum" icon={<MessagesSquare className="size-4" aria-hidden />}>Forum</NavLink>
              {user?.role === 'admin' && <NavLink href="/admin" icon={<Shield className="size-4" aria-hidden />}>Admin</NavLink>}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!bare && <InstallPrompt />}
            {user && <SyncIndicator />}
            {status === 'anonymous' && !bare && (
              <>
                <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface">
                  Log in
                </Link>
                <Link href="/register" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
                  Sign up
                </Link>
              </>
            )}
            <UserMenu />
          </div>
        </div>
        {(!sync.online || offlineSession) && (
          <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900">
            <WifiOff className="size-4" aria-hidden />
            You are offline. Trips you opened stay available; your changes will sync when you reconnect.
          </div>
        )}
      </header>

      <main id="main" className={clsx('mx-auto w-full max-w-6xl flex-1 px-4 py-6', user && !bare && 'pb-24 sm:pb-6')}>
        {children}
      </main>

      {user && !bare && (
        <nav aria-label="Main mobile" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-white py-1.5 sm:hidden">
          <NavLink href="/trips" icon={<Map className="size-5" aria-hidden />}>Trips</NavLink>
          <NavLink href="/forum" icon={<MessagesSquare className="size-5" aria-hidden />}>Forum</NavLink>
          {user.role === 'admin' && <NavLink href="/admin" icon={<Shield className="size-5" aria-hidden />}>Admin</NavLink>}
          <NavLink href="/profile" icon={<UserIcon className="size-5" aria-hidden />}>Profile</NavLink>
        </nav>
      )}

      {!user && !bare && (
        <footer className="border-t border-line bg-white py-6 text-center text-xs text-muted">
          Trip Planner PWA · works offline · installable
        </footer>
      )}
    </>
  );
}

/** Renders children only for logged-in users; redirects visitors to the login page. */
export function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex justify-center py-16 text-muted" role="status">
        Loading…
      </div>
    );
  }
  if (admin && user.role !== 'admin') {
    return <p className="py-16 text-center text-muted">This page is reserved for administrators.</p>;
  }
  return <>{children}</>;
}
