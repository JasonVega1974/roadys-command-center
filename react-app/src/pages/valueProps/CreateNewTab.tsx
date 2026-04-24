import { useMemo, useState } from 'react';
import type { useValuePropsState } from '../../hooks/useValuePropsState';
import { findFleets, type FleetScanResult } from '../../lib/geo';
import { fG } from '../../lib/valuePropsHelpers';
import type { FleetMatch, ValueProp } from '../../types/valueProps';

const POS_OPTS = ['SmartDESQ', 'SmartAuth', 'Fiscal', 'Verifone', 'NCR', 'Gilbarco', 'GasPOS', 'Other'];
const SITE_OPTS = ["Existing Roady's", "Existing Non-Roady's", 'New Build', 'Open < 30-days', 'Open > 30 days'];
const REQ_OPTS = ['Kaden', 'Angel', 'Burt', 'Robert', 'Logan', 'Steph', 'Stefanie', 'Maria', 'Shannon', 'Jason'];

type Props = {
  vp: ReturnType<typeof useValuePropsState>;
  onSaved: () => void;
};

export function CreateNewTab({ vp, onSaved }: Props) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [assigned, setAssigned] = useState('');
  const [aggPot, setAggPot] = useState('0');
  const [radius, setRadius] = useState('50');
  const [pos, setPos] = useState('');
  const [siteStatus, setSiteStatus] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludeSearch, setExcludeSearch] = useState('');

  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<FleetScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const states = useMemo(
    () => [...new Set(vp.FR.map((r) => r[2]))].filter((s) => s.length === 2).sort(),
    [vp.FR],
  );
  const fleetOpts = useMemo(() => [...vp.FN].sort((a, b) => a.localeCompare(b)), [vp.FN]);
  const filteredFleets = useMemo(() => {
    const q = excludeSearch.toLowerCase();
    if (!q) return fleetOpts;
    return fleetOpts.filter((f) => f.toLowerCase().includes(q));
  }, [fleetOpts, excludeSearch]);

  const doScan = async () => {
    if (!city.trim() || !state) return;
    setScanning(true);
    setScan(null);
    setScanError(null);
    try {
      const result = await findFleets(city.trim(), state, parseInt(radius, 10) || 50, {
        FN: vp.FN,
        FR: vp.FR,
        excludedFleets: vp.excludedFleets,
        formExcludedFleets: excluded,
      });
      if (result.err) setScanError(result.err);
      else setScan(result);
    } finally {
      setScanning(false);
    }
  };

  const doSave = async () => {
    if (!name.trim() || !city.trim() || !state) return;
    const matches: FleetMatch[] = (scan?.matches || []).map((m) => ({
      fleet: m.fleet,
      city: m.city,
      state: m.state,
      gallons: m.gallons,
      dist: m.dist,
    }));
    const agg = parseFloat(aggPot) || 0;
    const fleetPot = matches.reduce((s, m) => s + m.gallons, 0);
    const totalPot = agg + fleetPot;
    const record: ValueProp = {
      id: 'vp_' + Date.now(),
      name: name.trim(),
      city: city.charAt(0).toUpperCase() + city.slice(1),
      state,
      address: name.trim(),
      assigned: assigned.trim(),
      aggPot: agg,
      fleetPot,
      totalPot,
      winnable: totalPot * 0.2,
      fleetMatches: matches,
      fleetCount: matches.length,
      notes: notes.trim(),
      pos,
      siteStatus,
      requestedBy,
      requestedDate,
      radius: parseInt(radius, 10) || 50,
      status: 'active',
      excludedFleetsList: [...excluded],
      created: new Date().toISOString(),
    };
    await vp.upsertVP(record);
    onSaved();
  };

  const byFleet = useMemo(() => {
    const m: Record<string, FleetMatch[]> = {};
    for (const x of scan?.matches || []) {
      if (!m[x.fleet]) m[x.fleet] = [];
      m[x.fleet].push(x);
    }
    return Object.entries(m).sort((a, b) => {
      const gb = b[1].reduce((s, l) => s + l.gallons, 0);
      const ga = a[1].reduce((s, l) => s + l.gallons, 0);
      return gb - ga;
    });
  }, [scan]);

  const totalMatchGal = useMemo(
    () => (scan?.matches || []).reduce((s, m) => s + m.gallons, 0),
    [scan],
  );

  const toggleExcluded = (fn: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(fn)) next.delete(fn);
      else next.add(fn);
      return next;
    });
  };

  return (
    <div className="card">
      <div className="card-hdr">Create New Value Proposition</div>
      <div style={{ padding: 16 }}>
        <div className="vp-form-row">
          <div className="vp-fg">
            <label>Location Name / Address</label>
            <input
              placeholder="e.g. 31945 IH10 Hankamer TX 77560"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="vp-fg">
            <label>City</label>
            <input placeholder="Hankamer" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="vp-fg">
            <label>State</label>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Select...</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="vp-form-row">
          <div className="vp-fg">
            <label>Assigned To</label>
            <input
              placeholder="Manager name"
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
            />
          </div>
          <div className="vp-fg">
            <label>Agg Potential Gallons</label>
            <input type="number" value={aggPot} onChange={(e) => setAggPot(e.target.value)} />
          </div>
          <div className="vp-fg">
            <label>Search Radius (miles)</label>
            <select value={radius} onChange={(e) => setRadius(e.target.value)}>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="75">75 miles</option>
              <option value="100">100 miles</option>
            </select>
          </div>
        </div>
        <div className="vp-form-row">
          <div className="vp-fg">
            <label>POS System</label>
            <select value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="">Select...</option>
              {POS_OPTS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="vp-fg">
            <label>Site Status</label>
            <select value={siteStatus} onChange={(e) => setSiteStatus(e.target.value)}>
              <option value="">Select...</option>
              {SITE_OPTS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="vp-fg">
            <label>Requested By</label>
            <select value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)}>
              <option value="">Select...</option>
              {REQ_OPTS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="vp-form-row">
          <div className="vp-fg">
            <label>Requested Date</label>
            <input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
          </div>
          <div className="vp-fg" style={{ gridColumn: '2/-1' }}>
            <label>Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="vp-form-row">
          <div className="vp-fg" style={{ gridColumn: '1/-1', position: 'relative' }}>
            <label>
              Exclude Specific Fleets from Scan
              {excluded.size > 0 && (
                <span style={{ color: 'var(--muted)', textTransform: 'none', fontWeight: 500, marginLeft: 6 }}>
                  — {excluded.size} excluded
                </span>
              )}
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => setExcludeOpen((x) => !x)}
              style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}
            >
              <span style={{ flex: 1, color: excluded.size ? 'var(--text)' : 'var(--muted)' }}>
                {excluded.size
                  ? `${excluded.size} fleet${excluded.size === 1 ? '' : 's'} excluded from scan`
                  : 'Click to select fleets to exclude from this scan...'}
              </span>
              <span style={{ fontSize: '.9em' }}>▾</span>
            </button>
            {excludeOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--surface)', border: '1px solid var(--border2)',
                borderRadius: 8, marginTop: 4, overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,.4)',
              }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                  <input
                    type="text"
                    placeholder="Search fleets..."
                    value={excludeSearch}
                    onChange={(e) => setExcludeSearch(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--surface2)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text)', padding: '6px 10px',
                      fontFamily: 'inherit', fontSize: '.82em',
                    }}
                  />
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
                  {filteredFleets.length === 0 ? (
                    <div style={{ padding: 14, color: 'var(--muted)', fontSize: '.78em', textAlign: 'center' }}>
                      No fleets match
                    </div>
                  ) : filteredFleets.map((fn) => (
                    <label
                      key={fn}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', cursor: 'pointer', fontSize: '.82em',
                        background: excluded.has(fn) ? 'rgba(255,71,87,.08)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={excluded.has(fn)}
                        onChange={() => toggleExcluded(fn)}
                      />
                      <span style={{ flex: 1 }}>{fn}</span>
                    </label>
                  ))}
                </div>
                <div style={{
                  display: 'flex', gap: 6, padding: 8,
                  borderTop: '1px solid var(--border)', background: 'var(--surface2)',
                }}>
                  <button className="btn" onClick={() => setExcluded(new Set())}>Clear All</button>
                  <button
                    className="btn btn-accent"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => setExcludeOpen(false)}
                  >Done</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {[...excluded].sort().map((fn) => (
                <span key={fn} className="vp-excl-chip">
                  {fn}
                  <button title="Remove" onClick={() => toggleExcluded(fn)}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-accent" onClick={doScan} disabled={scanning}>
            {scanning ? '⏳ Scanning...' : '🔍 Scan Nearby Fleets'}
          </button>
          <button className="btn btn-green" onClick={doSave} disabled={!scan || scanning}>
            💾 Save Value Prop
          </button>
        </div>
        {(scanError || scan) && (
          <div style={{ marginTop: 16 }}>
            <div className="card-hdr" style={{ border: 0, padding: 0, marginBottom: 10 }}>
              📡 Fleet Matches Within {radius}-Mile Radius
            </div>
            {scanError && <p style={{ color: 'var(--red)' }}>{scanError}</p>}
            {scan && (
              <>
                <div className="vp-kpis">
                  <div className="vp-kpi k-cyan">
                    <div className="vp-kpi-label">Fleets in Range</div>
                    <div className="vp-kpi-val">{byFleet.length}</div>
                  </div>
                  <div className="vp-kpi k-green">
                    <div className="vp-kpi-label">Total Avail Gal/Mo</div>
                    <div className="vp-kpi-val">{fG(totalMatchGal)}</div>
                  </div>
                  <div className="vp-kpi k-yellow">
                    <div className="vp-kpi-label">Winnable (20%)</div>
                    <div className="vp-kpi-val">{fG(totalMatchGal * 0.2)}</div>
                  </div>
                  <div className="vp-kpi k-purple">
                    <div className="vp-kpi-label">Location Matches</div>
                    <div className="vp-kpi-val">{scan.matches.length}</div>
                  </div>
                </div>
                <p style={{ color: 'var(--green)', fontWeight: 600, fontSize: '.85em' }}>
                  ✓ Scanned {scan.checked.toLocaleString()} fleet records — {scan.matches.length} matches found
                </p>
                {scan.matches.length === 0 ? (
                  <p style={{ color: 'var(--muted)' }}>No fleet data in range. Try increasing radius.</p>
                ) : byFleet.map(([fn, locs]) => {
                  const g = locs.reduce((s, l) => s + l.gallons, 0);
                  return (
                    <div key={fn} className="vp-fm-row">
                      <div className="vp-fm-rank">{locs.length}</div>
                      <div>
                        <div className="vp-fm-name">{fn}</div>
                        <div className="vp-fm-loc">
                          {locs.map((l) => l.city).slice(0, 3).join(', ')}
                          {locs.length > 3 ? ' +more' : ''}
                        </div>
                      </div>
                      <div className="vp-fm-dist">{locs[0].dist}mi</div>
                      <div className="vp-fm-gal">{fG(g)} gal</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
