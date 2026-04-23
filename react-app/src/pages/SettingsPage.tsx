import { useTheme } from '../hooks/useTheme';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Mirrors the legacy section list in index.html#pg-settings. Keys must match
// the legacy storage keys so the two apps stay in sync during migration.
const SECTIONS: Array<{ id: string; icon: string; label: string }> = [
  { id: 'overview', icon: '🏠', label: 'Overview' },
  { id: 'kpi', icon: '📊', label: 'KPI Dashboards' },
  { id: 'truckstops', icon: '⛽', label: 'Truck Stops' },
  { id: 'aggregators', icon: '🏭', label: 'Aggregators' },
  { id: 'fleets', icon: '🚛', label: 'Fleets' },
  { id: 'rcheck', icon: '✅', label: 'R-Check' },
  { id: 'valprops', icon: '💡', label: 'Value Propositions' },
  { id: 'members', icon: '👥', label: 'Members' },
  { id: 'implementation', icon: '🛠️', label: 'Implementation' },
  { id: 'crm', icon: '📇', label: 'CRM' },
];

type Visibility = Record<string, boolean>;

const DEFAULT_VISIBILITY: Visibility = SECTIONS.reduce<Visibility>((acc, s) => {
  acc[s.id] = true;
  return acc;
}, {});

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const [visibility, setVisibility] = useLocalStorage<Visibility>(
    'roadys_section_visibility',
    DEFAULT_VISIBILITY,
  );

  const setSection = (id: string, visible: boolean) =>
    setVisibility((prev) => ({ ...prev, [id]: visible }));

  return (
    <>
      <div className="page-title">SETTINGS</div>
      <div className="page-sub">Dashboard configuration</div>

      <div className="card">
        <div className="card-hdr">🎨 Appearance</div>
        <div style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '1.2em' }}>🌙</span>
          <label className="tog">
            <input
              type="checkbox"
              checked={theme === 'day'}
              onChange={toggle}
              aria-label="Toggle day / night mode"
            />
            <span className="slider" />
          </label>
          <span style={{ fontSize: '1.2em' }}>☀️</span>
          <span style={{ fontSize: '.82em', color: 'var(--muted)', fontWeight: 600 }}>
            {theme === 'day' ? 'Day Mode' : 'Night Mode'}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-hdr">📋 Show / Hide Sections</div>
        <div>
          {SECTIONS.map((s) => {
            const on = visibility[s.id] ?? true;
            return (
              <div key={s.id} className={`stg-row ${on ? '' : 'disabled'}`}>
                <span className="stg-icon">{s.icon}</span>
                <span className="stg-name">{s.label}</span>
                <div className="stg-actions">
                  <span className="stg-label">{on ? 'Shown' : 'Hidden'}</span>
                  <label className="tog">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setSection(s.id, e.target.checked)}
                      aria-label={`Toggle ${s.label}`}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-hdr">🚧 Not yet ported</div>
        <div style={{ padding: '18px', fontSize: '.85em', color: 'var(--muted)', lineHeight: 1.6 }}>
          PIN &amp; Page Locking and Data Management still live in the legacy
          <code style={{ margin: '0 4px' }}>index.html</code>. They depend on the KPI and fuel data
          systems, which will come across in a later migration step.
        </div>
      </div>
    </>
  );
}
