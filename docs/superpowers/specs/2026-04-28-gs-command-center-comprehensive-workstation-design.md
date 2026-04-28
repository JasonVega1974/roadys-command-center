# GS Command Center — Comprehensive Workstation

**Date:** 2026-04-28
**File touched:** `gs-command-center.html` (single file, no new HTML pages)
**Branch:** new feature branch off `main` (HTML-only work; the React migration in `react-app/` is untouched)

## Goal

Turn `gs-command-center.html` from a thin per-GS notepad into a comprehensive workstation a Growth Strategist can use to manage their entire territory, and a Manager can use to see all six territories rolled up.

The upgrade adds:

1. A Manager-only **GS selector** in the topbar that switches the workstation between an All-GS rollup and any specific GS's view.
2. A **Master Dashboard** (All-GS rollup) with network KPIs, a per-GS performance grid, comparison charts, and cross-territory critical/activity feeds.
3. A redesigned **Per-GS Dashboard** that includes mirrored Fuel, Rewards, and Vendor Programs sub-dashboards (read-only, scoped to that GS's territory).
4. A redesigned **Calculator** modeled on the user's Excel screenshot: side-by-side Retail-Minus and Cost-Plus models, addable line items, saved named scenarios, optional stop/fleet links, and a Manager-only **Import Model** flow that loads coefficient defaults from an Excel file.
5. **Sortable columns** on every table.
6. **Import** flows on Calculator (Excel — model + scenarios), CRM/Tasks (CSV), and Critical (CSV).

## Non-goals

- No changes to `index.html`, `implementation.html`, or any portal in the React migration.
- No new Supabase tables. The existing `vp_enroll` table is read; nothing new is written.
- No write-back to `roadys_fuel`, `roadys_kpi`, `roadys_vp_enroll` from this workstation. They are read-only mirrors.
- No new login system. The existing per-GS PIN map stays.
- No general-purpose Excel formula engine. The model file is a fixed-shape coefficient sheet.

## Modes and the GS selector

The PIN map drives mode. There are three modes:

| Mode | Trigger | Selector |
|---|---|---|
| **GS** | Non-manager PIN (Logan, Burt, Maria, Shannon, Stefanie, Steph) | No selector. Workstation is locked to that GS's territory. |
| **Manager — All GS** | Manager PIN 9999, default selection | Topbar reads `Viewing: All GS ▼`. Master Dashboard renders. CRM, Calendar, Critical, Calculator tabs render an empty state with a hint to pick a GS. |
| **Manager — Specific GS** | Manager PIN, picks a GS in dropdown | Topbar reads `Viewing: <GS name> ▼`. Workstation behaves identically to that GS logging in. |

Manager selection persists in `localStorage['gs_cmd_manager_selection']`. A small data-access module (Section "Data layer") routes every read through `getActiveGS()` so renderers stay agnostic to mode.

## Master Dashboard (All-GS rollup)

Renders into `#dash-content` only when `isAllGSMode()` is true. Layout:

**Row 1 — Network KPIs.** Total stops in network, active Roady's stops, Fuelman gallons MTD/YTD, Rewards revenue MTD/YTD, vendor-program enrollment count, **Total Potential New Revenue** (sum of Calculator scenarios across all GS namespaces).

**Row 2 — GS Performance grid.** Six cards (one per GS) with name, region color stripe, and mini-stats: stops in territory, Fuelman MTD with % of network, Rewards MTD, vendor enrollments, saved scenarios + summed potential, last-30-days activity logs, open critical items. Click a card to switch the dropdown to that GS.

**Row 3 — Comparison charts.** Chart.js, matching `index.html` chart conventions:

- Bar: Fuelman gallons MTD by GS
- Bar: Rewards revenue MTD by GS
- Stacked bar: vendor enrollments by GS, segmented by vendor category
- Line: Total Potential New Revenue by GS over the last six months (from scenario `created` timestamps)

**Row 4 — Network Critical Items table.** Open critical items across every GS's namespace, sortable, with a GS column. Clicking a row drills into that GS.

**Row 5 — Recent Activity feed.** Last fifty activity logs across all GS namespaces, newest first, GS shown.

The rollup walks `Object.keys(REGIONS)` and reads each per-GS localStorage namespace. If a manager logs in from a fresh device, per-GS local data is empty for any GS that has not used this device — that's an acceptable limitation. Network-wide KPIs from the shared `roadys_*` keys still work because `index.html` shares the origin.

## Per-GS Dashboard

Renders into `#dash-content` for any GS mode (GS login, or Manager picked a specific GS).

**Row 1 — Territory KPIs.** Existing KPIs (stops, type breakdown, activity logs, upcoming, overdue) plus **Saved Scenarios** count and **My Potential New Revenue** sum.

**Row 2 — Three mirrored sub-dashboards** as collapsible cards. Each card shows a `Last synced: HH:MM` timestamp and a small Refresh button.

**2a. Fuel** (mirrors `pg-fuelman` from `index.html`). Reads from `localStorage['roadys_fuel']` (`GD` object), filtered to this GS's stops:

- KPIs: Fuelman gallons MTD, YTD, active Fuelman stops in territory, average gallons/stop
- Chart: line chart of monthly Fuelman gallons (12 months)
- Table: stops with Fuelman gallons (current, prior, % change), sortable

**2b. Rewards** (mirrors `pg-kpi-rewards`). Reads from `localStorage['roadys_kpi']` (`KD` object) filtered through `KPI_MD` metadata:

- KPIs: monthly Rewards revenue, YTD, active Rewards stops in territory
- Chart: line chart of monthly rewards revenue
- Table: per-stop rewards breakdown for this territory, sortable

**2c. Vendor Programs** (mirrors `pg-kpi-vendors`). Reads from `localStorage['roadys_vp_enroll']` (`VP_ENROLL` object) and the Supabase `vp_enroll` table:

- KPIs: vendor enrollments in territory (stop×vendor count), top vendor by enrollments, stops with at least one enrollment
- Top 10 Vendors (in this territory), sortable
- Per-stop enrollment grid, sortable, expandable per stop

**Row 3 — Needs Attention.** Existing panels (no contact / overdue / scheduled / critical) stay.

**Row 4 — Recent Activity.** This GS's last twenty activity logs.

**Data scoping.** All metrics filter through `stopsForGS(gsName)`, which is `MEMBERS.filter(m => REGIONS[gsName].states.includes(m.state))`. A GS in Wisconsin sees only WI numbers, never the network total.

## Calculator

Replaces the current single-input calculator at `#calc-content`. Three layers.

### Imported model

A new **`📥 Import Model`** button on the Calculator tab is enabled only for Manager. It accepts an `.xlsx` file with a sheet named `Coefficients` and a two-column layout: `Name | Value`. Recognized names:

| Name | Used in |
|---|---|
| `def_pct_of_diesel_default` | DEF row, % of diesel sales |
| `def_price_per_gallon_default` | DEF row |
| `inside_store_avg_gal_per_txn` | Inside Store row |
| `inside_store_avg_ring` | Inside Store row |
| `default_diesel_price_retail` | Current/Potential rows, Retail-Minus side |
| `default_diesel_price_costplus` | Current/Potential rows, Cost-Plus side |
| `default_retail_discount` | Current row, Retail-Minus side |
| `default_costplus_discount` | Current row, Cost-Plus side |
| `processor_fee_pct_default` | Optional net-margin calc |

Unknown names are ignored with a console warning. The imported coefficient set persists to `localStorage['gs_cmd_calc_model']` and is read by every new scenario as its default values. A small `Model: imported <date> by <user>` badge appears under the button. With no model imported, hardcoded fallback defaults ship with the file so the calculator works on day one.

The model is loaded with SheetJS (XLSX) via CDN, lazy-loaded the first time the user clicks an import button.

### Scenario editor

Two columns side by side, **Retail-Minus Model** and **Cost-Plus Model**. Each column has five row groups:

1. **Current** — Discount / Current Gallons / Diesel Price → *Diesel Sales*
2. **Potential New** — Discount / Potential Gallons / Diesel Price → *Diesel Sales*
3. **New DEF Gallons** — DEF % / DEF Gallons / DEF $/gal → *DEF Sales*
4. **New Inside Store Sales** — Avg gal/txn / # transactions / Avg ring → *Inside Store Sales*
5. **Total Potential New Revenue** = Potential Diesel Sales + DEF Sales + Inside Store Sales

Italicized cells are computed; orange-highlighted cells are inputs. Live recalculate on every keystroke.

Above the two columns:

- **Scenario Name** (text, required)
- **Stop** (dropdown of the active GS's stops, optional — links to a `MEMBERS` row)
- **Fleet** (free text, optional)
- **Notes** (textarea)

**Add line items.** Each row group has a small `+ Add line` button. Adds an additional sub-row with the same input columns and an optional label (for example, "Premium Diesel discount tier 2"). Sub-row Diesel Sales contributes to the parent group's total. Stored as a `lineItems` array on each row group; an empty array means classic single-line behavior.

### Saved scenarios

Above the editor, a sortable table of scenarios. In a GS view, only that GS's scenarios. In Manager All-GS view, scenarios across territories with a GS column.

| Name | GS | Stop | Fleet | Created | Updated | Total Potential | Actions |

Actions: Open, Duplicate, Delete. A second button on the tab, **`📥 Import Scenarios`**, accepts a multi-sheet `.xlsx` matching the screenshot's two-model layout (one sheet per scenario). Import is additive and never overwrites.

### Persistence

Scenarios live in `localStorage['gs_cmd_<gsName>_scenarios']` — same per-GS pattern as the rest of the file. Manager All-GS rollup walks every GS namespace via `forEachGS`. No Supabase for scenarios in this iteration.

### Stop drawer surfacing

The site detail drawer gains a **Calculations** section that lists scenarios linked to that stop (name, fleet, total potential, click to open in the Calculator tab).

## Sortability

A single helper `sortableTable(tableEl, defaultSortColIdx, defaultDir)`:

- Adds `▲▼` chevron indicators to every `<th>`
- Click cycles asc → desc → unsorted → asc
- Smart cell-value reading: numeric (strips `$`, `,`, `%`), date (ISO), string fallback
- Persists last sort per table in `localStorage['gs_cmd_sort_<tableId>']`

Applied to every table: Territory stops, CRM/Tasks list view (board view stays unsorted), Calendar list view (month grid stays as-is), Rates & Fees, Fuel Intro, Critical, Saved Scenarios, the per-GS Fuel/Rewards/Vendor sub-tables, and the Master GS Performance grid when toggled to a table view.

## Import

Three import surfaces, all powered by the same SheetJS dependency loaded once on first use.

**Calculator — Excel `.xlsx`**

- Manager-only: `📥 Import Model` → coefficients sheet → `localStorage['gs_cmd_calc_model']`
- `📥 Import Scenarios` → multi-sheet xlsx, additive only. Writes to the active GS's `_scenarios` namespace; disabled in Manager All-GS view (same hint as CRM/Critical: pick a specific GS first).

**CRM / Tasks — CSV**

- Columns: `site_name, site_id (optional), date, type (call|task|note|followup|urgent), subject, notes, contact_name`
- Adds rows to `localStorage['gs_cmd_<gsName>_logs']`. Site is matched by `site_id`, falling back to fuzzy `site_name` match (asks the user to confirm if ambiguous). Skips duplicates by `(site_id, date, subject)`.
- Manager All-GS view: import is disabled with a hint to pick a GS first.

**Critical — CSV**

- Columns: `site_name, site_id (optional), severity (low|med|high), title, description, due_date`
- Adds to `localStorage['gs_cmd_<gsName>_critical']`.

## Data layer

A new module at the top of the script section. Functions:

```
getActiveGS()           // GS name string (a REGIONS key) when scoped to one GS;
                        // null in Manager All-GS mode
isAllGSMode()           // true when manager logged in AND selection === "All GS"
gsKey(suffix)           // `gs_cmd_${getActiveGS()}_${suffix}`; throws in All-GS mode
                        // (use forEachGS instead)
forEachGS(fn)           // iterates REGIONS keys; fn receives (gsName, ns) where
                        // ns is a helper that returns gs_cmd_<gsName>_<suffix>
loadShared(key)         // cross-app reads: roadys_fuel, roadys_kpi, roadys_vp_enroll;
                        // logs a console warning on shape mismatch
loadVPEnrollFromSupabase()  // optional pull on Manager dashboard load
stopsForGS(gsName)      // MEMBERS filtered by REGIONS[gsName].states
```

Every renderer (`renderDashboard`, the new `renderMasterDashboard`, `renderCRM`, `renderCalculator`, etc.) is rewritten to call these helpers instead of touching `localStorage` or `currentUser` directly. Without this refactor, every new feature would sprinkle `currentUser.name` checks. With it, the renderers stay clean and the mode logic stays in one place.

`getRoadysSB()` is copied from `index.html` (same `ROADYS_SB_URL` and `ROADYS_SB_ANON` constants). On Manager dashboard mount we pull the `vp_enroll` table to keep vendor numbers fresh when `index.html` hasn't been opened recently. Other Supabase tables (`impl_sites`, `crm_leads`, `promotions`) are out of scope for this iteration.

## MEMBERS

`gs-command-center.html` today references a `MEMBERS` global it does not define. The dashboards need it. We add a one-time extraction:

- A new `scripts/extract-gs-members.mjs` slurps the `MEMBERS` array literal from `index.html` between known line markers and writes it into `gs-command-center.html` between `// === MEMBERS START ===` / `// === MEMBERS END ===` markers. Same pattern as `scripts/extract-vendors-data.mjs` in the React migration.
- `CLAUDE.md` gets a one-line note: edits to `MEMBERS` in `index.html` require re-running the extractor.

## What does not change

- Login PIN system, PIN map, Logout flow.
- Existing Rates & Fees aggregator data (hardcoded list). Sortable, but no import.
- Fuel Intro tab logic (auto-derived from "stops with zero call logs"). Sortable, no import.
- Calendar month grid. List view becomes sortable; the month grid stays as-is, no import.
- Site detail drawer existing sections. The Calculations section is added; nothing existing is removed.
- React migration in `react-app/`.

## Risks and mitigations

- **Cross-page localStorage drift.** GS Command Center reads keys (`roadys_fuel`, `roadys_kpi`, `roadys_vp_enroll`) written by `index.html`. If `index.html` ships a schema change, this file silently breaks. Mitigation: a small `loadShared(key)` wrapper that validates shape and logs a warning on mismatch. CLAUDE.md gets a note that those three keys are now load-bearing for two pages.
- **Manager fresh-device limitation.** Per-GS localStorage namespaces (`gs_cmd_<gsName>_*`) only exist on devices where each GS has logged in. A Manager on a fresh laptop sees empty CRM/scheduled/critical/scenarios for any GS that has not used that device. Acceptable for v1; a future iteration could sync per-GS data to Supabase. Documented in the "What does not change" section as out of scope.
- **MEMBERS extraction drift.** The extractor relies on stable line markers. Mitigation: the script reads markers in `index.html` and fails loudly if they're missing, rather than emitting a partial array.
- **SheetJS bundle weight.** Loaded only on first import click. No effect on cold load.
- **Manager All-GS scenarios sum.** Walks all six GS namespaces; with hundreds of scenarios per GS, the summing is still milliseconds. No pagination needed at this scale.

## Out of scope (deferred to future iterations)

- Writing fuel/rewards/vendor data from this workstation.
- Cloud sync of per-GS CRM, scheduled calls, tasks, critical items, scenarios.
- Mobile-specific UX beyond the existing media queries.
- Per-stop deep-dive page (the drawer is enough for now).
- Cost-Plus margin calculator beyond what the screenshot shows.
