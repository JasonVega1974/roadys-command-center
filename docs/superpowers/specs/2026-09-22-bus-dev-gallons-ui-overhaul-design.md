# Bus Dev Potential Gallons — UI/UX Overhaul (Design Spec)

**Date:** 2026-09-22
**File(s):** `index.html` only (CSS block + the `window.BDPG` script block)
**Author:** Jason Vega + Claude
**Status:** Approved design (user approved all six open rulings) — proceeding to
implementation plan (`writing-plans`).
**Predecessor spec:** `docs/superpowers/specs/2026-09-22-gs-value-props-calculator-design.md`
(the feature's functional spec — still binding, unchanged by this document).

---

## 1. Goal and hard boundary

Make the Bus Dev Potential Gallons tool look and feel like it belongs in the same
product as the GS Metrics tab: a guided three-step wizard with a real interactive
US map, a visual profile selector, visual adjustment inputs, and a charted results
section.

**This is a presentation-layer change only. The binding constraint on every task:**

- **Zero changes** to `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`, or
  `busDevGallonsCalculator.test.js`. The 42-test suite must pass untouched at
  every commit.
- **Zero changes** to formulas, adjustment percentages, the dual-number
  (`officialSubtotal` / `finalGallons`) contract, grade scoring, membership math,
  or the shape of `BDPG.state`.
- UI handlers may be rewritten, but they must write **the same state fields with
  the same values** they write today. A new control is a new way to set an
  existing field, never a new field that feeds the engine.
- `region_variance.json` and `network-context.json` are read-only inputs here —
  not modified, not regenerated.
- If a requested UI behavior appears to require a logic change, **stop and ask**
  rather than changing logic.

Out of scope, explicitly: the admin Region % panel, the CSV importers, and the
network-context generator keep their current markup. They are admin surfaces, not
part of the rep-facing wizard, and touching them widens the diff for no gain.

---

## 2. Current state (verified by reading `index.html`)

### 2.1 The existing US map is TopoJSON-driven, not inline SVG

There is **no inline SVG path data** anywhere in `index.html`. The GS Metrics map
works like this (verified, line numbers as of `5ddf34d`):

- `<script src>` deps already present (lines 13–14): `d3-geo@3.1.0`,
  `topojson-client@3.1.0`. Chart.js 4.4.0 at line 10. **No new library is
  needed for anything in this spec.**
- `loadUSTopojson()` (line 10459) fetches
  `https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json`, runs
  `topojson.feature(...)` → `d3.geoAlbersUsa().fitSize([900, 550], states)` →
  `d3.geoPath()`, and fills the module-global `STATE_PATHS` — a map of
  2-letter abbreviation → SVG path `d` string. It is **memoized** via
  `usTopoPromise`, so a third consumer costs one extra function call and zero
  extra network traffic.
- `FIPS_TO_STATE` (line ~10440) and `STATE_NAMES` (line 10485, full 50 + DC
  names) are module-global and reusable as-is.
- Rendering (`renderUSAMapInner`, line 10508) string-builds `<path>` elements
  into `<g id="states-group">` inside `<svg viewBox="0 0 900 550">`, appending a
  `<text>` abbreviation label per state positioned by `getCentroid(path, axis)`
  (line 10587 — bounding-box center, not a true centroid).
- Helpers reusable verbatim: `hexToRgba(hex, alpha)` (line 10582),
  `getCentroid` (line 10587).
- **Two instances already exist**: `#usa-svg` / `#states-group` (Territory tab)
  and `#usa-svg-gs` / `#states-group-gs` (GS Metrics, `renderUSAMapGS()` at line
  11455). **The established pattern for an additional instance is
  suffixed element ids sharing the same loader and cache** — this spec's map is
  the third instance, suffixed `-bdpg`.

### 2.2 Map CSS (lines 593–604) is id-scoped, so a new instance needs mirrored rules

```
#usa-svg path       { cursor:pointer; stroke:#0A0E1A; stroke-width:0.5; transition:all .15s; }
#usa-svg path:hover { opacity:.75; stroke-width:1.5; stroke:#fff; filter:drop-shadow(0 0 4px rgba(255,255,255,.3)); }
#usa-svg path.selected { stroke:#fff; stroke-width:2; filter:drop-shadow(0 0 6px rgba(255,255,255,.5)); }
.map-tooltip { position:fixed; background:rgba(8,12,24,.95); border:1px solid var(--border2);
               border-radius:8px; padding:10px 14px; font-size:.78em; pointer-events:none;
               z-index:9999; display:none; min-width:160px; }
.map-tooltip-state { font-family:var(--ff); font-size:1.1em; font-weight:800; letter-spacing:.06em; margin-bottom:4px; }
.map-tooltip-row { display:flex; justify-content:space-between; gap:16px; color:var(--muted); margin-top:2px; }
.map-tooltip-val { color:var(--text); font-weight:600; }
.map-legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
.map-legend-item { display:flex; align-items:center; gap:6px; font-size:.72em; font-weight:600; cursor:pointer; }
.map-legend-dot { width:12px; height:12px; border-radius:3px; }
```

Day-mode override exists at line 33 (`body.day-mode #usa-svg path{stroke:#D8DCE3;}`)
and line 35 for `.map-tooltip`. `.map-tooltip` and `.map-legend*` are **class-based
and directly reusable**; only the `#usa-svg`-prefixed path rules need a mirrored
selector for the new id.

### 2.3 Palette and typography (`:root`, lines 19–25)

```
--bg:#080C18  --surface:#0D1225  --surface2:#121830  --border:#1E2A45  --border2:#2A3A5C
--accent:#00C8FF  --green:#00D68F  --red:#FF4757  --yellow:#FFD60A  --orange:#FF6B35
--purple:#7C3AED  --teal:#0891B2  --text:#E8EDF8  --muted:#6B7A99  --dim:#3A4A6B
--ff:'Barlow Condensed','Arial Narrow',sans-serif   /* display: headers, numbers, uppercase */
--fb:'DM Sans','Segoe UI',sans-serif                /* body */
```

A complete `body.day-mode` override set exists (lines 26–31). **Every color used
by this overhaul must come from these variables** — no literal hex except where
reusing an existing constant (`REGIONS[...].color`) or building an `rgba()` fill
from one via `hexToRgba`.

### 2.4 Existing component vocabulary (reuse, don't reinvent)

| Class | Line | What it is |
|---|---|---|
| `.cc` / `.cc-lbl` / `.cw` | 506–508 | Chart card: surface bg, 1px border, radius 10, pad 14 / uppercase .7em muted label / 160px-tall canvas wrapper |
| `.kc` + `.kc-lbl` / `.kc-val` / `.kc-chg` / `.kc-sub` | 162–169 | KPI card with a 3px top accent bar via `::before`; variants `.up` (green glow), `.dn` (red glow), `.fl` (yellow glow) |
| `.sec-hdr` / `.sec-title` | 488–489 | Section header row; Barlow Condensed 1.3em 800 uppercase, letter-spacing .08em |
| `.badge` | 73 | Pill: radius 20, .7em, weight 700 |
| `.btn` / `.btn-accent` | 67–72 | Button; accent variant = cyan bg, **black** text |
| `.fg` | — | label + input form group (used throughout the current BDPG markup) |
| `.tw` / `.dt` | — | table wrapper / data table |
| `.bdpg-box` | 528 | The feature's own flat grouping box — **superseded** by this overhaul |

### 2.5 Chart conventions

- `mkchart(id, cfg)` (line 2873): destroys any existing chart with that id from
  the `CHS` registry, then constructs. **All charts in this overhaul go through
  it** — never `new Chart()` directly, or the re-render cycle leaks instances.
- `CDO` (line 2872): shared options — `responsive:true`,
  `maintainAspectRatio:false`, tick color `#6B7A99` at 9–10px, gridlines
  `rgba(255,255,255,.04–.05)`.
- Bar fills are `rgba(...,.6)`–`rgba(...,.7)` with `borderRadius:3`.
  Sign-conditional coloring is already precedented at line 6649:
  `nd.map(v => v >= 0 ? 'rgba(0,214,143,.7)' : 'rgba(255,71,87,.7)')`.
- Markup pattern: `<div class="cc"><div class="cc-lbl">TITLE</div><div class="cw"><canvas id="x"></canvas></div></div>`.
- **Charts must be created after their canvas is in the DOM.** `BDPG.render()`
  assigns `innerHTML` wholesale, so chart construction happens in a post-render
  step, not inside an HTML-string builder (see §4.6).

### 2.6 Current BDPG structure (what gets rewritten)

`BDPG.render()` (line 16940) concatenates, in order:
`step1Html() + step2Html() + supportingDetailsHtml() + adminPanelHtml() +
networkContextGeneratorHtml() + generateButtonHtml() + [resultsHtml() +
export/copy buttons + exportPdfHtml()] + [save/profiles box]`.

Rewritten by this overhaul: `step1Html`, `step2Html`, `regionMapSvg` (the grey
placeholder), `supportingDetailsHtml`, `generateButtonHtml`, `resultsHtml`,
`exportPdfHtml`, and their handlers. Left alone: `adminPanelHtml`,
`networkContextGeneratorHtml`, all CSV/admin handlers, `onGenerate`'s engine
calls, `summaryText`, profile save/load.

---

## 3. Rulings made during design (all user-approved)

| # | Item | Ruling |
|---|---|---|
| 1 | BDPG region colors | West `#00D68F`, Southeast `#FF4757`, Southwest `#FF6B35`, Midwest `#FFD60A`, Northeast `#7C3AED`. **Cyan (`--accent`) is reserved exclusively for selection/active state** and is never a region fill. West and Southeast deliberately match GS Metrics' colors for the same geography. |
| 2 | Trucker Path input | A `0.1`-step range slider, not clickable stars. The formula distinguishes 3.5 (0%) from 3.6 (+2%); a 5-star click input cannot express that. Stars render as a **read-only visualization** of the slider value, alongside **the live numeric value** and the band chip. |
| 3 | Pricing control direction | Segmented control ordered most-aggressive → no-discounts, colored **green → red**, matching the waterfall's positive-adjustment-is-green convention (aggressive discounting raises projected volume). |
| 4 | Amenity chart | No network comparison exists in the data. Ship a **prospect-only** mini bar chart titled **"Your Amenity Profile"**, scoring the six amenity dimensions visually. Leave a clean data hook for a future per-region average. |
| 5 | Step 1 invalid combinations | Once a profile is chosen, cards of other profiles are **dimmed but still clickable** (clicking one switches profile). Nothing is hidden or `disabled`. |
| 6 | Git | Branch `feat/bus-dev-gallons-ui` off `feat/bus-dev-potential-gallons`. Per-task commits by subagents. **No push, no PR, no merge** — the session ends with a diff summary for the user. |

---

## 4. The design

### 4.1 Wizard shell

Three numbered step cards plus a results region, all built from `.cc`-style
surfaces (not the old flat `.bdpg-box`):

- `.bdpg-step` — surface card, 1px `--border`, radius 10, pad 16–18, with a
  **step badge** (`①②③`) top-left as a 28px circle: `--surface2` bg,
  `--border2` ring, Barlow Condensed.
- **Completed state** (`.bdpg-step.done`): badge turns `--green`, a small `✓`
  appears in the header, and the card's left edge gets a 3px green rule. Step 1
  is "done" when profile+roadway resolve to a baseline row; Step 2 when a valid
  state is selected.
- Header: `.sec-hdr`/`.sec-title` — "STEP 1 — SELECT LOCATION PROFILE",
  "STEP 2 — ADJUSTMENTS", "STEP 3 — SUPPORTING DETAILS".

Supporting Details becomes **Step 3, always visible** — `BDPG.toggleSupporting`
and the `supportingOpen` collapse behavior are removed (the state key may remain
in `BDPG.state` harmlessly; it simply stops gating anything).

### 4.2 Step 1 — visual baseline selector

An 8-card responsive grid (`repeat(auto-fill, minmax(200px, 1fr))`), one card per
`BDPG_CONFIG.BASELINE_TABLE` row, **generated by iterating that config** — never a
hand-written duplicate of the table.

Each card shows: a profile-tier icon (⛽ Fuel stop / 🚏 Small / 🚛 Medium /
🏙 Large — decorative only), profile name (Barlow Condensed uppercase),
roadway + lane count as a muted sub-line, and the baseline gallons as the
prominent number.

- Click sets **both** `state.profile` and `state.roadway` atomically, then
  re-renders. This is a new *path* to the same two fields the cascading selects
  set today; `onProfileChange`/`onRoadwayChange` semantics are otherwise unchanged.
- Selected card: cyan border + cyan glow + cyan number.
- Non-selected cards of a *different* profile than the current selection: dimmed
  (`opacity:.45`), still clickable (ruling 5).
- Below the grid, a baseline callout: "**12,500** avg gal/mo baseline" plus a
  mini range bar (2,500–15,000) with a tick at the baseline's position — pure
  CSS, positioned `((baseline − 2500) / 12500) × 100%`.

The existing cascading `<select>`s are **removed** — the grid fully replaces them
(every card is a complete, valid combination, so the cascade has nothing left to
prevent).

### 4.3 Step 2 — two-column adjustments

`grid-template-columns: 1.15fr 1fr` (single column under ~1000px).

**Left column — the interactive map** (replaces `BDPG.regionMapSvg`'s grey
rectangles entirely):

- Third instance of the shared map: `<svg id="bdpg-usa-svg" viewBox="0 0 900 550">`
  containing `<g id="bdpg-states-group">`, rendered by `BDPG.renderMap()`.
- Loads via the memoized `loadUSTopojson()`; while pending, shows the same
  "Loading map…" `<text>` placeholder the other instances use, then re-renders.
- **Fill:** each state's BDPG region color (ruling 1) at ~`0.55` alpha via
  `hexToRgba`, `0.85` when its region is the active one. States not in
  `BDPG_REGION_MAP` (AK, HI, DC — none are mapped) render at `--dim` with a
  "not in any network region" tooltip and are **not clickable**.
- **Selected state:** `.selected` (white stroke + glow) plus a cyan stroke
  override, so selection reads clearly against any region fill.
- **Hover tooltip** reusing `.map-tooltip`: state name, region, and current
  Region % — e.g. `Idaho — West — +6.0%` (percent from
  `BDPG.effectiveRegionPct(region) * 100`, one decimal, explicit sign).
- **Click** sets `BDPG.state.state` to the abbreviation and re-renders, which
  re-derives region and region % exactly as typing does today.
- Below the map: the **typed fallback** — a compact 2-char input (kept, per the
  brief, for fast keyboard entry) wired to the existing `BDPG.onStateInput`
  path, whose scoped-rerender + focus-restore behavior is **preserved**.
- Below that: the **region chip strip** — 5 chips, each showing region name,
  current %, and the active-location count from `network-context.json`
  (`byRegion[region].total`, `—` when the file hasn't loaded). Active region's
  chip gets a cyan border + glow. Chips are display-only (not clickable — a
  region is not a selectable input; the state is).

**Right column, stacked:**

1. **Trucker Path Rating** — `<input type="range" min="1" max="5" step="0.1">`
   (ruling 2), with a live readout showing the **numeric value** (e.g. `3.8`), a
   **read-only 5-star visualization** (filled/half/empty from the value), and the
   **band chip** (`Below 3.0 — −5%` / `3.0–3.5 — 0%` / `3.6+ — +2%`) colored
   red/muted/green. All three update on `input` via a **targeted DOM update, no
   full re-render** — preserving the existing no-focus-steal rule for continuous
   inputs. An explicit "No rating found" toggle sets the value to empty (the
   engine's `flagged` path), since a slider has no natural empty position.
2. **Discount / Pricing Posture** — 5-button segmented control (ruling 3) built
   from `BDPG_CONFIG.PRICING_LEVELS`, labeled with each band's percentage,
   colored green → yellow → red across the row; active button filled.
   Sets `state.pricingLevel` via the existing `BDPG.onPricingChange`.
3. **Amenity Details** — six icon toggle-cards (🚿 showers, 🍔 food, ⚖️ scale,
   🅿️ parking, 🔧 service, ❄️ DEF/reefer). Each click **cycles to the next
   option** in that field's `BDPG_CONFIG.AMENITY_DETAIL_OPTIONS` array (wrapping
   from last → first, and from unset → first), writing the same
   `state.amenityDetails[field]` values as today's dropdowns. Card shows icon,
   field name, and current value; unset cards are muted.
   Below them: the live **suggested level** line and the **Confirmed Amenity
   Level** select (kept as a select — it is a 3-way authoritative choice, and its
   override semantics from the functional spec must not change).

### 4.4 Step 3 — Supporting Details

Always-visible card, fields in a 3-column responsive grid: the five Network-Fit
signal selects, the lane-count number input (keeping its out-of-range warning),
and prospect name/city/state text inputs (keeping their no-re-render `oninput`
behavior).

### 4.5 Generate button

Full-width, `--accent` cyan, black text, Barlow Condensed uppercase, with a truck
glyph: **🚛 GENERATE VALUE PROFILE**. Enabled condition is **exactly today's**:
`profile && roadway && state`. When disabled: dimmed (`opacity:.45`,
`cursor:not-allowed`) with `title="Complete Steps 1 and 2 to generate."`. The
existing scoped button-refresh from `onStateInput` (the wedge fix) is preserved.

### 4.6 Results

Rendered only when `BDPG.state.result` exists, entering with a CSS transition
(`opacity`/`translateY`, ~220ms) applied on mount — no layout-thrash animation.

1. **Hero dual-number** — two large `.kc`-style cards side by side:
   - **FINAL POTENTIAL GALLONS** (headline, cyan, largest) + `finalMathLine`
   - **OFFICIAL CALCULATOR SUBTOTAL** (secondary, `--text`) + `officialMathLine`
   Plus the annual figure and the region-variance as-of line (both already built;
   their content is unchanged). The two numbers remain **explicitly labeled and
   never visually merged** — the functional spec's dual-number contract is a
   presentation requirement as much as an engine one.
2. **Adjustment waterfall** — Chart.js floating-bar (`[start, end]` pairs).
   **Exactly five categories, mirroring the five rows of the already-shipped
   on-screen waterfall table** so the chart and the table can never disagree:

   | # | Bar | Value |
   |---|---|---|
   | 1 | Baseline | `estimate.baseline` (full bar from 0) |
   | 2 | Region | step to `round(baseline × (1 + regionPct))` |
   | 3 | Amenities + Review | step to `estimate.officialSubtotal` |
   | 4 | Pricing | step to `estimate.finalGallons` |
   | 5 | Final Potential | `estimate.finalGallons` (full bar from 0) |

   Amenities and Review are one combined bar (matching both the table's
   "Official calculator subtotal" row and the user's brief). Bars 1 and 5 are
   neutral endpoints (`--dim` / `--accent`); bars 2–4 are green when the step
   raises the number and red when it lowers it, using the existing
   `rgba(0,214,143,.7)` / `rgba(255,71,87,.7)` fills.
   **Every value derives from existing `estimate` fields** — the chart performs
   presentation arithmetic (running subtotals for bar geometry) only. It never
   recomputes a result: bar 3 must equal `estimate.officialSubtotal` and bar 5
   must equal `estimate.finalGallons` exactly, and bar 2's single derived value
   reuses the same `round(baseline × (1 + regionPct))` expression the existing
   table row already uses.
3. **Network range bar** — horizontal 2,500–15,000 track with **two distinct
   markers**: a cyan marker at `finalGallons` and a separate, visually different
   (white/outlined) marker at `officialSubtotal`, each labeled. Built in CSS/SVG,
   not Chart.js — it is a one-dimensional position indicator.
4. **Network Fit Grade badge** — large letter (Barlow Condensed, ~3em) with the
   grade label: A `--accent` · B `--green` · C `--yellow` · D `--orange` ·
   E `--red`, on a tinted card of the same hue. Keeps the existing caption noting
   the grade is scored from the official subtotal and is unaffected by pricing.
5. **"Your Amenity Profile"** (ruling 4) — horizontal bar chart of the six
   amenity dimensions, each scored 0–100 by the **index of the selected option
   within its `AMENITY_DETAIL_OPTIONS` array** (a presentation-only ordinal
   scale, explicitly *not* an engine concept and not used in any calculation).
   Title states it is the prospect's own profile; a sub-line reads "No network
   average available yet." The scoring helper takes an optional comparison
   dataset parameter, unused today — the clean hook for future per-region
   averages.
6. Condition-adjusted view, membership fit, network context, and the analysis
   narrative keep their current content and their current basis
   (`finalGallons` / `officialSubtotal` as the functional spec dictates),
   restyled into the new card vocabulary.

**Chart lifecycle:** `BDPG.render()` writes HTML, then a single
`BDPG.drawCharts()` runs immediately after the `innerHTML` assignment, calling
`mkchart` for each canvas present. Because `mkchart` destroys before creating,
repeated renders are safe.

### 4.7 Print / Export PDF

The existing `body.bdpg-print-mode` gating (and its `afterprint` cleanup) is
**kept as-is** — it is the ruling that protects every other page's printing.

`BDPG.exportPdfHtml()` gains:
- The hero dual-number block, print-styled (black on white, both numbers large
  and labeled, both math lines).
- **The waterfall chart as a static image**: at export time, `onExportPdf` reads
  `CHS['bdpg-waterfall'].toBase64Image()` and injects an `<img>` into the
  print-only block. A live `<canvas>` is unreliable across print pipelines; a
  data-URI image is not. If the chart instance is missing for any reason, the
  image is omitted and the rest of the packet still prints.
- The grade badge and range bar, print-styled (borders instead of glows).
- Membership Fit remains omitted entirely unless configured (unchanged rule).

---

## 5. Non-negotiable invariants (verification checklist for every task)

1. `node --test busDevGallonsCalculator.test.js` → **42/42 passing**, and
   `git diff --stat` shows **no change** to the three engine files.
2. Cases A–D still produce 13,750 / 2,250 / 14,550 / 3,240 through the UI at
   Standard pricing; A@MostAggressive = 14,375.
3. `officialSubtotal` and `finalGallons` are labeled distinctly everywhere they
   appear — screen, print, copy summary.
4. The Network Fit Grade is computed from `officialSubtotal`; membership fit and
   the condition-adjusted view from `finalGallons`. No task changes which number
   flows where.
5. Continuous text/number inputs (typed state abbreviation, Trucker Path slider,
   prospect name/city/state, lane count) never trigger a full-panel
   `innerHTML` rebuild on `input`.
6. All new globals stay on `window.BDPG`; no new loose globals, no new libraries.
7. Every color resolves to a `:root` variable or an existing constant.
8. Other `index.html` pages/tabs — including their printing — are unaffected.

---

## 6. Increments

1. CSS foundation + wizard shell (step cards, badges, done-state) — no behavior change
2. Step 1 visual baseline selector grid + baseline callout
3. Interactive US map (third instance) + region chip strip + typed fallback
4. Step 2 right column: Trucker Path slider, pricing segmented control, amenity toggle cards
5. Step 3 Supporting Details grid (un-collapse)
6. Generate button + results hero + slide-in
7. Results charts: waterfall, range bar, grade badge, amenity profile
8. Print/export updates (static waterfall image, hero, badge)
9. Whole-branch review + fixes

Each increment is one subagent task, reviewed before the next is dispatched.
