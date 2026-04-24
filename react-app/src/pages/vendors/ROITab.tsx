import { useMemo, useRef, useState } from 'react';
import { MEMBERS, MOS, ROI_DEFAULT_VENDOR_PRESETS, VP_TOP10_LIST, VP_VENDORS } from '../../data/vendors';
import {
  downloadCSV,
  estContractSav,
  fmtDollar,
  getManager,
  getRegionColor,
  parseCSVRow,
  vendorName,
  stopName,
} from '../../lib/vendorHelpers';
import type { useVendorsState } from '../../hooks/useVendorsState';
import type { Member, ROIRecord, Vendor } from '../../types/vendors';

type Props = { vendors: ReturnType<typeof useVendorsState> };
type SortCol = 'name' | 'location' | 'gs' | 'vendors' | 'spend' | 'rebate' | 'savings' | 'benefit' | 'ytd' | 'l12';

const PER_PAGE = 50;

export function ROITab({ vendors }: Props) {
  const { roi, defaults, upsertROI, deleteROI, bulkUpsertROI, setVendorDefault } = vendors;
  const [autoFill, setAutoFill] = useState(false);
  const [q, setQ] = useState('');
  const [vf, setVf] = useState<'all' | string>('all');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAdd, setShowAdd] = useState(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const month = (MOS as string[]).find((m) => m.startsWith(String(currentYear))) || (MOS as string[])[0];
  const yr = month.split('-')[0];
  const moNum = +month.split('-')[1] || 4;
  const mi = (MOS as string[]).indexOf(month);
  let ytdMo = mi >= 0 ? (MOS as string[]).slice(0, mi + 1).filter((x) => x.startsWith(yr)).length : moNum;
  if (!ytdMo) ytdMo = moNum;

  const totalSpend = roi.reduce((s, r) => s + (+r.monthly_spend || 0), 0);
  const totalReb = roi.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
  const totalSav = roi.reduce((s, r) => s + (+r.cost_savings || 0), 0);
  const totalEst = roi.reduce((s, r) => s + estContractSav(r, defaults), 0);
  const totalBen = totalReb + totalSav + totalEst;
  const uStops = new Set(roi.map((r) => r.stop_id)).size;
  const uVendors = new Set(roi.map((r) => r.vendor_id)).size;
  const roiPct = totalSpend ? (totalBen / totalSpend) * 100 : 0;

  const stops = useMemo(() => {
    const allStops = (MEMBERS as Member[]).filter((mb) => mb.status === 'active' && mb.id);
    const roiByStop: Record<string, Array<ROIRecord & { idx: number }>> = {};
    roi.forEach((r, idx) => {
      if (!roiByStop[r.stop_id]) roiByStop[r.stop_id] = [];
      roiByStop[r.stop_id].push({ ...r, idx });
    });
    let out = allStops.map((mb) => {
      const recs = roiByStop[mb.id] || [];
      const spend = recs.reduce((s, r) => s + (+r.monthly_spend || 0), 0);
      const reb = recs.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
      const estSav = recs.reduce((s, r) => s + estContractSav(r, defaults), 0);
      const ben = reb + estSav;
      const ytd = Math.round(ben * ytdMo * 100) / 100;
      const l12 = Math.round(ben * 12 * 100) / 100;
      return { mb, recs, vendorCount: recs.length, spend, reb, estSav, ben, ytd, l12 };
    });
    if (vf !== 'all') out = out.filter((s) => s.recs.some((r) => r.vendor_id === vf));
    if (q) {
      const ql = q.toLowerCase();
      out = out.filter((s) => [s.mb.name, s.mb.id, s.mb.city, s.mb.state].some((v) => (v || '').toLowerCase().includes(ql)));
    }
    out.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortCol === 'name') { va = (a.mb.name || '').toLowerCase(); vb = (b.mb.name || '').toLowerCase(); }
      else if (sortCol === 'location') { va = (a.mb.city || '') + ',' + (a.mb.state || ''); vb = (b.mb.city || '') + ',' + (b.mb.state || ''); }
      else if (sortCol === 'gs') { va = getManager(a.mb.state || ''); vb = getManager(b.mb.state || ''); }
      else if (sortCol === 'vendors') { va = a.vendorCount; vb = b.vendorCount; }
      else if (sortCol === 'spend') { va = a.spend; vb = b.spend; }
      else if (sortCol === 'rebate') { va = a.reb; vb = b.reb; }
      else if (sortCol === 'savings') { va = a.estSav; vb = b.estSav; }
      else if (sortCol === 'benefit') { va = a.ben; vb = b.ben; }
      else if (sortCol === 'ytd') { va = a.ytd; vb = b.ytd; }
      else { va = a.l12; vb = b.l12; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return out;
  }, [roi, defaults, vf, q, sortCol, sortDir, ytdMo]);

  const totalPages = Math.max(1, Math.ceil(stops.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStops = stops.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  const vendorOpts = useMemo(() => {
    const map = new Map<string, string>();
    (VP_TOP10_LIST as { id: string; name: string }[]).forEach((v) => map.set(v.id, v.name));
    roi.forEach((r) => { if (!map.has(r.vendor_id)) map.set(r.vendor_id, vendorName(r.vendor_id)); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [roi]);

  function onSort(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc'); setPage(0); }
  }
  const arrow = (col: SortCol) => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  function onExport() {
    if (!roi.length) { alert('No ROI data.'); return; }
    const header = ['stop_id', 'stop_name', 'vendor_id', 'vendor_name', 'monthly_spend', 'rebate_pct', 'rebate_amount', 'savings_pct', 'cost_savings', 'total_benefit'];
    const out = roi.map((r) => [
      r.stop_id,
      stopName(r.stop_id),
      r.vendor_id,
      vendorName(r.vendor_id),
      r.monthly_spend,
      r.rebate_pct || '',
      r.rebate_amount,
      r.savings_pct || '',
      r.cost_savings,
      (+r.rebate_amount || 0) + (+r.cost_savings || 0),
    ]);
    downloadCSV('Roadys_Vendor_ROI_' + new Date().toISOString().slice(0, 10) + '.csv', header, out);
  }

  function onUpload(file: File) {
    setStatus({ kind: 'info', text: 'Parsing…' });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) { setStatus({ kind: 'err', text: 'Need header + data.' }); return; }
        const h = parseCSVRow(lines[0]).map((x) => x.toLowerCase().replace(/['"]/g, ''));
        const aliases: Record<string, string[]> = {
          stop_id: ['stop_id', 'stopid', 'id', 'member_id'],
          vendor_id: ['vendor_id', 'vendorid', 'vendor', 'vendor_name'],
          monthly_spend: ['monthly_spend', 'spend', 'invoice', 'monthly_cost', 'cost'],
          rebate_pct: ['rebate_pct', 'rebate_percent', 'rebate_%'],
          rebate_amount: ['rebate_amount', 'rebate', 'rebate_dollars'],
          rebate_desc: ['rebate_desc', 'rebate_description', 'description'],
          savings_pct: ['savings_pct', 'savings_percent', 'savings_%'],
          cost_savings: ['cost_savings', 'savings', 'saving'],
        };
        const cm: Record<string, number> = {};
        for (const [f, names] of Object.entries(aliases)) {
          const i = h.findIndex((x) => names.includes(x));
          if (i !== -1) cm[f] = i;
        }
        if (cm.stop_id === undefined) { setStatus({ kind: 'err', text: 'Missing stop_id column.' }); return; }
        if (cm.vendor_id === undefined) { setStatus({ kind: 'err', text: 'Missing vendor_id column.' }); return; }
        const vnL: Record<string, string> = {};
        [...(VP_VENDORS as Vendor[]), ...(VP_TOP10_LIST as { id: string; name: string }[])].forEach((v) => {
          vnL[v.name.toLowerCase()] = v.id; vnL[v.id.toLowerCase()] = v.id;
        });
        let imp = 0, skip = 0;
        const newRows: ROIRecord[] = [];
        lines.slice(1).forEach((l) => {
          const c = parseCSVRow(l);
          const sid = (c[cm.stop_id] || '').toUpperCase();
          let vid = (c[cm.vendor_id] || '').trim();
          if (!sid || !vid) { skip++; return; }
          vid = vnL[vid.toLowerCase()] || vid;
          const spend = parseFloat(c[cm.monthly_spend]) || 0;
          let rpct = cm.rebate_pct !== undefined ? parseFloat(c[cm.rebate_pct]) || 0 : 0;
          let ramt = cm.rebate_amount !== undefined ? parseFloat(c[cm.rebate_amount]) || 0 : 0;
          let spct = cm.savings_pct !== undefined ? parseFloat(c[cm.savings_pct]) || 0 : 0;
          let samt = cm.cost_savings !== undefined ? parseFloat(c[cm.cost_savings]) || 0 : 0;
          if (rpct && !ramt) ramt = (spend * rpct) / 100;
          if (!rpct && ramt && spend) rpct = (ramt / spend) * 100;
          if (spct && !samt) samt = (spend * spct) / 100;
          if (!spct && samt && spend) spct = (samt / spend) * 100;
          newRows.push({
            stop_id: sid,
            vendor_id: vid,
            monthly_spend: spend,
            rebate_pct: rpct,
            rebate_amount: Math.round(ramt * 100) / 100,
            savings_pct: spct,
            cost_savings: Math.round(samt * 100) / 100,
            rebate_desc: cm.rebate_desc !== undefined ? c[cm.rebate_desc] || '' : '',
          });
          imp++;
        });
        bulkUpsertROI(newRows);
        setStatus({ kind: 'ok', text: `Imported ${imp} ROI records${skip ? ' (' + skip + ' skipped)' : ''}` });
      } catch (err) {
        setStatus({ kind: 'err', text: (err as Error).message });
      }
    };
    reader.readAsText(file);
  }

  function editRec(idx: number, patch: Partial<ROIRecord>) {
    const r = roi[idx];
    if (!r) return;
    const next: ROIRecord = { ...r, ...patch };
    // Re-compute the other side of each pair when one side changes.
    if ('monthly_spend' in patch) {
      if (next.rebate_pct) next.rebate_amount = Math.round((next.monthly_spend * next.rebate_pct) / 100 * 100) / 100;
      if (next.savings_pct) next.cost_savings = Math.round((next.monthly_spend * next.savings_pct) / 100 * 100) / 100;
    } else if ('rebate_pct' in patch) {
      next.rebate_amount = Math.round((next.monthly_spend * next.rebate_pct) / 100 * 100) / 100;
    } else if ('rebate_amount' in patch) {
      next.rebate_pct = next.monthly_spend ? Math.round((next.rebate_amount / next.monthly_spend) * 10000) / 100 : 0;
    } else if ('savings_pct' in patch) {
      next.cost_savings = Math.round((next.monthly_spend * next.savings_pct) / 100 * 100) / 100;
    } else if ('cost_savings' in patch) {
      next.savings_pct = next.monthly_spend ? Math.round((next.cost_savings / next.monthly_spend) * 10000) / 100 : 0;
    }
    upsertROI(next);
  }

  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">ROI Tracker</div>
      </div>

      <div className="kpi-grid">
        <div className="kc"><div className="kc-label">$ Spend/Mo</div><div className="kc-val">{fmtDollar(totalSpend)}</div><div className="kc-sub">{roi.length} records · {uStops} stops · {uVendors} vendors</div></div>
        <div className="kc kc-green"><div className="kc-label">Rebate $/Mo</div><div className="kc-val">{fmtDollar(totalReb)}</div><div className="kc-sub">Avg {fmtDollar(uStops ? totalReb / uStops : 0)}/stop</div></div>
        <div className="kc kc-accent"><div className="kc-label">$ Savings/Mo</div><div className="kc-val">{fmtDollar(totalSav + totalEst)}</div><div className="kc-sub">Avg {fmtDollar(uStops ? (totalSav + totalEst) / uStops : 0)}/stop</div></div>
        <div className="kc kc-green"><div className="kc-label">Avg Benefit/Mo</div><div className="kc-val">{fmtDollar(totalBen)}</div><div className="kc-sub">ROI: {roiPct.toFixed(1)}%</div></div>
      </div>

      <div className="panel">
        <div className="panel-hdr">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoFill} onChange={(e) => setAutoFill(e.target.checked)} />
            <span style={{ fontWeight: 700, color: autoFill ? 'var(--green)' : 'var(--muted)' }}>Auto-Fill Vendor Defaults: {autoFill ? 'ON' : 'OFF'}</span>
          </label>
        </div>
        {autoFill && <VendorDefaultsTable defaults={defaults} setVendorDefault={setVendorDefault} />}
      </div>

      <div className="panel">
        <div className="panel-hdr">
          <div className="panel-title">💰 ROI Detail</div>
          <input className="inp" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ minWidth: 180 }} />
          <select value={vf} onChange={(e) => { setVf(e.target.value); setPage(0); }}>
            <option value="all">All Vendors</option>
            {vendorOpts.map(([vid, name]) => <option key={vid} value={vid}>{name}</option>)}
          </select>
          <div className="panel-spacer" />
          <span className="muted" style={{ fontSize: '.78em' }}>{stops.length} stops · Page {safePage + 1}/{totalPages}</span>
          <button className="btn btn-accent" onClick={() => setShowAdd(true)}>＋ Add Record</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>📤 Import CSV</button>
          <button className="btn btn-green" onClick={onExport}>⬇ Export</button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </div>
        {status && (
          <div style={{ padding: '6px 16px', fontSize: '.82em', color: status.kind === 'err' ? 'var(--red)' : status.kind === 'ok' ? 'var(--green)' : 'var(--muted)' }}>{status.text}</div>
        )}
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th onClick={() => onSort('name')}>Truck Stop{arrow('name')}</th>
                <th onClick={() => onSort('location')}>Location{arrow('location')}</th>
                <th onClick={() => onSort('gs')}>GS{arrow('gs')}</th>
                <th onClick={() => onSort('vendors')} style={{ textAlign: 'center' }}># Vendors{arrow('vendors')}</th>
                <th onClick={() => onSort('spend')} style={{ textAlign: 'right' }}>$ Spend/Mo{arrow('spend')}</th>
                <th onClick={() => onSort('rebate')} style={{ textAlign: 'right' }}>Rebate $/Mo{arrow('rebate')}</th>
                <th onClick={() => onSort('savings')} style={{ textAlign: 'right' }}>Est. Savings/Mo{arrow('savings')}</th>
                <th onClick={() => onSort('benefit')} style={{ textAlign: 'right' }}>Total Benefit/Mo{arrow('benefit')}</th>
                <th onClick={() => onSort('ytd')} style={{ textAlign: 'right' }}>Est. YTD {yr}{arrow('ytd')}</th>
                <th onClick={() => onSort('l12')} style={{ textAlign: 'right' }}>Est. Last 12{arrow('l12')}</th>
              </tr>
            </thead>
            <tbody>
              {pageStops.map((s) => {
                const sid = s.mb.id;
                const gs = getManager(s.mb.state || '');
                const gc = getRegionColor(gs);
                const isOpen = !!expanded[sid];
                return (
                  <>
                    <tr key={sid} onClick={() => setExpanded((p) => ({ ...p, [sid]: !p[sid] }))} style={{ cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center' }}><span className="accent" style={{ fontWeight: 700 }}>{isOpen ? '－' : '＋'}</span></td>
                      <td><b>{s.mb.name}</b><br /><span style={{ fontSize: '.64em', color: 'var(--muted)' }}>{sid}</span></td>
                      <td style={{ fontSize: '.78em' }}>{s.mb.city || '—'}, {s.mb.state || '—'}</td>
                      <td><span style={{ color: gc, fontWeight: 600, fontSize: '.78em' }}>{gs}</span></td>
                      <td style={{ textAlign: 'center' }}>{s.vendorCount > 0 ? <span style={{ background: 'rgba(0,214,143,.15)', color: 'var(--green)', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{s.vendorCount}</span> : <span className="dim">0</span>}</td>
                      <td className="num">{s.spend ? fmtDollar(s.spend) : '—'}</td>
                      <td className="num green" style={{ fontWeight: 600 }}>{s.reb ? fmtDollar(s.reb) : '—'}</td>
                      <td className="num accent">{s.estSav ? fmtDollar(s.estSav) : '—'}</td>
                      <td className="num" style={{ color: s.ben > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>{s.ben ? fmtDollar(s.ben) : '—'}</td>
                      <td className="num">{s.ytd ? fmtDollar(s.ytd) : '—'}</td>
                      <td className="num">{s.l12 ? fmtDollar(s.l12) : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr key={sid + '-sub'}>
                        <td colSpan={11} style={{ padding: 0 }}>
                          <div style={{ background: 'rgba(0,0,0,.2)', padding: '8px 12px' }}>
                            <VendorSubRows
                              stop={s.mb}
                              recs={s.recs}
                              autoFill={autoFill}
                              defaults={defaults}
                              onEdit={editRec}
                              onDelete={(r) => { if (confirm('Delete this ROI record?')) deleteROI(r.stop_id, r.vendor_id); }}
                              onSave={(row) => upsertROI(row)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {!pageStops.length && (
                <tr><td colSpan={11} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No data.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ padding: 10, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button className="btn" disabled={safePage === 0} onClick={() => setPage(0)}>⏮</button>
            <button className="btn" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>◀ Prev</button>
            <span style={{ margin: '0 10px', fontSize: '.82em', color: 'var(--muted)' }}>Page {safePage + 1} of {totalPages} · {stops.length} stops</span>
            <button className="btn" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next ▶</button>
            <button className="btn" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>⏭</button>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddRecordModal
          defaults={defaults}
          autoFill={autoFill}
          onCancel={() => setShowAdd(false)}
          onSave={(r) => { upsertROI(r); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

function VendorDefaultsTable({
  defaults,
  setVendorDefault,
}: {
  defaults: ReturnType<typeof useVendorsState>['defaults'];
  setVendorDefault: ReturnType<typeof useVendorsState>['setVendorDefault'];
}) {
  return (
    <div className="dt-wrap">
      <table className="dt">
        <thead>
          <tr>
            <th>Vendor Program</th>
            <th>Program Savings Info</th>
            <th style={{ textAlign: 'right' }}>Default % Contract Savings</th>
            <th style={{ textAlign: 'right' }}>Default Rebate $</th>
          </tr>
        </thead>
        <tbody>
          {(VP_TOP10_LIST as { id: string; name: string }[]).map((v) => {
            const d = defaults[v.id] || { pct: 0, rebate: 0 };
            const preset = (ROI_DEFAULT_VENDOR_PRESETS as Record<string, { label?: string }>)[v.id];
            const info = preset?.label || 'No data';
            return (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{v.name}</td>
                <td style={{ fontSize: '.78em', color: 'var(--muted)', maxWidth: 320 }}>{info}</td>
                <td style={{ textAlign: 'right' }}>
                  <input className="inp" type="number" step="0.1" value={d.pct || ''} placeholder="%" style={{ width: 70, textAlign: 'right', color: 'var(--green)', fontWeight: 600 }} onChange={(e) => setVendorDefault(v.id, { pct: parseFloat(e.target.value) || 0, rebate: d.rebate || 0 })} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input className="inp" type="number" value={d.rebate || ''} placeholder="$0" style={{ width: 80, textAlign: 'right', color: 'var(--green)', fontWeight: 700 }} onChange={(e) => setVendorDefault(v.id, { pct: d.pct || 0, rebate: parseFloat(e.target.value) || 0 })} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VendorSubRows({
  stop,
  recs,
  autoFill,
  defaults,
  onEdit,
  onDelete,
  onSave,
}: {
  stop: Member;
  recs: Array<ROIRecord & { idx: number }>;
  autoFill: boolean;
  defaults: ReturnType<typeof useVendorsState>['defaults'];
  onEdit: (idx: number, patch: Partial<ROIRecord>) => void;
  onDelete: (r: ROIRecord) => void;
  onSave: (r: ROIRecord) => void;
}) {
  const existing = new Set(recs.map((r) => r.vendor_id));
  const subTh: React.CSSProperties = { fontSize: '.66em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 6px', borderBottom: '1px solid var(--border2)' };
  const subTd: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,.04)' };
  const inpStyle: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '3px 4px', borderRadius: 4, fontSize: '.78em', textAlign: 'right' };
  const [draft, setDraft] = useState<Record<string, { spend: string; rpct: string; ramt: string; spct: string; samt: string }>>({});

  function getDraft(vid: string) {
    const vd = autoFill ? defaults[vid] || { pct: 0, rebate: 0 } : { pct: 0, rebate: 0 };
    return draft[vid] || { spend: '', rpct: vd.pct ? String(vd.pct) : '', ramt: vd.rebate ? String(vd.rebate) : '', spct: '', samt: '' };
  }
  function setField(vid: string, field: keyof ReturnType<typeof getDraft>, val: string) {
    setDraft((d) => {
      const cur = d[vid] || getDraft(vid);
      const next = { ...cur, [field]: val };
      // When spend or %'s change, recompute $'s.
      const spend = parseFloat(next.spend) || 0;
      const rpct = parseFloat(next.rpct) || 0;
      const spct = parseFloat(next.spct) || 0;
      if (field === 'spend' || field === 'rpct') next.ramt = spend && rpct ? String(Math.round((spend * rpct) / 100 * 100) / 100) : '';
      if (field === 'spend' || field === 'spct') next.samt = spend && spct ? String(Math.round((spend * spct) / 100 * 100) / 100) : '';
      if (field === 'ramt') {
        const amt = parseFloat(val) || 0;
        next.rpct = spend ? ((amt / spend) * 100).toFixed(1) : '';
      }
      if (field === 'samt') {
        const amt = parseFloat(val) || 0;
        next.spct = spend ? ((amt / spend) * 100).toFixed(1) : '';
      }
      return { ...d, [vid]: next };
    });
  }
  function saveBlank(vid: string) {
    const d = getDraft(vid);
    const spend = parseFloat(d.spend) || 0;
    const rpct = parseFloat(d.rpct) || 0;
    const ramt = parseFloat(d.ramt) || (spend && rpct ? (spend * rpct) / 100 : 0);
    const spct = parseFloat(d.spct) || 0;
    const samt = parseFloat(d.samt) || (spend && spct ? (spend * spct) / 100 : 0);
    if (!spend && !ramt && !samt) { alert('Enter at least a spend amount or savings value.'); return; }
    onSave({
      stop_id: stop.id, vendor_id: vid, monthly_spend: spend,
      rebate_pct: rpct, rebate_amount: Math.round(ramt * 100) / 100,
      savings_pct: spct, cost_savings: Math.round(samt * 100) / 100, rebate_desc: '',
    });
    setDraft((prev) => { const n = { ...prev }; delete n[vid]; return n; });
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }} onClick={(e) => e.stopPropagation()}>
      <thead>
        <tr>
          <th style={subTh}>Vendor Program</th>
          <th style={{ ...subTh, textAlign: 'right' }}>$ Spend/Mo</th>
          <th style={{ ...subTh, textAlign: 'right' }}>% Contract</th>
          <th style={{ ...subTh, textAlign: 'right' }}>Rebate $</th>
          <th style={{ ...subTh, textAlign: 'right' }}>% Add'l</th>
          <th style={{ ...subTh, textAlign: 'right' }}>$ Savings/Mo</th>
          <th style={{ ...subTh, textAlign: 'center', width: 40 }}>Act</th>
        </tr>
      </thead>
      <tbody>
        {recs.map((r) => (
          <tr key={r.vendor_id}>
            <td style={subTd}><span className="accent" style={{ fontWeight: 600 }}>{vendorName(r.vendor_id)}</span></td>
            <td style={subTd}><input type="number" value={r.monthly_spend || 0} onChange={(e) => onEdit(r.idx, { monthly_spend: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 80 }} /></td>
            <td style={subTd}><input type="number" step="0.1" value={r.rebate_pct ? r.rebate_pct.toFixed(1) : ''} placeholder="%" onChange={(e) => onEdit(r.idx, { rebate_pct: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 55, color: 'var(--green)' }} /></td>
            <td style={subTd}><input type="number" value={r.rebate_amount || 0} onChange={(e) => onEdit(r.idx, { rebate_amount: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 75, color: 'var(--green)', fontWeight: 600 }} /></td>
            <td style={subTd}><input type="number" step="0.1" value={r.savings_pct ? r.savings_pct.toFixed(1) : ''} placeholder="%" onChange={(e) => onEdit(r.idx, { savings_pct: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 55, color: 'var(--accent)' }} /></td>
            <td style={subTd}><input type="number" value={r.cost_savings || 0} onChange={(e) => onEdit(r.idx, { cost_savings: parseFloat(e.target.value) || 0 })} style={{ ...inpStyle, width: 75, color: 'var(--accent)' }} /></td>
            <td style={{ ...subTd, textAlign: 'center' }}><button onClick={(e) => { e.stopPropagation(); onDelete(r); }} style={{ background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.3)', color: 'var(--red)', borderRadius: 4, padding: '2px 6px', fontSize: '.68em', cursor: 'pointer', fontWeight: 700 }}>✕</button></td>
          </tr>
        ))}
        {(VP_TOP10_LIST as { id: string; name: string }[])
          .filter((v) => !existing.has(v.id))
          .map((v) => {
            const d = getDraft(v.id);
            return (
              <tr key={'blank-' + v.id} style={{ opacity: 0.6 }}>
                <td style={subTd}><span className="muted">{v.name}</span></td>
                <td style={subTd}><input type="number" value={d.spend} placeholder="0" onChange={(e) => setField(v.id, 'spend', e.target.value)} style={{ ...inpStyle, width: 80 }} /></td>
                <td style={subTd}><input type="number" step="0.1" value={d.rpct} placeholder="%" onChange={(e) => setField(v.id, 'rpct', e.target.value)} style={{ ...inpStyle, width: 55, color: 'var(--green)' }} /></td>
                <td style={subTd}><input type="number" value={d.ramt} placeholder="0" onChange={(e) => setField(v.id, 'ramt', e.target.value)} style={{ ...inpStyle, width: 75, color: 'var(--green)' }} /></td>
                <td style={subTd}><input type="number" step="0.1" value={d.spct} placeholder="%" onChange={(e) => setField(v.id, 'spct', e.target.value)} style={{ ...inpStyle, width: 55, color: 'var(--accent)' }} /></td>
                <td style={subTd}><input type="number" value={d.samt} placeholder="0" onChange={(e) => setField(v.id, 'samt', e.target.value)} style={{ ...inpStyle, width: 75, color: 'var(--accent)' }} /></td>
                <td style={{ ...subTd, textAlign: 'center' }}><button onClick={(e) => { e.stopPropagation(); saveBlank(v.id); }} style={{ background: 'rgba(0,214,143,.1)', border: '1px solid rgba(0,214,143,.3)', color: 'var(--green)', borderRadius: 4, padding: '2px 6px', fontSize: '.68em', cursor: 'pointer', fontWeight: 700 }}>💾</button></td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

function AddRecordModal({
  defaults,
  autoFill,
  onCancel,
  onSave,
}: {
  defaults: ReturnType<typeof useVendorsState>['defaults'];
  autoFill: boolean;
  onCancel: () => void;
  onSave: (r: ROIRecord) => void;
}) {
  const stops = useMemo(() => (MEMBERS as Member[]).filter((m) => m.status === 'active' && m.id).sort((a, b) => (a.name || '').localeCompare(b.name || '')), []);
  const vendors = useMemo(() => (VP_VENDORS as Vendor[]).filter((v) => v.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)), []);
  const [stopId, setStopId] = useState(stops[0]?.id || '');
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [spend, setSpend] = useState('0');
  const [rpct, setRpct] = useState('');
  const [ramt, setRamt] = useState('0');
  const [spct, setSpct] = useState('');
  const [samt, setSamt] = useState('0');

  // Auto-fill from defaults when vendor changes.
  function fillDefaults(vid: string) {
    if (!autoFill) return;
    const d = defaults[vid];
    if (!d) return;
    if (d.pct) { setRpct(String(d.pct)); const amt = (parseFloat(spend) || 0) * d.pct / 100; setRamt(String(Math.round(amt * 100) / 100)); }
    if (d.rebate) setRamt(String(d.rebate));
  }
  function setRpctVal(v: string) {
    setRpct(v);
    const s = parseFloat(spend) || 0;
    const p = parseFloat(v) || 0;
    if (p) setRamt(String(Math.round((s * p) / 100 * 100) / 100));
  }
  function setRamtVal(v: string) {
    setRamt(v);
    const s = parseFloat(spend) || 0;
    const a = parseFloat(v) || 0;
    if (s) setRpct(((a / s) * 100).toFixed(1));
  }
  function setSpctVal(v: string) {
    setSpct(v);
    const s = parseFloat(spend) || 0;
    const p = parseFloat(v) || 0;
    if (p) setSamt(String(Math.round((s * p) / 100 * 100) / 100));
  }
  function setSamtVal(v: string) {
    setSamt(v);
    const s = parseFloat(spend) || 0;
    const a = parseFloat(v) || 0;
    if (s) setSpct(((a / s) * 100).toFixed(1));
  }

  const spendN = parseFloat(spend) || 0;
  const ramtN = parseFloat(ramt) || 0;
  const samtN = parseFloat(samt) || 0;
  const total = ramtN + samtN;
  const roiPct = spendN ? ((total / spendN) * 100).toFixed(1) : '0';

  function submit() {
    onSave({
      stop_id: stopId,
      vendor_id: vendorId,
      monthly_spend: spendN,
      rebate_pct: parseFloat(rpct) || 0,
      rebate_amount: ramtN,
      savings_pct: parseFloat(spct) || 0,
      cost_savings: samtN,
      rebate_desc: '',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-title">Add ROI Record</div></div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Truck Stop</div>
            <select className="inp" style={{ width: '100%' }} value={stopId} onChange={(e) => setStopId(e.target.value)}>
              {stops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Vendor Program</div>
            <select className="inp" style={{ width: '100%' }} value={vendorId} onChange={(e) => { setVendorId(e.target.value); fillDefaults(e.target.value); }}>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.program})</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>$ Spend/Mo (Invoice)</div>
            <input className="inp" type="number" style={{ width: '100%' }} value={spend} onChange={(e) => setSpend(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px 1fr', gap: 6, alignItems: 'end' }}>
            <div>
              <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>% Contract Savings</div>
              <input className="inp" type="number" step="0.1" style={{ width: '100%', color: 'var(--green)' }} value={rpct} onChange={(e) => setRpctVal(e.target.value)} />
            </div>
            <div style={{ textAlign: 'center', paddingBottom: 8, color: 'var(--muted)', fontWeight: 700 }}>=</div>
            <div>
              <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Rebate $ (auto)</div>
              <input className="inp" type="number" style={{ width: '100%', color: 'var(--green)', fontWeight: 700 }} value={ramt} onChange={(e) => setRamtVal(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px 1fr', gap: 6, alignItems: 'end' }}>
            <div>
              <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>% Add'l Savings</div>
              <input className="inp" type="number" step="0.1" style={{ width: '100%', color: 'var(--accent)' }} value={spct} onChange={(e) => setSpctVal(e.target.value)} />
            </div>
            <div style={{ textAlign: 'center', paddingBottom: 8, color: 'var(--muted)', fontWeight: 700 }}>=</div>
            <div>
              <div className="muted" style={{ fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>$ Savings/Mo (auto)</div>
              <input className="inp" type="number" style={{ width: '100%', color: 'var(--accent)' }} value={samt} onChange={(e) => setSamtVal(e.target.value)} />
            </div>
          </div>
          {(spendN > 0 || total > 0) && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
              <div className="green" style={{ fontSize: '.72em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>Preview</div>
              <div style={{ fontSize: '.85em' }}>
                Spend: <b>{fmtDollar(spendN)}</b> · Rebate: <b className="green">{fmtDollar(ramtN)}</b> · Savings: <b className="accent">{fmtDollar(samtN)}</b> · Total: <b className="green">{fmtDollar(total)}</b> ({roiPct}% ROI)
              </div>
            </div>
          )}
        </div>
        <div className="modal-ftr">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-green" onClick={submit}>Add Record</button>
        </div>
      </div>
    </div>
  );
}
