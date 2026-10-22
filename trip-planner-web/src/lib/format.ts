export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...opts });
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatMinutes(min: number) {
  if (!min) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Number of calendar days of a trip, inclusive (same rule as the API). */
export function tripDays(start: string, end: string) {
  const a = new Date(start);
  const b = new Date(end);
  const day = 86_400_000;
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.max(1, Math.round((ub - ua) / day) + 1);
}

export function dayDate(start: string, day: number) {
  return new Date(new Date(start).getTime() + (day - 1) * 86_400_000);
}

/** yyyy-mm-dd for <input type="date"> */
export function toDateInput(value: string | Date | null | undefined) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(value);
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Responsive Cloudinary URL (WebP, automatic quality) - other URLs are returned untouched. */
export function imageUrl(url: string | null | undefined, width = 800) {
  if (!url) return '';
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/f_webp,q_auto,w_${width},c_limit/`);
  }
  return url;
}
