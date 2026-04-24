import { useEffect, useMemo, useState } from 'react';
import type { useValuePropsState } from '../../hooks/useValuePropsState';
import { fG, fmt, parseGallonData } from '../../lib/valuePropsHelpers';

type Props = { vp: ReturnType<typeof useValuePropsState> };

type ImportMethod = 'paste' | 'csv' | 'xlsx';

type ImportRecord = { city: string; state: string; gallons: number };

type XLSXLib = {
  read: (buf: ArrayBuffer, opts: { type: 'array' }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_csv: (ws: unknown) => string };
};

function loadXLSX(): Promise<XLSXLib> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { XLSX?: XLSXLib };
    if (w.XLSX) return resolve(w.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => {
      const w2 = window as unknown as { XLSX?: XLSXLib };
      if (w2.XLSX) resolve(w2.XLSX);
      else reject(new Error('XLSX did not load'));
    };
    s.onerror = () => reject(new Error('Could not load Excel parser'));
    document.head.appendChild(s);
  });
}

export function GallonReportsTab({ vp }: Props) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [rowsLimit, setRowsLimit] = useState('100');
  const [grFleet, setGrFleet] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const states = useMemo(
    () => [...new Set(vp.FR.map((r) => r[2]))].filter((s) => s.length === 2).sort(),
    [vp.FR],
  );

  const tGal = useMemo(() => vp.FR.reduce((s, r) => s + r[3], 0), [vp.FR]);
  const stateCount = useMemo(() => new Set(vp.FR.map((r) => r[2])).size, [vp.FR]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vp.FR.filter((r) => {
      if (grFleet && vp.FN[r[0]] !== grFleet) return false;
      if (stateFilter && r[2] !== stateFilter) return false;
      if (q) {
        if (!vp.FN[r[0]].toLowerCase().includes(q) && !r[1].toLowerCase().includes(q) && !r[2].toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => b[3] - a[3]);
  }, [vp.FR, vp.FN, search, stateFilter, grFleet]);

  const lim = rowsLimit === '' ? 0 : parseInt(rowsLimit, 10) || 0;
  const total = filtered.length;
  const shown = lim > 0 ? filtered.slice(0, lim) : filtered;

  return (
    <div className="card">
      <div className="card-hdr">⛽ Fleet Gallon Reports Database</div>
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: '.78em', color: 'var(--muted)', marginBottom: 12 }}>
          Fleet gallon reports powering the 50-mile radius scanner. Import new fleet data below via CSV upload or paste.
        </p>
        <div className="vp-kpis">
          <div className="vp-kpi k-cyan">
            <div className="vp-kpi-label">Fleets</div>
            <div className="vp-kpi-val">{vp.FN.length}</div>
          </div>
          <div className="vp-kpi k-green">
            <div className="vp-kpi-label">Records</div>
            <div className="vp-kpi-val">{fG(vp.FR.length)}</div>
          </div>
          <div className="vp-kpi k-yellow">
            <div className="vp-kpi-label">Total Gallons</div>
            <div className="vp-kpi-val">{fmt(tGal)}</div>
          </div>
          <div className="vp-kpi k-purple">
            <div className="vp-kpi-label">States</div>
            <div className="vp-kpi-val">{stateCount}</div>
          </div>
        </div>
        <div className="vp-search-row">
          <input
            type="text"
            placeholder="Search fleets, cities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All States</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={rowsLimit} onChange={(e) => setRowsLimit(e.target.value)}>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
            <option value="500">500 rows</option>
            <option value="">All</option>
          </select>
          <button className="btn btn-accent" onClick={() => setShowImport((x) => !x)}>📥 Import Gallon Report</button>
        </div>

        {showImport && (
          <ImportPanel vp={vp} onDone={() => setShowImport(false)} />
        )}

        <div className="vp-gr-tabs">
          <button
            className={`vp-gr-tab ${!grFleet ? 'active' : ''}`}
            onClick={() => setGrFleet('')}
          >
            <span>All</span>
          </button>
          {vp.FN.map((fn) => {
            const excl = vp.excludedFleets.has(fn);
            const statusLbl = excl ? 'Inactive' : 'Active';
            return (
              <div
                key={fn}
                className={`vp-gr-tab ${grFleet === fn ? 'active' : ''} ${excl ? 'excluded' : ''}`}
                onClick={() => setGrFleet(grFleet === fn ? '' : fn)}
                title={statusLbl}
              >
                <span>{fn}</span>
                <span className="vp-gr-tab-status">{statusLbl}</span>
                <span className="vp-gr-tab-actions">
                  <button
                    className="vp-tab-btn"
                    title="Rename fleet"
                    onClick={(e) => { e.stopPropagation(); setRenaming(fn); }}
                  >✏️</button>
                  <button
                    className="vp-tab-btn"
                    title={excl ? 'Set Active' : 'Set Inactive'}
                    onClick={(e) => { e.stopPropagation(); vp.toggleExclude(fn); }}
                  >{excl ? '▶' : '⏸'}</button>
                  <button
                    className="vp-tab-btn"
                    title="Remove fleet"
                    style={{ color: 'var(--red)' }}
                    onClick={(e) => { e.stopPropagation(); setDeleting(fn); }}
                  >✕</button>
                </span>
              </div>
            );
          })}
        </div>

        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th>#</th>
                <th>Fleet</th>
                <th>City</th>
                <th>State</th>
                <th style={{ textAlign: 'right' }}>Gallons</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No records.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={i}>
                  <td className="num" style={{ color: 'var(--dim)' }}>{i + 1}</td>
                  <td><span className="badge badge-accent">{vp.FN[r[0]]}</span></td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td className="num" style={{ fontWeight: 600, color: 'var(--accent)' }}>{fG(r[3])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '6px 0', fontSize: '.72em', color: 'var(--muted)' }}>
          {total > shown.length
            ? `Showing ${shown.length} of ${fG(total)} records`
            : `Showing ${shown.length} records`}
        </div>
      </div>

      {renaming && (
        <RenameModal
          fn={renaming}
          allNames={vp.FN}
          onCancel={() => setRenaming(null)}
          onSave={(name) => {
            vp.renameFleet(renaming, name);
            if (grFleet === renaming) setGrFleet(name);
            setRenaming(null);
          }}
        />
      )}
      {deleting && (
        <DeleteModal
          fn={deleting}
          recordCount={vp.FR.filter((r) => r[0] === vp.FN.indexOf(deleting)).length}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            vp.removeFleet(deleting);
            if (grFleet === deleting) setGrFleet('');
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function ImportPanel({ vp, onDone }: { vp: ReturnType<typeof useValuePropsState>; onDone: () => void }) {
  const [fleetName, setFleetName] = useState('');
  const [method, setMethod] = useState<ImportMethod>('paste');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (method === 'paste') {
      const r = parseGallonData(pasteText);
      setRecords(r);
      setError(null);
    }
  }, [pasteText, method]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(`📎 ${file.name} (${Math.round(file.size / 1024)}KB)`);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const text = await file.text();
      const r = parseGallonData(text);
      if (!r.length) { setError('No valid records found in file'); setRecords([]); }
      else { setRecords(r); setError(null); }
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        const XLSX = await loadXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        let all: ImportRecord[] = [];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const csv = XLSX.utils.sheet_to_csv(ws);
          all = all.concat(parseGallonData(csv));
        }
        if (!all.length) { setError('No valid City/State/Gallons data found'); setRecords([]); }
        else { setRecords(all); setError(null); }
      } catch (e) {
        setError('Error reading Excel: ' + (e as Error).message);
      }
    }
  };

  const clear = () => {
    setPasteText('');
    setFileName('');
    setRecords([]);
    setError(null);
  };

  const confirmImport = () => {
    if (!fleetName.trim()) { setError('Enter a fleet name first'); return; }
    if (!records.length) { setError('No records to import'); return; }
    vp.importFleet(fleetName.trim(), records);
    clear();
    setFleetName('');
    onDone();
  };

  const downloadTemplate = () => {
    const csv = 'City,State,Gallons\nOklahoma City,OK,1500\nDallas,TX,3200\nMemphis,TN,800\nDenver,CO,2100\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'gallon_report_template.csv';
    a.click();
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="card" style={{ background: 'var(--surface2)', borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
        <div className="card-hdr">📥 Import New Fleet Gallon Report</div>
        <div style={{ padding: 14 }}>
          <div className="vp-form-row">
            <div className="vp-fg">
              <label>Fleet Name</label>
              <input
                placeholder="e.g. Werner Enterprises"
                value={fleetName}
                onChange={(e) => setFleetName(e.target.value)}
              />
            </div>
            <div className="vp-fg">
              <label>Import Method</label>
              <select value={method} onChange={(e) => { setMethod(e.target.value as ImportMethod); clear(); }}>
                <option value="paste">Paste Data (City, State, Gallons)</option>
                <option value="csv">Upload CSV File</option>
                <option value="xlsx">Upload Excel (.xlsx)</option>
              </select>
            </div>
          </div>

          {method === 'paste' && (
            <>
              <div className="vp-fg" style={{ marginTop: 8 }}>
                <label>Paste Data — one row per line: City, State, Gallons (comma, tab, or pipe separated)</label>
                <textarea
                  rows={8}
                  placeholder={'Oklahoma City, OK, 1500\nDallas, TX, 3200\nMemphis, TN, 800\n\nOr paste directly from Excel — tab-separated works too'}
                  style={{ fontSize: '.78em', lineHeight: 1.6 }}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
              </div>
              <div style={{ fontSize: '.7em', color: 'var(--muted)', margin: '4px 0 10px' }}>
                Supports comma-separated, tab-separated, or pipe-separated. Header row (City|State|Gallons) is auto-detected and skipped.
              </div>
            </>
          )}

          {method !== 'paste' && (
            <div style={{ marginTop: 8 }}>
              <label
                style={{
                  display: 'block', border: '2px dashed var(--border2)', borderRadius: 8,
                  padding: 24, textAlign: 'center', cursor: 'pointer',
                }}
                onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)';
                  onFile(e.dataTransfer.files[0]);
                }}
              >
                <div style={{ fontSize: '1.4em', marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: '.85em', color: 'var(--text)' }}>Click to browse or drag & drop</div>
                <div style={{ fontSize: '.72em', color: 'var(--muted)', marginTop: 4 }}>
                  CSV or Excel file with columns: City, State, Gallons
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.tsv,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
              {fileName && <div style={{ fontSize: '.78em', color: 'var(--accent)', marginTop: 6 }}>{fileName}</div>}
            </div>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: '.78em', marginTop: 8 }}>{error}</div>}

          {records.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="card-hdr" style={{ color: 'var(--green)', border: 0, padding: 0, marginBottom: 6 }}>
                ✓ Preview — {records.length} records parsed
              </div>
              <div className="dt-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>State</th>
                      <th style={{ textAlign: 'right' }}>Gallons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.city}</td>
                        <td>{r.state}</td>
                        <td className="num" style={{ color: 'var(--green)' }}>{fG(r.gallons)}</td>
                      </tr>
                    ))}
                    {records.length > 20 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.78em' }}>
                        ...and {records.length - 20} more rows
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-green" disabled={!records.length} onClick={confirmImport}>
              ✓ Add to Gallon Reports
            </button>
            <button className="btn" onClick={clear}>Clear</button>
            <button className="btn" onClick={onDone}>Cancel</button>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={downloadTemplate}>
              📄 Download CSV Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenameModal({
  fn, allNames, onCancel, onSave,
}: {
  fn: string; allNames: string[]; onCancel: () => void; onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(fn);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Fleet name cannot be empty'); return; }
    if (trimmed === fn) { onCancel(); return; }
    if (allNames.includes(trimmed)) { setError('A fleet with that name already exists'); return; }
    onSave(trimmed);
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ width: 'min(380px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-title">✏️ Rename Fleet</div></div>
        <div className="modal-body">
          <input
            className="inp"
            style={{ width: '100%' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }}
            maxLength={80}
          />
          {error && <div style={{ color: 'var(--red)', fontSize: '.78em', marginTop: 6 }}>{error}</div>}
        </div>
        <div className="modal-ftr">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-accent" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  fn, recordCount, onCancel, onConfirm,
}: {
  fn: string; recordCount: number; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-title">⚠️ Remove Fleet</div></div>
        <div className="modal-body">
          <div style={{
            background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.3)',
            borderRadius: 8, padding: 14, fontSize: '.82em',
          }}>
            Removing <strong style={{ color: 'var(--red)' }}>"{fn}"</strong> will permanently delete{' '}
            <strong style={{ color: 'var(--red)' }}>{fG(recordCount)} gallon records</strong> from this session.
            This cannot be undone.
          </div>
        </div>
        <div className="modal-ftr">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button
            className="btn"
            style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
            onClick={onConfirm}
          >Remove Fleet</button>
        </div>
      </div>
    </div>
  );
}
