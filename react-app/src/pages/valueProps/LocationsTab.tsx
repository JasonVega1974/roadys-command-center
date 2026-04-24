import { useEffect, useMemo, useRef, useState } from 'react';
import type { useValuePropsState } from '../../hooks/useValuePropsState';
import { fG } from '../../lib/valuePropsHelpers';
import type { ValueProp } from '../../types/valueProps';
import { EditVPModal } from './EditVPModal';

type Props = {
  vp: ReturnType<typeof useValuePropsState>;
  detailId: string | null;
  setDetailId: (id: string | null) => void;
  gotoCreate: () => void;
};

type ChartCtor = new (el: HTMLCanvasElement, cfg: unknown) => { destroy: () => void };

export function LocationsTab({ vp, detailId, setDetailId, gotoCreate }: Props) {
  const detail = detailId ? vp.vps.find((v) => v.id === detailId) : null;
  if (detail) return <DetailView vp={vp} record={detail} onBack={() => setDetailId(null)} />;
  return <ListView vp={vp} onOpen={setDetailId} gotoCreate={gotoCreate} />;
}

function ListView({
  vp,
  onOpen,
  gotoCreate,
}: {
  vp: ReturnType<typeof useValuePropsState>;
  onOpen: (id: string) => void;
  gotoCreate: () => void;
}) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [rows, setRows] = useState('300');
  const [sort, setSort] = useState<'name' | 'gal-desc' | 'gal-asc' | 'fleets'>('name');
  const [editing, setEditing] = useState<ValueProp | null>(null);

  const states = useMemo(() => {
    return [...new Set(vp.FR.map((r) => r[2]))].filter((s) => s.length === 2).sort();
  }, [vp.FR]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let d = vp.vps.filter((v) => {
      if (q) {
        const hay = [v.name, v.city, v.state, v.assigned || '', v.pos || '', v.siteStatus || '', v.requestedBy || '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (stateFilter && v.state !== stateFilter) return false;
      return true;
    });
    if (sort === 'gal-desc') d.sort((a, b) => (b.totalPot || 0) - (a.totalPot || 0));
    else if (sort === 'gal-asc') d.sort((a, b) => (a.totalPot || 0) - (b.totalPot || 0));
    else if (sort === 'fleets') d.sort((a, b) => (b.fleetCount || 0) - (a.fleetCount || 0));
    else d.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return d;
  }, [vp.vps, search, stateFilter, sort]);

  const limit = rows === '' ? 0 : parseInt(rows, 10) || 0;
  const totalCount = filtered.length;
  const shown = limit > 0 ? filtered.slice(0, limit) : filtered;

  const exportCSV = () => {
    const rowsCsv: string[][] = [[
      'Name', 'City', 'State', 'Assigned', 'Potential Gal', 'Winnable',
      'Agg Potential', 'Fleet Potential', 'Fleet Matches', 'Radius', 'Notes',
    ]];
    vp.vps.forEach((v) => rowsCsv.push([
      v.name, v.city, v.state, v.assigned || '',
      String(v.totalPot || 0), String(v.winnable || 0),
      String(v.aggPot || 0), String(v.fleetPot || 0),
      String(v.fleetCount || 0), String(v.radius || 50), v.notes || '',
    ]));
    const csv = rowsCsv.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'roadys_value_props_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
  };

  return (
    <div>
      <div className="vp-search-row">
        <input
          type="text"
          placeholder="Search locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="">All States</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={rows} onChange={(e) => setRows(e.target.value)}>
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
          <option value="75">75 rows</option>
          <option value="100">100 rows</option>
          <option value="150">150 rows</option>
          <option value="200">200 rows</option>
          <option value="250">250 rows</option>
          <option value="300">300 rows</option>
          <option value="">All</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'gal-desc' | 'gal-asc' | 'fleets')}>
          <option value="name">Sort: Name</option>
          <option value="gal-desc">Potential Gal ↓</option>
          <option value="gal-asc">Potential Gal ↑</option>
          <option value="fleets">Fleet Count ↓</option>
        </select>
        <button className="btn btn-accent" onClick={gotoCreate}>+ New Value Prop</button>
        <button className="btn" onClick={exportCSV}>📥 Export CSV</button>
      </div>
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th>#</th>
              <th>Location</th>
              <th>City/State</th>
              <th>Assigned</th>
              <th>Requested By</th>
              <th>POS</th>
              <th>Site Status</th>
              <th style={{ textAlign: 'right' }}>Potential Gal</th>
              <th style={{ textAlign: 'right' }}>Winnable (20%)</th>
              <th style={{ textAlign: 'right' }}>Fleet Matches</th>
              <th style={{ textAlign: 'right' }}>Fleet Gal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                No locations. Click + Create New to add.
              </td></tr>
            ) : shown.map((v, i) => (
              <tr key={v.id} onClick={() => onOpen(v.id)} style={{ cursor: 'pointer' }}>
                <td className="num" style={{ color: 'var(--dim)' }}>{i + 1}</td>
                <td><b>{v.name}</b></td>
                <td>{v.city}, {v.state}</td>
                <td style={{ fontSize: '.8em' }}>{v.assigned || '—'}</td>
                <td style={{ fontSize: '.8em' }}>{v.requestedBy || '—'}</td>
                <td style={{ fontSize: '.78em' }}>{v.pos || '—'}</td>
                <td style={{ fontSize: '.78em' }}>{v.siteStatus || '—'}</td>
                <td className="num">{fG(v.totalPot || 0)}</td>
                <td className="num" style={{ color: 'var(--green)' }}>{fG(v.winnable || 0)}</td>
                <td className="num">{v.fleetCount || 0}</td>
                <td className="num">{fG(v.fleetPot || 0)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn"
                    title="Edit location"
                    onClick={(e) => { e.stopPropagation(); setEditing(v); }}
                  >✏️</button>
                  <button
                    className="btn"
                    title="Delete location"
                    style={{ color: 'var(--red)', marginLeft: 4 }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm('Delete this value proposition?')) return;
                      await vp.deleteVP(v.id);
                    }}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 0', fontSize: '.75em', color: 'var(--muted)' }}>
        Show rows: {shown.length}{totalCount > shown.length ? ` (${totalCount} total)` : ''}
      </div>
      {editing && (
        <EditVPModal
          vp={editing}
          states={states}
          onCancel={() => setEditing(null)}
          onSave={async (next) => {
            await vp.upsertVP(next);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function DetailView({
  vp,
  record,
  onBack,
}: {
  vp: ReturnType<typeof useValuePropsState>;
  record: ValueProp;
  onBack: () => void;
}) {
  const [rowsLimit, setRowsLimit] = useState(300);
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);

  const fm = record.fleetMatches || [];
  const byFleet = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fm) m[f.fleet] = (m[f.fleet] || 0) + f.gallons;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [fm]);

  useEffect(() => {
    const Chart = (window as unknown as { Chart?: ChartCtor }).Chart;
    if (!Chart) return;
    const charts: Array<{ destroy: () => void }> = [];
    if (donutRef.current) {
      charts.push(
        new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['Aggregator', 'Fleet'],
            datasets: [{
              data: [record.aggPot || 0, record.fleetPot || 0],
              backgroundColor: ['#00d4ff', '#ffd600'],
              borderWidth: 0,
              cutout: '65%',
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { color: '#6B7A99', font: { size: 11 } } } },
          },
        }),
      );
    }
    if (barRef.current && byFleet.length) {
      charts.push(
        new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: byFleet.map((e) => e[0]),
            datasets: [{ data: byFleet.map((e) => e[1]), backgroundColor: '#00d4ff', borderRadius: 3 }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: {
                  color: '#6B7A99',
                  callback: (v: unknown) => (Number(v) >= 1e3 ? (Number(v) / 1e3).toFixed(0) + 'K' : v),
                },
                grid: { color: 'rgba(30,42,69,.5)' },
              },
              y: { ticks: { color: '#E8EDF8', font: { size: 10 } }, grid: { display: false } },
            },
          },
        }),
      );
    }
    return () => {
      for (const c of charts) {
        try { c.destroy(); } catch { /* ignore */ }
      }
    };
  }, [record.id, record.aggPot, record.fleetPot, byFleet]);

  const show = fm.slice(0, rowsLimit);

  return (
    <div>
      <button className="vp-back-link" onClick={onBack}>← Back to All Locations</button>
      <div className="card">
        <div style={{ padding: '16px 18px' }}>
          <h3 style={{ fontSize: '1em', fontWeight: 700, marginBottom: 4 }}>{record.name}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', fontSize: '.78em', color: 'var(--muted)', marginBottom: 12 }}>
            {record.pos && <span>🖥 <b>POS:</b> {record.pos}</span>}
            {record.siteStatus && <span>📍 <b>Status:</b> {record.siteStatus}</span>}
            {record.requestedBy && <span>👤 <b>Requested:</b> {record.requestedBy}</span>}
            {record.requestedDate && <span>📅 {record.requestedDate}</span>}
            {record.notes && <span>📝 {record.notes}</span>}
          </div>
          <div className="vp-kpis">
            <div className="vp-kpi k-yellow">
              <div className="vp-kpi-label">Potential Gallons</div>
              <div className="vp-kpi-val">{fG(record.totalPot || 0)}</div>
            </div>
            <div className="vp-kpi k-green">
              <div className="vp-kpi-label">Winnable (20%)</div>
              <div className="vp-kpi-val">{fG(record.winnable || 0)}</div>
            </div>
            <div className="vp-kpi k-cyan">
              <div className="vp-kpi-label">Agg Potential</div>
              <div className="vp-kpi-val">{fG(record.aggPot || 0)}</div>
            </div>
            <div className="vp-kpi k-purple">
              <div className="vp-kpi-label">Fleet Potential</div>
              <div className="vp-kpi-val">{fG(record.fleetPot || 0)}</div>
            </div>
          </div>
          <div className="vp-charts-grid">
            <div className="vp-chart-box">
              <div className="card-hdr" style={{ padding: 0, border: 0, marginBottom: 10 }}>Gallon Breakdown</div>
              <div className="vp-chart-wrap"><canvas ref={donutRef} /></div>
            </div>
            <div className="vp-chart-box">
              <div className="card-hdr" style={{ padding: 0, border: 0, marginBottom: 10 }}>Top Fleets by Raw Gallons</div>
              <div className="vp-chart-wrap"><canvas ref={barRef} /></div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.8em', color: 'var(--muted)' }}>Show rows:</span>
            <select
              value={String(rowsLimit)}
              onChange={(e) => setRowsLimit(parseInt(e.target.value, 10))}
              className="inp"
              style={{ padding: '4px 8px', fontSize: '.8em' }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="300">300</option>
            </select>
            <span style={{ fontSize: '.75em', color: 'var(--muted)' }}>({fm.length} total)</span>
            <button
              className="btn"
              style={{ marginLeft: 'auto', color: 'var(--red)' }}
              onClick={async () => {
                if (!confirm('Delete this value proposition?')) return;
                const ok = await vp.deleteVP(record.id);
                if (ok) onBack();
              }}
            >🗑 Delete</button>
          </div>
          <div className="dt-wrap" style={{ marginTop: 10 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fleet Within {record.radius || 50} Mile Radius</th>
                  <th>City/State</th>
                  <th style={{ textAlign: 'right' }}>Raw Gallons</th>
                </tr>
              </thead>
              <tbody>
                {show.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No fleet matches.</td></tr>
                ) : show.map((m, i) => (
                  <tr key={i}>
                    <td className="num" style={{ color: 'var(--dim)' }}>{i + 1}</td>
                    <td><b>{m.fleet}</b></td>
                    <td>
                      {m.city}, {m.state}
                      {' '}
                      <span style={{ color: 'var(--yellow)', fontSize: '.75em', marginLeft: 6 }}>
                        {m.dist ?? '?'} mi
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 600, color: 'var(--accent)' }}>{fG(m.gallons)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
