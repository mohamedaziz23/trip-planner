'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { request, errorMessage } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
      setMessage(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">We will email you a link valid for one hour.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {message && <Alert tone="success">{message}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email">
          {(id) => <Input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand-dark hover:underline">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}
