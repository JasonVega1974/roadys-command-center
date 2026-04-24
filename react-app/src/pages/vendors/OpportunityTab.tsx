import { Fragment, useMemo, useState } from 'react';
import { MEMBERS, REGIONS, ROI_DEFAULT_VENDOR_PRESETS, VP_TOP10_LIST } from '../../data/vendors';
import {
  GS_NAMES,
  estContractSav,
  fmtDollar,
  getManager,
  getRegionColor,
  getVendorPct,
} from '../../lib/vendorHelpers';
import type { useVendorsState } from '../../hooks/useVendorsState';
import type { ROIRecord } from '../../types/vendors';

type Props = { vendors: ReturnType<typeof useVendorsState> };
type Sub = 'analysis' | 'gsplan';
type OppSortCol = 'name' | 'on' | 'current' | 'missing' | 'potential' | 'total';

type MemberLite = { id: string; name: string; city: string; state: string; status: string };
type TopVendor = { id: string; name: string };
type PresetMap = Record<string, { mandatory?: boolean; pct?: number; rebate?: number }>;

export function OpportunityTab({ vendors }: Props) {
  const [sub, setSub] = useState<Sub>('analysis');
  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">Missing Opportunity</div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            className={`btn ${sub === 'analysis' ? 'btn-accent' : ''}`}
            style={{ fontSize: '.78em', padding: '4px 12px' }}
            onClick={() => setSub('analysis')}
          >
            🚨 Savings Opportunity
          </button>
          <button
            className={`btn ${sub === 'gsplan' ? 'btn-accent' : ''}`}
            style={{ fontSize: '.78em', padding: '4px 12px' }}
            onClick={() => setSub('gsplan')}
          >
            📈 50% Growth Plan
          </button>
        </div>
      </div>
      {sub === 'analysis' ? <OppAnalysis vendors={vendors} /> : <ActionPlan vendors={vendors} />}
    </div>
  );
}

// ───────── Savings Opportunity Analysis ─────────
function OppAnalysis({ vendors }: Props) {
  const { enroll, roi, defaults } = vendors;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'has-gap' | 'no-vendors' | 'top-opp'>('all');
  const [gsFilter, setGsFilter] = useState<string>('all');
  const [sortCol, setSortCol] = useState<OppSortCol>('potential');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const members = MEMBERS as MemberLite[];
  const topVendors = VP_TOP10_LIST as TopVendor[];

  const { kpis, rows } = useMemo(() => {
    const allActive = members.filter((m) => m.status === 'active' && m.id);
    const activeLocs = gsFilter === 'all' ? allActive : allActive.filter((m) => getManager(m.state || '') === gsFilter);

    // Network-wide vendor averages (used for estimating missing-vendor potential).
    const vendorAvgs: Record<string, { avgSpend: number; avgReb: number; avgEst: number; avgBenefit: number; count: number }> = {};
    for (const v of topVendors) {
      const recs = roi.filter((r) => r.vendor_id === v.id);
      const avgSpend = recs.length ? recs.reduce((s, r) => s + (+r.monthly_spend || 0), 0) / recs.length : 0;
      const avgReb = recs.length ? recs.reduce((s, r) => s + (+r.rebate_amount || 0), 0) / recs.length : 0;
      const pct = getVendorPct(v.id, defaults);
      const avgEst = (avgSpend * pct) / 100;
      vendorAvgs[v.id] = {
        avgSpend: Math.round(avgSpend),
        avgReb: Math.round(avgReb * 100) / 100,
        avgEst: Math.round(avgEst * 100) / 100,
        avgBenefit: Math.round((avgReb + avgEst) * 100) / 100,
        count: recs.length,
      };
    }

    let stops = activeLocs.map((mb) => {
      const stopROI = roi.filter((r) => r.stop_id === mb.id);
      const enrolledVids = new Set<string>();
      for (const r of stopROI) enrolledVids.add(r.vendor_id);
      const le = enroll[mb.id] || {};
      for (const v of topVendors) if (le[v.id]) enrolledVids.add(v.id);

      const currentReb = stopROI.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
      const currentEst = stopROI.reduce((s, r) => s + estContractSav(r, defaults), 0);
      const currentBenefit = Math.round((currentReb + currentEst) * 100) / 100;

      const onVendors = topVendors.filter((v) => enrolledVids.has(v.id));
      const missingVendors = topVendors.filter((v) => !enrolledVids.has(v.id) && vendorAvgs[v.id].count > 0);
      const potential = missingVendors.reduce((s, v) => s + vendorAvgs[v.id].avgBenefit, 0);
      const totalPotential = Math.round((currentBenefit + potential) * 100) / 100;

      return {
        mb,
        currentBenefit,
        potential: Math.round(potential * 100) / 100,
        totalPotential,
        onCount: onVendors.length,
        missCount: missingVendors.length,
        onVendors,
        missingVendors,
        stopROI,
      };
    });

    const ql = q.toLowerCase();
    if (ql) stops = stops.filter((s) => [s.mb.name, s.mb.id, s.mb.city, s.mb.state].some((v) => (v || '').toLowerCase().includes(ql)));
    if (filter === 'has-gap') stops = stops.filter((s) => s.missCount > 0);
    else if (filter === 'no-vendors') stops = stops.filter((s) => s.onCount === 0);
    else if (filter === 'top-opp') {
      stops.sort((a, b) => b.potential - a.potential);
      stops = stops.slice(0, 50);
    }

    stops.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortCol === 'name') { va = (a.mb.name || '').toLowerCase(); vb = (b.mb.name || '').toLowerCase(); }
      else if (sortCol === 'on') { va = a.onCount; vb = b.onCount; }
      else if (sortCol === 'current') { va = a.currentBenefit; vb = b.currentBenefit; }
      else if (sortCol === 'missing') { va = a.missCount; vb = b.missCount; }
      else if (sortCol === 'total') { va = a.totalPotential; vb = b.totalPotential; }
      else { va = a.potential; vb = b.potential; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const netCurrent = activeLocs.reduce((s, mb) => {
      const sr = roi.filter((r) => r.stop_id === mb.id);
      return s + sr.reduce((t, r) => t + (+r.rebate_amount || 0) + estContractSav(r, defaults), 0);
    }, 0);
    const netPotential = stops.reduce((s, st) => s + st.potential, 0);
    const stopsWithGap = stops.filter((s) => s.missCount > 0).length;
    const stopsNoVendors = stops.filter((s) => s.onCount === 0).length;

    return {
      kpis: {
        gsLabel: gsFilter === 'all' ? 'Network' : gsFilter,
        netCurrent,
        netPotential,
        stopsWithGap,
        stopsNoVendors,
        activeCount: activeLocs.length,
      },
      rows: stops,
    };
  }, [enroll, roi, defaults, q, filter, gsFilter, sortCol, sortDir, members, topVendors]);

  function onSort(col: OppSortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  }
  const arrow = (col: OppSortCol) => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="kpi-grid">
        <div className="kc" style={{ borderColor: 'rgba(0,214,143,.3)' }}>
          <div className="kc-label" style={{ color: 'var(--green)' }}>{kpis.gsLabel} Current Benefit/Mo</div>
          <div className="kc-val" style={{ color: 'var(--green)' }}>{fmtDollar(kpis.netCurrent)}</div>
          <div className="kc-sub">Actual rebates + est. contract savings · {kpis.activeCount} stops</div>
        </div>
        <div className="kc" style={{ borderColor: 'rgba(255,107,53,.3)' }}>
          <div className="kc-label" style={{ color: 'var(--orange)' }}>{kpis.gsLabel} Untapped Potential/Mo</div>
          <div className="kc-val" style={{ color: 'var(--orange)' }}>{fmtDollar(kpis.netPotential)}</div>
          <div className="kc-sub">{kpis.stopsWithGap} stops with missing vendors · {fmtDollar(kpis.netPotential * 12)}/yr</div>
        </div>
        <div className="kc">
          <div className="kc-label">{kpis.gsLabel} If Fully Enrolled</div>
          <div className="kc-val">{fmtDollar(kpis.netCurrent + kpis.netPotential)}</div>
          <div className="kc-sub">{fmtDollar((kpis.netCurrent + kpis.netPotential) * 12)}/yr potential</div>
        </div>
        <div className="kc">
          <div className="kc-label">Stops with No Vendors</div>
          <div className="kc-val" style={{ color: 'var(--red)' }}>{kpis.stopsNoVendors}</div>
          <div className="kc-sub">of {kpis.activeCount} {kpis.gsLabel === 'Network' ? 'active' : 'territory'} stops</div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-hdr">
          <input
            className="inp"
            placeholder="Search stop, city, state…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All Active Stops</option>
            <option value="has-gap">Has Missing Vendors</option>
            <option value="no-vendors">No Vendors Enrolled</option>
            <option value="top-opp">Top 50 by Potential</option>
          </select>
          <select value={gsFilter} onChange={(e) => setGsFilter(e.target.value)}>
            <option value="all">All Territories</option>
            {GS_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="panel-spacer" />
          <span className="muted" style={{ fontSize: '.78em' }}>{rows.length} stops</span>
        </div>
        <div className="dt-wrap">
          <table className="dt" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th onClick={() => onSort('name')} style={{ cursor: 'pointer' }}>Truck Stop{arrow('name')}</th>
                <th onClick={() => onSort('on')} style={{ cursor: 'pointer', textAlign: 'center' }}>Current Vendors{arrow('on')}</th>
                <th onClick={() => onSort('current')} style={{ cursor: 'pointer', textAlign: 'right' }}>Current Benefit/Mo{arrow('current')}</th>
                <th onClick={() => onSort('missing')} style={{ cursor: 'pointer', textAlign: 'center' }}>Missing Vendors{arrow('missing')}</th>
                <th onClick={() => onSort('potential')} style={{ cursor: 'pointer', textAlign: 'right' }}>Potential Add'l/Mo{arrow('potential')}</th>
                <th onClick={() => onSort('total')} style={{ cursor: 'pointer', textAlign: 'right' }}>Total If Enrolled{arrow('total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const gs = getManager(s.mb.state || '');
                const gc = getRegionColor(gs);
                const isOpen = !!expanded[s.mb.id];
                const potColor = s.potential > 500 ? 'var(--orange)' : s.potential > 100 ? 'var(--yellow)' : 'var(--muted)';
                return (
                  <Fragment key={s.mb.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpanded((e) => ({ ...e, [s.mb.id]: !e[s.mb.id] }))}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{isOpen ? '－' : '＋'}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: '.85em' }}>{s.mb.name}</span>
                        <br />
                        <span style={{ fontSize: '.64em', color: 'var(--muted)' }}>
                          {s.mb.id} · {s.mb.city || '—'}, {s.mb.state || '—'} · <span style={{ color: gc }}>{gs}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: 'rgba(0,214,143,.15)', color: 'var(--green)', padding: '1px 8px', borderRadius: 10, fontSize: '.82em', fontWeight: 700 }}>
                          {s.onCount}/{topVendors.length}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{s.currentBenefit ? fmtDollar(s.currentBenefit) : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          background: s.missCount > 0 ? 'rgba(255,107,53,.15)' : 'transparent',
                          color: s.missCount > 0 ? 'var(--orange)' : 'var(--dim)',
                          padding: '1px 8px',
                          borderRadius: 10,
                          fontSize: '.82em',
                          fontWeight: 700,
                        }}>{s.missCount}</span>
                      </td>
                      <td style={{ textAlign: 'right', color: potColor, fontWeight: 700 }}>{s.potential ? '+' + fmtDollar(s.potential) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{s.totalPotential ? fmtDollar(s.totalPotential) : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                          <OppStopDetail stop={s} roi={roi} defaults={defaults} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No stops match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type OppStop = {
  mb: MemberLite;
  currentBenefit: number;
  potential: number;
  totalPotential: number;
  onCount: number;
  missCount: number;
  onVendors: TopVendor[];
  missingVendors: TopVendor[];
  stopROI: ROIRecord[];
};

function OppStopDetail({ stop, roi, defaults }: { stop: OppStop; roi: ROIRecord[]; defaults: Record<string, { pct: number; rebate: number }> }) {
  // Re-compute network-avg for each missing vendor locally to avoid threading props.
  const vendorAvgs = useMemo(() => {
    const out: Record<string, { avgSpend: number; avgReb: number; avgEst: number; avgBenefit: number }> = {};
    for (const v of stop.missingVendors) {
      const recs = roi.filter((r) => r.vendor_id === v.id);
      const n = recs.length;
      const avgSpend = n ? recs.reduce((s, r) => s + (+r.monthly_spend || 0), 0) / n : 0;
      const avgReb = n ? recs.reduce((s, r) => s + (+r.rebate_amount || 0), 0) / n : 0;
      const pct = getVendorPct(v.id, defaults);
      const avgEst = (avgSpend * pct) / 100;
      out[v.id] = {
        avgSpend: Math.round(avgSpend),
        avgReb: Math.round(avgReb * 100) / 100,
        avgEst: Math.round(avgEst * 100) / 100,
        avgBenefit: Math.round((avgReb + avgEst) * 100) / 100,
      };
    }
    return out;
  }, [stop.missingVendors, roi, defaults]);

  const missTot = stop.missingVendors.reduce((s, v) => s + (vendorAvgs[v.id]?.avgBenefit || 0), 0);
  const cellBase = { padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: '.82em' } as const;
  const subTh = { fontSize: '.62em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--dim)', padding: '4px 8px', borderBottom: '1px solid var(--border)' };

  return (
    <div style={{ background: 'rgba(0,0,0,.2)', padding: '10px 14px' }}>
      <div style={{ fontSize: '.72em', fontWeight: 700, color: 'var(--green)', marginBottom: 6, letterSpacing: '.06em', textTransform: 'uppercase' }}>
        ✓ Current Vendors
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={subTh}>Vendor</th>
            <th style={{ ...subTh, textAlign: 'right' }}>Spend/Mo</th>
            <th style={{ ...subTh, textAlign: 'right' }}>Rebate/Mo</th>
            <th style={{ ...subTh, textAlign: 'right' }}>Est. Contract Savings</th>
            <th style={{ ...subTh, textAlign: 'right' }}>Total Benefit</th>
          </tr>
        </thead>
        <tbody>
          {stop.onVendors.length ? stop.onVendors.map((v) => {
            const r = stop.stopROI.find((x) => x.vendor_id === v.id);
            const spend = r ? +r.monthly_spend || 0 : 0;
            const reb = r ? +r.rebate_amount || 0 : 0;
            const est = r ? estContractSav(r, defaults) : 0;
            const ben = reb + est;
            return (
              <tr key={v.id}>
                <td style={{ ...cellBase, fontWeight: 600, color: 'var(--green)' }}>✓ {v.name}</td>
                <td style={{ ...cellBase, textAlign: 'right' }}>{spend ? fmtDollar(spend) : '—'}</td>
                <td style={{ ...cellBase, textAlign: 'right', color: 'var(--green)' }}>{reb ? fmtDollar(reb) : '—'}</td>
                <td style={{ ...cellBase, textAlign: 'right', color: 'var(--accent)' }}>{est ? fmtDollar(est) : '—'}</td>
                <td style={{ ...cellBase, textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{ben ? fmtDollar(ben) : '—'}</td>
              </tr>
            );
          }) : (
            <tr><td colSpan={5} style={{ padding: 8, color: 'var(--dim)', fontSize: '.82em' }}>No vendors enrolled yet</td></tr>
          )}
        </tbody>
      </table>

      {stop.missingVendors.length > 0 && (
        <>
          <div style={{ fontSize: '.72em', fontWeight: 700, color: 'var(--orange)', marginBottom: 6, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            🚨 Missing Vendors — Estimated Potential
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={subTh}>Vendor</th>
                <th style={{ ...subTh, textAlign: 'right' }}>Network Avg Spend</th>
                <th style={{ ...subTh, textAlign: 'right' }}>Est. Rebate/Mo</th>
                <th style={{ ...subTh, textAlign: 'right' }}>Est. Contract Savings</th>
                <th style={{ ...subTh, textAlign: 'right' }}>Est. Benefit/Mo</th>
              </tr>
            </thead>
            <tbody>
              {stop.missingVendors.map((v) => {
                const avg = vendorAvgs[v.id];
                return (
                  <tr key={v.id}>
                    <td style={{ ...cellBase, fontWeight: 600, color: 'var(--orange)' }}>+ {v.name}</td>
                    <td style={{ ...cellBase, textAlign: 'right', color: 'var(--muted)' }}>{fmtDollar(avg.avgSpend)}</td>
                    <td style={{ ...cellBase, textAlign: 'right', color: 'var(--orange)' }}>{fmtDollar(avg.avgReb)}</td>
                    <td style={{ ...cellBase, textAlign: 'right', color: 'var(--orange)' }}>{fmtDollar(avg.avgEst)}</td>
                    <td style={{ ...cellBase, textAlign: 'right', fontWeight: 700, color: 'var(--orange)' }}>{fmtDollar(avg.avgBenefit)}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding: '5px 8px', fontWeight: 700, fontSize: '.82em', color: 'var(--orange)' }}>TOTAL ADDITIONAL POTENTIAL</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, fontSize: '.95em', color: 'var(--orange)' }}>
                  {fmtDollar(missTot)}/mo · {fmtDollar(missTot * 12)}/yr
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ───────── 50% Growth Action Plan ─────────
function ActionPlan({ vendors }: Props) {
  const { enroll, roi, defaults } = vendors;
  const [gsFilter, setGsFilter] = useState<string>('all');
  const members = MEMBERS as MemberLite[];
  const topVendors = VP_TOP10_LIST as TopVendor[];
  const presets = ROI_DEFAULT_VENDOR_PRESETS as PresetMap;

  const allActive = useMemo(() => members.filter((m) => m.status === 'active' && m.id), [members]);

  const data = useMemo(() => {
    const locs = gsFilter === 'all' ? allActive : allActive.filter((m) => getManager(m.state || '') === gsFilter);
    const gsLabel = gsFilter === 'all' ? 'Network' : gsFilter;

    let currentRebates = 0;
    let currentEstSav = 0;
    let currentTotal = 0;
    const vendorStats: Record<string, { name: string; enrolled: number; notEnrolled: number; currentRev: number }> = {};
    for (const v of topVendors) vendorStats[v.id] = { name: v.name, enrolled: 0, notEnrolled: 0, currentRev: 0 };

    for (const mb of locs) {
      const recs = roi.filter((r) => r.stop_id === mb.id);
      const le = enroll[mb.id] || {};
      const stopReb = recs.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
      const stopEst = recs.reduce((s, r) => s + estContractSav(r, defaults), 0);
      currentRebates += stopReb;
      currentEstSav += stopEst;
      currentTotal += stopReb + stopEst;
      for (const v of topVendors) {
        const enrolled = le[v.id] || recs.some((r) => r.vendor_id === v.id);
        if (enrolled) {
          vendorStats[v.id].enrolled++;
          const vr = recs.find((r) => r.vendor_id === v.id);
          vendorStats[v.id].currentRev += vr ? (+vr.rebate_amount || 0) + estContractSav(vr, defaults) : 0;
        } else {
          vendorStats[v.id].notEnrolled++;
        }
      }
    }

    const stopsWithData = new Set(roi.filter((r) => locs.some((m) => m.id === r.stop_id)).map((r) => r.stop_id)).size;
    const avgPerStop = stopsWithData > 0 ? currentTotal / stopsWithData : 0;
    const target = Math.round(currentTotal * 1.5);
    const gap = target - currentTotal;

    const actions = topVendors.map((v) => {
      const vs = vendorStats[v.id];
      const allRecs = roi.filter((r) => r.vendor_id === v.id);
      const avgBen = allRecs.length ? allRecs.reduce((s, r) => s + (+r.rebate_amount || 0) + estContractSav(r, defaults), 0) / allRecs.length : 0;
      const totalPotential = vs.notEnrolled * avgBen;
      const pct = locs.length ? Math.round((vs.enrolled / locs.length) * 100) : 0;
      return {
        vid: v.id,
        name: v.name,
        enrolled: vs.enrolled,
        notEnrolled: vs.notEnrolled,
        pct,
        currentRev: vs.currentRev,
        avgBen,
        totalPotential,
      };
    }).filter((a) => a.avgBen > 0).sort((a, b) => b.totalPotential - a.totalPotential);

    const totalAllPotential = actions.reduce((s, a) => s + a.totalPotential, 0);
    const plan = actions.map((a) => {
      const share = totalAllPotential > 0 ? a.totalPotential / totalAllPotential : 0;
      const targetEnroll = gap > 0 && a.avgBen > 0 ? Math.min(a.notEnrolled, Math.max(1, Math.ceil((gap * share) / a.avgBen))) : 0;
      const revenueGain = Math.round(targetEnroll * a.avgBen);
      const fullPotential = Math.round(a.notEnrolled * a.avgBen);
      return { ...a, stopsToEnroll: targetEnroll, revenueGain, fullPotential };
    });

    const totalPlanGain = plan.reduce((s, p) => s + p.revenueGain, 0);
    const totalNewEnrollments = plan.reduce((s, p) => s + p.stopsToEnroll, 0);
    const totalFullPotential = plan.reduce((s, p) => s + p.fullPotential, 0);
    const totalNotEnrolled = plan.reduce((s, p) => s + p.notEnrolled, 0);

    return {
      locs,
      gsLabel,
      currentRebates,
      currentEstSav,
      currentTotal,
      stopsWithData,
      avgPerStop,
      target,
      gap,
      plan,
      totalPlanGain,
      totalNewEnrollments,
      totalFullPotential,
      totalNotEnrolled,
    };
  }, [allActive, gsFilter, enroll, roi, defaults, topVendors]);

  const gsRows = useMemo(() => {
    return GS_NAMES.map((gs) => {
      const gc = (REGIONS as Record<string, { color?: string; label?: string }>)[gs]?.color || '#888';
      const label = (REGIONS as Record<string, { color?: string; label?: string }>)[gs]?.label || '';
      const tLocs = allActive.filter((m) => getManager(m.state || '') === gs);
      const tCur = tLocs.reduce((s, mb) => {
        const sr = roi.filter((r) => r.stop_id === mb.id);
        return s + sr.reduce((t, r) => t + (+r.rebate_amount || 0) + estContractSav(r, defaults), 0);
      }, 0);
      const tTarget = Math.round(tCur * 1.5);
      const tGap = tTarget - tCur;
      let tFullPot = 0;
      for (const mb of tLocs) {
        const le = enroll[mb.id] || {};
        const recs = roi.filter((r) => r.stop_id === mb.id);
        const enrolledVids = new Set<string>();
        for (const r of recs) enrolledVids.add(r.vendor_id);
        for (const v of topVendors) if (le[v.id]) enrolledVids.add(v.id);
        for (const v of topVendors) {
          if (!enrolledVids.has(v.id)) {
            const vRecs = roi.filter((r) => r.vendor_id === v.id);
            if (vRecs.length) tFullPot += vRecs.reduce((s, r) => s + (+r.rebate_amount || 0) + estContractSav(r, defaults), 0) / vRecs.length;
          }
        }
      }
      return { gs, gc, label, stops: tLocs.length, cur: tCur, target: tTarget, gap: tGap, full: tFullPot, max: tCur + tFullPot };
    });
  }, [allActive, enroll, roi, defaults, topVendors]);

  const net = gsRows.reduce((acc, r) => ({
    stops: acc.stops + r.stops,
    cur: acc.cur + r.cur,
    target: acc.target + r.target,
    gap: acc.gap + r.gap,
    full: acc.full + r.full,
    max: acc.max + r.max,
  }), { stops: 0, cur: 0, target: 0, gap: 0, full: 0, max: 0 });

  if (!data.locs.length) {
    return (
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ padding: 16, color: 'var(--muted)', fontSize: '.85em' }}>No data available for {data.gsLabel}.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-hdr">
          <div className="panel-title">50% Growth Action Plan</div>
          <select value={gsFilter} onChange={(e) => setGsFilter(e.target.value)}>
            <option value="all">All Territories</option>
            {GS_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="panel-spacer" />
          <span className="muted" style={{ fontSize: '.78em' }}>{data.locs.length} stops</span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kc" style={{ borderColor: 'rgba(0,214,143,.3)' }}>
              <div className="kc-label" style={{ color: 'var(--green)' }}>{data.gsLabel} VP Revenue/Mo</div>
              <div className="kc-val" style={{ color: 'var(--green)' }}>{fmtDollar(data.currentRebates)}</div>
              <div className="kc-sub">Actual rebates & commissions · {data.stopsWithData} stops reporting</div>
            </div>
            <div className="kc" style={{ borderColor: 'rgba(0,200,255,.3)' }}>
              <div className="kc-label" style={{ color: 'var(--accent)' }}>{data.gsLabel} Est. Contract Savings/Mo</div>
              <div className="kc-val" style={{ color: 'var(--accent)' }}>{fmtDollar(data.currentEstSav)}</div>
              <div className="kc-sub">Estimated from vendor default rates</div>
            </div>
            <div className="kc" style={{ borderColor: 'rgba(124,58,237,.3)' }}>
              <div className="kc-label" style={{ color: 'var(--purple)' }}>Total Benefit/Mo</div>
              <div className="kc-val" style={{ color: 'var(--purple)' }}>{fmtDollar(data.currentTotal)}</div>
              <div className="kc-sub">{fmtDollar(data.currentTotal * 12)}/yr · Avg {fmtDollar(Math.round(data.avgPerStop))}/stop</div>
            </div>
            <div className="kc" style={{ borderColor: 'rgba(255,107,53,.3)' }}>
              <div className="kc-label" style={{ color: 'var(--orange)' }}>50% Growth Target</div>
              <div className="kc-val" style={{ color: 'var(--orange)' }}>
                {fmtDollar(data.target)}<span style={{ fontSize: '.5em', color: 'var(--muted)' }}>/mo</span>
              </div>
              <div className="kc-sub">Gap: +{fmtDollar(data.gap)}/mo needed</div>
            </div>
          </div>

          <div style={{ fontSize: '.78em', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 10 }}>
            📋 Action Plan by Vendor — Priority Order
          </div>
          <table className="dt" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Vendor Program</th>
                <th style={{ textAlign: 'center' }}>Enrolled</th>
                <th style={{ textAlign: 'center' }}>Not On</th>
                <th style={{ textAlign: 'center' }}>Target</th>
                <th style={{ textAlign: 'right' }}>Avg/Stop</th>
                <th style={{ textAlign: 'right' }}>Target Gain</th>
                <th style={{ textAlign: 'right' }}>Full Potential</th>
              </tr>
            </thead>
            <tbody>
              {data.plan.map((p, i) => {
                const urgency = i < 3 ? 'var(--orange)' : i < 6 ? 'var(--yellow)' : 'var(--muted)';
                const mand = presets[p.vid]?.mandatory;
                return (
                  <tr key={p.vid}>
                    <td style={{ textAlign: 'center', fontWeight: 800, color: urgency }}>{i + 1}</td>
                    <td>
                      <b>{p.name}</b>
                      {mand && (
                        <span style={{ fontSize: '.58em', background: 'rgba(255,107,53,.15)', color: 'var(--orange)', padding: '1px 5px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle', marginLeft: 6 }}>REQUIRED</span>
                      )}
                      <br />
                      <span style={{ fontSize: '.68em', color: 'var(--muted)' }}>{p.pct}% enrolled ({p.enrolled}/{data.locs.length})</span>
                      <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 4, height: 4, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ background: 'var(--green)', height: '100%', width: `${p.pct}%`, borderRadius: 4 }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 700 }}>{p.enrolled}</td>
                    <td style={{ textAlign: 'center', color: 'var(--orange)', fontWeight: 700 }}>{p.notEnrolled}</td>
                    <td style={{ textAlign: 'center' }}>
                      {p.stopsToEnroll > 0 ? (
                        <span style={{ background: 'rgba(124,58,237,.15)', color: 'var(--purple)', padding: '2px 8px', borderRadius: 10, fontWeight: 800, fontSize: '.88em' }}>+{p.stopsToEnroll}</span>
                      ) : <span style={{ color: 'var(--dim)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '.88em' }}>{fmtDollar(Math.round(p.avgBen))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{p.revenueGain ? '+' + fmtDollar(p.revenueGain) : '—'}</td>
                    <td style={{ textAlign: 'right', fontSize: '.85em', color: 'var(--accent)' }}>{p.fullPotential ? '+' + fmtDollar(p.fullPotential) : '—'}</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'rgba(124,58,237,.06)' }}>
                <td colSpan={3} style={{ borderTop: '2px solid var(--purple)', fontWeight: 800, color: 'var(--purple)' }}>TOTAL PLAN</td>
                <td style={{ borderTop: '2px solid var(--purple)', textAlign: 'center', fontWeight: 700, color: 'var(--orange)' }}>{data.totalNotEnrolled}</td>
                <td style={{ borderTop: '2px solid var(--purple)', textAlign: 'center', fontWeight: 800, color: 'var(--purple)' }}>+{data.totalNewEnrollments}</td>
                <td style={{ borderTop: '2px solid var(--purple)' }} />
                <td style={{ borderTop: '2px solid var(--purple)', textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>+{fmtDollar(data.totalPlanGain)}/mo</td>
                <td style={{ borderTop: '2px solid var(--purple)', textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>+{fmtDollar(data.totalFullPotential)}/mo</td>
              </tr>
            </tbody>
          </table>

          <ExecutiveSummary data={data} presets={presets} />
          <MandatoryNote />

          <div style={{ marginTop: 24, fontSize: '.78em', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
            🌐 Roady's Network Plan — All Territories
          </div>
          <table className="dt" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              <col style={{ width: 60 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th>GS Territory</th>
                <th style={{ textAlign: 'center' }}>Stops</th>
                <th style={{ textAlign: 'right' }}>Current/Mo</th>
                <th style={{ textAlign: 'right' }}>50% Target</th>
                <th style={{ textAlign: 'right' }}>Gap</th>
                <th style={{ textAlign: 'right' }}>Full Potential</th>
                <th style={{ textAlign: 'right' }}>If 100%</th>
              </tr>
            </thead>
            <tbody>
              {gsRows.map((r) => (
                <tr key={r.gs}>
                  <td>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: r.gc, marginRight: 6, verticalAlign: 'middle' }} />
                    <b>{r.gs}</b>
                    <br />
                    <span style={{ fontSize: '.68em', color: 'var(--muted)' }}>{r.label}</span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.stops}</td>
                  <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmtDollar(r.cur)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--purple)', fontWeight: 600 }}>{fmtDollar(r.target)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--orange)', fontWeight: 600 }}>{fmtDollar(r.gap)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtDollar(Math.round(r.full))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtDollar(Math.round(r.max))}</td>
                </tr>
              ))}
              <tr style={{ background: 'rgba(0,200,255,.06)' }}>
                <td style={{ borderTop: '2px solid var(--accent)', fontWeight: 800, color: 'var(--accent)' }}>ROADY'S NETWORK</td>
                <td style={{ borderTop: '2px solid var(--accent)', textAlign: 'center', fontWeight: 800 }}>{net.stops}</td>
                <td style={{ borderTop: '2px solid var(--accent)', textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{fmtDollar(net.cur)}</td>
                <td style={{ borderTop: '2px solid var(--accent)', textAlign: 'right', fontWeight: 800, color: 'var(--purple)' }}>{fmtDollar(net.target)}</td>
                <td style={{ borderTop: '2px solid var(--accent)', textAlign: 'right', fontWeight: 800, color: 'var(--orange)' }}>{fmtDollar(net.gap)}</td>
                <td style={{ borderTop: '2px solid var(--accent)', textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{fmtDollar(Math.round(net.full))}</td>
                <td style={{ borderTop: '2px solid var(--accent)', textAlign: 'right', fontWeight: 800 }}>{fmtDollar(Math.round(net.max))}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 6, fontSize: '.72em', color: 'var(--dim)' }}>
            Network annual potential: {fmtDollar(net.max * 12)}/yr · Current: {fmtDollar(net.cur * 12)}/yr · Growth opportunity: +{fmtDollar((net.max - net.cur) * 12)}/yr
          </div>
        </div>
      </div>
    </div>
  );
}

type PlanRow = { vid: string; name: string; enrolled: number; notEnrolled: number; pct: number; avgBen: number; stopsToEnroll: number; revenueGain: number; fullPotential: number };
type PlanData = {
  locs: MemberLite[];
  gsLabel: string;
  currentRebates: number;
  currentEstSav: number;
  currentTotal: number;
  stopsWithData: number;
  avgPerStop: number;
  target: number;
  gap: number;
  plan: PlanRow[];
  totalPlanGain: number;
  totalNewEnrollments: number;
  totalFullPotential: number;
  totalNotEnrolled: number;
};

function ExecutiveSummary({ data, presets }: { data: PlanData; presets: PresetMap }) {
  const pctGrowth = data.currentTotal > 0 ? Math.round((data.totalPlanGain / data.currentTotal) * 100) : 0;
  return (
    <div style={{ marginTop: 16, background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 8, padding: 14 }}>
      <div style={{ fontWeight: 700, color: 'var(--purple)', marginBottom: 8 }}>📊 Executive Summary — {data.gsLabel}</div>
      <div style={{ fontSize: '.88em', color: 'var(--text)', lineHeight: 1.7 }}>
        <b>{data.gsLabel}</b> currently generates <b style={{ color: 'var(--green)' }}>{fmtDollar(data.currentTotal)}/mo</b> ({fmtDollar(data.currentTotal * 12)}/yr) in total vendor program value across <b>{data.locs.length}</b> truck stops ({data.stopsWithData} actively reporting).
        This breaks down to <b style={{ color: 'var(--green)' }}>{fmtDollar(data.currentRebates)}/mo</b> in actual VP rebate revenue and an estimated <b style={{ color: 'var(--accent)' }}>{fmtDollar(data.currentEstSav)}/mo</b> in contract savings — averaging <b>{fmtDollar(Math.round(data.avgPerStop))}/stop/mo</b> for participating locations.
        <br /><br />
        To achieve a <b style={{ color: 'var(--purple)' }}>50% growth target of {fmtDollar(data.target)}/mo</b>, the plan recommends <b style={{ color: 'var(--orange)' }}>{data.totalNewEnrollments} new vendor enrollments</b> across {data.plan.filter((p) => p.stopsToEnroll > 0).length} programs, projected to add <b style={{ color: 'var(--green)' }}>+{fmtDollar(data.totalPlanGain)}/mo</b> (+{fmtDollar(data.totalPlanGain * 12)}/yr).
        {data.plan.length > 0 && (
          <>
            <br /><br /><b>Top 5 Priorities:</b><br />
            {data.plan.slice(0, 5).map((p, i) => (
              <span key={p.vid}>
                &nbsp;&nbsp;<b>{i + 1}.</b> <b>{p.name}</b>
                {presets[p.vid]?.mandatory && <span style={{ color: 'var(--orange)', fontSize: '.82em' }}> ⚠️ Required</span>}
                {' '}— enroll <b>{p.stopsToEnroll}</b> of {p.notEnrolled} unenrolled stops → <b style={{ color: 'var(--green)' }}>+{fmtDollar(p.revenueGain)}/mo</b> (avg {fmtDollar(Math.round(p.avgBen))}/stop)
                <br />
              </span>
            ))}
          </>
        )}
        <br />
        If fully executed, the plan projects <b style={{ color: 'var(--green)' }}>{fmtDollar(data.currentTotal + data.totalPlanGain)}/mo</b> ({fmtDollar((data.currentTotal + data.totalPlanGain) * 12)}/yr) — a <b>+{pctGrowth}%</b> increase.
        If <i>all</i> {data.locs.length} stops enrolled in <i>all</i> available vendor programs, the {data.gsLabel.toLowerCase()} could reach <b style={{ color: 'var(--accent)' }}>{fmtDollar(data.currentTotal + data.totalFullPotential)}/mo</b> ({fmtDollar((data.currentTotal + data.totalFullPotential) * 12)}/yr) — averaging <b>{fmtDollar(Math.round((data.currentTotal + data.totalFullPotential) / Math.max(1, data.locs.length)))}/stop/mo</b>.
      </div>
    </div>
  );
}

function MandatoryNote() {
  return (
    <div style={{ marginTop: 12, background: 'rgba(255,107,53,.06)', border: '1px solid rgba(255,107,53,.2)', borderRadius: 8, padding: 14 }}>
      <div style={{ fontWeight: 700, color: 'var(--orange)', marginBottom: 6 }}>⚠️ New Member Agreement — Mandatory Programs</div>
      <div style={{ fontSize: '.84em', color: 'var(--text)', lineHeight: 1.6 }}>
        New Members are required to participate in a <b>minimum of two</b> of the following Preferred Vendor Partner Programs if criteria is met:
        {' '}<b>Sysco/Entegra</b> (if purchasing $750+/wk foodservice, avg savings $1,120/mo),
        {' '}<b>Coca-Cola</b> (if dispensing Coke fountain with own dispenser, avg savings $120/mo),
        {' '}<b>Farmer Brothers</b> (if using supplier-provided equipment, avg savings $215/mo),
        {' '}<b>Heartland/Global Payments</b> (if 2%+ savings proven, up to $2,500/mo for high-volume).
        Additional recommended programs: <b>Lynco & DAS</b> (C-Store Merchandise), <b>Truck Parking Club</b> (Additional Revenue), <b>Cintas</b> (Uniforms & Facility Services, runs through Entegra).
      </div>
    </div>
  );
}
