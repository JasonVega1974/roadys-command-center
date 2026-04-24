import { useMemo, useRef, useState, useEffect } from 'react';
import { KPI_VP, MEMBERS, MOS, REGIONS, VP_TOP10_LIST, VP_VENDORS } from '../../data/vendors';
import {
  GS_NAMES,
  estContractSav,
  fmtDollar,
  getManager,
  kpi,
  monthLabel,
  prevMonth,
  ytdKpi,
} from '../../lib/vendorHelpers';
import type { useVendorsState } from '../../hooks/useVendorsState';

type Props = { month: string; vendors: ReturnType<typeof useVendorsState> };

export function DashboardTab({ month, vendors }: Props) {
  const { enroll, roi } = vendors;
  const prev = prevMonth(month);
  const vpRev = kpi('Monthly Vendor Program Revenue', month);
  const vpRevP = prev ? kpi('Monthly Vendor Program Revenue', prev) : null;
  const vpYTD = ytdKpi('Monthly Vendor Program Revenue', month);
  const activeLocs = useMemo(
    () => (MEMBERS as { id: string; status: string; state: string; name: string; city?: string }[]).filter((mb) => mb.status === 'active' && mb.id),
    [],
  );
  const t10Ids = new Set((VP_TOP10_LIST as { id: string }[]).map((v) => v.id));
  const t10Rebates = roi.filter((r) => t10Ids.has(r.vendor_id)).reduce((s, r) => s + (+r.rebate_amount || 0) + (+r.cost_savings || 0), 0);
  const t10Est = roi.filter((r) => t10Ids.has(r.vendor_id)).reduce((s, r) => s + estContractSav(r), 0);
  const t10Rev = Math.round((t10Rebates + t10Est) * 100) / 100;

  const netReb = roi.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
  const netSav = roi.reduce((s, r) => s + (+r.cost_savings || 0), 0);
  const netEst = roi.reduce((s, r) => s + estContractSav(r), 0);
  const netTotal = netReb + netSav + netEst;
  const moInYear = Math.max(1, +month.split('-')[1]);
  const netYTD = netTotal * moInYear;
  const avgPerLoc = activeLocs.length ? netTotal / activeLocs.length : 0;
  const roiStops = new Set(roi.map((r) => r.stop_id)).size;

  const activeVendorCount = (VP_VENDORS as { status: string }[]).filter((v) => v.status === 'Active').length;

  const pct = (c: number, p: number | null) => {
    if (p == null || p === 0) return null;
    return ((c - p) / Math.abs(p)) * 100;
  };
  const deltaVpRev = pct(vpRev, vpRevP);

  return (
    <div>
      <div className="sec-hdr"><div className="sec-title">Dashboard</div>
        <span className="badge badge-accent">Overview · {monthLabel(month)}</span>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Monthly VP Revenue"
          value={fmtDollar(vpRev)}
          delta={deltaVpRev != null ? { value: deltaVpRev, signed: true } : undefined}
          ytd={`YTD: ${fmtDollar(vpYTD)}`}
        />
        <KpiCard
          label="Top 10 Monthly Rebates & Savings"
          value={fmtDollar(t10Rev)}
          sub={`Rebates: ${fmtDollar(t10Rebates)} · Est. Contract Savings: ${fmtDollar(t10Est)}`}
        />
        <KpiCard
          label="Network Savings & Rebates/Mo"
          value={fmtDollar(netTotal)}
          sub={`Rebates: ${fmtDollar(netReb)} · Est. Contract Savings: ${fmtDollar(netEst)}${netSav ? ' · Other: ' + fmtDollar(netSav) : ''}`}
          ytd={`Est. YTD: ${fmtDollar(netYTD)}${roiStops ? ' · ' + roiStops + ' stops reporting' : ''}`}
          color="green"
        />
        <KpiCard
          label="Avg Savings/Mo per Location"
          value={fmtDollar(avgPerLoc)}
          sub={`Network total ÷ ${activeLocs.length} active truck stops`}
          ytd={`Est. YTD per location: ${fmtDollar(avgPerLoc * moInYear)}`}
          color="accent"
        />
        <KpiCard label="Active Vendors" value={String(activeVendorCount)} sub="PVP, Entegra, Shop, Approved" />
        <KpiCard label="Active Truck Stops" value={String(activeLocs.length)} />
      </div>

      <div className="gs-cards-row">
        <GSCard1 enroll={enroll} roi={roi} moInYear={moInYear} />
        <GSCard2 enroll={enroll} roi={roi} />
      </div>

      <RevenueChart />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  ytd,
  delta,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  ytd?: string;
  delta?: { value: number; signed?: boolean };
  color?: 'green' | 'accent';
}) {
  return (
    <div className={`kc ${color ? `kc-${color}` : ''}`}>
      <div className="kc-label">{label}</div>
      <div className="kc-val">{value}</div>
      {delta && (
        <div className="kc-delta" style={{ color: delta.value >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {delta.signed && delta.value >= 0 ? '+' : ''}{delta.value.toFixed(1)}%
        </div>
      )}
      {sub && <div className="kc-sub">{sub}</div>}
      {ytd && <div className="kc-ytd">{ytd}</div>}
    </div>
  );
}

type GSData = {
  stops: number;
  rebates: number;
  estSav: number;
  total: number;
  avgPerLoc: number;
  vendorCount: number;
  avgVendors: number;
  stopsWithVendors: number;
  avgSavPerStop: number;
  ytd: number;
};

function buildGSData(enroll: ReturnType<typeof useVendorsState>['enroll'], roi: ReturnType<typeof useVendorsState>['roi'], moInYear: number): Record<string, GSData> {
  const allActive = (MEMBERS as { id: string; status: string; state: string }[]).filter(
    (mb) => mb.status === 'active' && mb.id,
  );
  const vendors = VP_TOP10_LIST as { id: string }[];
  const out: Record<string, GSData> = {};
  for (const gs of GS_NAMES) {
    const locs = allActive.filter((mb) => getManager(mb.state || '') === gs);
    let rebates = 0, estSav = 0, vendorCount = 0, stopsWithVendors = 0;
    for (const mb of locs) {
      const recs = roi.filter((r) => r.stop_id === mb.id);
      const le = enroll[mb.id] || {};
      rebates += recs.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
      estSav += recs.reduce((s, r) => s + estContractSav(r), 0);
      const vc = vendors.filter((v) => le[v.id] || recs.some((r) => r.vendor_id === v.id)).length;
      vendorCount += vc;
      if (vc > 0) stopsWithVendors++;
    }
    const total = rebates + estSav;
    out[gs] = {
      stops: locs.length,
      rebates,
      estSav,
      total,
      avgPerLoc: locs.length ? total / locs.length : 0,
      vendorCount,
      avgVendors: locs.length ? vendorCount / locs.length : 0,
      stopsWithVendors,
      avgSavPerStop: stopsWithVendors ? total / stopsWithVendors : 0,
      ytd: total * moInYear,
    };
  }
  return out;
}

function GSCard1({ enroll, roi, moInYear }: { enroll: ReturnType<typeof useVendorsState>['enroll']; roi: ReturnType<typeof useVendorsState>['roi']; moInYear: number }) {
  const [selected, setSelected] = useState<string>(GS_NAMES[0]);
  const data = useMemo(() => buildGSData(enroll, roi, moInYear), [enroll, roi, moInYear]);
  const d = data[selected];
  const rankRev = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  const rankAvg = Object.entries(data).sort((a, b) => b[1].avgPerLoc - a[1].avgPerLoc);
  const rr = rankRev.findIndex(([k]) => k === selected) + 1;
  const ra = rankAvg.findIndex(([k]) => k === selected) + 1;
  const medals = ['🥇', '🥈', '🥉'];
  const medal = (n: number) => medals[n - 1] || '#' + n;
  const color = (REGIONS as Record<string, { color: string; label: string }>)[selected]?.color || '#888';
  const label = (REGIONS as Record<string, { color: string; label: string }>)[selected]?.label || '';

  return (
    <div className="panel panel-purple">
      <div className="panel-hdr">
        <div className="panel-title purple">📊 GS Revenue & Savings</div>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {GS_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="gs-card-body">
        <div className="gs-card-head">
          <span className="gs-swatch" style={{ background: color }} />
          <span className="gs-name">{selected}</span>
          <span className="gs-sub">{label} · {d.stops} stops</span>
        </div>
        <div className="gs-card-cols">
          <div className="gs-col">
            <div className="gs-col-lbl">VP Revenue/Mo</div>
            <div className="gs-col-val green">{fmtDollar(d.rebates)}</div>
            <div className="gs-col-sub">Rank: {medal(rr)}</div>
          </div>
          <div className="gs-col">
            <div className="gs-col-lbl">Savings & Rebates/Mo</div>
            <div className="gs-col-val purple">{fmtDollar(d.total)}</div>
            <div className="gs-col-sub">Reb: {fmtDollar(d.rebates)} + Est: {fmtDollar(d.estSav)}</div>
          </div>
          <div className="gs-col">
            <div className="gs-col-lbl">Avg/Location/Mo</div>
            <div className="gs-col-val accent">{fmtDollar(d.avgPerLoc)}</div>
            <div className="gs-col-sub">Rank: {medal(ra)}</div>
          </div>
        </div>
        <div className="gs-card-footer">
          <span className="muted">Est. YTD:</span>
          <span style={{ fontWeight: 700, color: 'var(--green)' }}>{fmtDollar(d.ytd)}</span>
          <span className="muted">Est. Annual:</span>
          <span style={{ fontWeight: 700 }}>{fmtDollar(d.total * 12)}</span>
        </div>
      </div>
    </div>
  );
}

function GSCard2({ enroll, roi }: { enroll: ReturnType<typeof useVendorsState>['enroll']; roi: ReturnType<typeof useVendorsState>['roi'] }) {
  const [selected, setSelected] = useState<string>(GS_NAMES[0]);
  const data = useMemo(() => buildGSData(enroll, roi, 1), [enroll, roi]);
  const d = data[selected];
  const rankVen = Object.entries(data).sort((a, b) => b[1].avgVendors - a[1].avgVendors);
  const rankStop = Object.entries(data).sort((a, b) => b[1].avgSavPerStop - a[1].avgSavPerStop);
  const rankRev = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  const rv = rankVen.findIndex(([k]) => k === selected) + 1;
  const rs = rankStop.findIndex(([k]) => k === selected) + 1;
  const ep = d.stops ? Math.round((d.stopsWithVendors / d.stops) * 100) : 0;
  const medals = ['🥇', '🥈', '🥉'];
  const medal = (n: number) => medals[n - 1] || '#' + n;
  const color = (REGIONS as Record<string, { color: string; label: string }>)[selected]?.color || '#888';

  return (
    <div className="panel panel-green">
      <div className="panel-hdr">
        <div className="panel-title green">🏆 GS Enrollment & Rankings</div>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {GS_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="gs-card-body">
        <div className="gs-card-head">
          <span className="gs-swatch" style={{ background: color }} />
          <span className="gs-name">{selected}</span>
          <span className="gs-sub">{d.stops} stops · {ep}% participation</span>
        </div>
        <div className="gs-card-cols">
          <div className="gs-col">
            <div className="gs-col-lbl">Stops w/ Vendors</div>
            <div className="gs-col-val">{d.stopsWithVendors}<span className="dim">/{d.stops}</span></div>
            <div className="gs-col-sub">{ep}% enrolled</div>
          </div>
          <div className="gs-col">
            <div className="gs-col-lbl">Avg Vendors/Stop</div>
            <div className="gs-col-val green">{d.avgVendors.toFixed(1)}</div>
            <div className="gs-col-sub">Rank: {medal(rv)}</div>
          </div>
          <div className="gs-col">
            <div className="gs-col-lbl">Avg Savings/Stop</div>
            <div className="gs-col-val accent">{fmtDollar(d.avgSavPerStop)}</div>
            <div className="gs-col-sub">Rank: {medal(rs)}</div>
          </div>
        </div>
        <div className="gs-card-ranks">
          <div className="gs-card-ranks-lbl">All Territories — Total Benefit/Mo</div>
          <div className="gs-card-ranks-grid">
            {rankRev.map(([name, row], i) => {
              const hi = name === selected;
              const swatch = (REGIONS as Record<string, { color: string }>)[name]?.color || '#888';
              return (
                <div key={name} className={`gs-rank-row ${hi ? 'hi' : ''}`}>
                  <span>
                    <span className="gs-rank-swatch" style={{ background: swatch }} />
                    <span className={`gs-rank-name ${hi ? 'hi' : ''}`}>{medal(i + 1)} {name.split(' ')[0]}</span>
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtDollar(row.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    type ChartCtor = new (el: HTMLCanvasElement, cfg: unknown) => { destroy: () => void };
    const Chart = (window as unknown as { Chart?: ChartCtor }).Chart;
    if (!Chart || !ref.current) return;
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: (MOS as string[]).map((m) => monthLabel(m)),
        datasets: [{
          label: 'VP Revenue',
          data: (MOS as string[]).map((m) => ((KPI_VP as Record<string, Record<string, number>>)['Monthly Vendor Program Revenue'] || {})[m] || 0),
          backgroundColor: 'rgba(124,58,237,.5)',
          borderColor: 'rgba(124,58,237,.8)',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#6B7A99', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#6B7A99', callback: (v: unknown) => '$' + Math.round(Number(v) / 1000) + 'K' }, grid: { color: 'rgba(30,42,69,.5)' } },
        },
      },
    });
    return () => chart.destroy();
  }, []);
  return (
    <div className="panel">
      <div className="panel-hdr"><div className="panel-title">📈 Vendor Program Revenue Trend</div></div>
      <div style={{ padding: 16 }}><canvas ref={ref} height={180} /></div>
    </div>
  );
}
