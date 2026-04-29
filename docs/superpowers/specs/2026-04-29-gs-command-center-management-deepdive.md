# GS Command Center — Management Migration & Stop Deep-Dive

**Date:** 2026-04-29
**Branch:** `gs-command-center-workstation`
**Predecessor:** [2026-04-28 comprehensive workstation design](2026-04-28-gs-command-center-comprehensive-workstation-design.md) — already shipped through Phase 5-2 + polish.
**Scope:** five-phase expansion of `gs-command-center.html` adding a Stop Deep-Dive drawer (the architectural anchor), vendor program enrichment, GS Management migration from `index.html`, results/plan documentation, and calendar-integrated visit scheduling.

---

## Goal

Bring the GS Management surface from `index.html` into `gs-command-center.html` without duplication, and add the deep-stop workflow GSes need to (1) tell a site manager their membership cost, fuel business decomposition, and trend, (2) identify vendor programs in play, (3) document results and plans, and (4) schedule the next visit straight onto the GS's real calendar.

The single architectural anchor is the **Stop Deep-Dive Drawer** — a right-side slide-in panel reachable from any surface that mentions a stop. Every other phase plugs into it.

## Non-goals

- ROI tracker / rebate calculations from `vendors.html` (deferred to a later spec).
- Real OAuth-backed calendar API integration (Google Calendar / Outlook). Ship `.ics` + Google Calendar URL only — both work without a backend.
- Bulk CSV import for stop-level membership cost.
- Cloud sync of `gs_cmd_*` localStorage keys.
- Replacing `index.html` outright. It continues to own data entry surfaces (Fuelman, Rewards, Vendor enrollment); GS Command Center reads via the existing localStorage bridges.

## Out of scope checks (kept narrow on purpose)

The previous workstation spec deferred a "Vendor display names — VP_VENDORS lives in index.html and would need an extraction pass like MEMBERS" item. That deferred item is **in scope** here as Phase 2. The previous spec also deferred "Fuel monthly chart and per-stop table on the Per-GS Fuel card" — Phase 1's Fuel Business card on the drawer covers the per-stop slice; the monthly chart on the Per-GS Fuel card stays deferred.

---

## Architecture

### File scope

All edits land in `gs-command-center.html` (single-file workstation, ~3000 LOC today). One supporting one-liner write is added to `vendors.html` (Phase 2) and one-liner read is added to `index.html` init (Phase 3). No new HTML files. No new bundled scripts. Inline JS only.

### New localStorage keys

| Key | Owner | Shape | Purpose |
|---|---|---|---|
| `gs_cmd_<gsName>_stopdata` | per-GS | `{ [stopId]: { membershipCost, siteMgrName, siteMgrEmail, siteMgrPhone, notes:[…], visits:[…] } }` | GS-editable per-stop data: membership dues, site-manager contact info, timestamped notes, scheduled visits. |
| `gs_cmd_<gsName>_drawer` | per-GS, transient | `{ openStopId, lastOpenedAt }` | Restores the drawer's last-open stop on reload. |
| `roadys_vp_vendors` | shared, written by `vendors.html` | `{ VP_VENDORS:[…], progDetails:[…], _ts: epoch }` | Bridge for vendor master data. Read by `gs-command-center.html`; inline fallback covers the first-visit gap. |
| `roadys_gs_config` | shared, written by `gs-command-center.html` | `{ MANAGER_MAP, REGIONS, _ts: epoch }` | Source of truth for GS territory configuration after Phase 3. `index.html` reads on init and overlays its in-memory copy. |

`gs_cmd_<gsName>_sched` already exists from prior phases and powers the in-app calendar; visit scheduling (Phase 5) reuses it directly.

### Modes

- **Manager (PIN 9999) in All-GS rollup:** drawer opens for any stop in any GS's territory; all fields are read-only; share buttons disabled; notes from all GSes are visible (each tile chipped with the writing GS's name); Manager Editor (Phase 3) is fully editable.
- **Per-GS user (PINs 1001-1006):** drawer fully editable for stops in their territory; stops outside their territory don't appear on their dashboard's "My Stops" table but can still be reached read-only via the global stop search; Manager Editor is hidden, replaced by a read-only "My Territory" view of their own card.

---

## Phase 1 — Stop Deep-Dive Drawer

The architectural anchor. Build the drawer first; later phases enrich it.

### Surface

Right-side slide-in panel, ~640px wide on desktop, full-width on narrow viewports, scrollable. Closes on ESC, scrim click, or X button. Single scrollable column (not tabs).

Five stacked cards in this fixed order:

1. **Header** — `${stopName}` (large), `${stopId} · ${type} · ${group}`, full address with exit, status pill, GS name. Close button top-right.
2. **Membership & Site Contact** (editable) — purple accent border. Inputs for `membershipCost` (formatted as currency on blur), `siteMgrName`, `siteMgrEmail`, `siteMgrPhone`. Save on blur via `saveStopData(gs, stopId, partial)`.
3. **Fuel Business — `${monthLabel}`** (cyan accent) — three-column grid: Total Gallons / Fleet Gallons / Aggregator Gallons. Each tile shows current month value, a `▲/▼` MoM% pill (green up, red down), a YoY% pill, and a YTD subline. All three derive from `roadys_fuel.GD[stopId][YYYY-MM]` (existing envelope: `{gallons, aggregators[], fleets[], rack}`).
4. **Vendor Programs (`${enrolledCount}` enrolled)** (green accent) — Phase 2 fills this in. Phase 1 stub shows enrolled vendor IDs with a "Vendor names sync from vendors.html — Phase 2" muted caption.
5. **Recent CRM Activity** (amber accent) — pulls tasks from `gs_cmd_<gsName>_tasks` filtered by `siteId === stopId`, last 5, click → opens task modal (existing flow).

Phases 4 and 5 add Notes and Share+Schedule cards beneath these five.

### Entry points (Q2 = E)

Three wired in Phase 1; the fourth (Territory Map) lands in Phase 3 because the map itself is being migrated then.

- **Per-GS Dashboard "My Stops" table** (Phase 1) — new sortable table on the per-GS dashboard listing every stop in that GS's territory with columns: Name · City · State · MTD Gallons · YTD Gallons · ▲▼ MoM. Row click → `openStopDrawer(stopId)`.
- **CRM Task Board / List / Activity Log** (Phase 1) — task tiles already display `${stopName}`. Wrap that span in a click handler that calls `openStopDrawer(siteId)`. Stop name becomes a hover-highlighted link.
- **Header global search** (Phase 1) — new input in the workstation header: type any part of a stop name or ID, autocomplete shows up to 8 matches across all stops the user has access to (per-GS = territory only; manager = all). Enter or click → `openStopDrawer(stopId)`. Manager-mode searches across the whole network and opens drawers read-only.
- **Territory Map** (Phase 3) — the migrated USA map's drill panel lists stops in the clicked state; each stop row opens the drawer. Wired as part of Phase 3's port; not available before then.

### New helpers

```
stopFleetGallons(stopId, m)          // sum GD[stopId][m].fleets[].gallons
stopAggregatorGallons(stopId, m)     // sum GD[stopId][m].aggregators[].gallons
openStopDrawer(stopId)               // builds drawer DOM, slides in, persists to gs_cmd_<gs>_drawer
closeStopDrawer()                    // slides out, clears persistence
saveStopData(gs, stopId, partial)    // shallow-merges partial into stopdata[stopId]; writes localStorage
loadStopData(gs)                     // returns { [stopId]: {…} }
renderDrawer(stopId)                 // top-level render; calls section helpers below
renderDrawerHeader(stopId)
renderDrawerMembership(stopId, gs)
renderDrawerFuel(stopId, m, p)       // m=current month, p=prior month
renderDrawerVendors(stopId)          // Phase 1 stub; Phase 2 fills
renderDrawerCRM(stopId, gs)
```

### Re-render hooks

- Calendar / month change → `renderDrawerFuel(stopId, m, p)` if drawer is open.
- Theme toggle → re-renders drawer in light-mode (existing pattern).
- `applySortability()` is called for the new "My Stops" table (existing tri-state sort infra from Phase 5-1).

---

## Phase 2 — Vendor Enrichment

### `vendors.html` change

One line near where `VP_VENDORS` is loaded:

```js
try { localStorage.setItem('roadys_vp_vendors', JSON.stringify({VP_VENDORS, progDetails, _ts: Date.now()})); } catch(e){}
```

That is the entire footprint in `vendors.html`. No other edits.

### `gs-command-center.html` changes

Inline literals appended to the data-layer block:

```js
const VP_VENDORS_INLINE = [ /* full VP_VENDORS array pasted from vendors.html line 429 */ ];
const PROG_DETAILS_INLINE = [ /* full progDetails array */ ];
```

New helper:

```js
function loadVendorMaster(){
  try {
    const cached = JSON.parse(localStorage.getItem('roadys_vp_vendors') || 'null');
    if (cached && Array.isArray(cached.VP_VENDORS)) return cached;
  } catch(e){}
  return { VP_VENDORS: VP_VENDORS_INLINE, progDetails: PROG_DETAILS_INLINE, _ts: 0 };
}
```

### Drawer Vendor Programs card

`VP_ENROLL[stopId]` (already loaded via the prior shared-data phase) lists enrolled vendor IDs. Each ID resolves through `loadVendorMaster()` to `{name, program, priority, contact, email, phone}`. Each row shows:

- Bold vendor name
- Program badge — colored by program: `PVP` cyan, `Entegra` purple, `Shop` orange, `Approved` green
- Inline contact line: `${contact} · ${phone}` (muted)
- Click → expand to show email + priority + a "Open Vendor Page" link to `vendors.html#vendor=<id>`

### Per-GS Vendor card upgrade

The Per-GS Dashboard's existing Vendor card today shows raw IDs and a count. Phase 2 swaps in vendor names sorted by enrollment count across the territory; top 5 visible; "Show all" expands.

### Stale-data hint

If `_ts` is older than 30 days OR cache is missing, drawer shows a small muted banner above the Vendor card: "Vendor data hasn't synced from vendors.html in N days. [Open vendors.html]". Non-blocking — drawer renders from inline fallback.

---

## Phase 3 — GS Management Migration

### Code being ported from `index.html`

- **Functions** (~600 LOC):
  - `renderManagerEditor`, `renderMgrCards`, `mgrToggleEdit`, `mgrRemoveState`, `mgrAddStateTo`, `mgrSaveCard`, `mgrAssign`, `mgrEditName`, `mgrRemoveMgr`
  - `renderUSAMap`, `renderUSAMapInner`, USA SVG path data, hover/click handlers, drill panel
  - `renderTerritoryOverviewGS` (summary cards block from `renderGSMetrics`)
  - Performance ranking + scoring (the 7-metric weighted scoring block)
- **Constants:** `ALL_STATES`, `STATE_NAMES`, `US_STATE_PATHS` (the SVG path data per state — the bulk).
- **HTML:** USA SVG container (`<svg id="usa-svg-gs">`), drill panel (`#map-drill-panel-gs`), manager editor row (state dropdown, color picker, region label input), summary cards container, ranking section.

`MANAGER_MAP` and `REGIONS` already exist in `gs-command-center.html` ([gs-command-center.html:440-453](../../gs-command-center.html#L440-L453)) — reused, not re-imported.

### Where it lands

The current Territory page (`renderTerritory()` at [gs-command-center.html:1449](../../gs-command-center.html#L1449)) is a small territory-card grid. Replace it with a 3-block layout on the same Territory page:

1. **Network Summary cards** (5 cards: Total Gallons / Fleet Gallons / Aggregator Gallons / VP Revenue / Rewards Revenue — group rollup).
2. **Performance Ranking + USA Map** — per-GS scoring chart + clickable USA map. State click → drill panel listing stops in the state → each stop row links to drawer (`openStopDrawer`).
3. **Manager Editor** — visible only when `currentUser.gsName === 'Manager'`. Per-GS users see a read-only "My Territory" card with display-name / color / label edits but no state reassignment.

### Source-of-truth bridge

`gs-command-center.html` becomes authoritative for `MANAGER_MAP` + `REGIONS`. Every `mgr*` mutator calls `saveGSConfig()`:

```js
function saveGSConfig(){ try { localStorage.setItem('roadys_gs_config', JSON.stringify({MANAGER_MAP, REGIONS, _ts: Date.now()})); } catch(e){} }
function loadGSConfig(){ try { const c = JSON.parse(localStorage.getItem('roadys_gs_config')||'null'); if (c){ Object.assign(MANAGER_MAP, c.MANAGER_MAP||{}); Object.assign(REGIONS, c.REGIONS||{}); } } catch(e){} }
```

`gs-command-center.html` calls `loadGSConfig()` on init (after the inline `MANAGER_MAP`/`REGIONS` defaults are declared, so localStorage overlays them).

`index.html` adds one read on its own init (overlaying the same way) and stops writing — no `mgr*` helpers in `index.html` get triggered any more because the user manages territory exclusively from `gs-command-center.html`. If `index.html` is opened first and edits happen to its in-memory `MANAGER_MAP`, those edits don't persist to `roadys_gs_config` (one-way bridge by design — keeps the source-of-truth clean).

### Re-render hooks

- Saving territory in the Manager Editor → re-render Territory page + drawer (in case its header GS chip changed) + per-GS dashboard table (if a stop's GS changed).

---

## Phase 4 — Notes + Share Results

### Notes panel

Added below Recent CRM Activity on the drawer.

Schema in `stopdata[stopId].notes`:

```js
{ id, category: 'results' | 'plan' | 'followup', text, ts, author }
```

`id = Date.now() + Math.random().toString(36).slice(2,6)`. `author = currentUser.gsName`.

UI:

- Add row: category dropdown + text input + `+ Add` button. Render below in reverse-chronological order.
- Each note: left-bordered tile, color-coded (results=cyan, plan=purple, followup=amber), header line `${CATEGORY} · ${dateStr}` (and `· ${author}` chip in manager All-GS view).
- Hover reveals `✕` to delete; click on text turns the tile into an inline editor (Calculator's existing inline-edit pattern).
- Manager All-GS view shows notes from all GSes for that stop, each chipped with the writing GS's name.

### Share Results

Three buttons. Single helper builds the source-of-truth summary:

```js
function buildStopSummary(stopId, gs){
  // returns multi-line plain text with sections:
  //   STOP REPORT, MEMBERSHIP, FUEL (Apr 2026 + YTD), VENDOR PROGRAMS,
  //   RESULTS / PLANS (last 10 notes), NEXT VISIT (if scheduled)
}
```

Buttons:

- **📋 Copy Summary** → `navigator.clipboard.writeText(buildStopSummary(...))` + toast.
- **✉️ Email Site Manager** → `window.location.href = 'mailto:'+encodeURIComponent(siteMgrEmail)+'?subject=...&body='+encodeURIComponent(summary)`. Disabled with tooltip if `siteMgrEmail` is empty.
- **🖨 Print / PDF** → populates `<div id="print-area">` with a print-styled HTML version (table-of-cards layout), then calls `window.print()`. New CSS `@media print { body * { display:none } #print-area, #print-area * { display:revert } }` ensures only the report prints.

---

## Phase 5 — Schedule Next Visit + Calendar Export

### Visit panel

Schema in `stopdata[stopId].visits`:

```js
{ id, date: 'YYYY-MM-DD', time: 'HH:mm', agenda, ts, author, status: 'scheduled' | 'completed' | 'canceled' }
```

UI:

- Form: `<input type="date">` + `<input type="time">` + agenda text + 3 buttons.
- Visits list below the form: upcoming (date >= today) chronologically; past visits collapsed in a "Show past N visits" disclosure. Each upcoming row: `✓ Mark Done`, `✕ Cancel`, `📅 Re-export (.ics)`.

### Three buttons

- **📅 Schedule + Calendar (primary, green):**
  - Appends a new visit to `stopdata[stopId].visits`.
  - Writes a calendar event to existing `gs_cmd_<gsName>_sched` so it shows up on `renderCalendar()` (existing in-app calendar).
  - Toast confirms.
- **⬇ .ics:**
  - Builds an RFC 5545 minimal calendar string:
    ```
    BEGIN:VCALENDAR
    VERSION:2.0
    PRODID:-//Roady's//GS Command Center//EN
    BEGIN:VEVENT
    UID:${stopId}-${visitId}@roadys.local
    DTSTAMP:${nowUTC}
    DTSTART:${startUTC}
    DTEND:${endUTC}            ; default duration 60 min
    SUMMARY:${agenda || 'Site visit — '+stopName}
    LOCATION:${stopAddress}
    DESCRIPTION:${oneLineSummary}
    END:VEVENT
    END:VCALENDAR
    ```
  - `Blob([ics],{type:'text/calendar'})` → `URL.createObjectURL` → triggers download `${stopId}-${date}.ics`.
- **G Cal:**
  - Builds `https://calendar.google.com/calendar/u/0/r/eventedit?text=${title}&dates=${startCompact}/${endCompact}&details=${oneLineSummary}&location=${stopAddress}` and `window.open(...)`.

All three reuse the same `buildVisitPayload(stopId, visit)` helper that returns `{title, startUTC, endUTC, location, description}`.

### Manager mode

Manager All-GS view: visits list visible read-only, all three schedule buttons disabled with tooltip "Switch to a specific GS to schedule".

---

## Cross-cutting concerns

### Syntax / regression gate

After every phase, before committing:
1. Extract the inline `<script>` content into a temp file.
2. Run `node -e "new Function(require('fs').readFileSync('tmp.js','utf8'))"`.
3. Fix any reported parse errors.
4. Any phase that re-renders a tbody (Phase 1's My Stops table, Phase 3's drill panel table) calls `applySortability()` after the re-render to preserve saved sort state.

### Commit hygiene

One commit per phase. Commit message pattern:
```
GS Command Center Phase X: <one-line summary>

<bullet list of what changed>
```
matching commits b40f3ec, 6837305, 9fc95b4 from the existing branch history.

### Testing checklist (per phase)

Phase 1: open drawer from each of the 4 entry points; edit membership cost, name, email, phone; reload page → values persist; switch GS → drawer closes; manager mode → drawer is read-only.

Phase 2: open vendors.html in a separate tab to populate `roadys_vp_vendors`; reload gs-command-center.html → vendor names appear; clear localStorage → drawer still shows names from inline fallback; bump `_ts` to 31 days ago → stale banner appears.

Phase 3: open Manager Editor as PIN 9999; reassign a state → re-render fires; reload index.html → its territory map reflects the new assignment; per-GS user (PIN 1001) → Manager Editor block hidden; click a state on the USA map → drill panel → click stop → drawer opens.

Phase 4: add a note in each category; verify color-coding; manager All-GS mode → see notes from multiple GSes with author chips; click Copy Summary → paste into a text editor and verify all sections present; click Email → mail client opens with prefilled subject + body; click Print → only the report prints.

Phase 5: schedule a visit → check in-app calendar shows it AND the visit list shows it; click .ics → file downloads, opens in Outlook/Apple Calendar; click G Cal → Google Calendar opens with prefilled event; mark a visit done → status flips, moves to past list.

---

## Open questions for the implementation plan

These are intentionally pushed to the writing-plans phase rather than locked here, because the answer changes only the order/granularity of commits, not the design:

- Should Phase 1's "My Stops" table also include columns for membership cost (once Phase 1 lands the editable field) — adds visibility but adds re-render cost.
- Print stylesheet — single-page or multi-page if notes are long? Default to allow natural pagination.
- `.ics` UID format — the proposed `${stopId}-${visitId}@roadys.local` is fine; an alternative is a UUIDv4 if the visit ID approach isn't stable.
