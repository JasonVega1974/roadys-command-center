# GS Command Center Phase 3 — Stop Drawer Sales Tools

**Date:** 2026-04-30
**Branch:** `gs-command-center-workstation`
**Predecessor:** [2026-04-29 Phase 1 + 2 spec](2026-04-29-gs-command-center-management-deepdive.md) — Phase 1 (Stop Deep-Dive Drawer) and Phase 2 (Vendor Enrichment) shipped.
**Renumbering:** the original Phase 3 (GS Management migration from `index.html`) is renumbered to **Phase 4**. Original Phase 4 (Notes + Share Results) → Phase 5. Original Phase 5 (Schedule + Calendar) → Phase 6.
**Scope:** six task additions to `gs-command-center.html` that turn the Stop Deep-Dive Drawer into a real sales tool. A GS opens any stop's drawer and immediately sees the value Roady's delivers, the gaps still on the table, and a clear ROI number to lead the conversation with the site manager.

---

## Goal

Make the drawer a **selling-point surface**: when a GS calls or visits a site manager, the drawer should already have everything they need — what's being delivered, what's missed, what it nets out to. No spreadsheet on the side, no toggling between apps.

The five-feature ask: clean up redundant Site Details fields, add Price File Fee status, add a Vendor Programs Opportunity (not-enrolled) card, add a Value Prop Gallons card, add an ROI Calculator. Plus a sixth task added during brainstorming: per-stop rewards data via CSV import (so the ROI Calculator uses real per-stop numbers, not a network allocation).

## Non-goals

- **Backend / Supabase migration of `stopdata`.** Per-stop data still lives in `gs_cmd_<gsName>_stopdata` localStorage; cross-GS sharing is deferred to the post-Phase-3 Auth + Backend sub-projects.
- **Auth migration.** The PIN-based login stays as-is.
- **Per-stop fuel margin tracking.** Fuel appears on the ROI card as gallon volume (informational), not as a $ figure in the math.
- **Vendor opportunity persistence.** The "vendors not enrolled" data is computed on the fly from existing `VP_VENDORS` ∖ `VP_ENROLL[stopId]` — no new table, no caching beyond the in-memory `loadVendorMaster` helper added in Phase 2.
- **Generalized import tool for arbitrary entities.** Task 6's importer is scoped to per-stop fields (membership cost, site manager contact, price file fee, rewards revenue). It's not a universal CSV pipeline.

---

## Architecture

### File scope

All edits land in `gs-command-center.html`. No new HTML files. Two existing patterns are reused: SheetJS lazy-load (`ensureSheetJS()`, established in Phase 4b-2) for the CSV import; direct REST against the Supabase `value_props` table (established in `value-props.html`) for the new Value Prop card.

### Data model changes

**Two new fields on `stopdata[stopId]`:**

| Field | Type | Default | Source |
|---|---|---|---|
| `priceFileFeeRemoved` | boolean | `false` | Editable on Membership card; or via Task 6 CSV import |
| `rewardsRevenueMonthly` | number | empty | Editable on Membership card; or via Task 6 CSV import |

Stored in the existing `gs_cmd_<gsName>_stopdata` localStorage key. Schema bump only — no migration needed (missing fields treated as defaults).

### New helpers

```js
// Cached single-shot fetch of all active value_props from Supabase
let _vpCache = null;
async function loadValueProps(){ /* fetches /rest/v1/value_props?status=eq.active */ }

// City + state fuzzy match (per Q3 = c)
function valuePropForStop(stop){ /* finds VP by lowercased city+state */ }

// Parse "$1,120/mo" out of free-text avgSavings strings; 0 if not parseable
function parseAvgSavings(text){ /* regex extractor */ }

// Compute monthly vendor program savings for a stop
function vendorSavingsForStop(stopId){ /* sum parseAvgSavings(progDetails[vid]) for enrolled */ }

// Compute the not-enrolled set for a stop with savings potential
function vendorOpportunityForStop(stopId){
  // Returns [{vid, name, program, priority, avgSavings}] sorted by avgSavings desc
}

// Per-stop ROI calculation
function computeStopROI(stopId){
  // Returns {cost, value, net, hasMissingData} where hasMissingData=true if
  // membershipCost or rewardsRevenueMonthly are empty.
}
```

### Drawer section order after Phase 3 ships

1. Header (existing)
2. Site Details — existing minus removed fields (only `Has Rewards` remains in this section)
3. **💳 Membership & Site Contact** (existing) — adds rows for Price File Fee toggle and Rewards Revenue / mo
4. **⛽ Fuel Business** (existing)
5. **🏢 Vendor Programs (enrolled)** (existing — Phase 2)
6. **🎯 Vendor Programs Opportunity (NEW)** — not-enrolled vendors with savings potential
7. **📊 Value Prop Gallons (NEW)** — fleet + aggregator potential, last-run date
8. **📋 Recent CRM Tasks** (existing)
9. **💰 ROI Calculator (NEW)** — sums everything above
10. **🧮 Calculations** (existing)
11. **📋 Activity Log** (existing)

### Modes

- **Per-GS user (PINs 1001-1006):** all fields editable in their territory. Import tool is enabled.
- **Manager (PIN 9999) in All-GS rollup:** drawer opens read-only; all edits and the import tool are disabled (consistent with Phase 1's All-GS gating).

---

## Task 1 — Site Details cleanup

Remove the redundant free-text fields from the existing `Site Details` `drawer-section` block in `openSiteDrawer`:

- **Vendor Programs** (text input bound to `extras.vendorPrograms`) — redundant with Phase 2's structured Vendor Programs card.
- **Contacts** (text input bound to `extras.contacts`) — redundant with Phase 1's structured Membership & Site Contact card.
- **Site Notes** (text input bound to `extras.siteNotes`) — redundant with the Recent CRM Tasks + Activity Log surfaces.

**Keep:**

- **Has Rewards** checkbox (`extras.hasRewards`) — this is genuinely a stop-level fact and isn't covered by other surfaces.

The `siteExtras` data structure stays in localStorage (used by other parts of the app); only the UI surfaces for the three removed fields go away. `toggleExtra` and `updateExtra` continue to handle the `Has Rewards` checkbox.

After cleanup, the Site Details `drawer-section` collapses to a single row (Has Rewards). Remove the `info-grid` 2-col layout if there's only one cell, or keep the grid for consistency — the task's plan resolves that.

## Task 2 — Price File Fee status

**New field on Membership card:**

```
[ ☐ ] $295 Price File Fee — Removed
```

A checkbox + label, placed below the existing 4 inputs. Stored as `stopdata[stopId].priceFileFeeRemoved` (boolean). On change, calls `saveStopRecord(stopId, {priceFileFeeRemoved: this.checked})`. Toast on save.

When the box is **unchecked** (default), the ROI Calculator includes $295 in the Costs total. When **checked**, the ROI Calculator shows `$0.00 (✓ Removed)` for that line.

## Task 3 — Value Prop Gallons card

New `drawer-section` between Vendor Programs Opportunity and Recent CRM Tasks (cyan accent border).

**Data flow:**
1. On drawer open, `loadValueProps()` fires (cached after first call per session).
2. `valuePropForStop(stop)` matches by lowercased city + state. Returns the value-prop row or `null`.
3. Card renders the `vp.fleet_potential`, `vp.agg_potential`, and `vp.updated_at` (formatted as relative time, e.g. "Last run 6w ago").

**With a matching value prop:**

```
📊 VALUE PROP — Marshall, MI · Last run 2026-03-15 (6w ago)

  Fleet Potential          312,540 gal/mo
  Aggregator Potential     156,440 gal/mo
  ──────────────────────────────────────
  Total Potential          468,980 gal/mo

  Top fleets within 50 miles: Landstar (45k), Swift (38k), Werner (29k)
```

The "top fleets" line is built from `vp.fleet_matches` (the `[{fleet, city, state, gallons, dist}, …]` array), top 3 by gallons, k-formatted.

**Without a matching value prop:**

```
No value prop on file for Marshall, MI.
[Open value-props.html →]
```

The link opens `value-props.html` in a new tab. (Future phase could deep-link to "create new" pre-populated.)

## Task 4 — Vendor Programs Opportunity card

New `drawer-section` between the existing Vendor Programs (enrolled) card and the Value Prop card (amber accent border).

**Data flow:**
1. `loadVendorMaster()` (Phase 2 helper) gives `VP_VENDORS` and `progDetails`.
2. `loadVendorEnrolls()[stopId]` (existing) gives the enrolled set.
3. `vendorOpportunityForStop(stopId)` returns the missed set, with each vendor's `parseAvgSavings(progDetails[vid].avgSavings)`. Sorted by savings desc.

**Render:**

```
🎯 OPPORTUNITY — Vendors NOT Enrolled (12 missed)

  Sysco                  Foodservice         avg $1,120/mo  →
  Entegra                Foodservice         avg $1,120/mo  →
  Coca-Cola              Beverage            avg unknown    →
  Cintas                 Uniforms            via Entegra    →
  …
  Total potential savings if enrolled: $4,820/mo
```

**Click any row to expand** (uses the same `toggleVendorDetails` pattern from Phase 2):

- Email (mailto link)
- Rebate structure
- Contract term
- "Why they should enroll" — drawn from `progDetails[vid].notes`
- "Enroll on vendors.html" link

Vendors with **no `progDetails` entry** still appear in the missed list but show "avg savings: unknown" with no expand affordance. (These are the long-tail vendors not in the top-12 detailed records.)

The "Total potential savings" footer sums only the vendors with parseable $ figures. Subtitle in muted text: "Excludes vendors without quantified savings."

## Task 5 — ROI Calculator card

New `drawer-section` between Recent CRM Tasks and Calculations (green accent border, full-width — this is the punchline of the drawer).

**Data flow:** all values come from prior cards' helpers — `computeStopROI(stopId)` is the single entry point.

**Render** (with complete data):

```
💰 SITE VALUE / ROI — Monthly

  Membership cost                       $    500.00
  Price File Fee ($295)                 $      0.00  (✓ Removed)
                                       ─────────────
  COSTS                                 $    500.00

  Rewards revenue (this site)           $    340.50
  Vendor program savings (estimated)    $  1,425.00  *
                                       ─────────────
  VALUE DELIVERED                       $  1,765.50

  ─────────────────────────────────────────────────
  NET TO SITE / ROI                     $  1,265.50  ✓
  ─────────────────────────────────────────────────

  Fuel context: 324,580 gal MTD ·  1,287,940 gal YTD
  * Estimates based on network averages and your enrollment data.
```

**Per-line behavior with missing data:**

- `membershipCost` empty → Costs line shows `$0.00` with a small "*" footnote ("Set membership cost above").
- `rewardsRevenueMonthly` empty → Rewards line shows `—` with a small "*" footnote ("Import rewards CSV or enter per stop").
- `Net` is rendered as `—` if **either** `membershipCost` or `rewardsRevenueMonthly` is empty (avoids misleading the GS with a partial number). Hint line:
  ```
  NET TO SITE / ROI                       —
  Complete missing fields above to compute ROI.
  ```

The green ✓ / red ✗ indicator only renders when `Net` is computed (both inputs present). Color: green if Net > 0, red if Net <= 0.

The `*` footnote on Vendor savings always shows. The "Estimates based on network averages" disclaimer always shows.

## Task 6 — Per-stop rewards data + CSV import tool

**New field on Membership card:**

A 5th editable input added below the Price File Fee row:

```
Rewards Revenue / mo                   [ $______ ]
```

Stored as `stopdata[stopId].rewardsRevenueMonthly` (number). On blur → `saveStopRecord(stopId, {rewardsRevenueMonthly: parseFloat(...)})`. Toast on save.

**Import tool:**

A new button on the Per-GS Dashboard (positioned alongside the existing CRM and Critical CSV import buttons established in Phase 5-2 of the prior workstation build):

```
[ 📥 Import Stop Data ]
```

When clicked, opens a small modal:

1. File picker (`<input type="file" accept=".csv,.xlsx,.xls">`).
2. On file load: `ensureSheetJS()` (lazy-load if not already loaded, same pattern as the calculator import).
3. Parse with SheetJS; first row = headers; case-insensitive match against expected columns.
4. **Expected columns** (all optional except `Stop ID`):
   - `Stop ID` — matches `MEMBERS[].id` directly OR with the leading-zero fallback (`R3650` → `R03650`).
   - `Membership Cost` — string or number; stored verbatim as the formatted string (`$X,XXX.XX`).
   - `Site Manager` — string.
   - `Email` — string.
   - `Phone` — string.
   - `Price File Fee Removed` — accepts `Yes`/`No`/`true`/`false`/`1`/`0`.
   - `Rewards Revenue Monthly` — string or number; stored as a number.
5. **Preview screen:** shows matched-stop count, unmatched count, top 5 sample rows. `Confirm Import` button to commit; `Cancel` to abort.
6. On confirm: write to all 6 GS namespaces (`gs_cmd_<gs>_stopdata`) with shallow merge (existing fields preserved unless overwritten by CSV).
7. Toast confirms import: `"Imported N stops · M unmatched"`.

**Disabled states:**
- Manager All-GS rollup mode → button hidden (consistent with Phase 1's gating).
- No file selected → button shows but modal blocks the Confirm step.

The import tool **replaces the devtools-paste approach** used as a one-time bootstrap on 2026-04-30. Future updates to membership / rewards / contact data flow through the same CSV.

---

## Cross-cutting concerns

### Re-render hooks

- Editing `priceFileFeeRemoved` or `rewardsRevenueMonthly` on the Membership card triggers a re-render of the ROI Calculator card so the user sees the impact immediately.
- Drawer reopen (close + reopen) always rebuilds all cards from scratch — no stale-state risk.
- `loadValueProps()` is called once per session; if a value prop changes (added in `value-props.html` after this session opened), the user must reload `gs-command-center.html` to see it.

### Syntax / regression gate

After every task, before committing:
1. Extract inline `<script>` content into a temp file.
2. Run `node -e "new Function(require('fs').readFileSync('tmp.js','utf8'))"`.
3. Fix any reported parse errors.

Same gate that's run after every prior phase task.

### Commit hygiene

One commit per phase (matches the established pattern). Commit message follows:
```
GS Command Center Phase 3: Stop Drawer Sales Tools

<bullet list of the six tasks>
```

### Browser smoke test (Task 7-equivalent at end of phase)

1. Site Details no longer shows Vendor Programs / Contacts / Site Notes free-text fields.
2. Membership card has Price File Fee checkbox + Rewards Revenue input.
3. Vendor Programs Opportunity card lists not-enrolled vendors with avg savings; click expands details.
4. Value Prop Gallons card shows fleet + aggregator + last-run for stops in matching cities; "no VP on file" for unmatched cities.
5. ROI Calculator card renders with `$X` Net when data complete; renders `—` with hint when incomplete.
6. Per-GS Dashboard has Import Stop Data button. Click → modal → upload sample CSV → preview → confirm → toast.
7. Manager All-GS mode: drawer cards still render read-only; Import button hidden.

---

## Out of scope (carry-forward to future phases)

- **GS Management migration** (USA territory map, manager editor, ranking from `index.html`) — Phase 4 (renumbered).
- **Notes panel + Share Results buttons** (copy / mailto / print) — Phase 5.
- **Schedule Next Visit + .ics / Google Calendar URL export** — Phase 6.
- **Backend migration of `stopdata` to Supabase** — separate sub-project, after Phases 4-6.
- **Supabase Auth (PIN-as-password)** — separate sub-project, paired with backend stopdata.
- **Per-stop fuel margin / rebate tracking** — would let the ROI Calculator include real fuel value (currently informational only). Out of scope; future spec.
