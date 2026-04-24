import { useMemo, useState } from 'react';
import { VP_VENDORS } from '../../data/vendors';
import type { useVendorsState } from '../../hooks/useVendorsState';
import type { Vendor } from '../../types/vendors';

type Props = { vendors?: ReturnType<typeof useVendorsState> };

type ContactInfo = { contact: string; email: string; phone: string };
type SortCol = 'id' | 'name' | 'program' | 'priority' | 'phone' | 'contact';

const PROG_COLOR: Record<string, string> = {
  PVP: 'var(--accent)',
  Entegra: 'var(--purple)',
  Shop: 'var(--orange)',
  'Approved Vendor': 'var(--teal)',
  'NO VP': 'var(--dim)',
};
const PRI_COLOR: Record<string, string> = {
  High: 'var(--green)',
  Medium: 'var(--yellow)',
  Low: 'var(--muted)',
};
const PRI_ORDER: Record<string, number> = { High: 1, Medium: 2, Low: 3 };

export function DirectoryTab({ vendors }: Props) {
  const [q, setQ] = useState('');
  const [pf, setPf] = useState<'all' | string>('all');
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const contactMap = useMemo<Record<string, ContactInfo>>(() => {
    const map: Record<string, ContactInfo> = {};
    const prog = (vendors?.progDetails || []) as Array<Record<string, unknown>>;
    for (const p of prog) {
      const vid = p.vid as string | undefined;
      if (vid) {
        map[vid] = {
          contact: (p.contact as string) || '',
          email: (p.email as string) || '',
          phone: (p.phone as string) || '',
        };
      }
    }
    return map;
  }, [vendors?.progDetails]);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    let out = (VP_VENDORS as Vendor[]).filter((v) => {
      if (ql && !v.name.toLowerCase().includes(ql) && !v.id.toLowerCase().includes(ql) && !(v.phone || '').includes(ql)) return false;
      if (pf !== 'all' && v.program !== pf) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortCol === 'id') { va = a.id; vb = b.id; }
      else if (sortCol === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (sortCol === 'program') { va = a.program; vb = b.program; }
      else if (sortCol === 'priority') { va = PRI_ORDER[a.priority] || 9; vb = PRI_ORDER[b.priority] || 9; }
      else if (sortCol === 'phone') { va = a.phone || 'zzz'; vb = b.phone || 'zzz'; }
      else { va = (contactMap[a.id]?.contact || 'zzz').toLowerCase(); vb = (contactMap[b.id]?.contact || 'zzz').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return out;
  }, [q, pf, sortCol, sortDir, contactMap]);

  const programs = Array.from(new Set((VP_VENDORS as Vendor[]).map((v) => v.program)));

  function onSort(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }
  const arrow = (col: SortCol) => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">Vendor Directory</div>
        <span className="badge badge-accent">{rows.length} vendors</span>
      </div>
      <div className="panel">
        <div className="panel-hdr">
          <input
            className="inp"
            placeholder="Search name, ID, or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select value={pf} onChange={(e) => setPf(e.target.value)}>
            <option value="all">All Programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="panel-spacer" />
          <span className="muted" style={{ fontSize: '.78em' }}>{rows.length} shown</span>
        </div>
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th onClick={() => onSort('id')}>ID{arrow('id')}</th>
                <th onClick={() => onSort('name')}>Vendor Name{arrow('name')}</th>
                <th onClick={() => onSort('program')}>Program{arrow('program')}</th>
                <th onClick={() => onSort('priority')}>Priority{arrow('priority')}</th>
                <th onClick={() => onSort('phone')}>Phone{arrow('phone')}</th>
                <th onClick={() => onSort('contact')}>Contact{arrow('contact')}</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const c = contactMap[v.id] || { contact: '', email: '', phone: '' };
                return (
                  <tr key={v.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '.78em', color: 'var(--muted)' }}>{v.id}</td>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td><span style={{ color: PROG_COLOR[v.program] || 'var(--muted)', fontWeight: 600 }}>{v.program}</span></td>
                    <td><span style={{ color: PRI_COLOR[v.priority] || 'var(--muted)', fontWeight: 600 }}>{v.priority}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{v.phone || '—'}</td>
                    <td>{c.contact || <span className="dim">—</span>}</td>
                    <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="dim">—</span>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>No vendors match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
