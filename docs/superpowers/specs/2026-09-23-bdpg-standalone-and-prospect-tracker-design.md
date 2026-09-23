# Bus Dev Potential Gallons — Standalone Page + Prospect Tracker (Design Spec)

**Date:** 2026-09-23
**Files:** `bus-dev-potential-gallons/index.html` (new), `index.html` (tool removed, nav link added)
**Author:** Jason Vega + Claude
**Status:** Approved — all rulings confirmed by the user. Proceeding to implementation plan.
**Predecessors:** `2026-09-22-gs-value-props-calculator-design.md` (functional spec, still binding)
and `2026-09-22-bus-dev-gallons-ui-overhaul-design.md` (UI spec, still binding).

---

## 1. Goal and hard boundary

Four things:

1. **Extract** the Bus Dev Potential Gallons tool out of `index.html` into its own page served at
   `https://jasonvega1974.github.io/roadys-command-center/bus-dev-potential-gallons`.
2. **Prospect Profile** header card (⓪) above Step 1.
3. **Pre-Evaluation** panel between the header and Step 1.
4. **Prospects tracker** — a second sub-tab logging every saved profile as a sortable summary table.

**The binding constraint, unchanged from both predecessor specs:**

- **Zero changes** to `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`,
  `busDevGallonsCalculator.test.js`. Byte-identical at every commit; `node --test` 42/42.
- **Zero changes** to formulas, adjustment percentages, the dual-number
  (`officialSubtotal` / `finalGallons`) contract, grade scoring, or membership math.
- New UI writes **existing** `BDPG.state` fields where they exist; genuinely new fields
  (prospect header, pre-eval) are **presentation/record-keeping only** and feed no calculation.
- `region_variance.json` and `network-context.json` are read-only inputs.
- If a requested behavior appears to need a logic change, **stop and ask**.

---

## 2. Current state (verified by reading `index.html` at branch point)

### 2.1 What has to move

| Thing | Lines (approx.) | Notes |
|---|---|---|
| `.bdpg-*` CSS | from 530 (`/* ── Bus Dev Potential Gallons — wizard shell ── */`) | contiguous block |
| `@media print` BDPG rules | 889–924, all `body.bdpg-print-mode`-prefixed | must move with the tool |
| `window.BDPG` object + helpers | 17038 (`var BDPG = {`) – 18234 | ~1,200 lines |
| `renderBusDevGallons()` wrapper | 18234 | becomes unnecessary off-dashboard |

### 2.2 What the tool depends on from `index.html` (exhaustive — verified by scanning the block)

Only **three clusters**, ~85 lines total:

- **Map machinery**: `loadUSTopojson()` (10575), `usTopoLoaded`, `STATE_PATHS`,
  `FIPS_TO_STATE` (10561), `STATE_NAMES` (10601), `hexToRgba()` (10698), `getCentroid()` (10703)
- **Chart machinery**: `CHS`, `CDO`, `mkchart()` (2985–2991)
- **UI**: `toast()` (2994–2999) + the `<div class="toast" id="toast">` element (2746)

Everything else it needs is **already external and shared**: `busDevGallonsConfig.js`,
`busDevGallonsCalculator.js`, `region_variance.json`, `network-context.json`, and the three
CDN tags (Chart.js 4.4.0, d3-geo 3.1.0, topojson-client 3.1.0).

### 2.3 Wiring in `index.html` that must be cleaned up

- Nav item at **995** (`data-nav-id="bus-dev-potential-gallons"`, `onclick="nav(...)"`)
- Page shell at **1372** (`<div class="page" id="pg-bus-dev-potential-gallons">`)
- `TITLES` entry at **3004**
- `renderPage()` branch at **3225**
- Two `<script src>` tags for the engine files (added during the original build)

### 2.4 House patterns the new work reuses

- **Sub-tabs**: `.impl-sub-tab` (780–782) — accent text + 3px accent bottom-border when
  `.active`; switcher `implSwitchSubTab(tab)` (16444).
- **Tables**: `.dt` (522–528) in a `.tw` wrapper. **Click-to-sort is free**: a delegated
  handler bound once on `document` for `table.dt thead th` (~11229), explicitly written to
  survive re-renders. Any `class="dt"` table gets ascending/descending sorting with no
  per-column wiring.
- **Status chips**: `.tag-green / -red / -yellow / -blue / -orange / -gray` (606–611).
- **Empty states**: muted centred text; for tables a single
  `<tr><td colspan=N style="text-align:center;padding:24px;color:var(--muted)">`.
- **Palette**: `:root` at 19–25 + the full `body.day-mode` override at 26–31.

### 2.5 Hosting facts

`.nojekyll` is present, so GitHub Pages performs **no extensionless-URL rewriting**. A file
`bus-dev-potential-gallons.html` would answer only at `/bus-dev-potential-gallons.html`.
To serve the requested bare path, the page must be **`bus-dev-potential-gallons/index.html`**;
GitHub Pages 301-redirects `/bus-dev-potential-gallons` → `/bus-dev-potential-gallons/`.

Relative paths from inside that directory go up one level: `../busDevGallonsConfig.js`,
`../busDevGallonsCalculator.js`, `../region_variance.json`, `../network-context.json`.

`localStorage` is scoped **per origin**, not per path, so every profile already saved from the
dashboard is visible in the new page with no migration.

---

## 3. Rulings (all user-confirmed)

| # | Item | Ruling |
|---|---|---|
| 1 | Extract vs. duplicate | **Move out entirely.** `index.html` keeps a link-out nav item, no second copy. Matches the repo's existing convention — five standalone tools are already `window.open()` links. Two copies of ~1,200 lines would drift on first touch. |
| 2 | URL shape | Directory (`bus-dev-potential-gallons/index.html`), required by `.nojekyll`. |
| 3 | Old saved profiles | **Silent graceful degradation** — missing header fields render `—`. No migration prompt, no crash, never `undefined` on screen. |
| 4 | Grade distribution + signal counts in the tracker summary | **Colored chips, not plain text**: five grade chips `A ×3` (A cyan / B green / C yellow / D orange / E red) and three signal chips (Strong green / Moderate yellow / Review red), each with its count. |
| 5 | Shared helpers | The new page carries its **own trimmed copies** of the ~85 lines (§2.2). `index.html` keeps its originals untouched — ~25 charts and two maps depend on them. This is deliberate, bounded duplication of *infrastructure*, not of the tool. |

---

## 4. The design

### 4.1 The standalone page

`bus-dev-potential-gallons/index.html`, self-contained apart from the shared external files:

- `<head>`: the three CDN tags, `../busDevGallonsConfig.js`, `../busDevGallonsCalculator.js`,
  and a `<style>` carrying the `:root` palette (both themes), the component classes the tool
  actually uses (`.cc/.cc-lbl/.cw`, `.dt/.tw`, `.btn/.btn-accent`, `.tag-*`, `.fg`,
  `.sec-hdr/.sec-title`, `.badge`, `.map-tooltip*`, `.toast`, `.impl-sub-tab`), the whole
  `.bdpg-*` block, and the `body.bdpg-print-mode` print rules.
- `<body>`: a slim header (title + day/night toggle), the sub-tab bar, two panels, the
  `#toast` element, and one `<script>` holding the ported helpers plus the `window.BDPG` object.
- **Print gating stays exactly as-is** — still `body.bdpg-print-mode`-prefixed. It no longer
  has sibling pages to protect, but changing it would be gratuitous risk for zero gain.

### 4.2 Sub-tabs

`⛽ Potential Gallons` | `📋 Prospects`, using `.impl-sub-tab`. Panel visibility toggled by a
`BDPG.switchTab(name)` mirroring `implSwitchSubTab`'s shape. Default: Potential Gallons.
The Prospects panel renders on switch (its data is `localStorage`, cheap to re-read).

### 4.3 Addition 1 — Prospect Profile (⓪, above Step 1)

Same `.bdpg-step` card vocabulary, badge `⓪`, done-state when the three required fields are filled.

| Field | State key | Required |
|---|---|---|
| Truck Stop Name | `prospect.name` | ● |
| Street Address | `prospect.street` | |
| City | `prospect.city` | ● |
| State (2-letter) | **`state.state`** — the existing field | ● |
| Location Type | `prospect.locationType` | |
| Notes | `prospect.notes` | |

- Required labels carry a `<span style="color:var(--red)">*</span>`.
- **State is not a new field.** The header's State input writes `BDPG.state.state`, the same
  field the map click and the Step 2 typed fallback write — one source of truth, so entering
  it here resolves the region and selects the state on the map through the existing path.
- Name/Street/City/Notes are **continuous text inputs**: they write state on `input` with
  **no re-render** (the established focus-preservation rule). Location Type is a segmented
  control (`.bdpg-seg`, reused from the pricing control) and may re-render.
- The display name used in results, export, and the tracker is `prospect.name`, falling back
  to the existing `supportingDetails.prospectName`, then `'Prospect'`.
- **Generate gating**: the condition gains the three required fields. Tooltip text becomes
  `"Complete Prospect Profile, Steps 1 and 2 to generate."` when anything is missing.

### 4.4 Location Type → Step 1 coupling

On Location Type change only (never on re-render — it must not fight a manual choice):

| Type | Behavior |
|---|---|
| `Fuel Stop` | **Auto-selects** the `Fuel stop / Any` baseline row; truck-stop cards dim; note: *"Fuel Stop type selected — baseline auto-set."* |
| `Service Center`, `Truck Stop / Service Center` | **Suggests** Medium and Large truck stop rows with a `.bdpg-bcard.suggest` outline + note *"Suggested starting point for this location type."* Does **not** select. |
| `Truck Stop`, `C-Store` | No coupling. |

Every auto-selection is overridable — clicking any card always wins, and a manual pick clears
the auto-set note.

### 4.5 Addition 2 — Pre-Evaluation panel

Collapsible card between ⓪ and Step 1, populated once Name + City + State + Location Type are
present. **Informational only** — nothing here feeds the calculator. Header text:
*"Pre-Evaluation — complete the calculator below for a full analysis."*

Seven `.tag-*` chips:

| # | Chip | Green | Yellow | Red |
|---|---|---|---|---|
| 1 | Region identified | resolved | state empty | — |
| 2 | Region performance | pct > 0 | pct === 0 (not configured) | pct < 0 |
| 3 | Network presence (region total) | > 20 | 10–20 | < 10 |
| 4 | Location type in network | > 20 | 10–20 | < 10 |
| 5 | Baseline range for type | always neutral/blue — informational | | |
| 6 | Estimated profile | always neutral/blue — suggestion | | |
| 7 | **Overall signal** | all green → **Strong candidate** | mixed → **Moderate opportunity** | any red → **Review carefully** |

- #3/#4 read `network-context.json` (`byRegion[region].total` and `byRegion[region].byType[t]`).
- #5 reads min/max `baseline` across `BASELINE_TABLE` rows for the mapped profile.
- #6 maps Location Type → a suggested profile row, rendered as e.g.
  *"Fuel stop · Any · 1–2 lanes · 2,500 baseline"*.
- Chips #5 and #6 are excluded from the #7 roll-up (they carry no judgement).
- `prospect.preEvalSignal` (`'Strong' | 'Moderate' | 'Review'`) is stored for the tracker.

### 4.6 Addition 3 — Prospects tracker

Reads the existing `localStorage['roadysBDPGProfiles']`. The saved record gains a `prospect`
object and `preEvalSignal`; **every read is defensive** — a profile saved before today has no
`prospect`, so each column falls back to `—`.

Columns (all sortable for free via `class="dt"`): Prospect Name + type badge · City, State +
region chip · Location Profile (`"Large · Interstate"`) · Official Subtotal · Final Potential
Gallons + pricing-posture indicator · Grade badge · Pre-Eval signal chip · Confirmed amenity
level · Pricing posture · Saved date · Actions (Load / Export PDF / Delete).

- Default sort: saved date **descending**.
- **Load** restores the profile into the calculator and switches to the Potential Gallons tab.
- **Export PDF** loads the profile, then runs the existing export path (which needs a
  generated result — so it regenerates first via the existing `onGenerate`).
- **Delete** is `confirm()`-gated, as today.
- **Empty state**: *"No prospects evaluated yet — complete a profile above and save it."*
- **Summary row** (ruling 4): average Official, average Final, then **five grade chips**
  (`A ×3` …) and **three signal chips**, colour-coded, counts included. Averages ignore
  records missing that number rather than treating them as zero.

---

## 5. Invariants (checked every task)

1. `node --test busDevGallonsCalculator.test.js` → 42/42; the three engine files byte-identical.
2. Cases A–D still produce 13,750 / 2,250 / 14,550 / 3,240 (Standard pricing, West +6%).
3. `officialSubtotal` and `finalGallons` labelled distinctly on screen, in print, in Copy Summary.
4. Grade from `officialSubtotal`; membership + condition-adjusted from `finalGallons`.
5. Continuous text/number inputs never trigger a full-panel rebuild on `input`.
6. The `onStateInput` cluster (focus/cursor restore → generate-button refresh → step-card sync →
   `renderMap()`) survives intact.
7. All new globals on `window.BDPG`. No new libraries.
8. `index.html`'s other tabs, charts, maps, and printing are unaffected by the extraction.

---

## 6. Increments

1. Standalone page scaffold (shell, ported helpers, CSS, engine wiring) — tool renders and works
2. Remove the tool from `index.html`; nav becomes a link-out
3. Sub-tab bar (Potential Gallons | Prospects)
4. Prospect Profile card ⓪ + Generate gating
5. Location Type → Step 1 coupling
6. Pre-Evaluation panel
7. Saved-record extension + defensive reads
8. Tracker table + empty state + actions
9. Summary row with chips
10. Whole-branch review + invariant checklist
