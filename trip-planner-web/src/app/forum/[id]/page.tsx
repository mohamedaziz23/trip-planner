'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowBigUp, ArrowLeft, Bell, BellOff, Flag, Lock, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { PostEditor } from '@/components/forum/PostEditor';
import { PushOptIn } from '@/components/forum/PushOptIn';
import { useToast } from '@/components/Toaster';
import { Alert, Avatar, Badge, Button, EmptyState, Field, Input, LoadingBlock, Modal, Textarea } from '@/components/ui';
import { ApiError, api, errorMessage, request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { capitalize, formatDateTime, relativeTime } from '@/lib/format';
import { useSyncStatus } from '@/lib/sync';
import type { ForumPost, ForumReply } from '@/lib/types';

interface Thread {
  post: ForumPost;
  replies: ForumReply[];
}

function VoteButton({ count, active, disabled, onClick, label }: { count: number; active: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${label} (${count} upvotes)`}
      className={clsx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium', active ? 'bg-brand-light text-brand-dark' : 'text-muted hover:bg-surface', disabled && 'cursor-not-allowed opacity-60')}
    >
      <ArrowBigUp className={clsx('size-5', active && 'fill-brand text-brand')} aria-hidden /> {count}
    </button>
  );
}

function Edited({ at }: { at: string | null }) {
  return at ? <span className="italic" title={formatDateTime(at)}>· edited</span> : null;
}

function ReportDialog({ target, onClose }: { target: { kind: 'post' | 'reply'; id: string } | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={target !== null} onClose={onClose} title="Report content">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!target || reason.trim().length < 3) return;
          setBusy(true);
          try {
            const res = await request(`/forum/${target.kind === 'post' ? 'posts' : 'replies'}/${target.id}/report`, { method: 'POST', body: { reason: reason.trim() } });
            toast(res.message);
            setReason('');
            onClose();
          } catch (err) {
            toast(errorMessage(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-muted">Moderators will review it. Tell them what is wrong (spam, abuse, unsafe advice…).</p>
        <Field label="Reason">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={reason.trim().length < 3}>
            Send report
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReplyForm({ onSubmit, placeholder, max, compact }: { onSubmit: (body: string) => Promise<void>; placeholder: string; max: number; compact?: boolean }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body.trim());
      setBody('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <Textarea aria-label={placeholder} placeholder={placeholder} rows={compact ? 2 : 4} maxLength={max} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {body.length}/{max}
        </span>
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
          {compact ? 'Comment' : 'Post reply'}
        </Button>
      </div>
    </form>
  );
}

function ThreadView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const { online } = useSyncStatus();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState(false);
  const [editingReply, setEditingReply] = useState<ForumReply | null>(null);
  const [commentingOn, setCommentingOn] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ kind: 'post' | 'reply'; id: string } | null>(null);
  const [engaged, setEngaged] = useState(search.get('new') === '1');

  const fetchThread = useCallback(() => api<Thread>(`/forum/posts/${id}`, { auth: 'optional' }), [id]);

  /** Reload after an action (reply, edit, delete). */
  const load = useCallback(async () => {
    try {
      setThread(await fetchThread());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [fetchThread]);

  useEffect(() => {
    let cancelled = false;
    fetchThread()
      .then((t) => {
        if (cancelled) return;
        setThread(t);
        setError(null);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [fetchThread, user?._id]);

  if (error && !thread) {
    return (
      <EmptyState title={error === 'You appear to be offline' ? 'This post is not available offline' : 'Post not found'} action={<Link href="/forum" className="text-sm font-medium text-brand-dark hover:underline">Back to the forum</Link>}>
        {error === 'You appear to be offline' ? 'Only the last 50 posts you opened are kept for offline reading.' : error}
      </EmptyState>
    );
  }
  if (!thread) return <LoadingBlock />;

  const { post, replies } = thread;
  const isAuthor = user && post.author._id === user._id;
  const isAdmin = user?.role === 'admin';
  const canWrite = Boolean(user) && online && !post.isLocked && post.status === 'published';
  const requireLogin = () => router.push(`/login?next=/forum/${id}`);

  async function votePost() {
    if (!user) return requireLogin();
    const r = await api<{ upvotes: number; hasVoted: boolean }>(`/forum/posts/${id}/vote`, { method: 'POST' }).catch((e) => (toast(errorMessage(e), 'error'), null));
    if (r) setThread((t) => t && { ...t, post: { ...t.post, ...r } });
  }

  async function voteReply(replyId: string) {
    if (!user) return requireLogin();
    const r = await api<{ upvotes: number; hasVoted: boolean }>(`/forum/replies/${replyId}/vote`, { method: 'POST' }).catch((e) => (toast(errorMessage(e), 'error'), null));
    if (!r) return;
    const patch = (list: ForumReply[]): ForumReply[] => list.map((x) => (x._id === replyId ? { ...x, ...r } : { ...x, comments: patch(x.comments ?? []) }));
    setThread((t) => t && { ...t, replies: patch(t.replies) });
  }

  async function toggleFollow() {
    if (!user) return requireLogin();
    const following = post.isFollowing;
    try {
      const res = await request<{ isFollowing: boolean; isMuted: boolean }>(`/forum/posts/${id}/follow`, { method: following ? 'DELETE' : 'POST' });
      setThread((t) => t && { ...t, post: { ...t.post, ...res.data } });
      toast(res.message);
      if (!following) setEngaged(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function reply(body: string, parentReply: string | null = null) {
    await api(`/forum/posts/${id}/replies`, { method: 'POST', body: { body, parentReply } });
    setCommentingOn(null);
    setEngaged(true);
    await load();
  }

  async function deleteReply(r: ForumReply) {
    if (!confirm('Delete this reply?')) return;
    try {
      await api(`/forum/replies/${r._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  function renderReply(r: ForumReply, comment = false) {
    const mine = user && r.author._id === user._id;
    return (
      <div id={`reply-${r._id}`} className={clsx('flex gap-3', comment && 'mt-3')}>
        <Avatar name={r.author.name} url={r.author.avatarUrl} size={comment ? 24 : 32} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            <span className="font-medium text-ink">{r.author.name}</span> · <time dateTime={r.createdAt}>{relativeTime(r.createdAt)}</time> <Edited at={r.editedAt} />
            {r.status === 'hidden' && <Badge tone="danger" className="ml-2">hidden</Badge>}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <VoteButton count={r.upvotes} active={r.hasVoted} onClick={() => voteReply(r._id)} label="Upvote reply" disabled={!online} />
            {!comment && canWrite && (
              <Button size="sm" variant="ghost" onClick={() => setCommentingOn(commentingOn === r._id ? null : r._id)} icon={<MessageSquare className="size-4" aria-hidden />}>
                Comment
              </Button>
            )}
            {user && !mine && online && (
              <Button size="sm" variant="ghost" onClick={() => setReportTarget({ kind: 'reply', id: r._id })} icon={<Flag className="size-4" aria-hidden />}>
                Report
              </Button>
            )}
            {mine && online && (
              <Button size="sm" variant="ghost" onClick={() => setEditingReply(r)} icon={<Pencil className="size-4" aria-hidden />}>
                Edit
              </Button>
            )}
            {(mine || isAdmin) && online && (
              <Button size="sm" variant="ghost" onClick={() => deleteReply(r)} icon={<Trash2 className="size-4" aria-hidden />}>
                Delete
              </Button>
            )}
          </div>
          {!comment && (
            <div className="border-l-2 border-line pl-4">
              {r.comments?.map((c) => <div key={c._id}>{renderReply(c, true)}</div>)}
              {commentingOn === r._id && (
                <div className="mt-3">
                  <ReplyForm compact max={500} placeholder="Write a comment (500 characters max)" onSubmit={(body) => reply(body, r._id)} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/forum" className="inline-flex items-center gap-1 text-sm text-brand-dark hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Forum
      </Link>

      {engaged && user && <PushOptIn reason="Get a notification on this device when someone replies to threads you follow." />}
      {!online && <Alert tone="warn">Offline copy — voting and replying need a connection.</Alert>}

      <article className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="brand">{capitalize(post.category)}</Badge>
          {post.destinationTags.map((t) => (
            <Link key={t} href={`/forum?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface px-2 py-0.5 hover:bg-line">
              #{t}
            </Link>
          ))}
          {post.isLocked && (
            <Badge tone="warn">
              <Lock className="size-3" aria-hidden /> Locked
            </Badge>
          )}
          {post.status === 'hidden' && <Badge tone="danger">Hidden by a moderator</Badge>}
        </div>
        <h1 className="mt-3 text-2xl font-bold">{post.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <Avatar name={post.author.name} url={post.author.avatarUrl} size={20} />
          <span className="font-medium text-ink">{post.author.name}</span> · <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time> <Edited at={post.editedAt} />
        </p>
        <p className="mt-4 whitespace-pre-line leading-relaxed">{post.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line pt-3">
          <VoteButton count={post.upvotes} active={post.hasVoted} onClick={votePost} label="Upvote post" disabled={!online} />
          {user && (
            <Button size="sm" variant="ghost" disabled={!online} onClick={toggleFollow} icon={post.isFollowing ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}>
              {post.isFollowing ? 'Unfollow' : 'Follow'}
            </Button>
          )}
          {user && !isAuthor && online && (
            <Button size="sm" variant="ghost" onClick={() => setReportTarget({ kind: 'post', id: post._id })} icon={<Flag className="size-4" aria-hidden />}>
              Report
            </Button>
          )}
          {isAuthor && online && !post.isLocked && (
            <Button size="sm" variant="ghost" onClick={() => setEditingPost(true)} icon={<Pencil className="size-4" aria-hidden />}>
              Edit
            </Button>
          )}
          {(isAuthor || isAdmin) && online && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" aria-hidden />}
              onClick={async () => {
                if (!confirm('Delete this post and all its replies?')) return;
                await api(`/forum/posts/${id}`, { method: 'DELETE' }).catch((e) => toast(errorMessage(e), 'error'));
                router.push('/forum');
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </article>

      <section aria-labelledby="replies-title" className="space-y-4">
        <h2 id="replies-title" className="font-semibold">
          {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
        </h2>
        {replies.map((r) => (
          <div key={r._id} className="rounded-xl border border-line bg-white p-4">
            {renderReply(r)}
          </div>
        ))}
        {canWrite ? (
          <div className="rounded-xl border border-line bg-white p-4">
            <ReplyForm max={5000} placeholder="Write a reply" onSubmit={(body) => reply(body)} />
          </div>
        ) : !user ? (
          <p className="text-sm text-muted">
            <Link href={`/login?next=/forum/${id}`} className="font-medium text-brand-dark hover:underline">
              Log in
            </Link>{' '}
            to reply.
          </p>
        ) : post.isLocked ? (
          <p className="text-sm text-muted">This thread is locked by a moderator.</p>
        ) : null}
      </section>

      <Modal open={editingPost} onClose={() => setEditingPost(false)} title="Edit post" wide>
        {editingPost && (
          <PostEditor
            initial={post}
            submitLabel="Save"
            onCancel={() => setEditingPost(false)}
            onSubmit={async (values) => {
              const updated = await api<ForumPost>(`/forum/posts/${id}`, { method: 'PATCH', body: values });
              setThread((t) => t && { ...t, post: { ...t.post, ...updated } });
              setEditingPost(false);
            }}
          />
        )}
      </Modal>

      <Modal open={editingReply !== null} onClose={() => setEditingReply(null)} title="Edit reply">
        {editingReply && (
          <EditReply
            reply={editingReply}
            onCancel={() => setEditingReply(null)}
            onSave={async (body) => {
              await api(`/forum/replies/${editingReply._id}`, { method: 'PATCH', body: { body } });
              setEditingReply(null);
              await load();
            }}
          />
        )}
      </Modal>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}

function EditReply({ reply, onSave, onCancel }: { reply: ForumReply; onSave: (body: string) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState(reply.body);
  const max = reply.parentReply ? 500 : 5000;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (body.trim()) await onSave(body.trim());
      }}
    >
      <Textarea aria-label="Reply" rows={5} maxLength={max} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

export default function ForumThreadPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ThreadView />
    </Suspense>
  );
}
