import { useState } from 'react';
import { MOS } from '../data/vendors';
import { defaultSelectedMonth, monthLabel } from '../lib/vendorHelpers';
import { useVendorsState } from '../hooks/useVendorsState';
import { DashboardTab } from './vendors/DashboardTab';
import { ProgramsTab } from './vendors/ProgramsTab';
import { DirectoryTab } from './vendors/DirectoryTab';
import { ROITab } from './vendors/ROITab';
import { AnalyticsTab } from './vendors/AnalyticsTab';
import { OpportunityTab } from './vendors/OpportunityTab';
import { ProgDetailsTab } from './vendors/ProgDetailsTab';

type TabId = 'dashboard' | 'programs' | 'directory' | 'roi' | 'analytics' | 'opportunity' | 'progdetails';

const TABS: Array<{ id: TabId; icon: string; label: string; group: string }> = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', group: 'Overview' },
  { id: 'programs', icon: '⭐', label: 'Top 10 & Enrollment', group: 'Vendor Programs' },
  { id: 'directory', icon: '📂', label: 'Vendor Directory', group: 'Vendor Programs' },
  { id: 'roi', icon: '💰', label: 'ROI Tracker', group: 'ROI & Financials' },
  { id: 'analytics', icon: '📈', label: 'ROI Analytics', group: 'ROI & Financials' },
  { id: 'opportunity', icon: '🚨', label: 'Opportunity', group: 'ROI & Financials' },
  { id: 'progdetails', icon: '📋', label: 'Program Details', group: 'Reference' },
];

export function VendorsPage() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [month, setMonth] = useState<string>(() => defaultSelectedMonth());
  const vendors = useVendorsState();

  const groups = Array.from(new Set(TABS.map((t) => t.group)));

  return (
    <div className="vendors-layout">
      <aside className="vendors-sidebar">
        <div className="vendors-period">
          <label>Period</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {(MOS as string[]).map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
        {groups.map((g) => (
          <div key={g} className="vendors-nav-group">
            <div className="vendors-nav-label">{g}</div>
            {TABS.filter((t) => t.group === g).map((t) => (
              <button
                key={t.id}
                className={`vendors-nav-item ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="vendors-nav-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="vendors-main">
        {tab === 'dashboard' && <DashboardTab month={month} vendors={vendors} />}
        {tab === 'programs' && <ProgramsTab month={month} vendors={vendors} />}
        {tab === 'directory' && <DirectoryTab />}
        {tab === 'roi' && <ROITab vendors={vendors} />}
        {tab === 'analytics' && <AnalyticsTab vendors={vendors} />}
        {tab === 'opportunity' && <OpportunityTab vendors={vendors} />}
        {tab === 'progdetails' && <ProgDetailsTab vendors={vendors} />}
      </div>
    </div>
  );
}
