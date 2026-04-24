import { useMemo, useRef, useState } from 'react';
import { MEMBERS, MOS, VP_TOP10_LIST, VP_VENDORS } from '../../data/vendors';
import {
  downloadCSV,
  estContractSav,
  fmtDollar,
  getManager,
  getRegionColor,
  getVendorPct,
  parseCSVRow,
} from '../../lib/vendorHelpers';
import type { useVendorsState } from '../../hooks/useVendorsState';
import type { Member, ROIRecord } from '../../types/vendors';

type Props = { month: string; vendors: ReturnType<typeof useVendorsState> };

type T10SortCol = 'name' | 'count' | 'rank' | 'monthRev' | 'ytdRev';

export function ProgramsTab({ month, vendors }: Props) {
  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">Top 10 & Enrollment</div>
      </div>
      <Top10Table month={month} vendors={vendors} />
      <EnrollmentGrid vendors={vendors} />
    </div>
  );
}

function Top10Table({ month, vendors }: Props) {
  const { enroll, roi, defaults, syscoStatus } = vendors;
  const [sortCol, setSortCol] = useState<T10SortCol>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [openVid, setOpenVid] = useState<Record<string, boolean>>({});

  const mi = (MOS as string[]).indexOf(month);
  const yr = month.split('-')[0];
  const moNum = +month.split('-')[1] || 4;
  let ytdMo = mi >= 0 ? (MOS as string[]).slice(0, mi + 1).filter((mo) => mo.startsWith(yr)).length : moNum;
  if (!ytdMo) ytdMo = moNum;

  const activeLocs = useMemo(
    () => (MEMBERS as Member[]).filter((mb) => mb.status === 'active' && mb.id),
    [],
  );

  const rows = useMemo(() => {
    const list = (VP_TOP10_LIST as { id: string; name: string }[]).map((v) => {
      const enrolled = activeLocs.filter((mb) => (enroll[mb.id] || {})[v.id]);
      const vendorROI = roi.filter((r) => r.vendor_id === v.id);
      const rebateTotal = vendorROI.reduce((s, r) => s + (+r.rebate_amount || 0), 0);
      const savingsTotal = vendorROI.reduce((s, r) => s + (+r.cost_savings || 0), 0);
      const estSavTotal = vendorROI.reduce((s, r) => s + estContractSav(r, defaults), 0);
      const monthRev = Math.round((rebateTotal + savingsTotal + estSavTotal) * 100) / 100;
      const ytdRev = Math.round(ytdMo * monthRev * 100) / 100;
      return { v, vid: v.id, count: enrolled.length, monthRev, ytdRev, enrolled, vendorROI, rebateTotal, estSavTotal, rank: 0 };
    });
    const byRev = [...list].sort((a, b) => b.monthRev - a.monthRev);
    byRev.forEach((d, i) => (d.rank = i + 1));
    list.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortCol === 'name') { va = a.v.name.toLowerCase(); vb = b.v.name.toLowerCase(); }
      else if (sortCol === 'count') { va = a.count; vb = b.count; }
      else if (sortCol === 'rank') { va = a.rank; vb = b.rank; }
      else if (sortCol === 'monthRev') { va = a.monthRev; vb = b.monthRev; }
      else { va = a.ytdRev; vb = b.ytdRev; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [enroll, roi, defaults, activeLocs, sortCol, sortDir, ytdMo]);

  function onSort(col: T10SortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  }
  const arrow = (col: T10SortCol) => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '#' + r);

  return (
    <div className="panel panel-accent">
      <div className="panel-hdr">
        <div className="panel-title accent">⭐ Top 10 Vendor Programs · {yr}</div>
      </div>
      <div className="dt-wrap">
        <table className="dt">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th onClick={() => onSort('name')}>Vendor{arrow('name')}</th>
              <th onClick={() => onSort('count')} style={{ textAlign: 'center' }}># Stops{arrow('count')}</th>
              <th onClick={() => onSort('rank')} style={{ textAlign: 'center' }}>Rank{arrow('rank')}</th>
              <th onClick={() => onSort('monthRev')} style={{ textAlign: 'right' }}>Month Rev{arrow('monthRev')}</th>
              <th onClick={() => onSort('ytdRev')} style={{ textAlign: 'right' }}>YTD Rev{arrow('ytdRev')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const isOpen = !!openVid[d.vid];
              return (
                <>
                  <tr key={d.vid} onClick={() => setOpenVid((p) => ({ ...p, [d.vid]: !p[d.vid] }))} style={{ cursor: 'pointer' }}>
                    <td style={{ textAlign: 'center' }}>
                      <span className="accent" style={{ fontWeight: 700 }}>{isOpen ? '－' : '＋'}</span>
                    </td>
                    <td><b>{d.v.name}</b></td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.count}</td>
                    <td style={{ textAlign: 'center' }}>{medal(d.rank)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtDollar(d.monthRev)}</td>
                    <td className="num accent" style={{ fontWeight: 700 }}>{d.ytdRev ? fmtDollar(d.ytdRev) : '$0'}</td>
                  </tr>
                  {isOpen && (
                    <tr key={d.vid + '-detail'}>
                      <td colSpan={6} style={{ background: 'rgba(0,0,0,.2)', padding: 10 }}>
                        <StopDetailTable vid={d.vid} vname={d.v.name} enrolled={d.enrolled} roi={roi} defaults={defaults} syscoStatus={syscoStatus} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StopDetailTable({
  vid,
  vname,
  enrolled,
  roi,
  defaults,
}: {
  vid: string;
  vname: string;
  enrolled: Member[];
  roi: ROIRecord[];
  defaults: ReturnType<typeof useVendorsState>['defaults'];
  syscoStatus: ReturnType<typeof useVendorsState>['syscoStatus'];
}) {
  if (!enrolled.length) return <div className="muted" style={{ fontSize: '.82em' }}>No stops enrolled in {vname}.</div>;
  const pct = getVendorPct(vid, defaults);
  let totSpend = 0, totReb = 0, totEst = 0;
  const rows = enrolled.map((mb) => {
    const gs = getManager(mb.state);
    const gc = getRegionColor(gs);
    const r = roi.find((x) => x.stop_id === mb.id && x.vendor_id === vid);
    const spend = r ? +r.monthly_spend || 0 : 0;
    const reb = r ? +r.rebate_amount || 0 : 0;
    const est = pct && spend ? Math.round((spend * pct) / 100 * 100) / 100 : 0;
    totSpend += spend; totReb += reb; totEst += est;
    const benefit = reb + est;
    return { mb, gs, gc, spend, reb, est, benefit };
  });
  const totBen = totReb + totEst;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82em' }}>
      <thead>
        <tr>
          <th style={th}>Stop</th>
          <th style={th}>Location</th>
          <th style={th}>GS</th>
          <th style={{ ...th, textAlign: 'right' }}>Mo Spend</th>
          <th style={{ ...th, textAlign: 'center' }}>% Contract</th>
          <th style={{ ...th, textAlign: 'right' }}>Rebate/Mo</th>
          <th style={{ ...th, textAlign: 'right' }}>Est. Savings/Mo</th>
          <th style={{ ...th, textAlign: 'right' }}>Total Benefit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mb.id}>
            <td style={td}>{r.mb.name}</td>
            <td style={td}>{r.mb.city || '—'}, {r.mb.state || '—'}</td>
            <td style={td}><span style={{ color: r.gc, fontWeight: 600 }}>{r.gs}</span></td>
            <td style={{ ...td, textAlign: 'right' }}>{r.spend ? fmtDollar(r.spend) : <span className="dim">—</span>}</td>
            <td style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>{pct ? pct + '%' : '—'}</td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{r.reb ? fmtDollar(r.reb) : '—'}</td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--accent)' }}>{r.est ? fmtDollar(r.est) : '—'}</td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{r.benefit ? fmtDollar(r.benefit) : '—'}</td>
          </tr>
        ))}
        <tr style={{ borderTop: '2px solid var(--border)' }}>
          <td colSpan={3} style={{ ...td, fontWeight: 700, color: 'var(--muted)' }}>TOTALS ({enrolled.length} stops)</td>
          <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtDollar(totSpend)}</td>
          <td style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>{pct ? pct + '%' : '—'}</td>
          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmtDollar(totReb)}</td>
          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmtDollar(totEst)}</td>
          <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{fmtDollar(totBen)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const th: React.CSSProperties = { fontSize: '.7em', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', padding: '5px 8px', borderBottom: '1px solid var(--border2)', textAlign: 'left' };
const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,.04)' };

type EnSortCol = 'name' | 'id' | 'gs' | 'score' | string;

function EnrollmentGrid({ vendors }: { vendors: ReturnType<typeof useVendorsState> }) {
  const { enroll, syscoStatus, bulkSetEnroll } = vendors;
  const [q, setQ] = useState('');
  const [vf, setVf] = useState<string>('all');
  const [gsf, setGsf] = useState<string>('all');
  const [sortCol, setSortCol] = useState<EnSortCol>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [status, setStatus] = useState<{ kind: 'info' | 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const top10 = VP_TOP10_LIST as { id: string; name: string }[];
  const gsNames = useMemo(() => {
    const s = new Set<string>();
    (MEMBERS as Member[]).forEach((mb) => { if (mb.status === 'active' && mb.state) s.add(getManager(mb.state)); });
    return Array.from(s).sort();
  }, []);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    let out = (MEMBERS as Member[]).filter((mb) => mb.status === 'active' && mb.id).map((mb) => {
      const le = enroll[mb.id] || {};
      const gs = getManager(mb.state);
      const sc = top10.reduce((s, v) => s + (le[v.id] ? 1 : 0), 0);
      const flags: Record<string, 0 | 1> = {};
      top10.forEach((v) => (flags[v.id] = le[v.id] ? 1 : 0));
      return { mb, le, gs, sc, flags };
    });
    out = out.filter((r) => {
      if (gsf !== 'all' && r.gs !== gsf) return false;
      if (ql && ![r.mb.name, r.mb.id, r.mb.city, r.mb.state].some((v) => (v || '').toLowerCase().includes(ql))) return false;
      if (vf !== 'all') return !!r.le[vf];
      return true;
    });
    out.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortCol === 'name') { va = (a.mb.name || '').toLowerCase(); vb = (b.mb.name || '').toLowerCase(); }
      else if (sortCol === 'id') { va = a.mb.id; vb = b.mb.id; }
      else if (sortCol === 'gs') { va = a.gs; vb = b.gs; }
      else if (sortCol === 'score') { va = a.sc; vb = b.sc; }
      else { va = a.flags[sortCol] || 0; vb = b.flags[sortCol] || 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return (a.mb.name || '').localeCompare(b.mb.name || '');
    });
    return out;
  }, [enroll, q, vf, gsf, sortCol, sortDir, top10]);

  function onSort(col: EnSortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
  }
  const arrow = (col: EnSortCol) => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  function renderCell(sid: string, vid: string, enrolled: boolean) {
    if (vid === 'V00010' && syscoStatus[sid]) {
      const st = syscoStatus[sid];
      if (st === 'active') return <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>;
      if (st === 'pending') return <span style={{ background: 'rgba(255,214,10,.15)', color: 'var(--yellow)', fontSize: '.62em', fontWeight: 700, padding: '1px 4px', borderRadius: 8 }}>PEND</span>;
      if (st === 'refused') return <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗</span>;
    }
    return enrolled ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--border2)' }}>·</span>;
  }

  function onExport() {
    const header = ['stop_id', 'stop_name', 'city', 'state', 'growth_strategist', ...top10.map((v) => v.name), 'total'];
    const out = (MEMBERS as Member[]).filter((mb) => mb.status === 'active' && mb.id).map((mb) => {
      const le = enroll[mb.id] || {};
      const sc = top10.reduce((s, v) => s + (le[v.id] ? 1 : 0), 0);
      return [mb.id, mb.name, mb.city || '', mb.state || '', getManager(mb.state), ...top10.map((v) => (le[v.id] ? 'yes' : 'no')), String(sc)];
    });
    downloadCSV('Roadys_VP_Enrollment_' + new Date().toISOString().slice(0, 10) + '.csv', header, out);
  }

  function onUpload(file: File) {
    setStatus({ kind: 'info', text: 'Parsing…' });
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) { setStatus({ kind: 'err', text: 'Need header + data rows.' }); return; }
        const headers = parseCSVRow(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''));
        const siCol = headers.findIndex((h) => ['stop_id', 'stopid', 'id', 'member_id'].includes(h));
        if (siCol === -1) { setStatus({ kind: 'err', text: 'Missing stop_id column.' }); return; }
        const vnL: Record<string, string> = {};
        [...(VP_TOP10_LIST as { id: string; name: string }[]), ...(VP_VENDORS as { id: string; name: string }[])].forEach((v) => {
          vnL[v.name.toLowerCase()] = v.id;
          vnL[v.id.toLowerCase()] = v.id;
        });
        const viCol = headers.findIndex((h) => ['vendor_id', 'vendorid'].includes(h));
        const enCol = headers.findIndex((h) => ['enrolled', 'active', 'status'].includes(h));
        let imp = 0, skip = 0;
        const updates: Array<{ stop_id: string; vendor_id: string; enrolled: boolean }> = [];
        if (viCol !== -1) {
          lines.slice(1).forEach((l) => {
            const c = parseCSVRow(l);
            const sid = (c[siCol] || '').toUpperCase();
            const vidRaw = (c[viCol] || '').trim();
            if (!sid || !vidRaw) { skip++; return; }
            const vid = vnL[vidRaw.toLowerCase()] || vidRaw;
            const ev = enCol !== -1 ? (c[enCol] || '').toLowerCase() : 'true';
            const enrolled = ['true', 'yes', '1', 'y', 'enrolled'].includes(ev || 'true');
            updates.push({ stop_id: sid, vendor_id: vid, enrolled });
            imp++;
          });
        } else {
          const vc: Array<{ col: number; vid: string }> = [];
          headers.forEach((h, i) => {
            if (i === siCol) return;
            const vid = vnL[h];
            if (vid) vc.push({ col: i, vid });
          });
          if (!vc.length) { setStatus({ kind: 'err', text: 'No vendor columns found.' }); return; }
          lines.slice(1).forEach((l) => {
            const c = parseCSVRow(l);
            const sid = (c[siCol] || '').toUpperCase();
            if (!sid) { skip++; return; }
            vc.forEach(({ col, vid }) => {
              const enrolled = ['true', 'yes', '1', 'y', 'enrolled', '✓', 'x'].includes((c[col] || '').toLowerCase());
              updates.push({ stop_id: sid, vendor_id: vid, enrolled });
              imp++;
            });
          });
        }
        bulkSetEnroll(updates);
        setStatus({ kind: 'ok', text: `Imported ${imp} records${skip ? ' (' + skip + ' skipped)' : ''}` });
      } catch (err) {
        setStatus({ kind: 'err', text: (err as Error).message });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="panel">
      <div className="panel-hdr">
        <div className="panel-title">🗂️ Enrollment Grid</div>
        <input className="inp" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 180 }} />
        <select value={vf} onChange={(e) => setVf(e.target.value)}>
          <option value="all">All Vendors</option>
          {top10.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={gsf} onChange={(e) => setGsf(e.target.value)}>
          <option value="all">All GS</option>
          {gsNames.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <div className="panel-spacer" />
        <span className="muted" style={{ fontSize: '.78em' }}>{rows.length} stops</span>
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
              <th onClick={() => onSort('name')}>Stop{arrow('name')}</th>
              <th onClick={() => onSort('id')} style={{ textAlign: 'center' }}>ID{arrow('id')}</th>
              <th onClick={() => onSort('gs')} style={{ textAlign: 'center' }}>GS{arrow('gs')}</th>
              {top10.map((v) => (
                <th key={v.id} onClick={() => onSort(v.id)} style={{ textAlign: 'center' }} title={v.name}>{v.name.split(' ')[0]}{arrow(v.id)}</th>
              ))}
              <th onClick={() => onSort('score')} style={{ textAlign: 'center' }}>Score{arrow('score')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gc = getRegionColor(r.gs);
              const sc = r.sc;
              const scC = sc >= 8 ? 'var(--green)' : sc >= 5 ? 'var(--yellow)' : sc >= 3 ? 'var(--orange)' : 'var(--red)';
              return (
                <tr key={r.mb.id}>
                  <td style={{ fontWeight: 600, fontSize: '.82em' }}>{r.mb.name}</td>
                  <td style={{ fontSize: '.72em', color: 'var(--muted)', fontFamily: 'monospace', textAlign: 'center' }}>{r.mb.id}</td>
                  <td style={{ textAlign: 'center' }}><span style={{ color: gc, fontWeight: 600, fontSize: '.72em' }}>{r.gs}</span></td>
                  {top10.map((v) => (
                    <td key={v.id} style={{ textAlign: 'center' }}>{renderCell(r.mb.id, v.id, !!r.le[v.id])}</td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 800, color: scC }}>{sc}/{top10.length}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4 + top10.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>No enrollment data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
