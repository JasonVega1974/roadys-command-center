// Haversine + geolocation helpers. All-offline by default; falls back to
// Nominatim for the single city a user types into the Create form.

import { GEO as GEO_SEED, ST_COORDS } from '../data/valueProps';
import { syncGeoEntry } from './valuePropsSync';

// Mutable runtime geo cache — starts from seeded GEO then picks up localStorage
// additions and Supabase geo_cache rows.
export const GEO: Record<string, [number, number]> = { ...GEO_SEED };

export function seedGeo(extra: Record<string, [number, number]> | null | undefined): void {
  if (!extra) return;
  for (const k of Object.keys(extra)) GEO[k] = extra[k];
}

export function hav(a1: number, o1: number, a2: number, o2: number): number {
  const R = 3958.8;
  const d1 = ((a2 - a1) * Math.PI) / 180;
  const d2 = ((o2 - o1) * Math.PI) / 180;
  const a =
    Math.sin(d1 / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(d2 / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function geoLookup(city: string, state: string): [number, number] | null {
  const k = (city.trim() + '|' + state.trim()).toUpperCase();
  return GEO[k] || null;
}

export async function geoWithFallback(city: string, state: string): Promise<[number, number] | null> {
  const coords = geoLookup(city, state);
  if (coords) return coords;
  try {
    const q = encodeURIComponent(city + ', ' + state + ', USA');
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + q, {
      headers: { 'User-Agent': 'RoadysVP/1.0' },
    });
    const d = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (d.length) {
      const c: [number, number] = [parseFloat(d[0].lat), parseFloat(d[0].lon)];
      const key = (city + '|' + state).toUpperCase();
      GEO[key] = c;
      syncGeoEntry(key, c[0], c[1]);
      return c;
    }
  } catch {
    /* offline — fall through to state centroid */
  }
  return ST_COORDS[state.toUpperCase()] || null;
}

export type FleetScanResult = {
  err?: string;
  center?: [number, number];
  matches: Array<{ fleet: string; city: string; state: string; gallons: number; dist: number }>;
  checked: number;
};

export async function findFleets(
  city: string,
  state: string,
  radius: number,
  opts: {
    FN: string[];
    FR: Array<[number, string, string, number]>;
    excludedFleets: Set<string>;
    formExcludedFleets: Set<string>;
  },
): Promise<FleetScanResult> {
  const ctr = await geoWithFallback(city, state);
  if (!ctr) return { err: 'Cannot locate ' + city + ', ' + state, matches: [], checked: 0 };

  const matches: FleetScanResult['matches'] = [];
  let checked = 0;
  for (const r of opts.FR) {
    const fname = opts.FN[r[0]];
    if (opts.excludedFleets.has(fname)) continue;
    if (opts.formExcludedFleets.has(fname)) continue;
    const fK = (r[1] + '|' + r[2]).toUpperCase();
    const fc = GEO[fK];
    if (!fc) continue;
    checked++;
    const d = hav(ctr[0], ctr[1], fc[0], fc[1]);
    if (d <= radius) {
      matches.push({ fleet: fname, city: r[1], state: r[2], gallons: r[3], dist: Math.round(d) });
    }
  }
  matches.sort((a, b) => b.gallons - a.gallons);
  return { center: ctr, matches, checked };
}

// Synthesize a deterministic coord for cities we haven't geocoded — used by
// the import tool so newly-imported fleet records still participate in scans.
export function synthesizeCoord(city: string, state: string): [number, number] | null {
  const base = ST_COORDS[state.toUpperCase()];
  if (!base) return null;
  const gk = (city + '|' + state).toUpperCase();
  let h = 0;
  for (let i = 0; i < gk.length; i++) h = (h << 5) - h + gk.charCodeAt(i);
  h = Math.abs(h);
  return [
    Math.round((base[0] + ((h % 200) - 100) / 100) * 10000) / 10000,
    Math.round((base[1] + (((h >> 8) % 200) - 100) / 100) * 10000) / 10000,
  ];
}
