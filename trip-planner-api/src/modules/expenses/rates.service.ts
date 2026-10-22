import { env } from '../../config/env';

export interface RateTable {
  base: string;
  /** 1 base = rates[X] units of X */
  rates: Record<string, number>;
  fetchedAt: string;
  source: 'live' | 'fallback';
}

const DAY_MS = 24 * 3600 * 1000;
const cache = new Map<string, { at: number; table: RateTable }>();

/** Approximate EUR-based rates used when the rates API is unreachable. */
const FALLBACK_EUR: Record<string, number> = {
  EUR: 1, USD: 1.08, GBP: 0.85, CHF: 0.95, JPY: 162, CNY: 7.8, CAD: 1.47, AUD: 1.64, NZD: 1.79,
  TND: 3.37, MAD: 10.8, DZD: 145, EGP: 52, TRY: 37, AED: 3.97, SAR: 4.05, QAR: 3.93, INR: 90,
  THB: 38.5, IDR: 17500, SGD: 1.45, HKD: 8.45, KRW: 1480, BRL: 5.9, MXN: 19.5, ARS: 1050,
  ZAR: 19.8, SEK: 11.4, NOK: 11.7, DKK: 7.46, PLN: 4.3, CZK: 25.2, HUF: 395, RON: 4.97,
};

function fromFallback(base: string): RateTable {
  const baseInEur = FALLBACK_EUR[base];
  if (!baseInEur) throw new Error(`Unsupported currency ${base}`);
  const rates: Record<string, number> = {};
  for (const [code, eurRate] of Object.entries(FALLBACK_EUR)) rates[code] = eurRate / baseInEur;
  return { base, rates, fetchedAt: new Date().toISOString(), source: 'fallback' };
}

/** Rates for `base`, fetched at most once a day and cached server side. */
export async function getRates(base: string): Promise<RateTable> {
  base = base.toUpperCase();
  const hit = cache.get(base);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.table;
  try {
    const response = await fetch(`${env.ratesApiUrl}/${base}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`rates ${response.status}`);
    const json = (await response.json()) as { result: string; rates?: Record<string, number>; time_last_update_unix?: number };
    if (json.result !== 'success' || !json.rates) throw new Error('rates API error');
    const table: RateTable = {
      base,
      rates: json.rates,
      fetchedAt: new Date((json.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString(),
      source: 'live',
    };
    cache.set(base, { at: Date.now(), table });
    return table;
  } catch (err) {
    console.warn(`[rates] live rates unavailable for ${base}: ${(err as Error).message} - using fallback table`);
    const table = fromFallback(base);
    // retry the live API in an hour rather than a day
    cache.set(base, { at: Date.now() - DAY_MS + 3600 * 1000, table });
    return table;
  }
}

/** Converts `amount` from `currency` into `base`. Returns the converted amount and the rate (1 currency = rate base). */
export async function convert(amount: number, currency: string, base: string) {
  currency = currency.toUpperCase();
  base = base.toUpperCase();
  if (currency === base) return { amountInBase: amount, rateUsed: 1 };
  const table = await getRates(base);
  const perBase = table.rates[currency];
  if (!perBase) throw new Error(`Unsupported currency ${currency}`);
  const rateUsed = 1 / perBase;
  return { amountInBase: Math.round(amount * rateUsed * 100) / 100, rateUsed: Math.round(rateUsed * 1e6) / 1e6 };
}
