// Supabase REST layer for value-props — plain fetch with AbortController 5s timeouts.
// Mirrors the legacy value-props.html sync pattern exactly (no SDK, tombstones, local-first).

import type { ValueProp } from '../types/valueProps';

const SB_URL = 'https://yyhnnalsqzyghjqtfisy.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG5uYWxzcXp5Z2hqcXRmaXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDE4NzksImV4cCI6MjA4OTQxNzg3OX0.misOc3tEQD0GBOsjNkv6Im8wUmlfXhiX97DflpgaqAc';

const HDR_READ = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Accept: 'application/json' };
const HDR_WRITE = {
  apikey: SB_KEY,
  Authorization: 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};
const HDR_DELETE = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

function withTimeout(ms = 5000): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, clear: () => clearTimeout(timer) };
}

type RawVPRow = {
  id: string; name: string; city: string; state: string; address?: string;
  assigned?: string; agg_potential?: number; fleet_potential?: number;
  total_potential?: number; winnable?: number;
  fleet_matches?: ValueProp['fleetMatches']; fleet_count?: number;
  notes?: string; radius?: number; status?: string; created_at?: string;
};

export function rowToVP(r: RawVPRow): ValueProp {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    address: r.address || '',
    assigned: r.assigned || '',
    aggPot: r.agg_potential || 0,
    fleetPot: r.fleet_potential || 0,
    totalPot: r.total_potential || 0,
    winnable: r.winnable || 0,
    fleetMatches: r.fleet_matches || [],
    fleetCount: r.fleet_count || 0,
    notes: r.notes || '',
    radius: r.radius || 50,
    status: r.status || 'active',
    created: r.created_at,
  };
}

function vpToRow(v: ValueProp) {
  return {
    id: v.id,
    name: v.name,
    city: v.city,
    state: v.state,
    address: v.address || '',
    assigned: v.assigned || '',
    agg_potential: v.aggPot || 0,
    fleet_potential: v.fleetPot || 0,
    total_potential: v.totalPot || 0,
    winnable: v.winnable || 0,
    fleet_matches: v.fleetMatches || [],
    fleet_count: v.fleetCount || 0,
    notes: v.notes || '',
    radius: v.radius || 50,
    status: v.status || 'active',
    updated_at: new Date().toISOString(),
  };
}

export async function loadValueProps(): Promise<{ ok: true; data: ValueProp[] } | { ok: false; reason: string }> {
  const { signal, clear } = withTimeout(5000);
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/value_props?select=*&order=name`, {
      signal,
      headers: HDR_READ,
    });
    clear();
    if (!resp.ok) return { ok: false, reason: 'HTTP ' + resp.status };
    const data = (await resp.json()) as RawVPRow[];
    return { ok: true, data: data.map(rowToVP) };
  } catch (e) {
    clear();
    const reason = (e as Error).name === 'AbortError' ? 'timeout' : 'offline/blocked';
    return { ok: false, reason };
  }
}

export async function saveValueProp(vp: ValueProp): Promise<boolean> {
  const { signal, clear } = withTimeout(5000);
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/value_props`, {
      method: 'POST',
      signal,
      headers: HDR_WRITE,
      body: JSON.stringify(vpToRow(vp)),
    });
    clear();
    return resp.ok;
  } catch {
    clear();
    return false;
  }
}

export async function deleteValueProp(id: string): Promise<boolean> {
  const { signal, clear } = withTimeout(5000);
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/value_props?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal,
      headers: HDR_DELETE,
    });
    clear();
    return resp.ok;
  } catch {
    clear();
    return false;
  }
}

export async function loadGeoCache(): Promise<Record<string, [number, number]> | null> {
  const { signal, clear } = withTimeout(5000);
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/geo_cache?select=*`, { signal, headers: HDR_READ });
    clear();
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<{ city_state: string; lat: number; lng: number }>;
    const out: Record<string, [number, number]> = {};
    for (const r of rows) out[r.city_state] = [r.lat, r.lng];
    return out;
  } catch {
    clear();
    return null;
  }
}

export async function syncGeoEntry(key: string, lat: number, lng: number): Promise<void> {
  const { signal, clear } = withTimeout(5000);
  try {
    await fetch(`${SB_URL}/rest/v1/geo_cache`, {
      method: 'POST',
      signal,
      headers: HDR_WRITE,
      body: JSON.stringify({ city_state: key, lat, lng }),
    });
    clear();
  } catch {
    clear();
  }
}

// Fleet active/inactive status (optional cloud sync; table may not exist).
export async function loadFleetStatus(): Promise<Set<string> | null> {
  const { signal, clear } = withTimeout(5000);
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/fleet_status?select=fleet_name,status`, {
      signal,
      headers: HDR_READ,
    });
    clear();
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<{ fleet_name: string; status: string }>;
    return new Set(rows.filter((r) => r.status === 'inactive').map((r) => r.fleet_name));
  } catch {
    clear();
    return null;
  }
}

export async function saveFleetStatus(fleetName: string, status: 'active' | 'inactive'): Promise<void> {
  const { signal, clear } = withTimeout(5000);
  try {
    await fetch(`${SB_URL}/rest/v1/fleet_status`, {
      method: 'POST',
      signal,
      headers: HDR_WRITE,
      body: JSON.stringify({ fleet_name: fleetName, status, updated_at: new Date().toISOString() }),
    });
    clear();
  } catch {
    clear();
  }
}

export async function deleteFleetStatus(fleetName: string): Promise<void> {
  const { signal, clear } = withTimeout(5000);
  try {
    await fetch(`${SB_URL}/rest/v1/fleet_status?fleet_name=eq.${encodeURIComponent(fleetName)}`, {
      method: 'DELETE',
      signal,
      headers: HDR_DELETE,
    });
    clear();
  } catch {
    clear();
  }
}
