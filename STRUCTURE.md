Last mapped: 2026-04-20

# `index.html` — Structural Map
**Total line count: 14,018**

---

## HEAD (Lines 1–634)

### `<head>` — External Scripts (Lines 1–11)
- **Line 6** — `chart.js@4.4.0` (charts)
- **Line 7** — `xlsx@0.18.5` (Excel import/export)
- **Line 8–9** — `d3-array`, `d3-geo` (USA map)
- **Line 10** — `topojson-client` (USA map shapes)
- **Line 11** — `@supabase/supabase-js@2` (backend sync)

### `<style>` Block (Lines 12–634)
| Lines | CSS Section |
|---|---|
| 12–35 | `:root` CSS variables (dark/day mode color tokens) |
| 36–56 | Layout — `.app`, `.sidebar`, `.main`, `.topbar`, `.content` |
| 57–68 | Topbar, buttons, badges |
| 70–93 | Member Directory tables (`.mem-tbl`, `.onb-*`) |
| 95–116 | Service Desk (`.sd-*`) + editable KPI table cells (`.ft-cell`) |
| 122–130 | Value Props table, toggles (`.vp-tog`) |
| 133–145 | Expandable nav (`.nav-parent`, `.nav-children`), topbar period selector |
| 146–199 | KPI cards (`.kc`, `.kc-*`), territory cards, revenue section, entry forms |
| 200–215 | KPI entry form (`.eg`, `.es`), KPI table cell colors |
| 218–243 | Settings toggles (`.stg-*`, `.tog`, `.tog-sm`) |
| 245–270 | Master lock button + PIN modal (`.master-pin-*`) |
| 275–310 | Sortable tables, page search, data entry fields |
| 308–318 | PDF upload (`.pdf-drop`, `.pdf-list`) |
| 320–330 | TS tabs, overview territory |
| 339–399 | Section headers, tabs, alerts, chart grids, data tables, detail panel, notes, ranking |
| 400–432 | Search, discount cards, toast notification, profitability indicator |
| 434–459 | USA Map (`#usa-svg`, `.map-tooltip`, `.map-legend`) |
| 448–493 | Territory drill-down panel, Territory Manager Editor (`.mgr-*`) |
| 494–506 | Value Props tab (`.vp-*`) |
| 508–522 | Import/Manual Entry tabs (`.imp-*`), Hosting Info card |
| 523–526 | Scrollbar |
| 527–599 | **Implementation Portal** (`.impl-*` — full component suite: dashboard, charts, tables, tabs, task rows, team bar) |

---

## BODY (Lines 636–14,018)

### Sidebar (Lines 639–845)
- Logo block
- Navigation links: Overview, KPI submenu, Truck Stops submenu, Aggregators, Fleets, Fuelman, R-Check, Import, Value Props, Members, Implementation, Interstate V2, CRM, Settings, Rewards/Promos, Backend Plan
- Month/period selector in footer

### Main App Shell + Topbar (Lines ~636–845)

---

### PAGE BLOCKS

| Page ID | Line | Description |
|---|---|---|
| `pg-master` | 846 | Master data view (full KPI table) |
| `pg-gs-metrics` | 854 | Growth Strategist metrics |
| `pg-kpi-financial` | 903 | KPI — Financial |
| `pg-kpi-membership` | 911 | KPI — Membership |
| `pg-kpi-bizdev` | 919 | KPI — Business Development |
| `pg-kpi-rewards` | 927 | KPI — Rewards |
| `pg-kpi-ptp` | 939 | KPI — PTP |
| `pg-kpi-ecred` | 947 | KPI — eCred (tabs: Network, GS, PTP, Vendor, Stop Level) |
| `pg-kpi-vendors` | 976 | KPI — Vendors (KPI cards, CSV upload, Top 10 Vendor Programs table, Full Enrollment View) |
| `pg-crm` | 1038 | **CRM / Business Development** (KPI strip, tab nav: Kanban/Pipeline/Activity/Contacts/Import; Lead Detail Modal at 1154) |
| `pg-kpi-entry` | 1168 | **KPI Entry Forms** (form inputs for all KPI categories) |
| `pg-kpi-fulltable` | 1181 | Full KPI table view |
| `pg-overview` | 1200 | Overview dashboard (USA map at 1233, Territory Drill Panel at 1256, GS Cards at 1270, GS Assignment Editor at 1274, Import/Export at 1323) |
| `pg-truckstops` | 1362 | Truck Stops (tabs: List, Fuel by Location, Rewards by Location, Vendor Programs by Location, Territory, Data Entry at 1428, Import at 1487, API Connector at 1497) |
| `pg-tsdetail` | 1528 | Truck Stop Detail view |
| `pg-aggregators` | 1570 | Aggregators (KPI cards, aggregator cards, charts, breakdown table, CSV import) |
| `pg-fleets` | 1611 | Fleets (KPI cards, top 25 fleet cards, charts, breakdown, CSV import) |
| `pg-fuelman` | 1656 | Fuelman |
| `pg-rcheck` | 1664 | R-Check |
| `pg-import` | 1673 | Import page (tabs: KPI Data Source, Fuel Data Source, Vendor Data Source, Quick Actions, Bulk Entry Table at 1794, Manage Stops at 2012) |
| `pg-valprops` | 2055 | Value Propositions (KPI cards, VP table, charts, VP Form Modal at 2096, Auto-Calc Display at 2146) |
| `pg-mem-contacts` | 2168 | Member Directory — Contacts |
| `pg-mem-locations` | 2185 | Member Directory — Locations |
| `pg-mem-onboarding` | 2201 | Member Directory — Onboarding |
| `pg-implementation` | 2222 | **Implementation Portal** (KPI dashboard at 2242, charts at 2245, Sites/Templates sub-tabs at 2262, New Site Modal at 2297, Notes Modal at 2320) |
| `pg-interstate-v2` | 2333 | Interstate V2 (tabs: Network Summary, Aggregators, Fleets, Fuelman, R-Check, Rewards, Vendor Programs, Growth Strategist, Full GitHub Issue Spec at 2442) |
| `pg-settings` | 2453 | Settings (Theme toggle, Section visibility, PIN & Page Locking, Data Management) |
| `pg-rewards-promotions` | 2515 | Rewards & Promotions |
| `pg-backend-plan` | 2524 | Backend Developer Plan |

---

## `<script>` Block (Lines 2537–~14,010)

| Lines | JS Section |
|---|---|
| 2537–2544 | Supabase client init (`ROADYS_SB_URL`, `ROADYS_SB_ANON`, `getRoadysSB()`) |
| 2556–2560 | Member data (368 stops from CSV) |
| 2561–2567 | Months array |
| 2568–2614 | Data model (stop/KPI structures) |
| 2615–2655 | Sample data — Morehead Shell + generated network |
| 2656–2749 | Helpers (formatting, math, date utils) |
| 2750–2985 | **Navigation** (tab/page routing, sidebar) |
| 2986–2988 | Fuel Network Overview |
| 2989–3424 | **KPI Data System** (load/save, month logic; sub-sections: Financial at 3205, Membership at 3340, Rewards at 3351, Vendor Programs at 3367, Fuel Programs at 3372, BizDev/PTP at 3381) |
| 3425–3512 | KPI helpers |
| 3513–4356 | **KPI Pages** (render functions for all KPI tab pages) |
| 4357–4437 | Territory Overview (Overview page "By Territory" tab) |
| 4438–4522 | Territory Page (Truck Stops → Territory tab) |
| 4523–4582 | Truck Stop List |
| 4583–4720 | Truck Stop sub-views: Fuel, Rewards, Vendor Programs |
| 4721–4936 | Truck Stop Detail |
| 4937–5164 | **Aggregators Page** |
| 5165–5388 | **Fleets Page** |
| 5389–5464 | Discounts Page |
| 5465–5597 | **R-Check** |
| 5598–5755 | Import / Export |
| 5756–5799 | Export — Combined KPI + Fuel data |
| 5800–5844 | Document Storage (PDF uploads per stop) |
| 5845–5864 | Print & Export for Truck Stop Detail |
| 5865–6011 | **Data Entry Functions** |
| 6012–6097 | Smart CSV Downloads |
| 6098–6170 | API Connector (Data Entry tab) |
| 6171–6777 | **Interstate V2 Spec** (full rendered spec/doc generator) |
| 6778–7024 | **Settings** — Visibility toggles, PIN lock |
| 7025–7060 | Init (app startup) |
| 7061–7102 | Import Tab Switcher |
| 7103–7210 | *(unlabeled — import/export helpers)* |
| 7211–7259 | Bulk Table |
| 7260–7497 | **Value Propositions** |
| 7498–7745 | **USA Territory Map** (D3/TopoJSON render, FIPS → state mapping) |
| 7746–8006 | Territory Manager Editor (map page) |
| 8007–8022 | CSV Export (territory) |
| 8023–8082 | CSV Import (territory) |
| 8083–8143 | Sortable Tables — event delegation |
| 8144–8194 | Page Search — table filter |
| 8195–8450 | *(CRM rendering functions)* |
| 8451–8724 | **Manage Truck Stops** — Add / Remove / Offboard |
| 8725–8750 | Theme (Day / Night mode) |
| 8751–8985 | **Member Directory System** |
| 8986–9362 | **Vendor Programs System** (includes Supabase upsert at 9276) |
| 9363–9999 | **Service Desk** |
| 10000–11356 | **Implementation Portal JS** (load/save/render, Supabase upsert at 10466, JSON import at 11356) |
| 11356–11466 | Implementation JSON import + Supabase realtime `.subscribe()` at 11460 |
| 11467–12577 | **Rewards Promotions System** (includes Supabase `.upsert()` at 11805) |
| 12578–13311 | **Backend Developer Plan** (SQL/code spec generator) |
| 13312–13339 | **Supabase Sync Layer** — header + sync status indicator |
| 13340–13420 | **CRM — Supabase Sync** (`crmLoadFromSupabase`, `crmSaveLeadToSupabase`) |
| 13421–13535 | **Implementation — Supabase Sync** (`implLoadFromSupabase`, `implSaveSiteToSupabase`, `implDeleteSiteFromSupabase`) |
| 13537–~14010 | **Enhanced Page Loaders** (`pgCRMWithSync`, `pgImplWithSync` — load localStorage first, then refresh from Supabase) |
