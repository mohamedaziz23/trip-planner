import { api } from './api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * Asks for notification permission (only ever called from a user action, never
 * on page load) and registers this device's push subscription with the API.
 */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported' | 'unavailable'> {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unavailable';
  const { publicKey } = await api<{ publicKey: string | null }>('/push/public-key', { auth: false });
  if (!publicKey) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await api('/users/me/push-subscription', { method: 'POST', body: { subscription: subscription.toJSON() } });
  return 'enabled';
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api('/users/me/push-subscription', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}
