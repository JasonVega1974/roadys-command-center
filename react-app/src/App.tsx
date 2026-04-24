import { useState } from 'react';
import { SettingsPage } from './pages/SettingsPage';
import { OverviewPlaceholder } from './pages/OverviewPlaceholder';
import { VendorsPage } from './pages/VendorsPage';
import { ValuePropsPage } from './pages/ValuePropsPage';

type PageId = 'overview' | 'vendors' | 'valueprops' | 'settings';

const NAV: Array<{ id: PageId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'vendors', label: 'Vendor Programs', icon: '🤝' },
  { id: 'valueprops', label: 'Value Propositions', icon: '📍' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function App() {
  const [page, setPage] = useState<PageId>('vendors');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-t">ROADY'S</div>
          <div className="logo-s">Command Center</div>
        </div>
        <nav className="nav">
          <div className="nav-lbl">Navigation</div>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`ni ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span className="ni-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <strong style={{ fontFamily: 'var(--ff)', letterSpacing: '.04em' }}>
            {NAV.find((n) => n.id === page)?.label}
          </strong>
          <span style={{ marginLeft: 'auto', fontSize: '.75em', color: 'var(--muted)' }}>
            React migration preview
          </span>
        </div>
        <div className="content">
          {page === 'settings' && <SettingsPage />}
          {page === 'overview' && <OverviewPlaceholder />}
          {page === 'vendors' && <VendorsPage />}
          {page === 'valueprops' && <ValuePropsPage />}
        </div>
      </main>
    </div>
  );
}
