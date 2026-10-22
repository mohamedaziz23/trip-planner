/**
 * Countries whose territory (or main population) lies in the southern hemisphere.
 * Used to derive the season from the start date: seasons are inverted there.
 */
const SOUTHERN = new Set([
  'AR', 'AU', 'BO', 'BR', 'BW', 'CL', 'FJ', 'ID', 'LS', 'MG', 'MU', 'MW', 'MZ', 'NA', 'NZ', 'PE', 'PG', 'PY',
  'SZ', 'TO', 'UY', 'WS', 'ZA', 'ZM', 'ZW', 'AO', 'TZ', 'RE', 'NC', 'PF', 'VU', 'SB',
]);

export function hemisphereOf(countryCode: string): 'north' | 'south' {
  return SOUTHERN.has(countryCode.toUpperCase()) ? 'south' : 'north';
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export function seasonOf(date: Date, countryCode: string): Season {
  const month = date.getUTCMonth(); // 0 = January
  const north: Season[] = [
    'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
    'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
  ];
  const season = north[month]!;
  if (hemisphereOf(countryCode) === 'north') return season;
  const flip: Record<Season, Season> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
  return flip[season];
}

/** Number of calendar days covered by the trip, inclusive. */
export function durationInDays(start: Date, end: Date): number {
  const day = 24 * 3600 * 1000;
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.round((b - a) / day) + 1);
}
