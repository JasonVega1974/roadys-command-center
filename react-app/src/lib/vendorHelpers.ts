import { KPI_VP, MANAGER_MAP, MEMBERS, MOS, REGIONS, ROI_DEFAULT_VENDOR_PRESETS, VP_TOP10_LIST, VP_VENDORS } from '../data/vendors';
import type { ROIRecord } from '../types/vendors';

export const GS_NAMES = [
  'Shannon Bumbalough',
  'Steph Leslie',
  'Maria Coleman',
  'Stefanie Ritter',
  'Burt Newman',
  'Logan',
] as const;

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[+mo - 1]} ${y}`;
}

export function prevMonth(m: string): string | null {
  const i = (MOS as string[]).indexOf(m);
  return i > 0 ? (MOS as string[])[i - 1] : null;
}

export function kpi(key: string, m: string): number {
  return ((KPI_VP as Record<string, Record<string, number>>)[key] || {})[m] || 0;
}

export function fmtDollar(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

export function deltaPct(c: number, p: number | null): string | null {
  if (p == null || p === 0) return null;
  const pct = ((c - p) / Math.abs(p)) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
}

export function ytdKpi(key: string, m: string): number {
  const mi = (MOS as string[]).indexOf(m);
  const yr = m.split('-')[0];
  return (MOS as string[])
    .slice(0, mi + 1)
    .filter((mo) => mo.startsWith(yr))
    .reduce((s, mo) => s + kpi(key, mo), 0);
}

export function getManager(state: string): string {
  return (MANAGER_MAP as Record<string, string>)[state] || (MANAGER_MAP as Record<string, string>)['default'];
}

export function getRegionColor(mgr: string): string {
  return (REGIONS as Record<string, { color: string }>)[mgr]?.color || '#3A4A6B';
}

export function vendorName(vid: string): string {
  const v =
    (VP_VENDORS as { id: string; name: string }[]).find((x) => x.id === vid) ||
    (VP_TOP10_LIST as { id: string; name: string }[]).find((x) => x.id === vid);
  return v ? v.name : vid;
}

export function stopName(sid: string): string {
  const m = (MEMBERS as { id: string; name: string }[]).find((x) => x.id === sid);
  return m ? m.name : sid;
}

export type VendorPreset = { pct: number; rebate?: number; mandatory?: boolean; label?: string };

export function getVendorPreset(vid: string): VendorPreset {
  return (ROI_DEFAULT_VENDOR_PRESETS as Record<string, VendorPreset>)[vid] || { pct: 0 };
}

// Mirrors legacy getVendorPct: user-set default wins over preset.
export function getVendorPct(vid: string, defaults?: Record<string, { pct: number; rebate: number }>): number {
  const ud = defaults?.[vid];
  if (ud && ud.pct) return ud.pct;
  return getVendorPreset(vid).pct || 0;
}

// Estimated contract savings = monthly_spend * pct / 100 where pct comes from the
// vendor's user-set default (if any), else its preset. Ignores r.savings_pct —
// that field is for per-record add'l savings that flow into r.cost_savings.
export function estContractSav(
  r: ROIRecord,
  defaults?: Record<string, { pct: number; rebate: number }>,
): number {
  const spend = +r.monthly_spend || 0;
  const pct = getVendorPct(r.vendor_id, defaults);
  return pct ? (spend * pct) / 100 : 0;
}

export function downloadCSV(filename: string, header: string[], rows: (string | number)[][]): void {
  const escape = (c: string | number) => '"' + String(c ?? '').replace(/"/g, '""') + '"';
  const csv = [header.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export function parseCSVRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function defaultSelectedMonth(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const list = MOS as string[];
  if (list.includes(ym)) return ym;
  // Pick closest past month with revenue data.
  const rev = (KPI_VP as Record<string, Record<string, number>>)['Monthly Vendor Program Revenue'] || {};
  const withData = list.filter((m) => rev[m] != null);
  for (let i = list.indexOf(ym); i >= 0; i--) {
    if (withData.includes(list[i])) return list[i];
  }
  return withData[withData.length - 1] || list[0];
}
