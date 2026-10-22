import { env } from '../../config/env';

export interface Stop {
  _id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Leg {
  from: string;
  to: string;
  distanceKm: number;
  driveMin: number;
  walkMin: number;
}

export interface DayRoute {
  source: 'osrm' | 'estimate';
  legs: Leg[];
  /** [lat, lng] pairs ready for a Leaflet polyline */
  geometry: [number, number][];
  totalKm: number;
  totalDriveMin: number;
}

const cache = new Map<string, { at: number; route: DayRoute }>();
const CACHE_MS = 6 * 3600 * 1000;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
// walking: 4.5 km/h on a path ~25% longer than the straight line
const walkMinutes = (km: number) => Math.round(((km * 1.25) / 4.5) * 60);

function estimate(stops: Stop[]): DayRoute {
  const legs: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const km = haversineKm(stops[i - 1]!, stops[i]!);
    // driving: ~40 km/h average in mixed traffic on a path ~30% longer
    legs.push({
      from: stops[i - 1]!._id,
      to: stops[i]!._id,
      distanceKm: round(km * 1.3),
      driveMin: Math.round(((km * 1.3) / 40) * 60),
      walkMin: walkMinutes(km),
    });
  }
  return {
    source: 'estimate',
    legs,
    geometry: stops.map((s) => [s.lat, s.lng]),
    totalKm: round(legs.reduce((a, l) => a + l.distanceKm, 0)),
    totalDriveMin: legs.reduce((a, l) => a + l.driveMin, 0),
  };
}

/** Route through the stops in order, using OSRM when reachable, otherwise a straight-line estimate. */
export async function routeFor(stops: Stop[]): Promise<DayRoute> {
  if (stops.length < 2) return { source: 'estimate', legs: [], geometry: stops.map((s) => [s.lat, s.lng]), totalKm: 0, totalDriveMin: 0 };
  const coords = stops.map((s) => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`).join(';');
  const hit = cache.get(coords);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.route;

  try {
    const url = `${env.osrmUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'TripPlannerPWA/1.0' } });
    if (!response.ok) throw new Error(`OSRM ${response.status}`);
    const json = (await response.json()) as {
      code: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { distance: number; duration: number }[] }[];
    };
    const best = json.routes?.[0];
    if (json.code !== 'Ok' || !best) throw new Error(`OSRM ${json.code}`);
    const route: DayRoute = {
      source: 'osrm',
      legs: best.legs.map((leg, i) => ({
        from: stops[i]!._id,
        to: stops[i + 1]!._id,
        distanceKm: round(leg.distance / 1000),
        driveMin: Math.round(leg.duration / 60),
        walkMin: walkMinutes(haversineKm(stops[i]!, stops[i + 1]!)),
      })),
      geometry: best.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      totalKm: round(best.distance / 1000),
      totalDriveMin: Math.round(best.duration / 60),
    };
    cache.set(coords, { at: Date.now(), route });
    return route;
  } catch (err) {
    console.warn('[route] OSRM unavailable, using estimate:', (err as Error).message);
    return estimate(stops);
  }
}
