import { useState } from 'react';
import { useValuePropsState } from '../hooks/useValuePropsState';
import { fG } from '../lib/valuePropsHelpers';
import { LocationsTab } from './valueProps/LocationsTab';
import { ChartsTab } from './valueProps/ChartsTab';
import { AssignmentsTab } from './valueProps/AssignmentsTab';
import { CreateNewTab } from './valueProps/CreateNewTab';
import { GallonReportsTab } from './valueProps/GallonReportsTab';

type Sub = 'locations' | 'charts' | 'assignments' | 'create' | 'gallon';

export function ValuePropsPage() {
  const vp = useValuePropsState();
  const [tab, setTab] = useState<Sub>('locations');
  const [detailId, setDetailId] = useState<string | null>(null);

  const tLoc = vp.vps.length;
  const tPot = vp.vps.reduce((s, v) => s + (v.totalPot || 0), 0);
  const tWin = vp.vps.reduce((s, v) => s + (v.winnable || 0), 0);
  const tFC = vp.vps.reduce((s, v) => s + (v.fleetCount || 0), 0);

  const gotoCreate = () => {
    setTab('create');
    setDetailId(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: '.75em', color: 'var(--muted)' }}>
          <span className={`vp-sync-dot ${vp.syncStatus}`} />
          {vp.syncLabel}
        </div>
      </div>

      <div className="vp-kpis">
        <div className="vp-kpi k-yellow">
          <div className="vp-kpi-label">Total Locations</div>
          <div className="vp-kpi-val">{tLoc}</div>
        </div>
        <div className="vp-kpi k-green">
          <div className="vp-kpi-label">Total Potential Gal</div>
          <div className="vp-kpi-val">{fG(tPot)}</div>
        </div>
        <div className="vp-kpi k-cyan">
          <div className="vp-kpi-label">Total Winnable Gal (20%)</div>
          <div className="vp-kpi-val">{fG(tWin)}</div>
        </div>
        <div className="vp-kpi k-purple">
          <div className="vp-kpi-label">Total Fleet Entries</div>
          <div className="vp-kpi-val">{fG(tFC)}</div>
        </div>
      </div>

      <div className="vp-sub-tabs">
        <button
          className={`vp-stab ${tab === 'locations' ? 'active' : ''}`}
          onClick={() => { setTab('locations'); setDetailId(null); }}
        >📍 All Locations</button>
        <button className={`vp-stab ${tab === 'charts' ? 'active' : ''}`} onClick={() => setTab('charts')}>
          📊 Charts
        </button>
        <button className={`vp-stab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>
          👤 Assignments
        </button>
        <button className={`vp-stab ${tab === 'create' ? 'active' : ''}`} onClick={gotoCreate}>
          + Create New
        </button>
        <button className={`vp-stab ${tab === 'gallon' ? 'active' : ''}`} onClick={() => setTab('gallon')}>
          ⛽ Gallon Reports <span className="badge badge-accent" style={{ marginLeft: 4 }}>{vp.FN.length}</span>
        </button>
      </div>

      {tab === 'locations' && (
        <LocationsTab vp={vp} detailId={detailId} setDetailId={setDetailId} gotoCreate={gotoCreate} />
      )}
      {tab === 'charts' && <ChartsTab vp={vp} />}
      {tab === 'assignments' && <AssignmentsTab vp={vp} />}
      {tab === 'create' && <CreateNewTab vp={vp} onSaved={() => { setTab('locations'); setDetailId(null); }} />}
      {tab === 'gallon' && <GallonReportsTab vp={vp} />}
    </div>
  );
}
