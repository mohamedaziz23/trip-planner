'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { request, errorMessage } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('The password must be at least 8 characters');
    if (password !== confirm) return setError('The two passwords do not match');
    setLoading(true);
    setError(null);
    try {
      const res = await request('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      setDone(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) return <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>;

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {done ? (
        <div className="mt-6 space-y-4">
          <Alert tone="success">{done}</Alert>
          <Link href="/login" className="inline-block font-medium text-brand-dark hover:underline">
            Go to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" hint="At least 8 characters">
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label="Confirm password">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            Update password
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
