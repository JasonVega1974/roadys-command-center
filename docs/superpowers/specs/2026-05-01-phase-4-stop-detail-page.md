# GS Command Center Phase 4 — Stop Detail Page

**Date:** 2026-05-01
**Branch:** `gs-command-center-workstation`
**Predecessor:** [2026-04-30 Phase 3 spec](2026-04-30-phase-3-stop-drawer-sales-tools.md) — shipped through Phase 3.1.
**Renumbering:** the previous Phase 4 (GS Management migration from `index.html`) is renumbered to **Phase 5**. Original Phase 5 (Notes + Share Results) → Phase 6. Original Phase 6 (Schedule Next Visit + calendar export) → Phase 7.
**Scope:** add a full-screen Stop Detail Page to `gs-command-center.html`, modeled on `index.html → Performance → Location (Truck Stops)` (the `pg-tsdetail` surface). Co-exists with the existing slide-in drawer. Hero KPI strip at top, two-column detail area below, Print + Export CSV.

---

## Goal

The slide-in drawer is great for the "click → see → close → click another stop" workflow. But when a GS is on the phone with a site manager and needs to walk through every number — gallons, revenue, profit, vendor enrollments, ROI, opportunities — they need a real dashboard view. This phase adds that dashboard.

The page is **anchored on the immediate-read pattern**: top of page = at-a-glance KPI cards (gallons MTD, revenue, profit, ROI, vendor enrollment status, rewards rate, membership status). Below = drill-in detail. Cards already built in Phases 1-3 get reused; new cards (Revenue & Profitability with monthly expand, Rack Information, Charts, Discounts by Aggregator & Fleet, 6-month history table) are ported or added.

## Non-goals

- **Replacing the drawer.** Both surfaces ship; the drawer keeps current behavior. New "🗗 Open full page" button on the drawer header navigates to the page.
- **URL routing / deep links.** The page is a tab in the existing `gs-command-center.html` tab bar (hidden by default, shown when a stop is opened). No browser back support, no shareable URL. Same pattern every other view in the file uses.
- **Per-stop $/gallon override.** The Revenue & Profitability card uses the same network-wide constants `REV_PER_GAL = 0.05` and `COST_PER_GAL = 0.02` ported verbatim from `index.html`. Per-stop override is a future enhancement (would benefit from a real backend).
- **Editing fuel data on the page.** The page reads `roadys_fuel.GD[stopId][month]` as-is. Fuel data entry stays in `index.html`'s Fuelman page. The page surfaces the data; it doesn't manage it.
- **Standalone Notes textarea.** The drawer's Activity Log is the existing notes pattern; we surface that on the page rather than introducing an `index.html`-style free-form Notes box. (Phase 6 — old Phase 5 — adds the structured Notes panel.)

---

## Architecture

### File scope

All edits land in `gs-command-center.html`. No new HTML files. No new bundled scripts (Chart.js is already loaded for the Master Dashboard from Phase 2; reused here).

### New tab + panel

Hidden by default in the existing top tab bar:
```html
<div class="tab" data-tab="stop-detail" id="tab-stop-detail" style="display:none" onclick="switchTab('stop-detail',this)">📊 Stop Detail</div>
```

New panel:
```html
<div class="panel" id="p-stop-detail"><div class="container" id="stop-detail-content"></div></div>
```

### State

Two new module-level globals:
- `let _stopDetailActiveStopId = null;` — which stop the page is currently rendering (null when page closed).
- `let _stopDetailReturnTab = null;` — which tab to return to when "← Back" is clicked.

### Navigation helpers

```js
function openStopDetailPage(stopId){
  // Stash current tab, show stop-detail tab, render the page, switch to it.
}
function closeStopDetailPage(){
  // Hide the stop-detail tab, switch back to _stopDetailReturnTab, reopen the drawer at the same stopId.
}
```

The `← Back` button calls `closeStopDetailPage()`. The drawer's new `🗗 Open full page` button calls `openStopDetailPage(siteId); closeDrawer();`.

### Modes

- **Per-GS users (PINs 1001-1006):** all editable fields on the page (Membership card, Rewards card, ROI components) save through `saveStopRecord` exactly as on the drawer.
- **Manager (PIN 9999) in All-GS rollup:** page renders read-only — same gating pattern Phase 1 established for the drawer in All-GS view.

### Data sources reused

| Card | Source | Notes |
|---|---|---|
| KPI Hero strip | `roadys_fuel.GD`, `vendorStatsForStops`, `loadStopRecord`, `vendorOpportunityForStop`, `computeStopROI` | Composes existing helpers — no new sources |
| Membership / Rewards / Value Prop / Vendor Programs / Vendor Opportunity / ROI / CRM / Calculations / Activity Log | Existing Phase 1-3 helpers | Verbatim renderers |
| Revenue & Profitability | `roadys_fuel.GD[stopId][m].gallons` × `REV_PER_GAL_GS` / `COST_PER_GAL_GS` constants | New constants & helpers below |
| Rack Information | `roadys_fuel.GD[stopId][m].rack` | Read-only display |
| Charts (6-mo gallons line, Fleets/Aggregators doughnut) | `stopGallons`, `GD[stopId][m].aggregators[]` / `.fleets[]` | Chart.js (already loaded) |
| Discounts by Aggregator & Fleet | `GD[stopId][m].aggregators[]` and `.fleets[]` (full records: cost_plus, retail_minus, processor, etc.) | Read-only port from index.html |
| 6-month history table | `MOS` array + `stopGallons(sid, mo)` per period | Compares each month to prior |

### New constants & helpers

```js
// Network-wide revenue/profit assumptions (ported from index.html)
const REV_PER_GAL_GS  = 0.05;   // $/gal revenue
const COST_PER_GAL_GS = 0.02;   // $/gal cost
function estRevenueGS(gallons, rack){ return (+gallons || 0) * REV_PER_GAL_GS; }
function estProfitGS(gallons, rack){  return (+gallons || 0) * (REV_PER_GAL_GS - COST_PER_GAL_GS); }

// Page render entry point
function renderStopDetailPage(stopId);

// Card renderers (each returns an HTML string, sits next to Phase 1-3 drawer renderers)
function pageKpiHeroHTML(stopId);
function pageRevProfitHTML(stopId);
function pageChartsHTML(stopId);
function pageDiscountsHTML(stopId);
function pageRackHTML(stopId);
function pageHistoryTableHTML(stopId);

// Interaction helpers
function openStopDetailPage(stopId);
function closeStopDetailPage();
function toggleRevProfitMonthly(btn);    // +/- expand on Revenue card
function exportStopDetailCSV(stopId);    // builds + downloads the CSV
function printStopDetail();              // calls window.print() (with @media print CSS)
```

### Browser print stylesheet

`@media print` rules hide chrome (`.topbar`, `.tabs`, `#site-drawer`, page action buttons), force the detail area to full-width single-column, allow Chart.js canvases to render at full resolution, set `page-break-inside: avoid` on each card so they don't split mid-page.

---

## Page layout

### Header bar

```
[← Back]  115 Truck Stop  ·  R03650 · Truck Stop · Roady's  ·  📍 Marshall, MI  ·  🗺 GS: Garrick  ·  Network rank #42 of 230    [🖨 Print Report] [📊 Export CSV]
```

Network rank is computed live from MTD gallons (matches `index.html`'s `showTSDetail` pattern). Always re-rendered fresh on page open.

### KPI Hero strip — 2 rows × 4 cards

| | Card | Source values |
|---|---|---|
| 1 | Total Gallons MTD | `stopTotalGallons(sid, m)` + MoM ▲▼ + YTD subline |
| 2 | Est. Revenue MTD | `estRevenueGS(gallons)` + MoM ▲▼ + YTD subline |
| 3 | Est. Profit MTD | `estProfitGS(gallons)` + `Math.round((REV-COST)*10000)/10000` $/gal margin |
| 4 | Net to Site / ROI | `computeStopROI(stopId).netCurrent` + ✓/✗ + Potential ROI subline |
| 5 | Aggregators / Fleets | counts from `GD[sid][m].aggregators.length / .fleets.length` + gallon split |
| 6 | Vendor Programs | `vendorEnrolledCount` / `vendorOpportunityForStop(sid).slice(0,10).length` missed |
| 7 | Rewards Redemption | `redeems / adds × 100`% from `stopdata` (per Phase 3 Rewards card) |
| 8 | Membership / Programs | `stopdata.membershipCost` / chips for PFF removed · Fuelman · R-Check |

Each card uses the existing `.kpi` style block in the file. Color accents match the relevant section's accent color.

### Detail area — `display:grid; grid-template-columns: 1fr 2fr; gap:14px`

**Left column** (in this order):
1. 📍 Location Details — id, company, name, address, city/state, exit, phone, group, type, status, network rank
2. 💳 Membership & Site Contact — `drawerMembershipHTML(stopId)` (reused verbatim from drawer)
3. 🎁 Rewards — YTD — `drawerRewardsHTML(stopId)` (reused)
4. 📊 Value Prop Gallons — `drawerValuePropHTML(stopId)` (reused)
5. ⛽ Rack Information — `pageRackHTML(stopId)` (NEW; read-only display of OPIS rack data)
6. 📋 Activity Log — same activity log section the drawer renders, lifted out into its own helper

**Right column** (in this order):
1. 💰 Revenue & Profitability — `pageRevProfitHTML(stopId)` (NEW)
2. ⛽ Fuel Business — `drawerFuelHTML(stopId)` (reused)
3. 📈 Charts — `pageChartsHTML(stopId)` (NEW)
4. 🏢 Vendor Programs (enrolled) — `drawerVendorStubHTML(stopId)` (reused)
5. 🎯 Vendor Opportunity (top 10) — `drawerVendorOpportunityHTML(stopId)` (reused, top-10-with-toggle from Phase 3.1)
6. 💲 Discounts by Aggregator & Fleet — `pageDiscountsHTML(stopId)` (NEW; ported from index.html)
7. 💰 ROI Calculator (Current vs Potential) — `drawerROIHTML(stopId)` (reused)
8. 📋 Recent CRM Tasks — `drawerCRMTasksHTML(stopId)` (reused)
9. 🧮 Calculations — same Calculations section the drawer renders
10. 📊 6-month History — `pageHistoryTableHTML(stopId)` (NEW)

---

## Revenue & Profitability card details

### Top — current month, always visible

Four stat tiles at top:
| Tile | Value | Color |
|---|---|---|
| Rev / Gallon (est.) | `$0.0500` | green |
| Cost / Gallon (est.) | `$0.0200` | red |
| Net / Gallon | `$0.0300` | accent |
| Freight Rate | `${rack.freight || 0.0675}` | text |

Below the tiles, one summary line: `Apr 2026: 324,580 gal · $16,229 revenue · $9,737 profit`.

### Expandable — monthly breakdown

The `[+ Show monthly breakdown]` link sits below the summary. On click, calls `toggleRevProfitMonthly(btn)`:
- The link text flips to `[− Hide monthly breakdown]`.
- A hidden `<table>` is revealed beneath, showing one row per month from January through the current month (no future-month rows). Columns: Period · Gallons · Est Revenue · Est Profit · Rev/Gal.
- Current month row is bolded.
- Empty months (no `GD[stopId][month]` entry) render `—` in numeric cells.

State is DOM-only — no localStorage persistence. Reopening the page always shows the table collapsed.

### Helpers

```js
function pageRevProfitHTML(stopId){
  // Computes month, prior, ytd via existing helpers.
  // Returns the static-top tiles + collapsed monthly table HTML.
}
function toggleRevProfitMonthly(btn){
  const tbl = btn.parentElement.querySelector('.revprofit-monthly-tbl');
  const expanded = tbl.classList.toggle('show');
  tbl.style.display = expanded ? 'block' : 'none';
  btn.textContent = expanded ? '− Hide monthly breakdown' : '+ Show monthly breakdown';
}
```

---

## Drawer integration

One new button on the drawer header, immediately to the left of the existing close (`✕`):

```html
<button class="btn" onclick="openStopDetailPage('${siteId}'); closeDrawer();" title="Open full page">🗗 Open full page</button>
```

The button is visible in all modes (per-GS and manager). On click: opens the detail page tab, switches to it, closes the drawer.

The page's `← Back` button:
```js
function closeStopDetailPage(){
  // Hide the stop-detail tab
  document.getElementById('tab-stop-detail').style.display = 'none';
  // Restore previous tab
  if(_stopDetailReturnTab){
    switchTab(_stopDetailReturnTab, document.querySelector(`.tab[data-tab="${_stopDetailReturnTab}"]`));
  } else {
    switchTab('dashboard', document.querySelector('.tab[data-tab="dashboard"]'));
  }
  // Reopen the drawer at the same stop
  if(_stopDetailActiveStopId) openSiteDrawer(_stopDetailActiveStopId);
  _stopDetailActiveStopId = null;
  _stopDetailReturnTab = null;
}
```

This means a typical GS workflow becomes:
1. Click stop in My Stops → drawer slides in
2. Click 🗗 Open full page → page replaces drawer
3. Walk through all the data on the phone
4. Click ← Back → returns to the drawer for that same stop, ready to close or move on

---

## Print + Export

### Print

`🖨 Print Report` button → `printStopDetail()` → `window.print()`.

CSS rules:
```css
@media print {
  .topbar, .tabs, #site-drawer, #stopdata-import-modal,
  .stop-detail-page-actions, .tab { display: none !important; }
  body, .panel, .container { background: #fff !important; color: #000 !important; }
  #p-stop-detail { display: block !important; }
  #p-stop-detail .container { max-width: 100% !important; padding: 0 !important; }
  .drawer-card, .card { page-break-inside: avoid; box-shadow: none !important; }
  /* Charts: Chart.js handles canvas snapshot for print automatically */
}
```

### Export CSV

`📊 Export CSV` button → `exportStopDetailCSV(stopId)`.

Builds a flat CSV with these sections (sections separated by blank rows):

```
Stop,R03650,115 Truck Stop,Marshall,MI

KPI,Value,Period,Variance
Total Gallons MTD,324580,Apr 2026,+4.2% MoM
Est. Revenue MTD,16229,Apr 2026,+4.2% MoM
...

Revenue & Profitability,Period,Gallons,Revenue,Profit,RevPerGal
,Jan 2026,298400,14920,8952,0.0500
,Feb 2026,285180,14259,8555,0.0500
...

Vendor Programs Enrolled,Vendor,Program,Avg Savings
,Sysco,PVP,$1120/mo
...

Vendor Opportunity (Top 10),Vendor,Program,Avg Savings
,Entegra,Entegra,$1120/mo
...
```

Filename: `<stopId>-<YYYY-MM>-detail.csv`. Reuses the same Blob → object URL pattern Phase 6 will use for `.ics`.

---

## Cross-cutting concerns

### Re-render hooks

- Saving any field on the Membership / Rewards card via `onMembershipChange` already triggers a drawer re-render (Phase 3 added that). Extension: also re-render the Stop Detail Page if it's currently active for the same stop.
- Switching GS via the GS selector closes the page (returns to dashboard) — same as how the drawer auto-closes today on GS switch.

### Syntax / regression gate

After every task:
1. Extract inline `<script>` content into a temp file.
2. Run `node -e "new Function(require('fs').readFileSync('tmp.js','utf8'))"`.
3. Fix any reported parse errors.

Same gate every prior phase has used.

### Commit hygiene

One commit per phase. Commit message: `GS Command Center Phase 4: Stop Detail Page`.

### Browser smoke test (Task 11-equivalent at end of phase)

1. Click any stop in My Stops → drawer opens. New 🗗 button visible in drawer header.
2. Click 🗗 → drawer closes, full page opens with Stop Detail tab active.
3. KPI Hero strip shows 8 cards in 2 rows of 4 with correct values.
4. Two-column detail area below: left column has Location/Membership/Rewards/ValueProp/Rack/ActivityLog; right column has Revenue&Profit/Fuel/Charts/Vendors/Opportunity/Discounts/ROI/CRM/Calculations/HistoryTable in that order.
5. Revenue & Profitability card: 4 stat tiles + summary line + `[+ Show monthly breakdown]`. Click → expands to a Jan-through-current-month table (no future-month rows). Click again → collapses.
6. 6-month gallons line chart + Fleets/Aggregators doughnut render via Chart.js.
7. Discounts section shows per-aggregator and per-fleet cards with cost-plus / retail-minus / net-per-gallon breakdowns.
8. `← Back` button → page closes, drawer reopens at the same stop.
9. `🖨 Print Report` button → browser print dialog. Print preview shows only page content, no chrome.
10. `📊 Export CSV` button → downloads `<stopId>-<YYYY-MM>-detail.csv`. Open in Excel — sections render correctly.
11. Manager All-GS view: page renders the same surface; saves are no-ops because `saveData()` early-returns when `getActiveGS()` is null (matches the Phase 1 drawer pattern — UI looks editable, writes don't persist).
12. Switching GS via the selector while page is open → page closes, dashboard returns.

---

## Out of scope (carry-forward to future phases)

- **Phase 5 (renumbered):** GS Management migration from `index.html`. Was the old Phase 4.
- **Phase 6 (renumbered):** Notes panel + Share Results buttons. Was the old Phase 5.
- **Phase 7 (renumbered):** Schedule Next Visit + .ics / Google Calendar URL export. Was the old Phase 6.
- **Per-stop $/gallon margin override.** Out of scope — uses network constants. Future enhancement, ideally paired with the Supabase backend migration.
- **Cloud sync of `stopdata`.** Same separate sub-project queued post-Phase-7.
- **Browser back / URL routing.** Out of scope — the page is a session-state tab, not a route.
- **Notes textarea (free-form `index.html`-style).** The Activity Log replaces it. If a use case for free-form notes emerges, Phase 6 (Notes panel) is the natural home.
