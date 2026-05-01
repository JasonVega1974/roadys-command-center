# GS Command Center Phase 4 — Stop Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen Stop Detail Page to `gs-command-center.html` — modeled on `index.html → Performance → Location` — with a hero KPI strip at the top and a two-column detail area below. Reuses Phase 1-3 drawer cards verbatim; adds new Revenue & Profitability (with monthly expand), Rack Information, Charts, Discounts by Aggregator & Fleet, and 6-month history-table cards. Print + Export CSV. Co-exists with the existing slide-in drawer via a `🗗 Open full page` button.

**Architecture:** Single-file edits to `gs-command-center.html`. New tab `📊 Stop Detail` hidden by default; shown only when `openStopDetailPage(stopId)` is called. New page render driven by `renderStopDetailPage(stopId)` which calls a sequence of card-helper functions. Tasks 1-11 progressively fill in these helpers — earlier tasks define stubs that return placeholder strings, later tasks replace stubs with real renderers, so the page is end-to-end smoke-testable after Task 2. Chart.js (already loaded for Phase 2's master dashboard) drives the two charts.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + manual browser smoke test (consolidated at Task 11).

**Spec:** [docs/superpowers/specs/2026-05-01-phase-4-stop-detail-page.md](../specs/2026-05-01-phase-4-stop-detail-page.md).

**Phase boundary:** Phase 5 (GS Management migration), Phase 6 (Notes + Share), Phase 7 (Schedule + Calendar) are out of scope for this plan.

---

## File Structure

**Modify only:** `gs-command-center.html`

| Insertion point | What we add | Locator |
|---|---|---|
| `<style>` block | Page layout, KPI hero strip, monthly-table styling, action-button styling, print stylesheet | `grep -n "\\.drawer-card\\.amber{" gs-command-center.html` (insert after that block) |
| Tab bar (line ~372) | New `<div class="tab" data-tab="stop-detail" id="tab-stop-detail">` (hidden by default) | `grep -n "data-tab=\"critical\"" gs-command-center.html` |
| Panels (line ~405) | New `<div class="panel" id="p-stop-detail">` | Same — insert after `<div class="panel" id="p-critical">` |
| Above `openSiteDrawer` | New globals `_stopDetailActiveStopId`, `_stopDetailReturnTab`. New helpers (added across Tasks 2-10): `openStopDetailPage`, `closeStopDetailPage`, `renderStopDetailPage`, `pageHeaderHTML`, `pageKpiHeroHTML`, `pageLocationDetailsHTML`, `pageRackHTML`, `pageRevProfitHTML`, `toggleRevProfitMonthly`, `pageChartsHTML`, `pageDiscountsHTML`, `pageHistoryTableHTML`, `exportStopDetailCSV`, `printStopDetail`. New constants `REV_PER_GAL_GS`, `COST_PER_GAL_GS`. | `grep -n "^function openSiteDrawer" gs-command-center.html` |
| Drawer header (line ~410) | New `🗗 Open full page` button left of the existing `✕` close button | `grep -n "drawer-close.*onclick=\"closeDrawer" gs-command-center.html` |

---

## Task 1: CSS additions

**Files:**
- Modify: `gs-command-center.html` (CSS block, after the `.drawer-card.amber` Phase 3 rules)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^\\.drawer-card\\.amber\\.opp-row\\|\\.import-preview-tbl\\b" gs-command-center.html
```

The new rules go after the last Phase 3 CSS block (find the `.import-preview-tbl th{font-size:...}` rule which is the final Phase 3 CSS line).

- [ ] **Step 2: Insert new CSS rules immediately after `.import-preview-tbl th{...}`**

Use Edit. Find the exact line `.import-preview-tbl th{font-size:.66em;text-transform:uppercase;color:var(--muted)}` and replace with that line + a newline + the new CSS block:

```css
.import-preview-tbl th{font-size:.66em;text-transform:uppercase;color:var(--muted)}
/* Phase 4 — Stop Detail Page */
#p-stop-detail .container{padding:14px 16px}
.sd-header{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:6px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px}
.sd-header .sd-name{font-size:1.05em;font-weight:800;margin-left:12px}
.sd-header .sd-meta{font-size:.74em;color:var(--muted);margin-left:8px}
.sd-actions{display:flex;gap:6px}
.sd-actions .btn{font-size:.72em}
.sd-section-label{font-size:.65em;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;font-weight:700}
.sd-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.sd-kpi{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:5px;padding:10px}
.sd-kpi.green{border-left-color:var(--green)}
.sd-kpi.purple{border-left-color:var(--purple)}
.sd-kpi.amber{border-left-color:var(--yellow)}
.sd-kpi-lbl{font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.sd-kpi-val{font-size:1.15em;font-weight:800;margin-top:2px}
.sd-kpi-sub{font-size:.66em;margin-top:3px;color:var(--muted)}
.sd-detail-grid{display:grid;grid-template-columns:1fr 2fr;gap:14px}
.sd-col{display:flex;flex-direction:column;gap:10px}
.revprofit-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px}
.revprofit-tile{background:var(--bg);padding:8px 10px;border-radius:4px}
.revprofit-tile-lbl{font-size:.62em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.revprofit-tile-val{font-size:1em;font-weight:800;margin-top:3px}
.revprofit-summary{font-size:.84em;margin-top:10px;padding:8px 10px;background:var(--bg);border-radius:4px}
.revprofit-summary b{color:var(--green)}
.revprofit-toggle{display:inline-block;cursor:pointer;color:var(--cyan);font-size:.78em;font-weight:700;padding:6px 0;margin-top:6px}
.revprofit-monthly-tbl{display:none;width:100%;border-collapse:collapse;font-size:.78em;margin-top:8px}
.revprofit-monthly-tbl.show{display:table}
.revprofit-monthly-tbl th{text-align:left;padding:5px 8px;font-size:.66em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border)}
.revprofit-monthly-tbl td{padding:4px 8px;border-bottom:1px solid var(--border)}
.revprofit-monthly-tbl tr.current td{font-weight:800;background:var(--bg)}
.sd-loc-row{display:flex;justify-content:space-between;padding:3px 0;font-size:.82em;border-bottom:1px solid var(--border)}
.sd-loc-row:last-child{border-bottom:0}
.sd-loc-row .lbl{color:var(--muted)}
.sd-rack{background:var(--bg);padding:8px 10px;border-radius:4px;margin-top:6px}
.sd-rack .sd-loc-row{font-size:.78em}
.sd-charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.sd-chart-wrap{background:var(--bg);border-radius:4px;padding:10px;height:240px;position:relative}
.sd-chart-wrap canvas{max-height:200px}
.disc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:6px}
.disc-card{background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--green);border-radius:4px;padding:8px 10px;font-size:.78em}
.disc-card.alert{border-left-color:var(--red)}
.disc-card .disc-name{font-weight:700;font-size:.92em}
.disc-card .disc-meta{font-size:.78em;color:var(--muted);margin-top:2px}
.disc-card .disc-stats{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;font-size:.78em}
.disc-card .disc-stat-lbl{color:var(--muted);font-size:.86em}
.disc-card .disc-stat-val{font-weight:700}
.sd-history-tbl{width:100%;border-collapse:collapse;font-size:.82em;margin-top:6px}
.sd-history-tbl th{text-align:left;padding:5px 8px;font-size:.66em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);background:var(--bg3)}
.sd-history-tbl td{padding:5px 8px;border-bottom:1px solid var(--border)}
.sd-history-tbl tr.current td{font-weight:800;background:var(--bg)}
@media print {
  .topbar, .tabs, #site-drawer, #stopdata-import-modal, .sd-actions, #toast { display: none !important; }
  body, .panel, .container { background: #fff !important; color: #000 !important; }
  .panel { display: none !important; }
  #p-stop-detail { display: block !important; }
  #p-stop-detail .container { max-width: 100% !important; padding: 0 !important; }
  .drawer-card, .card, .sd-kpi, .disc-card { page-break-inside: avoid; box-shadow: none !important; border: 1px solid #999 !important; }
  .sd-detail-grid { grid-template-columns: 1fr !important; }
  .sd-charts-grid { grid-template-columns: 1fr 1fr !important; }
  .sd-chart-wrap { height: 200px !important; }
}
```

- [ ] **Step 3: Verify CSS classes inserted**

```bash
grep -c "^\\.sd-kpi-grid{" gs-command-center.html
grep -c "^\\.sd-detail-grid{" gs-command-center.html
grep -c "^\\.revprofit-monthly-tbl{" gs-command-center.html
grep -c "^\\.disc-grid{" gs-command-center.html
grep -c "^\\.sd-history-tbl{" gs-command-center.html
grep -c "@media print" gs-command-center.html
```

Each should print `1`.

- [ ] **Step 4: Run the syntax check**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const html = fs.readFileSync('gs-command-center.html','utf8');
const m = html.match(/<script>([\\s\\S]*?)<\\/script>/g);
if(!m) throw new Error('no script blocks');
m.forEach((blk,i) => { const js = blk.replace(/^<script>|<\\/script>\$/g,''); try { new Function(js); } catch(e){ throw new Error('block '+i+': '+e.message); } });
console.log('syntax ok, '+m.length+' script blocks');
"
```

Expected: `syntax ok, 1 script blocks`. (CSS-only changes, but run anyway as a safety net.)

---

## Task 2: Tab + panel HTML + state globals + nav helpers + page shell

**Files:**
- Modify: `gs-command-center.html` (tab bar around line 372, panels around line 405, helpers above `openSiteDrawer`)

- [ ] **Step 1: Add the hidden tab to the tab bar**

```bash
grep -n "data-tab=\"critical\"" gs-command-center.html
```

Find the `Critical` tab line. Use Edit:
- `old_string`: `    <div class="tab" data-tab="critical" onclick="switchTab('critical',this)">🚨 Critical<span class="badge" id="crit-badge" style="display:none">0</span></div>`
- `new_string`:
  ```
      <div class="tab" data-tab="critical" onclick="switchTab('critical',this)">🚨 Critical<span class="badge" id="crit-badge" style="display:none">0</span></div>
      <div class="tab" data-tab="stop-detail" id="tab-stop-detail" style="display:none" onclick="switchTab('stop-detail',this)">📊 Stop Detail</div>
  ```

- [ ] **Step 2: Add the panel after the Critical panel**

Use Edit:
- `old_string`: `  <div class="panel" id="p-critical"><div class="container" id="crit-content"></div></div>`
- `new_string`:
  ```
    <div class="panel" id="p-critical"><div class="container" id="crit-content"></div></div>
  
    <!-- ═══ STOP DETAIL PAGE (Phase 4) ═══ -->
    <div class="panel" id="p-stop-detail"><div class="container" id="stop-detail-content"></div></div>
  ```

- [ ] **Step 3: Add globals + nav helpers + page shell + stub helpers above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
// ─── Phase 4: Stop Detail Page ────────────────────────────────────────
let _stopDetailActiveStopId = null;
let _stopDetailReturnTab = null;
const REV_PER_GAL_GS = 0.05;
const COST_PER_GAL_GS = 0.02;
function estRevenueGS(gallons, rack){ return (+gallons || 0) * REV_PER_GAL_GS; }
function estProfitGS(gallons, rack){  return (+gallons || 0) * (REV_PER_GAL_GS - COST_PER_GAL_GS); }

function openStopDetailPage(stopId){
  if(!MEMBERS.find(m => m.id === stopId)) return;
  // Stash current tab so we can return to it
  const currentTab = document.querySelector('.tab.active')?.dataset?.tab;
  if(currentTab && currentTab !== 'stop-detail') _stopDetailReturnTab = currentTab;
  _stopDetailActiveStopId = stopId;
  const tabEl = document.getElementById('tab-stop-detail');
  if(tabEl) tabEl.style.display = '';
  switchTab('stop-detail', tabEl);
  renderStopDetailPage(stopId);
}
function closeStopDetailPage(){
  const tabEl = document.getElementById('tab-stop-detail');
  if(tabEl) tabEl.style.display = 'none';
  const ret = _stopDetailReturnTab || 'dashboard';
  const retEl = document.querySelector(`.tab[data-tab="${ret}"]`);
  switchTab(ret, retEl);
  const sid = _stopDetailActiveStopId;
  _stopDetailActiveStopId = null;
  _stopDetailReturnTab = null;
  if(sid) openSiteDrawer(sid);
}
function renderStopDetailPage(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop){ document.getElementById('stop-detail-content').innerHTML = ''; return; }
  // Phase 4 fires the value-prop fetch on first open (matches drawer)
  if(typeof loadValueProps === 'function' && !_vpCache){
    loadValueProps().then(() => {
      if(_stopDetailActiveStopId === stopId) renderStopDetailPage(stopId);
    });
  }
  document.getElementById('stop-detail-content').innerHTML = `
    ${pageHeaderHTML(stopId)}
    ${pageKpiHeroHTML(stopId)}
    <div class="sd-detail-grid">
      <div class="sd-col">
        ${pageLocationDetailsHTML(stopId)}
        ${drawerMembershipHTML(stopId)}
        ${drawerRewardsHTML(stopId)}
        ${drawerValuePropHTML(stopId)}
        ${pageRackHTML(stopId)}
      </div>
      <div class="sd-col">
        ${pageRevProfitHTML(stopId)}
        ${drawerFuelHTML(stopId)}
        ${pageChartsHTML(stopId)}
        ${drawerVendorStubHTML(stopId)}
        ${drawerVendorOpportunityHTML(stopId)}
        ${pageDiscountsHTML(stopId)}
        ${drawerROIHTML(stopId)}
        ${drawerCRMTasksHTML(stopId)}
        ${pageHistoryTableHTML(stopId)}
      </div>
    </div>
  `;
  // Charts render after innerHTML — Task 7 will populate
  if(typeof renderStopDetailCharts === 'function') renderStopDetailCharts(stopId);
}

// ─── Stub helpers — replaced in Tasks 3-9 ──
function pageHeaderHTML(stopId){ return ''; }
function pageKpiHeroHTML(stopId){ return ''; }
function pageLocationDetailsHTML(stopId){ return ''; }
function pageRackHTML(stopId){ return ''; }
function pageRevProfitHTML(stopId){ return ''; }
function pageChartsHTML(stopId){ return ''; }
function pageDiscountsHTML(stopId){ return ''; }
function pageHistoryTableHTML(stopId){ return ''; }
function exportStopDetailCSV(stopId){ /* Task 10 */ }
function printStopDetail(){ window.print(); }

function openSiteDrawer(siteId){
```

- [ ] **Step 4: Verify**

```bash
grep -c "^function openStopDetailPage" gs-command-center.html
grep -c "^function closeStopDetailPage" gs-command-center.html
grep -c "^function renderStopDetailPage" gs-command-center.html
grep -c "id=\"tab-stop-detail\"" gs-command-center.html
grep -c "id=\"p-stop-detail\"" gs-command-center.html
```

Expected: 1, 1, 1, 1, 1.

- [ ] **Step 5: Syntax check** (same `node -e` command from Task 1 Step 4). Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 6: Browser smoke test**

Open `gs-command-center.html`, log in. Open devtools console. Run:
```js
openStopDetailPage('R03650');
```
Expected: navigates to a new "📊 Stop Detail" tab. Page renders empty drawer cards (Membership, Rewards, Value Prop, Vendor stub, Vendor Opportunity, ROI, CRM, Calculations) — these are the existing Phase 1-3 helpers wired up immediately. Stub helpers (`pageHeaderHTML`, `pageKpiHeroHTML`, etc.) return `''` so no header / KPI strip yet.

Run:
```js
closeStopDetailPage();
```
Expected: returns to dashboard, drawer reopens at R03650.

---

## Task 3: Header bar (pageHeaderHTML)

**Files:**
- Modify: `gs-command-center.html` (replace the `pageHeaderHTML` stub)

- [ ] **Step 1: Locate the stub**

```bash
grep -n "^function pageHeaderHTML" gs-command-center.html
```

Expected: a single match.

- [ ] **Step 2: Replace the stub**

Use Edit with:
- `old_string`: `function pageHeaderHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageHeaderHTML(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop) return '';
  // Compute network rank by MTD gallons
  const m = currentMonthKey();
  const ranked = MEMBERS.slice().map(s => ({id: s.id, g: stopTotalGallons(s.id, m)})).sort((a,b) => b.g - a.g);
  const rank = ranked.findIndex(r => r.id === stopId) + 1;
  const total = ranked.length;
  const gsName = MANAGER_MAP[stop.state] || 'Unassigned';
  return `
    <div class="sd-header">
      <div style="display:flex;align-items:center;flex-wrap:wrap">
        <button class="btn" onclick="closeStopDetailPage()" style="font-size:.72em">← Back</button>
        <span class="sd-name">${esc(stop.name)}</span>
        <span class="sd-meta">${esc(stop.id)} · ${esc(stop.type)} · ${esc(stop.group)} · 📍 ${esc(stop.city||'')}, ${esc(stop.state||'')} · 🗺 GS: ${esc(gsName)} · Network rank #${rank} of ${total}</span>
      </div>
      <div class="sd-actions">
        <button class="btn" onclick="printStopDetail()">🖨 Print Report</button>
        <button class="btn btn-green" onclick="exportStopDetailCSV('${esc(stopId)}')">📊 Export CSV</button>
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Verify**

```bash
grep -c "function pageHeaderHTML(stopId){" gs-command-center.html
grep -c "Network rank #" gs-command-center.html
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser smoke**

Run `openStopDetailPage('R03650')` in console. Expected: header bar now shows stop name, ID, city/state, GS, network rank, plus the Back / Print / Export buttons. Click Back → returns to dashboard, drawer reopens.

---

## Task 4: KPI Hero strip (pageKpiHeroHTML)

**Files:**
- Modify: `gs-command-center.html` (replace the `pageKpiHeroHTML` stub)

- [ ] **Step 1: Replace the stub**

Use Edit with:
- `old_string`: `function pageKpiHeroHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageKpiHeroHTML(stopId){
  const m = currentMonthKey();
  const pm = priorMonthKey(m);
  const totalMtd = stopTotalGallons(stopId, m);
  const totalPrior = stopTotalGallons(stopId, pm);
  const totalYtd = ytdGallonsForStop(stopId, m, 'total');
  const revMtd = estRevenueGS(totalMtd);
  const revPrior = estRevenueGS(totalPrior);
  const revYtd = estRevenueGS(totalYtd);
  const profitMtd = estProfitGS(totalMtd);
  const fmtN = n => Math.round(+n||0).toLocaleString();
  const fmt$ = n => '$' + Math.round(+n||0).toLocaleString();
  const fmt$k = n => { const v = Math.round(+n||0); return v >= 1000 ? '$' + (v/1000).toFixed(1) + 'k' : fmt$(v); };
  // Pull GD record for aggregator/fleet counts
  let aggCount = 0, fleetCount = 0, aggGal = 0, fleetGal = 0;
  try {
    const GD = loadFuelGD();
    const rec = GD[stopId]?.[m];
    if(rec){
      aggCount = (rec.aggregators||[]).length;
      fleetCount = (rec.fleets||[]).length;
      aggGal = (rec.aggregators||[]).reduce((s,a)=>s+(+a.gallons||0),0);
      fleetGal = (rec.fleets||[]).reduce((s,f)=>s+(+f.gallons||0),0);
    }
  } catch(e){}
  // Vendor counts
  const VPE = loadVendorEnrolls();
  const stopVP = VPE[stopId];
  const enrolledCount = (stopVP && typeof stopVP === 'object')
    ? Object.values(stopVP).filter(v => v === true).length
    : 0;
  const opps = vendorOpportunityForStop(stopId);
  const missedTop = Math.min(opps.length, 10);
  // Rewards redemption rate
  const rec = loadStopRecord(stopId);
  const adds = (typeof rec.rewardsYtdAdds === 'number') ? rec.rewardsYtdAdds : null;
  const redeems = (typeof rec.rewardsYtdRedeems === 'number') ? rec.rewardsYtdRedeems : null;
  const redemptionRate = (adds != null && redeems != null && adds > 0) ? ((redeems/adds)*100) : null;
  const redemptionLabel = redemptionRate != null ? redemptionRate.toFixed(1) + '%' : '—';
  const redemptionSub = (adds != null && redeems != null) ? `YTD adds ${fmt$k(adds)} · redeems ${fmt$k(redeems)}` : 'set on Rewards card';
  // ROI
  const roi = computeStopROI(stopId);
  const netCurrentLbl = roi.netCurrent != null ? fmt$(roi.netCurrent) + (roi.netCurrent > 0 ? ' ✓' : ' ✗') : '—';
  const netPotLbl = roi.netPotential != null ? 'Potential: ' + fmt$(roi.netPotential) + (roi.netPotential > 0 ? ' ✓' : '') : '—';
  // Membership chips
  const memChips = [];
  if(rec.priceFileFeeRemoved) memChips.push('PFF removed');
  if(rec.acceptsFuelman) memChips.push('Fuelman ✓');
  if(rec.acceptsRcheck) memChips.push('R-Check ✓');
  const memLabel = rec.membershipCost ? esc(rec.membershipCost) : '—';
  const trendPill = (cur, prior) => {
    if(!prior || prior <= 0) return '<span style="color:var(--muted)">—</span>';
    const d = ((cur - prior) / prior) * 100;
    return `<span style="color:${d>=0?'var(--green)':'var(--red)'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(1)}% MoM</span>`;
  };
  return `
    <div class="sd-section-label">📊 At-a-Glance — ${(() => { const [y,mo]=m.split('-').map(Number); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1]+' '+y; })()}</div>
    <div class="sd-kpi-grid">
      <div class="sd-kpi"><div class="sd-kpi-lbl">Total Gallons MTD</div><div class="sd-kpi-val">${fmtN(totalMtd)}</div><div class="sd-kpi-sub">${trendPill(totalMtd, totalPrior)} · YTD ${fmtN(totalYtd)}</div></div>
      <div class="sd-kpi green"><div class="sd-kpi-lbl">Est. Revenue MTD</div><div class="sd-kpi-val">${fmt$(revMtd)}</div><div class="sd-kpi-sub">${trendPill(revMtd, revPrior)} · YTD ${fmt$k(revYtd)}</div></div>
      <div class="sd-kpi purple"><div class="sd-kpi-lbl">Est. Profit MTD</div><div class="sd-kpi-val" style="color:var(--green)">${fmt$(profitMtd)}</div><div class="sd-kpi-sub">$${(REV_PER_GAL_GS-COST_PER_GAL_GS).toFixed(4)} margin/gal</div></div>
      <div class="sd-kpi amber"><div class="sd-kpi-lbl">Net to Site (ROI)</div><div class="sd-kpi-val" style="color:${roi.netCurrent != null && roi.netCurrent > 0 ? 'var(--green)' : (roi.netCurrent != null ? 'var(--red)' : 'var(--muted)')}">${netCurrentLbl}</div><div class="sd-kpi-sub">${netPotLbl}</div></div>
      <div class="sd-kpi"><div class="sd-kpi-lbl">Aggregators / Fleets</div><div class="sd-kpi-val">${aggCount} / ${fleetCount}</div><div class="sd-kpi-sub">${fmtN(aggGal)} gal agg · ${fmtN(fleetGal)} gal fleet</div></div>
      <div class="sd-kpi amber"><div class="sd-kpi-lbl">Vendor Programs</div><div class="sd-kpi-val">${enrolledCount} enrolled</div><div class="sd-kpi-sub"><span style="color:var(--yellow)">${missedTop} missed (top 10)</span></div></div>
      <div class="sd-kpi amber"><div class="sd-kpi-lbl">Rewards Redemption</div><div class="sd-kpi-val" style="color:${redemptionRate != null && redemptionRate >= 60 ? 'var(--green)' : (redemptionRate != null && redemptionRate >= 30 ? 'var(--yellow)' : 'var(--muted)')}">${redemptionLabel}</div><div class="sd-kpi-sub">${redemptionSub}</div></div>
      <div class="sd-kpi purple"><div class="sd-kpi-lbl">Membership · Programs</div><div class="sd-kpi-val">${memLabel}</div><div class="sd-kpi-sub">${memChips.length ? memChips.join(' · ') : 'no programs flagged'}</div></div>
    </div>
  `;
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "function pageKpiHeroHTML(stopId){" gs-command-center.html
grep -c "sd-kpi-grid" gs-command-center.html
```

Expected: 1, ≥2 (CSS rule + the helper).

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Run `openStopDetailPage('R03650')` again. Expected: 8 KPI cards visible at top, 4 across, 2 rows. Trend pills render green/red. Membership chips show.

---

## Task 5: Location Details + Rack Information cards

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `pageLocationDetailsHTML` stub**

Use Edit:
- `old_string`: `function pageLocationDetailsHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageLocationDetailsHTML(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop) return '';
  const m = currentMonthKey();
  const ranked = MEMBERS.slice().map(s => ({id: s.id, g: stopTotalGallons(s.id, m)})).sort((a,b) => b.g - a.g);
  const rank = ranked.findIndex(r => r.id === stopId) + 1;
  const groupColor = stop.group === "Roady's" ? 'var(--cyan)' : (stop.group === 'PTP' ? 'var(--orange)' : 'var(--muted)');
  return `
    <div class="drawer-card purple">
      <div class="drawer-card-hd">📍 Location Details</div>
      <div class="sd-loc-row"><span class="lbl">Roady's ID</span><span>${esc(stop.id)}</span></div>
      <div class="sd-loc-row"><span class="lbl">Company</span><span>${esc(stop.company||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Name</span><span>${esc(stop.name||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Address</span><span style="font-size:.92em">${esc(stop.street||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">City / State</span><span>${esc(stop.city||'—')}, ${esc(stop.state||'—')} ${esc(stop.zip||'')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Exit / Highway</span><span>${esc(stop.exit||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Phone</span><span>${stop.phone ? `<a href="tel:${esc(stop.phone)}" style="color:var(--cyan)">${esc(stop.phone)}</a>` : '—'}</span></div>
      <div class="sd-loc-row"><span class="lbl">Group</span><span style="color:${groupColor};font-weight:700">${esc(stop.group||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Type</span><span>${esc(stop.type||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Status</span><span style="color:${stop.status==='active'?'var(--green)':'var(--muted)'}">${esc(stop.status||'—')}</span></div>
      <div class="sd-loc-row"><span class="lbl">Network Rank</span><span><b>#${rank}</b> of ${ranked.length}</span></div>
    </div>
  `;
}
```

- [ ] **Step 2: Replace `pageRackHTML` stub**

Use Edit:
- `old_string`: `function pageRackHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageRackHTML(stopId){
  let rack = {};
  try {
    const GD = loadFuelGD();
    rack = GD[stopId]?.[currentMonthKey()]?.rack || {};
  } catch(e){}
  const fmtRate = n => (typeof n === 'number' && !isNaN(n)) ? '$' + n.toFixed(4) : '—';
  return `
    <div class="drawer-card amber">
      <div class="drawer-card-hd">⛽ Rack Information</div>
      <div class="sd-rack">
        <div class="sd-loc-row"><span class="lbl">Rack Index</span><span>${esc(rack.rack_index||'—')}</span></div>
        <div class="sd-loc-row"><span class="lbl">OPIS ID</span><span>${esc(rack.opis_id||'—')}</span></div>
        <div class="sd-loc-row"><span class="lbl">Index Type</span><span>${esc(rack.index_type||'—')}</span></div>
        <div class="sd-loc-row"><span class="lbl">Freight Rate</span><span>${fmtRate(rack.freight)}/gal</span></div>
        <div class="sd-loc-row"><span class="lbl">Federal Tax</span><span>${fmtRate(rack.federal_tax)}</span></div>
        <div class="sd-loc-row"><span class="lbl">State Excise Tax</span><span>${fmtRate(rack.state_excise)}</span></div>
        <div class="sd-loc-row"><span class="lbl">State Sales Tax</span><span>${rack.state_sales_tax !== undefined ? rack.state_sales_tax + '%' : '—'}</span></div>
        <div class="sd-loc-row"><span class="lbl">Misc. Tax</span><span>${rack.misc_tax !== undefined ? '$' + rack.misc_tax : '—'}</span></div>
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Verify**

```bash
grep -c "function pageLocationDetailsHTML(stopId){" gs-command-center.html
grep -c "function pageRackHTML(stopId){" gs-command-center.html
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser smoke**

Reload, run `openStopDetailPage('R03650')`. Left column now shows: 📍 Location Details (purple) at top, ⛽ Rack Information (amber) at bottom of left column. All other left-column cards (Membership, Rewards, Value Prop) already worked from Task 2.

---

## Task 6: Revenue & Profitability card

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `pageRevProfitHTML` stub**

Use Edit:
- `old_string`: `function pageRevProfitHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageRevProfitHTML(stopId){
  const m = currentMonthKey();
  const [y, currentMo] = m.split('-').map(Number);
  const monthLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMo-1] + ' ' + y;
  const totalMtd = stopTotalGallons(stopId, m);
  const revMtd = estRevenueGS(totalMtd);
  const profitMtd = estProfitGS(totalMtd);
  let rack = {};
  try {
    const GD = loadFuelGD();
    rack = GD[stopId]?.[m]?.rack || {};
  } catch(e){}
  const freight = (typeof rack.freight === 'number' && !isNaN(rack.freight)) ? rack.freight : 0.0675;
  const fmtN = n => Math.round(+n||0).toLocaleString();
  const fmt$ = n => '$' + Math.round(+n||0).toLocaleString();
  // Build Jan-through-current-month rows
  const rows = [];
  for(let mi = 1; mi <= currentMo; mi++){
    const mk = y + '-' + String(mi).padStart(2, '0');
    const g = stopTotalGallons(stopId, mk);
    const r = estRevenueGS(g);
    const p = estProfitGS(g);
    const isCur = (mi === currentMo);
    const moLbl = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mi-1] + ' ' + y;
    rows.push(`<tr${isCur ? ' class="current"' : ''}>
      <td>${moLbl}</td>
      <td>${g > 0 ? fmtN(g) : '—'}</td>
      <td style="color:var(--green)">${g > 0 ? fmt$(r) : '—'}</td>
      <td style="color:${p >= 0 ? 'var(--green)' : 'var(--red)'}">${g > 0 ? fmt$(p) : '—'}</td>
      <td style="color:var(--muted)">${g > 0 ? '$' + REV_PER_GAL_GS.toFixed(4) : '—'}</td>
    </tr>`);
  }
  return `
    <div class="drawer-card green">
      <div class="drawer-card-hd">💰 Revenue &amp; Profitability — ${esc(monthLabel)}</div>
      <div class="revprofit-tiles">
        <div class="revprofit-tile"><div class="revprofit-tile-lbl">Rev / Gallon (est.)</div><div class="revprofit-tile-val" style="color:var(--green)">$${REV_PER_GAL_GS.toFixed(4)}</div></div>
        <div class="revprofit-tile"><div class="revprofit-tile-lbl">Cost / Gallon (est.)</div><div class="revprofit-tile-val" style="color:var(--red)">$${COST_PER_GAL_GS.toFixed(4)}</div></div>
        <div class="revprofit-tile"><div class="revprofit-tile-lbl">Net / Gallon</div><div class="revprofit-tile-val" style="color:var(--cyan)">$${(REV_PER_GAL_GS-COST_PER_GAL_GS).toFixed(4)}</div></div>
        <div class="revprofit-tile"><div class="revprofit-tile-lbl">Freight Rate</div><div class="revprofit-tile-val">$${freight.toFixed(4)}</div></div>
      </div>
      <div class="revprofit-summary">
        <b>${esc(monthLabel)}:</b> ${fmtN(totalMtd)} gal · ${fmt$(revMtd)} revenue · ${fmt$(profitMtd)} profit
      </div>
      <div class="revprofit-toggle" onclick="toggleRevProfitMonthly(this)">+ Show monthly breakdown</div>
      <table class="revprofit-monthly-tbl">
        <thead><tr><th>Period</th><th>Gallons</th><th>Est Revenue</th><th>Est Profit</th><th>Rev/Gal</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}
function toggleRevProfitMonthly(btn){
  const tbl = btn.parentElement.querySelector('.revprofit-monthly-tbl');
  if(!tbl) return;
  const expanded = tbl.classList.toggle('show');
  btn.textContent = expanded ? '− Hide monthly breakdown' : '+ Show monthly breakdown';
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "function pageRevProfitHTML(stopId){" gs-command-center.html
grep -c "^function toggleRevProfitMonthly" gs-command-center.html
```

Expected: 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Reload, run `openStopDetailPage('R03650')`. Right column top now shows 💰 Revenue & Profitability card with 4 stat tiles, summary line, and `[+ Show monthly breakdown]` link. Click it → expands to a Jan-through-current-month table. Click again → collapses.

---

## Task 7: Charts (pageChartsHTML + renderStopDetailCharts)

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `pageChartsHTML` stub**

Use Edit:
- `old_string`: `function pageChartsHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageChartsHTML(stopId){
  return `
    <div class="drawer-card amber">
      <div class="drawer-card-hd">📈 Trends</div>
      <div class="sd-charts-grid">
        <div class="sd-chart-wrap">
          <div style="font-size:.7em;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">6-Month Gallons</div>
          <canvas id="sd-chart-gallons"></canvas>
        </div>
        <div class="sd-chart-wrap">
          <div style="font-size:.7em;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Fleets / Aggregators · Current Month</div>
          <canvas id="sd-chart-mix"></canvas>
        </div>
      </div>
    </div>
  `;
}
let _sdGallonsChart = null;
let _sdMixChart = null;
function renderStopDetailCharts(stopId){
  const m = currentMonthKey();
  const [y, mo] = m.split('-').map(Number);
  // Build last 6 months including current
  const labels = [];
  const gallons = [];
  for(let i = 5; i >= 0; i--){
    const d = new Date(y, mo - 1 - i, 1);
    const ml = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    labels.push(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear().toString().slice(2));
    gallons.push(stopTotalGallons(stopId, ml));
  }
  // Gallons line chart
  if(_sdGallonsChart){ try { _sdGallonsChart.destroy(); } catch(e){} _sdGallonsChart = null; }
  const c1 = document.getElementById('sd-chart-gallons');
  if(c1 && typeof Chart !== 'undefined'){
    _sdGallonsChart = new Chart(c1, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Gallons', data: gallons, borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,.1)', tension: .3, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } }
    });
  }
  // Fleets/Aggregators doughnut
  if(_sdMixChart){ try { _sdMixChart.destroy(); } catch(e){} _sdMixChart = null; }
  let aggList = [], fleetList = [], directG = 0;
  try {
    const GD = loadFuelGD();
    const rec = GD[stopId]?.[m];
    if(rec){
      aggList = (rec.aggregators||[]).map(a => ({label: (a.name||'').split(' ').slice(0,2).join(' ') || 'Agg', value: +a.gallons||0}));
      fleetList = (rec.fleets||[]).map(f => ({label: f.name||'Fleet', value: +f.gallons||0}));
      const aggSum = aggList.reduce((s,x)=>s+x.value,0);
      const fleetSum = fleetList.reduce((s,x)=>s+x.value,0);
      const total = +rec.gallons || 0;
      directG = Math.max(0, total - aggSum - fleetSum);
    }
  } catch(e){}
  const c2 = document.getElementById('sd-chart-mix');
  if(c2 && typeof Chart !== 'undefined'){
    const aggGroup = aggList.reduce((s,x)=>s+x.value,0);
    const fleetGroup = fleetList.reduce((s,x)=>s+x.value,0);
    _sdMixChart = new Chart(c2, {
      type: 'doughnut',
      data: { labels: ['Aggregators', 'Fleets', 'Direct'], datasets: [{ data: [aggGroup, fleetGroup, directG], backgroundColor: ['rgba(34,211,238,.7)', 'rgba(16,185,129,.7)', 'rgba(251,146,60,.7)'], borderColor: 'transparent' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } } }
    });
  }
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "function pageChartsHTML(stopId){" gs-command-center.html
grep -c "^function renderStopDetailCharts" gs-command-center.html
grep -c "_sdGallonsChart" gs-command-center.html
grep -c "_sdMixChart" gs-command-center.html
```

Expected: 1, 1, ≥3, ≥3.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Reload, run `openStopDetailPage('R03650')`. Right column shows the 📈 Trends card with two side-by-side canvases — a 6-month gallons line chart and a doughnut showing Aggregators / Fleets / Direct mix.

---

## Task 8: Discounts by Aggregator & Fleet (pageDiscountsHTML)

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `pageDiscountsHTML` stub**

Use Edit:
- `old_string`: `function pageDiscountsHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageDiscountsHTML(stopId){
  let aggList = [], fleetList = [];
  try {
    const GD = loadFuelGD();
    const rec = GD[stopId]?.[currentMonthKey()];
    if(rec){
      aggList = rec.aggregators || [];
      fleetList = rec.fleets || [];
    }
  } catch(e){}
  if(!aggList.length && !fleetList.length){
    return `
      <div class="drawer-card amber">
        <div class="drawer-card-hd">💲 Discounts by Aggregator &amp; Fleet</div>
        <div style="font-size:.78em;color:var(--muted)">No aggregator or fleet records on file for this period. Add discount programs in <code>index.html</code>'s Fuelman page.</div>
      </div>
    `;
  }
  const fmtN = n => Math.round(+n||0).toLocaleString();
  const aggCards = aggList.map(a => {
    const cp = +a.cost_plus || 0;
    const rm = +a.retail_minus || 0;
    const net = cp + rm;
    const profitable = net >= 0;
    return `
      <div class="disc-card${profitable ? '' : ' alert'}">
        <div class="disc-name">${esc(a.name||'—')}</div>
        <div class="disc-meta">ID: ${esc(a.id||'—')} · ${esc(a.processor||'—')} · Aggregator</div>
        <div class="disc-stats">
          <div><div class="disc-stat-lbl">Gallons</div><div class="disc-stat-val">${fmtN(a.gallons)}</div></div>
          <div><div class="disc-stat-lbl">Cost Plus</div><div class="disc-stat-val">${cp > 0 ? '+$'+cp.toFixed(4) : (cp === 0 ? 'None' : '$'+cp.toFixed(4))}</div></div>
          <div><div class="disc-stat-lbl">Retail Minus</div><div class="disc-stat-val">${rm < 0 ? '$'+rm.toFixed(4) : (rm === 0 ? 'None' : '+$'+rm.toFixed(4))}</div></div>
          <div><div class="disc-stat-lbl">Net / Gallon</div><div class="disc-stat-val" style="color:${profitable ? 'var(--green)' : 'var(--red)'}">${profitable ? '+' : ''}$${net.toFixed(4)}</div></div>
        </div>
      </div>
    `;
  }).join('');
  const fleetCards = fleetList.map(f => `
    <div class="disc-card">
      <div class="disc-name">${esc(f.name||'—')}</div>
      <div class="disc-meta">ID: ${esc(f.id||'—')} · ${esc(f.processor||'—')} · Fleet</div>
      <div class="disc-stats">
        <div><div class="disc-stat-lbl">Gallons</div><div class="disc-stat-val">${fmtN(f.gallons)}</div></div>
        <div><div class="disc-stat-lbl">Type</div><div class="disc-stat-val">Fleet Account</div></div>
      </div>
    </div>
  `).join('');
  return `
    <div class="drawer-card amber">
      <div class="drawer-card-hd">💲 Discounts by Aggregator &amp; Fleet (${aggList.length} agg · ${fleetList.length} fleet)</div>
      <div class="disc-grid">
        ${aggCards}
        ${fleetCards}
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "function pageDiscountsHTML(stopId){" gs-command-center.html
```

Expected: 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Reload, run `openStopDetailPage('R03650')`. Right column now shows 💲 Discounts by Aggregator & Fleet card with per-aggregator and per-fleet sub-cards (or "No aggregator or fleet records on file" if the GD entry is empty).

---

## Task 9: 6-month History Table (pageHistoryTableHTML)

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `pageHistoryTableHTML` stub**

Use Edit:
- `old_string`: `function pageHistoryTableHTML(stopId){ return ''; }`
- `new_string`:

```js
function pageHistoryTableHTML(stopId){
  const m = currentMonthKey();
  const [y, currentMo] = m.split('-').map(Number);
  const fmtN = n => Math.round(+n||0).toLocaleString();
  // Last 6 months including current
  const months = [];
  for(let i = 5; i >= 0; i--){
    const d = new Date(y, currentMo - 1 - i, 1);
    months.push({
      key: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'),
      label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear()
    });
  }
  let GD = {};
  try { GD = loadFuelGD(); } catch(e){}
  const rows = months.map((mo, i) => {
    const d = GD[stopId]?.[mo.key] || {};
    const gal = +d.gallons || 0;
    // Compare against the row above (i-1) which is the prior month
    const prior = i > 0 ? (+(GD[stopId]?.[months[i-1].key]?.gallons) || 0) : null;
    const aggCount = (d.aggregators||[]).length;
    const fleetCount = (d.fleets||[]).length;
    const aggNames = (d.aggregators||[]).map(a => (a.name||'').split(' ')[0]).filter(Boolean).slice(0,3).join(', ');
    let changeLbl = '—';
    let changeColor = 'var(--muted)';
    if(prior != null && prior > 0){
      const pct = ((gal - prior) / prior) * 100;
      changeLbl = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
      changeColor = pct >= 0 ? 'var(--green)' : 'var(--red)';
    }
    const isCur = (i === months.length - 1);
    return `<tr${isCur ? ' class="current"' : ''}>
      <td>${esc(mo.label)}</td>
      <td>${gal > 0 ? fmtN(gal) : '—'}</td>
      <td style="color:${changeColor}">${changeLbl}</td>
      <td>${aggCount}</td>
      <td>${fleetCount}</td>
      <td style="font-size:.86em;color:var(--muted)">${esc(aggNames || '—')}</td>
    </tr>`;
  }).join('');
  return `
    <div class="drawer-card">
      <div class="drawer-card-hd">📊 6-Month History</div>
      <table class="sd-history-tbl">
        <thead><tr><th>Period</th><th>Gallons</th><th>Change</th><th>Agg #</th><th>Fleet #</th><th>Aggregators</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "function pageHistoryTableHTML(stopId){" gs-command-center.html
```

Expected: 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Reload, run `openStopDetailPage('R03650')`. Right column now shows 📊 6-Month History at the bottom: 6 rows, current month bolded, with month-over-month change column (green ▲ / red ▼).

---

## Task 10: Export CSV (exportStopDetailCSV)

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `exportStopDetailCSV` stub**

Use Edit:
- `old_string`: `function exportStopDetailCSV(stopId){ /* Task 10 */ }`
- `new_string`:

```js
function exportStopDetailCSV(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop){ toast('Stop not found'); return; }
  const m = currentMonthKey();
  const [y, currentMo] = m.split('-').map(Number);
  const monthLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMo-1] + ' ' + y;
  const rec = loadStopRecord(stopId);
  const roi = computeStopROI(stopId);
  const totalMtd = stopTotalGallons(stopId, m);
  const totalYtd = ytdGallonsForStop(stopId, m, 'total');
  const revMtd = estRevenueGS(totalMtd);
  const revYtd = estRevenueGS(totalYtd);
  const profitMtd = estProfitGS(totalMtd);
  // CSV cell escape (RFC 4180): wrap in double quotes, escape inner quotes
  const cell = v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const row = arr => arr.map(cell).join(',');
  const lines = [];
  // Header
  lines.push(row(['Stop', stop.id, stop.name, stop.city||'', stop.state||'', monthLabel]));
  lines.push('');
  // KPIs
  lines.push(row(['KPI', 'Value']));
  lines.push(row(['Total Gallons MTD', totalMtd]));
  lines.push(row(['Total Gallons YTD', totalYtd]));
  lines.push(row(['Est. Revenue MTD', revMtd.toFixed(2)]));
  lines.push(row(['Est. Revenue YTD', revYtd.toFixed(2)]));
  lines.push(row(['Est. Profit MTD', profitMtd.toFixed(2)]));
  lines.push(row(['Membership Cost', rec.membershipCost || '']));
  lines.push(row(['Price File Fee Removed', rec.priceFileFeeRemoved ? 'Yes' : 'No']));
  lines.push(row(['Accepts Fuelman', rec.acceptsFuelman ? 'Yes' : 'No']));
  lines.push(row(['Accepts R-Check', rec.acceptsRcheck ? 'Yes' : 'No']));
  lines.push(row(['YTD Total Gallons (manual)', rec.ytdTotalGallons != null ? rec.ytdTotalGallons : '']));
  lines.push(row(['Rewards YTD Adds', rec.rewardsYtdAdds != null ? rec.rewardsYtdAdds : '']));
  lines.push(row(['Rewards YTD Redeems', rec.rewardsYtdRedeems != null ? rec.rewardsYtdRedeems : '']));
  lines.push(row(['ROI Net Current', roi.netCurrent != null ? roi.netCurrent.toFixed(2) : '']));
  lines.push(row(['ROI Net Potential', roi.netPotential != null ? roi.netPotential.toFixed(2) : '']));
  lines.push('');
  // Revenue & Profitability monthly
  lines.push(row(['Revenue & Profitability', 'Period', 'Gallons', 'Revenue', 'Profit', 'RevPerGal']));
  for(let mi = 1; mi <= currentMo; mi++){
    const mk = y + '-' + String(mi).padStart(2, '0');
    const g = stopTotalGallons(stopId, mk);
    const moLbl = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mi-1] + ' ' + y;
    lines.push(row(['', moLbl, g, estRevenueGS(g).toFixed(2), estProfitGS(g).toFixed(2), REV_PER_GAL_GS.toFixed(4)]));
  }
  lines.push('');
  // Vendor enrollment
  const VPE = loadVendorEnrolls();
  const stopVP = VPE[stopId];
  if(stopVP && typeof stopVP === 'object'){
    const master = loadVendorMaster();
    const enrolledIds = Object.keys(stopVP).filter(vid => stopVP[vid] === true);
    lines.push(row(['Vendor Programs Enrolled', 'Vendor ID', 'Name', 'Program', 'Avg Savings']));
    for(const vid of enrolledIds){
      const v = master.VP_VENDORS.find(x => x.id === vid);
      const c = master.progDetails.find(p => p.vid === vid);
      lines.push(row(['', vid, v?.name || '—', v?.program || '—', c?.avgSavings || '—']));
    }
    lines.push('');
  }
  // Vendor opportunity (top 10)
  const opps = vendorOpportunityForStop(stopId).slice(0, 10);
  if(opps.length){
    lines.push(row(['Vendor Opportunity (Top 10)', 'Vendor ID', 'Name', 'Program', 'Avg Savings ($/mo)']));
    for(const o of opps){
      lines.push(row(['', o.vid, o.name, o.program, o.savings || 0]));
    }
  }
  const csv = lines.join('\r\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = stopId + '-' + m + '-detail.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
  toast('Exported ' + a.download);
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "function exportStopDetailCSV(stopId){" gs-command-center.html
grep -c "Vendor Opportunity (Top 10)" gs-command-center.html
```

Expected: 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Reload, run `openStopDetailPage('R03650')`. Click `📊 Export CSV` button in header. File `R03650-2026-05-detail.csv` downloads. Open in Excel — sections render with KPIs, Revenue & Profit monthly table, Vendor Programs Enrolled, Vendor Opportunity Top 10.

---

## Task 11: Drawer integration + Phase 4 commit

**Files:**
- Modify: `gs-command-center.html` (drawer markup around line 410)

- [ ] **Step 1: Add the `🗗 Open full page` button to the drawer header**

```bash
grep -n "drawer-close.*onclick=\"closeDrawer" gs-command-center.html
```

Expected: a single match around line 410.

Use Edit:
- `old_string`: `  <button class="drawer-close" onclick="closeDrawer()">&times;</button>`
- `new_string`:
  ```
    <button class="btn" id="drawer-fullpage-btn" onclick="drawerOpenFullPage()" style="position:absolute;top:14px;right:54px;font-size:.72em;padding:4px 10px" title="Open full page">🗗 Full Page</button>
    <button class="drawer-close" onclick="closeDrawer()">&times;</button>
  ```

The new button calls `drawerOpenFullPage()` (defined in Step 2), which reads the active stop ID from `_drawerActiveStopId` (also set in Step 2). Keeping nav state on a module-scoped variable is simpler and easier to debug than threading the ID through DOM data attributes.

- [ ] **Step 2: Add `drawerOpenFullPage` helper + track current drawer stop ID**

The drawer's `openSiteDrawer(siteId)` doesn't currently store the active stopId where we can grab it. Add the helper above `openSiteDrawer` (find `function openSiteDrawer(siteId){` and prepend):

Use Edit:
- `old_string`: `function openSiteDrawer(siteId){\n  const s=MEMBERS.find(m=>m.id===siteId);if(!s)return;`
- `new_string`:
  ```
  let _drawerActiveStopId = null;
  function drawerOpenFullPage(){
    const sid = _drawerActiveStopId;
    if(!sid){ toast('No stop active'); return; }
    closeDrawer();
    openStopDetailPage(sid);
  }
  function openSiteDrawer(siteId){
    const s=MEMBERS.find(m=>m.id===siteId);if(!s)return;
    _drawerActiveStopId = siteId;
  ```

Also patch `closeDrawer` to clear it. Find:
- `old_string`: `function closeDrawer(){document.getElementById('site-drawer').classList.remove('open');}`
- `new_string`: `function closeDrawer(){_drawerActiveStopId = null; document.getElementById('site-drawer').classList.remove('open');}`

- [ ] **Step 3: Verify**

```bash
grep -c "^function drawerOpenFullPage" gs-command-center.html
grep -c "^let _drawerActiveStopId" gs-command-center.html
grep -c "drawer-fullpage-btn" gs-command-center.html
grep -c "_drawerActiveStopId = siteId" gs-command-center.html
grep -c "_drawerActiveStopId = null" gs-command-center.html
```

Expected: 1, 1, 1, 1, ≥1.

- [ ] **Step 4: Run full syntax check.**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const html = fs.readFileSync('gs-command-center.html','utf8');
const m = html.match(/<script>([\\s\\S]*?)<\\/script>/g);
m.forEach((blk,i) => { const js = blk.replace(/^<script>|<\\/script>\$/g,''); new Function(js); });
console.log('syntax ok, '+m.length+' script blocks');
"
```

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser end-to-end smoke checklist**

Open `gs-command-center.html`, hard-reload. Log in as a per-GS PIN.

  - [ ] On Dashboard, scroll to My Stops. Click any row → drawer slides in.
  - [ ] In drawer header, see new `🗗 Full Page` button at top-right (between content and the `✕`).
  - [ ] Click `🗗 Full Page` → drawer closes, new "📊 Stop Detail" tab activates, page renders.
  - [ ] Header bar shows stop name + ID + city/state + GS + network rank + Print + Export buttons.
  - [ ] KPI Hero strip shows 8 cards in 2 rows of 4.
  - [ ] Two-column detail area below: left col = Location · Membership · Rewards · Value Prop · Rack; right col = Revenue & Profitability · Fuel · Charts · Vendor Programs · Vendor Opportunity · Discounts · ROI · CRM · Calculations · 6-Month History.
  - [ ] Revenue & Profitability `[+ Show monthly breakdown]` expands to Jan-through-current-month table; `[− Hide]` collapses.
  - [ ] 6-month gallons line chart and Fleet/Agg/Direct doughnut both render via Chart.js.
  - [ ] Discounts section shows per-aggregator/fleet sub-cards (or "no records" if GD is empty).
  - [ ] 6-Month History table renders 6 rows with current month bolded.
  - [ ] Click `📊 Export CSV` → downloads `<stopId>-<YYYY-MM>-detail.csv`. Open in Excel — sections present.
  - [ ] Click `🖨 Print Report` → browser print dialog. Print preview shows only the page content (no top tabs, no drawer).
  - [ ] Click `← Back` in header → page closes, drawer reopens at the same stop.
  - [ ] Switch GS via topbar selector while on the detail page → page closes, dashboard returns.
  - [ ] Manager mode (PIN 9999) in All-GS rollup: page renders the same surface; saves are no-ops (consistent with Phase 1 drawer pattern).

- [ ] **Step 6: Commit Phase 4**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html "docs/superpowers/plans/2026-05-01-phase-4-stop-detail-page.md" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 4: Stop Detail Page

Full-screen stop dashboard, modeled on index.html → Performance →
Location. Co-exists with the existing slide-in drawer.

- New tab '📊 Stop Detail' (hidden by default, shown when openStopDetailPage
  is called). New panel #p-stop-detail with the full page render.
- New nav helpers openStopDetailPage / closeStopDetailPage. Page closes
  via Back button → reopens drawer at the same stop.
- Header bar: Back · stop name · ID · city/state · GS · network rank ·
  Print · Export CSV.
- KPI Hero strip — 8 cards in 2 rows × 4: Total Gallons MTD · Est. Revenue
  MTD · Est. Profit MTD · Net to Site (ROI) · Aggregators/Fleets · Vendor
  Programs · Rewards Redemption · Membership/Programs.
- Two-column detail area below. Left col: Location Details · Membership
  · Rewards · Value Prop · Rack Information. Right col: Revenue &
  Profitability (with Jan-through-current-month expandable breakdown) ·
  Fuel Business · Trends (6-month gallons line + Fleet/Agg doughnut via
  Chart.js) · Vendor Programs · Vendor Opportunity · Discounts by
  Aggregator & Fleet · ROI Calculator · CRM Tasks · Calculations ·
  6-Month History table.
- Print stylesheet hides chrome and renders the page full-width.
- Export CSV builds a flat multi-section CSV.
- Drawer integration: new 🗗 Full Page button in drawer header.
- New constants REV_PER_GAL_GS=0.05, COST_PER_GAL_GS=0.02 ported from
  index.html. New helpers estRevenueGS, estProfitGS for the math.
- Reuses Phase 1-3 drawer card renderers verbatim (drawerMembershipHTML,
  drawerRewardsHTML, drawerValuePropHTML, drawerFuelHTML,
  drawerVendorStubHTML, drawerVendorOpportunityHTML, drawerROIHTML,
  drawerCRMTasksHTML).

Spec: docs/superpowers/specs/2026-05-01-phase-4-stop-detail-page.md
Plan: docs/superpowers/plans/2026-05-01-phase-4-stop-detail-page.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push**

```bash
git push origin gs-command-center-workstation
```

---

## Out-of-scope reminders

- **Phase 5 (renumbered):** GS Management migration from `index.html` (USA territory map, manager editor).
- **Phase 6 (renumbered):** Notes panel + Share Results buttons.
- **Phase 7 (renumbered):** Schedule Next Visit + .ics / Google Calendar URL export.
- **Per-stop $/gallon margin override:** the Revenue & Profitability card uses fixed network constants; per-stop override is a future enhancement.
- **Backend / Auth migration of `stopdata`:** separate sub-project after Phase 7.
- **Browser back / URL routing:** the page is a session-state tab, not a route.
