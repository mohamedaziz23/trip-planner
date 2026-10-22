'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MessagesSquare, PenSquare, Search, X } from 'lucide-react';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { PostCard } from '@/components/forum/PostCard';
import { Alert, Button, ButtonLink, EmptyState, Input, LoadingBlock, PageHeader, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FORUM_CATEGORIES } from '@/lib/constants';
import { capitalize } from '@/lib/format';
import type { ForumPost, Paginated } from '@/lib/types';

function ForumList() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const tag = params.get('tag') ?? '';
  const sort = params.get('sort') ?? (q ? 'relevance' : 'recent');
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  // response tagged with the query it answers: a different key means "loading"
  const [result, setResult] = useState<{ key: string; data: Paginated<ForumPost> | null; error: string | null } | null>(null);

  // keep the search box in sync when the URL changes (back/forward, tag links)
  if (q !== lastQ) {
    setLastQ(q);
    setSearch(q);
  }

  const qs = new URLSearchParams({ page: String(page), limit: '15', sort });
  if (q) qs.set('q', q);
  if (category) qs.set('category', category);
  if (tag) qs.set('tag', tag);
  const key = `${qs}|${user?._id ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    api<Paginated<ForumPost>>(`/forum/posts?${key.split('|')[0]}`, { auth: 'optional' })
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((err) => !cancelled && setResult({ key, data: null, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const data = result?.key === key ? result.data : null;
  const error = result?.key === key ? result.error : null;

  useEffect(() => {
    api<{ tag: string; count: number }[]>('/forum/tags', { auth: false })
      .then(setTags)
      .catch(() => undefined);
  }, []);

  function update(next: Record<string, string>) {
    const qs = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) qs.set(k, v);
      else qs.delete(k);
    }
    if (!('page' in next)) qs.delete('page');
    router.push(`/forum?${qs}`);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: search.trim(), sort: search.trim() ? 'relevance' : '' });
  }

  return (
    <>
      <PageHeader
        title="Community forum"
        subtitle="Ask about destinations, share tips and trip reports."
        actions={user ? <ButtonLink href="/forum/new" icon={<PenSquare className="size-4" aria-hidden />}>New post</ButtonLink> : <ButtonLink href="/login?next=/forum/new" variant="secondary">Log in to post</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <form onSubmit={onSearch} role="search" className="flex gap-2">
            <Input aria-label="Search the forum" placeholder="Search titles and posts…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button type="submit" icon={<Search className="size-4" aria-hidden />}>
              Search
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Category" value={category} onChange={(e) => update({ category: e.target.value })} className="h-9 w-48">
              <option value="">All categories</option>
              {FORUM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </Select>
            <Select aria-label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value })} className="h-9 w-40">
              {q && <option value="relevance">Most relevant</option>}
              <option value="recent">Newest</option>
              <option value="active">Recently active</option>
              <option value="top">Most upvoted</option>
            </Select>
            {tag && (
              <button type="button" onClick={() => update({ tag: '' })} className="flex items-center gap-1 rounded-full bg-brand-light px-3 py-1 text-sm text-brand-dark">
                #{tag} <X className="size-3.5" aria-label="Remove tag filter" />
              </button>
            )}
            {q && (
              <button type="button" onClick={() => update({ q: '', sort: '' })} className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-sm">
                “{q}” <X className="size-3.5" aria-label="Clear search" />
              </button>
            )}
          </div>

          {error && <Alert tone="warn">{error === 'You appear to be offline' ? 'Offline — the forum list needs a connection. Posts you opened recently are still readable.' : error}</Alert>}
          {!data && !error && <LoadingBlock />}
          {data && data.items.length === 0 && (
            <EmptyState icon={<MessagesSquare className="size-8" />} title="No posts found">
              Try another search, or be the first to ask.
            </EmptyState>
          )}
          {data && data.items.length > 0 && (
            <>
              <p className="text-xs text-muted" aria-live="polite">
                {data.total} post{data.total > 1 ? 's' : ''}
              </p>
              <ul className="space-y-3">
                {data.items.map((p) => (
                  <li key={p._id}>
                    <PostCard post={p} />
                  </li>
                ))}
              </ul>
              {data.pages > 1 && (
                <nav aria-label="Pagination" className="flex items-center justify-center gap-3 pt-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted">
                    Page {data.page} of {data.pages}
                  </span>
                  <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>

        <aside aria-label="Popular destinations" className="space-y-2">
          <h2 className="text-sm font-semibold">Popular destinations</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => update({ tag: t.tag })}
                aria-pressed={tag === t.tag}
                className={`rounded-full px-3 py-1 text-sm ${tag === t.tag ? 'bg-brand text-white' : 'bg-white text-ink ring-1 ring-line hover:ring-brand'}`}
              >
                #{t.tag} <span className="opacity-70">{t.count}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

export default function ForumPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ForumList />
    </Suspense>
  );
}
