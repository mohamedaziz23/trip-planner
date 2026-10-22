import Link from 'next/link';
import { ArrowBigUp, Lock, MessageSquare } from 'lucide-react';
import type { ForumPost } from '@/lib/types';
import { capitalize, relativeTime } from '@/lib/format';
import { Badge } from '@/components/ui';

export function PostCard({ post }: { post: ForumPost }) {
  return (
    <article className="flex gap-4 rounded-xl border border-line bg-white p-4 hover:border-brand">
      <div className="flex w-10 shrink-0 flex-col items-center text-muted" aria-label={`${post.upvotes} upvotes`}>
        <ArrowBigUp className={post.hasVoted ? 'size-6 fill-brand text-brand' : 'size-6'} aria-hidden />
        <span className="text-sm font-semibold text-ink">{post.upvotes}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">
          <Link href={`/forum/${post._id}`} className="hover:text-brand-dark hover:underline">
            {post.title}
          </Link>
          {post.isLocked && <Lock className="ml-1.5 inline size-4 text-muted" aria-label="Locked" />}
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{post.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="brand">{capitalize(post.category)}</Badge>
          {post.destinationTags.map((t) => (
            <Link key={t} href={`/forum?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface px-2 py-0.5 hover:bg-line">
              #{t}
            </Link>
          ))}
          <span>
            by {post.author.name} · {relativeTime(post.createdAt)}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden /> {post.replyCount}
          </span>
        </div>
      </div>
    </article>
  );
}
