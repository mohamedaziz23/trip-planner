'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COUNTRIES, CURRENCIES } from '@/lib/constants';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui';

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', baseCurrency: 'EUR', homeCountry: 'TN' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/trips');
  }, [status, router]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email';
    if (form.password.length < 8) local.password = 'At least 8 characters';
    setErrors(local);
    if (Object.keys(local).length) return;
    setLoading(true);
    setError(null);
    try {
      await register(form);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(Object.fromEntries(err.errors.map((x) => [x.path, x.message])));
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Plan trips with friends and family.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" error={errors.name}>
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Home country" hint="Used for the packing list">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={form.homeCountry} onChange={set('homeCountry')}>
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Currency">
            {(id) => (
              <Select id={id} value={form.baseCurrency} onChange={set('baseCurrency')}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Sign up
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-brand-dark hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
