'use client';

import { useRouter } from 'next/navigation';
import { MonitorSmartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { RequireAuth } from '@/components/AppShell';
import { AvatarEditor } from '@/components/AvatarEditor';
import { useToast } from '@/components/Toaster';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COUNTRIES, CURRENCIES } from '@/lib/constants';
import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { useSyncStatus } from '@/lib/sync';
import { formatDateTime } from '@/lib/format';
import type { User } from '@/lib/types';

function ProfileForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [baseCurrency, setCurrency] = useState(user.baseCurrency);
  const [homeCountry, setCountry] = useState(user.homeCountry ?? '');
  const [language, setLanguage] = useState(user.language);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      setUser(await api<User>('/users/me', { method: 'PATCH', body: { name, baseCurrency, homeCountry: homeCountry || null, language } }));
      toast('Profile saved');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Profile</h2>
      <AvatarEditor user={user} />
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email" hint="The email cannot be changed">
          {(id, d) => <Input id={id} aria-describedby={d} value={user.email} disabled />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Home country" hint="Drives the “abroad” checklist items">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={homeCountry} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Not set</option>
                {COUNTRIES.map(([code, n]) => (
                  <option key={code} value={code}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Base currency">
            {(id) => (
              <Select id={id} value={baseCurrency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Language" hint="The interface is English only for now">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function NotificationSettings({ user }: { user: User }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && pushSupported();

  useEffect(() => {
    currentSubscription().then((s) => setDeviceOn(Boolean(s)));
  }, []);

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold">Notifications</h2>
      <p className="mb-4 text-sm text-muted">Get a push notification when someone replies to a forum thread you follow.</p>
      <label className="flex items-center justify-between gap-4 py-2">
        <span className="text-sm">Forum replies (all devices)</span>
        <input
          type="checkbox"
          role="switch"
          className="size-5 accent-brand"
          checked={user.notificationPrefs?.forumReplies ?? true}
          onChange={async (e) => {
            try {
              setUser(await api<User>('/users/me/notifications', { method: 'PATCH', body: { forumReplies: e.target.checked } }));
            } catch (err) {
              toast(errorMessage(err), 'error');
            }
          }}
        />
      </label>
      <div className="flex items-center justify-between gap-4 border-t border-line py-3">
        <span className="text-sm">
          This device{' '}
          <span className="text-muted">{!supported ? '(not supported by this browser)' : deviceOn ? '(on)' : '(off)'}</span>
        </span>
        {supported && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (deviceOn) {
                  await disablePush();
                  setDeviceOn(false);
                } else {
                  const r = await enablePush();
                  if (r === 'enabled') {
                    setDeviceOn(true);
                    setUser({ ...user, pushEnabled: true });
                  } else toast(r === 'denied' ? 'Notifications are blocked in the browser settings' : 'Notifications are not available here', 'error');
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            {deviceOn ? 'Turn off' : 'Turn on'}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">You can also mute a single thread with its “Unfollow” button.</p>
    </Card>
  );
}

/** Last connections of the account (IP address, device, date), recorded by the API at each login. */
function RecentConnections({ user }: { user: User }) {
  const { setUser } = useAuth();
  const history = user.loginHistory ?? [];

  // refresh from the API so the list includes connections made on other devices
  useEffect(() => {
    api<User>('/users/me').then(setUser).catch(() => undefined);
  }, [setUser]);

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold">Recent connections</h2>
      <p className="mb-4 text-sm text-muted">
        IP address and device of your last {history.length || 10} logins. If you do not recognise one, change your password.
      </p>
      {history.length === 0 ? (
        <p className="text-sm text-muted">No connection recorded yet — it appears after your next login.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">IP address</th>
                <th className="py-2 pr-4">Device</th>
                <th className="py-2">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((h, i) => (
                <tr key={h.at + i}>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {formatDateTime(h.at)} {i === 0 && <Badge tone="brand">Latest</Badge>}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{h.ip}</td>
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-1.5">
                      <MonitorSmartphone className="size-4 text-muted" aria-hidden /> {h.device || 'Unknown'}
                    </span>
                  </td>
                  <td className="py-2">{h.method === 'register' ? 'Sign-up' : 'Login'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Password</h2>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (newPassword.length < 8) return setError('The new password must be at least 8 characters');
          setSaving(true);
          setError(null);
          try {
            await api('/users/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
            setCurrent('');
            setNext('');
            toast('Password changed');
          } catch (err) {
            setError(err instanceof ApiError ? err.fieldError('currentPassword') ?? err.message : errorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />}</Field>
          <Field label="New password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNext(e.target.value)} />}</Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!currentPassword || !newPassword}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DeleteAccount() {
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-red-200 p-6">
      <h2 className="mb-1 text-lg font-semibold text-red-800">Delete account</h2>
      <p className="mb-3 text-sm text-muted">Your trips are deleted, you leave shared trips, and your forum posts are kept but anonymised.</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/users/me', { method: 'DELETE', body: { password } });
              await logout(); // clears the session, local data and cached API responses
              router.push('/');
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          <p className="text-sm">This cannot be undone. Enter your password to confirm.</p>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!password}>
              Delete forever
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function Profile() {
  const { user } = useAuth();
  const { online } = useSyncStatus();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile & settings" />
      {!online && <Alert tone="warn">Offline — profile changes need a connection.</Alert>}
      <ProfileForm user={user} />
      <NotificationSettings user={user} />
      <RecentConnections user={user} />
      <PasswordForm />
      <DeleteAccount />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}
