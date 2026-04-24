import { useMemo, useState } from 'react';
import { MEMBERS } from '../../data/vendors';
import {
  estContractSav,
  fmtDollar,
  getManager,
  getRegionColor,
  stopName,
  vendorName,
} from '../../lib/vendorHelpers';
import type { useVendorsState } from '../../hooks/useVendorsState';

type Props = { vendors: ReturnType<typeof useVendorsState> };

type MemberLite = { id: string; name: string; city: string; state: string };

export function AnalyticsTab({ vendors }: Props) {
  const { roi, defaults } = vendors;
  const [stopQuery, setStopQuery] = useState('');

  const vendorRows = useMemo(() => {
    const map: Record<string, { spend: number[]; rebate: number[]; estSav: number[]; stops: Set<string> }> = {};
    for (const r of roi) {
      if (!map[r.vendor_id]) map[r.vendor_id] = { spend: [], rebate: [], estSav: [], stops: new Set() };
      map[r.vendor_id].spend.push(+r.monthly_spend || 0);
      map[r.vendor_id].rebate.push(+r.rebate_amount || 0);
      map[r.vendor_id].estSav.push(estContractSav(r, defaults));
      map[r.vendor_id].stops.add(r.stop_id);
    }
    return Object.entries(map)
      .map(([vid, d]) => {
        const n = d.spend.length;
        const totReb = d.rebate.reduce((a, b) => a + b, 0);
        const totEst = d.estSav.reduce((a, b) => a + b, 0);
        return {
          vid,
          name: vendorName(vid),
          stops: d.stops.size,
          avgSpend: n ? d.spend.reduce((a, b) => a + b, 0) / n : 0,
          avgReb: n ? totReb / n : 0,
          avgEst: n ? totEst / n : 0,
          totBen: totReb + totEst,
        };
      })
      .sort((a, b) => b.totBen - a.totBen);
  }, [roi, defaults]);

  const vendorTotals = useMemo(() => {
    if (!roi.length) return null;
    const totReb = roi.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
    const totEst = roi.reduce((s, r) => s + estContractSav(r, defaults), 0);
    const totSpend = roi.reduce((s, r) => s + (+r.monthly_spend || 0), 0);
    const n = roi.length;
    const avgSpend = totSpend / n;
    const avgReb = totReb / n;
    const avgEst = totEst / n;
    const avgBen = avgReb + avgEst;
    const roiPct = avgSpend ? (avgBen / avgSpend) * 100 : null;
    const stops = new Set(roi.map((r) => r.stop_id)).size;
    return { totReb, totEst, totSpend, n, avgSpend, avgReb, avgEst, avgBen, roiPct, stops };
  }, [roi, defaults]);

  const stopRows = useMemo(() => {
    const sm: Record<string, { spend: number; reb: number; estSav: number; vn: Set<string> }> = {};
    for (const r of roi) {
      if (!sm[r.stop_id]) sm[r.stop_id] = { spend: 0, reb: 0, estSav: 0, vn: new Set() };
      sm[r.stop_id].spend += +r.monthly_spend || 0;
      sm[r.stop_id].reb += +r.rebate_amount || 0;
      sm[r.stop_id].estSav += estContractSav(r, defaults);
      sm[r.stop_id].vn.add(r.vendor_id);
    }
    const members = MEMBERS as MemberLite[];
    let out = Object.entries(sm).map(([sid, d]) => {
      const mb = members.find((x) => x.id === sid);
      const ben = d.reb + d.estSav;
      const gs = getManager(mb?.state || '');
      return {
        sid,
        name: stopName(sid),
        city: mb?.city || '',
        state: mb?.state || '',
        gs,
        gsC: getRegionColor(gs),
        vn: d.vn.size,
        spend: d.spend,
        reb: d.reb,
        estSav: d.estSav,
        ben,
      };
    }).sort((a, b) => b.ben - a.ben);
    const q = stopQuery.toLowerCase();
    if (q) out = out.filter((s) => [s.name, s.sid, s.city, s.state].some((v) => v.toLowerCase().includes(q)));
    return out;
  }, [roi, defaults, stopQuery]);

  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">ROI Analytics</div>
        <span className="badge badge-accent">Vendor & Stop rollups</span>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-hdr">
          <div className="panel-title">By Vendor</div>
          <div className="panel-spacer" />
          <span className="muted" style={{ fontSize: '.78em' }}>{vendorRows.length} programs</span>
        </div>
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Vendor</th>
                <th style={{ textAlign: 'center' }}># Stops</th>
                <th style={{ textAlign: 'right' }}>Avg Spend/Mo</th>
                <th style={{ textAlign: 'right' }}>Avg Rebate/Mo</th>
                <th style={{ textAlign: 'right' }}>Avg Est. Savings/Mo</th>
                <th style={{ textAlign: 'right' }}>Avg Benefit/Mo (ROI%)</th>
                <th style={{ textAlign: 'right' }}>Network Total/Mo</th>
                <th style={{ textAlign: 'right' }}>Est. Annual</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map((v) => {
                const avgBen = v.avgReb + v.avgEst;
                const roiPct = v.avgSpend ? ((avgBen / v.avgSpend) * 100).toFixed(1) : '—';
                return (
                  <tr key={v.vid}>
                    <td><b>{v.name}</b> <span style={{ fontSize: '.68em', color: 'var(--muted)' }}>{v.vid}</span></td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{v.stops}</td>
                    <td style={{ textAlign: 'right' }}>{fmtDollar(v.avgSpend)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmtDollar(v.avgReb)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>
                      {v.avgEst ? <>{fmtDollar(v.avgEst)} <span style={{ fontSize: '.6em', color: 'var(--dim)' }}>Est.</span></> : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>
                      {fmtDollar(avgBen)} <span style={{ fontSize: '.72em', color: 'var(--muted)' }}>({roiPct}%)</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtDollar(v.totBen)}</td>
                    <td style={{ textAlign: 'right', fontSize: '.85em' }}>
                      {fmtDollar(v.totBen * 12)} <span style={{ fontSize: '.6em', color: 'var(--dim)' }}>Est.</span>
                    </td>
                  </tr>
                );
              })}
              {vendorTotals && (
                <tr style={{ background: 'rgba(0,214,143,.06)' }}>
                  <td style={{ borderTop: '2px solid var(--green)', fontWeight: 800 }}>ALL PROGRAMS</td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'center', fontWeight: 700 }}>{vendorTotals.stops}</td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'right', fontWeight: 700 }}>{fmtDollar(vendorTotals.avgSpend)}</td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{fmtDollar(vendorTotals.avgReb)}</td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{fmtDollar(vendorTotals.avgEst)}</td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'right', color: 'var(--green)', fontWeight: 800 }}>
                    {fmtDollar(vendorTotals.avgBen)} <span style={{ fontSize: '.72em' }}>({vendorTotals.roiPct != null ? vendorTotals.roiPct.toFixed(1) : '—'}%)</span>
                  </td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'right', fontWeight: 800 }}>{fmtDollar(vendorTotals.totReb + vendorTotals.totEst)}</td>
                  <td style={{ borderTop: '2px solid var(--green)', textAlign: 'right', fontWeight: 800 }}>{fmtDollar((vendorTotals.totReb + vendorTotals.totEst) * 12)}</td>
                </tr>
              )}
              {!vendorRows.length && (
                <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No ROI data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-hdr">
          <div className="panel-title">By Truck Stop</div>
          <input
            className="inp"
            placeholder="Search stop, city, state…"
            value={stopQuery}
            onChange={(e) => setStopQuery(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <div className="panel-spacer" />
          <span className="muted" style={{ fontSize: '.78em' }}>{stopRows.length} stops</span>
        </div>
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Truck Stop</th>
                <th>Location</th>
                <th>GS</th>
                <th style={{ textAlign: 'center' }}># Vendors</th>
                <th style={{ textAlign: 'right' }}>$ Spend/Mo</th>
                <th style={{ textAlign: 'right' }}>Rebate $/Mo</th>
                <th style={{ textAlign: 'right' }}>Est. Savings/Mo</th>
                <th style={{ textAlign: 'right' }}>Total Benefit/Mo</th>
                <th style={{ textAlign: 'right' }}>Est. Annual</th>
              </tr>
            </thead>
            <tbody>
              {stopRows.map((s) => {
                const roiPct = s.spend ? ((s.ben / s.spend) * 100).toFixed(1) : '—';
                return (
                  <tr key={s.sid}>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: '.82em' }}>{s.name}</span>{' '}
                      <span style={{ fontSize: '.66em', color: 'var(--muted)' }}>{s.sid}</span>
                    </td>
                    <td style={{ fontSize: '.8em' }}>{s.city}, {s.state}</td>
                    <td><span style={{ color: s.gsC, fontWeight: 600, fontSize: '.78em' }}>{s.gs}</span></td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.vn}</td>
                    <td style={{ textAlign: 'right' }}>{fmtDollar(s.spend)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{fmtDollar(s.reb)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>
                      {s.estSav ? <>{fmtDollar(s.estSav)} <span style={{ fontSize: '.6em', color: 'var(--dim)' }}>Est.</span></> : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>
                      {fmtDollar(s.ben)} <span style={{ fontSize: '.7em', color: 'var(--muted)' }}>({roiPct}%)</span>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '.85em' }}>
                      {fmtDollar(s.ben * 12)} <span style={{ fontSize: '.6em', color: 'var(--dim)' }}>Est.</span>
                    </td>
                  </tr>
                );
              })}
              {!stopRows.length && (
                <tr><td colSpan={9} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
