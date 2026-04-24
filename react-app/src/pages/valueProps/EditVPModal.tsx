import { useState } from 'react';
import type { ValueProp } from '../../types/valueProps';

const POS_OPTS = ['SmartDESQ', 'SmartAuth', 'Fiscal', 'Verifone', 'NCR', 'Gilbarco', 'GasPOS', 'Other'];
const SITE_OPTS = ["Existing Roady's", "Existing Non-Roady's", 'New Build', 'Open < 30-days', 'Open > 30 days'];
const REQ_OPTS = ['Kaden', 'Angel', 'Burt', 'Robert', 'Logan', 'Steph', 'Stefanie', 'Maria', 'Shannon', 'Jason'];

type Props = {
  vp: ValueProp;
  states: string[];
  onCancel: () => void;
  onSave: (next: ValueProp) => void | Promise<void>;
};

export function EditVPModal({ vp, states, onCancel, onSave }: Props) {
  const [name, setName] = useState(vp.name);
  const [city, setCity] = useState(vp.city);
  const [state, setState] = useState(vp.state);
  const [assigned, setAssigned] = useState(vp.assigned || '');
  const [aggPot, setAggPot] = useState(String(vp.aggPot || 0));
  const [radius, setRadius] = useState(String(vp.radius || 50));
  const [pos, setPos] = useState(vp.pos || '');
  const [siteStatus, setSiteStatus] = useState(vp.siteStatus || '');
  const [requestedBy, setRequestedBy] = useState(vp.requestedBy || '');
  const [requestedDate, setRequestedDate] = useState(vp.requestedDate || '');
  const [notes, setNotes] = useState(vp.notes || '');

  const save = () => {
    if (!name.trim() || !city.trim() || !state) return;
    const agg = parseFloat(aggPot) || 0;
    const total = agg + (vp.fleetPot || 0);
    onSave({
      ...vp,
      name: name.trim(),
      city: city.charAt(0).toUpperCase() + city.slice(1),
      state,
      address: name.trim(),
      assigned: assigned.trim(),
      aggPot: agg,
      totalPot: total,
      winnable: total * 0.2,
      radius: parseInt(radius, 10) || 50,
      pos,
      siteStatus,
      requestedBy,
      requestedDate,
      notes: notes.trim(),
    });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        style={{ width: 'min(720px, 92vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hdr"><div className="modal-title">✏️ Edit Location</div></div>
        <div className="modal-body">
          <div className="vp-form-row">
            <div className="vp-fg">
              <label>Location Name / Address</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="vp-fg">
              <label>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
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
              <input value={assigned} onChange={(e) => setAssigned(e.target.value)} />
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
          <div style={{ fontSize: '.72em', color: 'var(--muted)', margin: '4px 0 4px' }}>
            Fleet matches and gallon totals are preserved.
          </div>
        </div>
        <div className="modal-ftr">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-accent" onClick={save}>💾 Save Changes</button>
        </div>
      </div>
    </div>
  );
}
