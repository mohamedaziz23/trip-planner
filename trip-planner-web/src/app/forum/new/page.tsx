'use client';

import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/AppShell';
import { PostEditor } from '@/components/forum/PostEditor';
import { useToast } from '@/components/Toaster';
import { Alert, Card, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useSyncStatus } from '@/lib/sync';
import type { ForumPost } from '@/lib/types';

export default function NewPostPage() {
  const router = useRouter();
  const toast = useToast();
  const { online } = useSyncStatus();
  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl">
        <PageHeader title="New forum post" subtitle="You will automatically follow your post and be notified of replies." />
        {!online && (
          <div className="mb-4">
            <Alert tone="warn">Posting needs a connection: moderation and notifications happen on the server.</Alert>
          </div>
        )}
        <Card className="p-6">
          <PostEditor
            submitLabel="Publish"
            onCancel={() => router.back()}
            onSubmit={async (values) => {
              const post = await api<ForumPost>('/forum/posts', { method: 'POST', body: values });
              toast('Post published');
              router.push(`/forum/${post._id}?new=1`);
            }}
          />
        </Card>
      </div>
    </RequireAuth>
  );
}
