'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RequireAuth } from '@/components/AppShell';
import { useToast } from '@/components/Toaster';
import { Alert, Avatar, Badge, Button, Card, Chip, EmptyState, Input, LoadingBlock, PageHeader } from '@/components/ui';
import { api, errorMessage, request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/constants';
import { formatDate, relativeTime } from '@/lib/format';
import type { Paginated, User } from '@/lib/types';

interface Stats {
  users: number;
  activeUsersLast7Days: number;
  newUsersLast7Days: number;
  trips: number;
  places: number;
  expenses: number;
  checklistItems: number;
  journalEntries: number;
  forumPosts: number;
  forumReplies: number;
  openReports: number;
  topDestinations: { country: string; trips: number }[];
}

interface Report {
  _id: string;
  reporter: { name: string } | null;
  reason: string;
  createdAt: string;
}

interface QueueItem {
  _id: string;
  title?: string;
  body: string;
  status: 'published' | 'hidden';
  isLocked?: boolean;
  author: { name: string } | null;
  post?: { _id: string; title: string };
  reports: Report[];
  createdAt: string;
}

function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!stats) return <LoadingBlock />;
  const tiles = [
    ['Users', stats.users, `${stats.newUsersLast7Days} new this week`],
    ['Active (7 days)', stats.activeUsersLast7Days, 'logged in recently'],
    ['Trips', stats.trips, `${stats.places} places`],
    ['Expenses', stats.expenses, 'logged'],
    ['Checklist items', stats.checklistItems, 'generated + manual'],
    ['Journal entries', stats.journalEntries, 'written'],
    ['Forum posts', stats.forumPosts, `${stats.forumReplies} replies`],
    ['Open reports', stats.openReports, 'to moderate'],
  ] as const;
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <li key={label} className="rounded-xl border border-line bg-white p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted">{sub}</p>
          </li>
        ))}
      </ul>
      <Card>
        <h3 className="mb-2 text-sm font-semibold">Top destinations</h3>
        <ul className="space-y-1 text-sm">
          {stats.topDestinations.map((d) => (
            <li key={d.country} className="flex justify-between">
              <span>{countryName(d.country)}</span>
              <span className="font-medium">{d.trips} trip{d.trips > 1 ? 's' : ''}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ModerationQueue() {
  const toast = useToast();
  const [queue, setQueue] = useState<{ posts: QueueItem[]; replies: QueueItem[] } | null>(null);
  const load = useCallback(() => api<{ posts: QueueItem[]; replies: QueueItem[] }>('/forum/moderation').then(setQueue).catch((e) => toast(errorMessage(e), 'error')), [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: 'posts' | 'replies', id: string, action: string) {
    if (action === 'delete' && !confirm('Delete this content permanently?')) return;
    try {
      const res = await request(`/forum/moderation/${kind}/${id}`, { method: 'POST', body: { action } });
      toast(res.message);
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  if (!queue) return <LoadingBlock />;
  if (!queue.posts.length && !queue.replies.length) return <EmptyState title="Nothing to moderate">No open reports. 🎉</EmptyState>;

  const item = (kind: 'posts' | 'replies', x: QueueItem) => (
    <li key={x._id} className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="danger">{x.reports.length} report{x.reports.length > 1 ? 's' : ''}</Badge>
        <Badge>{kind === 'posts' ? 'Post' : 'Reply'}</Badge>
        {x.status === 'hidden' && <Badge tone="warn">hidden</Badge>}
        {x.isLocked && <Badge tone="warn">locked</Badge>}
        <span>
          by {x.author?.name ?? 'Deleted user'} · {relativeTime(x.createdAt)}
        </span>
      </div>
      {kind === 'posts' ? (
        <Link href={`/forum/${x._id}`} className="mt-2 block font-semibold hover:underline">
          {x.title}
        </Link>
      ) : (
        x.post && (
          <Link href={`/forum/${x.post._id}#reply-${x._id}`} className="mt-2 block text-sm text-muted hover:underline">
            On “{x.post.title}”
          </Link>
        )
      )}
      <p className="mt-1 line-clamp-3 text-sm">{x.body}</p>
      <ul className="mt-3 space-y-1 rounded-lg bg-surface p-3 text-xs">
        {x.reports.map((r) => (
          <li key={r._id}>
            <span className="font-medium">{r.reporter?.name ?? 'Deleted user'}:</span> {r.reason} <span className="text-muted">({formatDate(r.createdAt)})</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {x.status === 'published' ? (
          <Button size="sm" variant="secondary" onClick={() => act(kind, x._id, 'hide')}>
            Hide
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => act(kind, x._id, 'unhide')}>
            Unhide
          </Button>
        )}
        {kind === 'posts' && (
          <Button size="sm" variant="secondary" onClick={() => act(kind, x._id, x.isLocked ? 'unlock' : 'lock')}>
            {x.isLocked ? 'Unlock thread' : 'Lock thread'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => act(kind, x._id, 'dismiss')}>
          Dismiss reports
        </Button>
        <Button size="sm" variant="danger" onClick={() => act(kind, x._id, 'delete')}>
          Delete
        </Button>
      </div>
    </li>
  );

  return (
    <ul className="space-y-3">
      {queue.posts.map((p) => item('posts', p))}
      {queue.replies.map((r) => item('replies', r))}
    </ul>
  );
}

function UsersTable() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Paginated<User> | null>(null);
  const load = useCallback(
    (search = '') => api<Paginated<User>>(`/admin/users?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}`).then(setData).catch((e) => toast(errorMessage(e), 'error')),
    [toast],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function update(u: User, body: Partial<Pick<User, 'isActive' | 'role'>>) {
    try {
      const updated = await api<User>(`/admin/users/${u._id}`, { method: 'PATCH', body });
      setData((d) => d && { ...d, items: d.items.map((x) => (x._id === u._id ? updated : x)) });
      toast('User updated');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="space-y-3">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void load(q);
        }}
      >
        <Input aria-label="Search users" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      {!data ? (
        <LoadingBlock />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Joined</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name} url={u.avatarUrl} size={28} />
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 capitalize">{u.role}</td>
                  <td className="px-4 py-2 text-muted">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2">{u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</td>
                  <td className="px-4 py-2 text-right">
                    {u._id !== me?._id && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant={u.isActive ? 'secondary' : 'primary'} onClick={() => update(u, { isActive: !u.isActive })}>
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => update(u, { role: u.role === 'admin' ? 'member' : 'admin' })}>
                          {u.role === 'admin' ? 'Make member' : 'Make admin'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState<'stats' | 'moderation' | 'users'>('stats');
  return (
    <>
      <PageHeader title="Administration" subtitle="Usage statistics, forum moderation and accounts." />
      <div className="mb-6 flex gap-2" role="tablist">
        {(['stats', 'moderation', 'users'] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>
            {t === 'stats' ? 'Statistics' : t === 'moderation' ? 'Moderation queue' : 'Users'}
          </Chip>
        ))}
      </div>
      {tab === 'stats' && <StatsPanel />}
      {tab === 'moderation' && <ModerationQueue />}
      {tab === 'users' && <UsersTable />}
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth admin>
      <AdminDashboard />
    </RequireAuth>
  );
}
