'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/trips';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next.startsWith('/') ? next : '/trips');
  }, [status, router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Too many attempts, wait a few minutes.' : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold">Log in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back! Your trips are waiting.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email">
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password">
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-brand-dark underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-brand-dark hover:underline">
          Sign up
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
