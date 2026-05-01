# Phase 5 — GS Management Migration (USA Map + Manager Editor)

**Status:** Spec
**Date:** 2026-05-01
**File scope:** `gs-command-center.html` only.

---

## Goal

Migrate the GS Management features from `index.html` into `gs-command-center.html`. Two pieces:

1. A **USA SVG territory map** color-coded by Growth Strategist, with hover tooltip + click-to-drill, three view modes (Gallons / Revenue / Growth).
2. A **GS Manager Editor** (manager-only, PIN 9999) that lets a Manager rename / recolor / relabel each GS, add or remove state assignments, add or remove managers entirely, with localStorage persistence and JSON export/import for backup or cross-device transfer.

Both live as new sub-tabs of the existing **Territory** tab. The current "🗺️ Territory Map" sub-tab (which shows GS cards, not a real map) becomes the new map sub-tab; GS cards move below the map as a clickable summary row. The list sub-tab stays. The editor sub-tab is hidden for non-managers.

---

## Non-Goals

- **Topojson / d3 runtime fetch.** SVG paths are pre-baked and inlined as a `STATE_PATHS` constant. No CDN dependencies, no async load.
- **Cross-device sync.** localStorage is per-browser; JSON export/import is the manual sync path.
- **Audit log.** Who changed what when is not tracked.
- **Conflict resolution.** Single-user-per-browser is assumed.
- **Permission tiers.** Two levels only (manager / non-manager), as today.
- **Schema migrations.** First version (`version: 1`); future schema changes will add migration logic.
- **Print behavior.** No print stylesheet additions for the map sub-tab.
- **Phase 6 (Notes + Share)** and **Phase 7 (Schedule + Calendar)** remain separate sub-projects.

---

## Architecture

### File structure
All edits go to `gs-command-center.html`. No new files.

### Data layer
`MANAGER_MAP` and `REGIONS` stay declared at lines 565 and 693 — their *contents* are mutated in place by editor actions and on hydration, so `const` works (object identity preserved; bindings never reassigned). All mutations clear keys then `Object.assign` to maintain reference stability for any code that captured the object reference.

Two frozen deep-clone snapshots (`MANAGER_MAP_DEFAULTS`, `REGIONS_DEFAULTS`) are captured immediately after declaration, used only by Reset-to-defaults.

A new `STATE_PATHS` constant (~50 KB inlined) holds Albers-USA projected SVG path strings keyed by state abbreviation. Generated once with a one-off Node dev script (run on the implementer's machine, not part of the deployed app) using `us-atlas@3/states-10m.json` + `d3-geo` at viewbox 900×550, then pasted as a static object literal directly into `gs-command-center.html`. The dev script is a throwaway and is not committed to the repo.

A new `STATE_NAMES` constant (verbatim port from `index.html`) provides full state names for tooltips and dropdowns.

A new `ALL_STATES` constant lists the 50 + DC two-letter abbreviations in order, used by editor dropdowns.

`FIPS_TO_STATE` (the FIPS-code → state-abbreviation lookup used by `index.html` during topojson conversion) is **not needed at runtime** — it's only consumed by the throwaway dev script that pre-bakes `STATE_PATHS`. It is not added to `gs-command-center.html`.

### Persistence
localStorage key `gs_cmd_managers` holds the override schema:
```json
{
  "MANAGER_MAP": { "AL": "Shannon Bumbalough", … },
  "REGIONS": {
    "Logan Resinkin": { "states": ["CT","DE",…], "color": "#4ade80", "label": "Northeast" },
    …
  },
  "version": 1,
  "savedAt": "2026-05-01T14:32:00.000Z"
}
```

Map mode preference persists separately as `gs_cmd_map_mode` (string: `gallons` | `revenue` | `growth`).

### Hydration order (app init)
1. `let MANAGER_MAP = { … }` and `let REGIONS = { … }` declared with hardcoded defaults.
2. `MANAGER_MAP_DEFAULTS` and `REGIONS_DEFAULTS` deep-cloned + frozen.
3. `loadManagerOverrides()` runs before any render. Reads `gs_cmd_managers`; if present and schema-valid, replaces in-place (clear keys, then `Object.assign`) so that downstream references stay valid. If parse fails, log a warning and continue with defaults.
4. App proceeds with normal init; first `renderTerritory()` paints with the loaded state.

### UI layer
The existing Territory tab's `terSubTab(view, el)` switcher becomes 3-way:
- `'map'` → `renderTerritoryMap()` (new) → calls `renderUSAMapInline()` to paint the SVG, then `renderGSCardsRow()` for the summary band beneath.
- `'list'` → `renderTerritoryList()` (rename of existing `filterTerritory`-driven render).
- `'editor'` → `renderManagerEditor()` (new) — manager-only.

The drill panel (`#ter-drill`) is reused. State click → resolves state→GS via `MANAGER_MAP[st]` → calls existing `terDrill(gs, highlightState)`. The existing `terDrill` is extended with a second optional `highlightState` parameter; when present, the matching state-breakdown row in the drill panel gets a colored border.

---

## Map Sub-Tab

### Layout
- **Sub-tab strip** with 3 entries (last hidden for non-managers).
- **Mode selector row**: 3 pill buttons — Gallons / Revenue / Growth — plus a right-aligned label "Showing: Gallon Volume by Territory" (etc.). Mode persists to `gs_cmd_map_mode`. Default Gallons.
- **SVG map**: `<svg viewBox="0 0 900 550">`, scales responsively. Each state path: `<path id="state-XX" d="..." fill="..." data-st="XX" data-mgr="..." onmouseenter="mapShowTip(...)" onmouseleave="mapHideTip()" onclick="mapClickState(...)"/>`. State 2-letter abbreviation overlay: `<text>` at the path bounding-box center, white with text-shadow.
- **GS cards row below**: existing `gsCards` rendering reused (3-column auto-fill grid, color-coded left border, label · state count · stop count · per-card stats). Click a card → `terDrill(gs)`.
- **Drill panel** (`#ter-drill`): unchanged markup; reused via `terDrill(gs, highlightState)`.

### Color logic per mode
- **Gallons** (default): each state filled with its GS's `REGIONS[gs].color`; opacity scaled `0.2 + 0.7 * (val/maxVal)` where `val` = current-month gallons for that state and `maxVal` = max gallons across all states.
- **Revenue**: same color base; `val` = `estRevenueGS(g, rack)` per state.
- **Growth**: green/red split — `rgba(0,214,143,opacity)` when MoM growth ≥ 0, `rgba(255,71,87,opacity)` when < 0; `val` = `|growth%|`. States with `null` growth (no prior data) render at minimum opacity in muted grey.
- **Unassigned states** (`MANAGER_MAP[st]==='Unassigned'`): muted grey `#3A4A6B` at 0.2 opacity, regardless of mode.

### Helpers
- `renderTerritoryMap()` — main entry, renders mode buttons + SVG + GS cards row.
- `renderUSAMapInline()` — paints `<path>` elements into `#states-group` based on current mode + state data.
- `mapShowTip(event, st)` — populates and positions `#map-tooltip` floating div with state name, GS, stop count, gallons, est. revenue. Adds `.selected` class to the hovered path.
- `mapHideTip()` — hides tooltip + removes `.selected` class.
- `mapClickState(st, gs)` — calls `terDrill(gs, st)` and scrolls drill panel into view.
- `mapSetMode(mode)` — updates `mapMode` global, persists to `gs_cmd_map_mode`, calls `renderUSAMapInline()`.
- `getCentroid(pathStr, axis)` — utility from `index.html`, returns bounding-box center of a path d-string.
- `hexToRgba(hex, alpha)` — utility from `index.html`.

### Tooltip content
```
[State Name]
GS: [Manager Name]
[N] stops · [N,NNN] gal · $[N,NNN]
```

### Empty / loading state
Inline paths means no async load. If MEMBERS is empty (theoretical), all states render at minimum opacity with a centered "No data" overlay text.

---

## GS Manager Editor Sub-Tab

### Visibility
Manager-only. The sub-tab is omitted from the strip when `currentUser?.isManager` is false. The editor render functions are still defined; they just aren't reachable through the UI.

### Layout
**Toolbar row:**
- ➕ Add Manager · 💾 Save All · 📥 Import Config · 📤 Export Config · ↺ Reset to Defaults

**Manager cards grid:**
- One `mgr-card` per GS in `REGIONS`, sorted alphabetically.
- Auto-grid `repeat(auto-fill, minmax(260px, 1fr))`, gap 12px.

### Card content (collapsed)
- Color stripe (left border = `REGIONS[gs].color`).
- GS name in color, label, state count, stop count, current-month gallons.
- State chips: each chip displays the state abbreviation and an inline ✕ for inline removal.
- ✏️ Edit button toggles the edit row open.

### Edit row (expanded)
- **Add State** dropdown: unassigned states first, then `<optgroup>` of "Reassign from other GS" (lists assigned states with current GS in parens).
- **+ Add** button → calls `mgrAddStateTo(gs)`. If reassigning from another GS, confirm dialog.
- **Color** input (`type="color"`), live-preview to map.
- **Label** input (text).
- **💾 Save** button → updates `REGIONS[gs].color`, `REGIONS[gs].label`, persists, re-renders cards + map.
- **Cancel** button → discards local input, re-renders card.
- **✏️ Rename** button → `prompt()` for new name; updates all `MANAGER_MAP` entries pointing to old name + renames the `REGIONS` key. Persists. Re-renders cards + map + GS selector dropdown.
- **✕ Remove** button → confirm; sets `MANAGER_MAP[*]='Unassigned'` for all the GS's states, deletes the `REGIONS[gs]` entry. Persists. Re-renders.

### Toolbar actions
- **➕ Add Manager** → modal or inline form: name input + color picker + initial-state multi-select. Validates name non-empty and unique. Creates `REGIONS[name]={states:[...], color, label:name.split(' ')[0]}`. Persists. Re-renders.
- **💾 Save All** → forces `saveManagerOverrides()` and shows confirmation toast. (Most edits already auto-save inline; this is a belt-and-suspenders explicit save.)
- **📥 Import Config** → file picker, reads JSON, validates schema (`MANAGER_MAP` and `REGIONS` present and well-formed), confirms before overwriting current state, merges in, persists, re-renders.
- **📤 Export Config** → downloads `gs_cmd_managers_<YYYY-MM-DD>.json` from current in-memory state.
- **↺ Reset to Defaults** → confirms; clears `gs_cmd_managers` localStorage; replaces `MANAGER_MAP` and `REGIONS` contents in-place from `MANAGER_MAP_DEFAULTS` and `REGIONS_DEFAULTS`; re-renders.

### Save semantics
All inline edits auto-save via `saveManagerOverrides()`. The 💾 Save All button is a manual confirmation path (toast feedback). Any change re-renders the map sub-tab (via `renderUSAMapInline()`) so colors update immediately.

### Validation
- Manager name: non-empty, trimmed, unique (case-sensitive match against `Object.keys(REGIONS)`).
- Color: must match `/^#[0-9a-fA-F]{6}$/` (6-digit hex).
- State: must be in `ALL_STATES`.
- Import schema: rejects with toast error if `MANAGER_MAP` or `REGIONS` keys are missing, or if any `REGIONS[*].states` is not an array, or if any color is not valid hex.

### Helpers
- `renderManagerEditor()` — main entry; renders toolbar + cards.
- `renderMgrCards()` — paints the cards grid; called from every mutator.
- `mgrToggleEdit(eid, gs)`, `mgrAddStateTo(gs, eid)`, `mgrRemoveState(gs, st, eid)`, `mgrSaveCard(gs, eid)`, `mgrEditName(oldName)`, `mgrRemoveMgr(gs)` — per-card actions (verbatim ports from `index.html` with persistence hook added).
- `mgrAddManager()` — toolbar add.
- `mgrSaveAll()`, `mgrImportConfig()`, `mgrExportConfig()`, `mgrResetDefaults()` — toolbar actions.
- `saveManagerOverrides()` — single point of localStorage write; also calls `populateGSSelector()` to refresh the topbar dropdown.
- `loadManagerOverrides()` — single point of localStorage read; called once at app init.

---

## Cross-Cutting Concerns

- **Live re-render on edit.** Every mutating editor action calls `renderMgrCards()` + `renderUSAMapInline()`. Other tabs (Dashboard, CRM, etc.) read `MANAGER_MAP` / `REGIONS` lazily on next visit; no cross-tab re-render needed.
- **Manager-only enforcement.** Editor sub-tab not rendered in the strip when `currentUser?.isManager` is falsy. Map sub-tab is read-only for non-managers (no editor links).
- **GS selector dropdown sync.** Topbar GS selector (`#gs-selector`) must repopulate after rename / add / remove manager. `saveManagerOverrides()` is the hook.
- **Map mode persistence.** `gs_cmd_map_mode` remembers selection across sessions per browser.
- **Reset behavior preserves user data.** Reset only clears `gs_cmd_managers`. It does not touch `gs_cmd_<gs>_stopdata`, activity logs, calculator scenarios, etc.

---

## Smoke Test

After Phase 5 implementation, hard-reload `gs-command-center.html`:

1. **Default load (any user)** — Territory tab shows sub-tab strip: 🗺️ Territory Map active, 📋 Stop List, plus 👥 GS Manager Editor only when logged in as Manager.
2. **Map sub-tab** — SVG renders all 50 states + DC, colored by GS. Mode buttons toggle Gallons / Revenue / Growth, label updates accordingly.
3. **Hover** — tooltip displays state name + GS + stop count + gallons + revenue. State path highlights.
4. **Click state** — drill panel opens for that state's GS, with the state row highlighted in the breakdown.
5. **Click GS card below map** — drill panel opens for that GS, no state highlight.
6. **Manager (PIN 9999) → Editor sub-tab** — visible. Cards render alphabetically.
7. **Inline edit** — change Logan's color to purple → map repaints purple immediately. Add MT to Logan from Steph → confirm dialog → state moves. Click ✕ on a chip → confirm → state moves to Unassigned (grey on map).
8. **Rename** — Logan → "Logan R." → all references update (cards, map color key, drill panel, topbar selector).
9. **Remove manager** — confirm → all states unassigned, manager removed from REGIONS, GS selector loses entry.
10. **Add manager** — toolbar ➕ → form → save → new card appears, states reassigned.
11. **Persistence** — refresh page → all changes preserved.
12. **Export** → JSON file downloads with current state. Edit something. Import the file back → confirm overwrite → state restored.
13. **Reset** → confirm → defaults restored. Map repaints with original colors.
14. **Non-manager (per-GS PIN)** — Territory tab strip shows only Map + List sub-tabs.

---

## File Footprint Estimate

- **Inline `STATE_PATHS` constant** — ~50 KB (~600 lines of formatted JSON-like object literal, one entry per state).
- **`STATE_NAMES`, `ALL_STATES`** — ~3 KB. (`FIPS_TO_STATE` is dev-time only, not in the file.)
- **`renderTerritoryMap()`, `renderUSAMapInline()`, helpers, tooltip** — ~150 lines.
- **`renderManagerEditor()`, `renderMgrCards()`, all `mgr*` helpers** — ~300 lines.
- **CSS additions** (`.mgr-person-card`, `.mgr-state-chip`, `.map-tooltip`, etc.) — ~100 lines.
- **Persistence helpers + hydration call** — ~40 lines.

**Estimated total addition:** ~1200 lines (~70 KB), of which ~50 KB is the inlined SVG paths.

---

## Open Questions

None outstanding — all four design sections approved.

## References

- Source patterns: [index.html](../../index.html) — search for `renderUSAMap`, `renderManagerEditor`, `mgrAssign`, `STATE_PATHS`, `STATE_NAMES`.
- Plan: TBD — produced by `superpowers:writing-plans` skill after this spec is approved.
