import { useMemo, useState } from 'react';
import type { useValuePropsState } from '../../hooks/useValuePropsState';
import { fG } from '../../lib/valuePropsHelpers';

export function AssignmentsTab({ vp }: { vp: ReturnType<typeof useValuePropsState> }) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    const byMgr: Record<string, { count: number; pot: number; win: number; fc: number }> = {};
    for (const v of vp.vps) {
      const m = v.assigned || 'Unassigned';
      if (q && !m.toLowerCase().includes(q)) continue;
      if (!byMgr[m]) byMgr[m] = { count: 0, pot: 0, win: 0, fc: 0 };
      byMgr[m].count++;
      byMgr[m].pot += v.totalPot || 0;
      byMgr[m].win += v.winnable || 0;
      byMgr[m].fc += v.fleetCount || 0;
    }
    return Object.entries(byMgr).sort((a, b) => b[1].pot - a[1].pot);
  }, [vp.vps, search]);

  return (
    <div className="card">
      <div className="card-hdr">Manager Assignments</div>
      <div style={{ padding: 14 }}>
        <div className="vp-search-row">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Manager</th>
                <th style={{ textAlign: 'right' }}>Locations</th>
                <th style={{ textAlign: 'right' }}>Total Potential Gal</th>
                <th style={{ textAlign: 'right' }}>Winnable</th>
                <th style={{ textAlign: 'right' }}>Fleet Matches</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  No assignments yet.
                </td></tr>
              ) : rows.map(([m, d]) => (
                <tr key={m}>
                  <td><b>{m}</b></td>
                  <td className="num">{d.count}</td>
                  <td className="num">{fG(d.pot)}</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{fG(d.win)}</td>
                  <td className="num">{d.fc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
