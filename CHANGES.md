# rankings.html → GS Performance Tracker — UI redesign changelog

Single-file edit. Scoring engine (`gsrCompute`, `GSR_METRICS`, `GSR_AGG_NAME`,
`gsrAuto`, `gsrAgg`, `gsrFuelSeed`, `gsrRewardsSeed`, `gsrVendorEnrolled`) and all
existing seed objects are **untouched**. localStorage keys unchanged. File is now
2,110 lines / ~177 KB (net ~+45 lines vs. prior).

## Header / title
- `<title>` and `.sec-title`: **"Growth Strategist Rankings" → "GS Performance Tracker"**.
- Removed the "Score = green ÷ measurable cells…" subtitle line.

## Seed objects added
- `RETENTION_BY_STOP` and `RETENTION_BY_STOP_PREV` — one entry per stop ID (0–1),
  built deterministically from `GS_TERRITORY` so reloads are stable. Most stops
  0.85–0.96, ~15% intentionally lower (0.60–0.82). Helpers `_retHash` / `_retVal`.
  Both are commented `// TODO: replace with Interstate live data in the migration PR`.

## Functions added (UI rollups — engine untouched)
- `GSR_SEED_MONTHS`, `GSR_ALL_MONTHS`, `GSR_CATS`, `gsrCatOf(section)`
- `gsrCatTotals(m)` — network green/meas/pct per category (fuel/rewards/vendor), live.
- `gsrCatYtd(cat, m)` — mean of a category's monthly pct across closed seed months ≤ m.
- `gsrNetAvg(m)` / `gsrNetAvgSnap(m)` / `gsrNetYtd(m)` — network average of the 6 GS
  scores (current live, previous from saved snapshots, YTD from per-GS `gsrYtdAvg`).
- `gsrRetMean`, `gsrAllStopIds`, `gsrRetentionNetwork(seed)`, `gsrRetentionGS(gs, seed)`.

## Functions changed
- `gsrSaveSnapshot(r)` — now also persists `sections: {legacy:{green,meas}, …}` per
  snapshot (needed for per-category history; carried forward to Interstate).
- `gsrRenderFront(m)` — **fully rewritten.** Old 4-stat summary strip + top-3 podium
  + stacked bar list → **three top cards** (Retention Rate · GS Network Average Score
  · Total Active Stops) + **three category cards** (Fuel Average · Rewards · Vendor
  Programs, each `green/meas · %` with prev + YTD) + a real `<table>` **standings grid**
  (GS Name · Jan–Dec · YTD · Retention Rate). Jul–Dec render a muted `%` placeholder.
  First column and header row are `position:sticky`; the table scrolls horizontally
  inside its card on narrow viewports. Rows call `gsrOpenModal(gs)`.
- `gsrRerender()` — backfills snapshots for **all** closed seed months (not just the
  open one) so YTD / prev-month reads and the category cards are always complete.

## Modal cleanup (`gsrScorecardHTML`)
- Removed the words **"measurable cells green"** — header now shows just `X/Y`.
- Removed the master-mode hint **"— click a stop, then a tag to set green/red"** from
  the "Truck stops (N)" section header.

## Verify on localhost
- Cycle the month selector (Jan–Jun 2026): top cards, category cards, and the grid's
  YTD/current columns should all move; grid Jan–Jun stay populated, Jul–Dec stay `%`.
- Toggle **Master mode**, open a GS scorecard, flip a cell green/red → the standings
  grid and category cards should recolor on close (`gsrRerender` re-runs).
- Day/night toggle: every new color uses a CSS var, so both themes should hold.
- **Vendor Programs card / vendor grid contribution shows 0.0% until `roadys_vp_enroll`
  localStorage has enrollments** (unchanged behavior — vendor scoring reads `VP_ENROLL`).
  Confirm it lights up on a browser that has used the value-prop wizard.
- Narrow the window < 900px → the standings table should scroll sideways with the GS
  Name column pinned; nothing else should reflow-collapse.

## Follow-up: Category Drill-Down

Second single-file edit on `rankings.html`. Adds a 12-month per-GS drill-down modal to
each category card. Engine, seeds, standings, master-mode, localStorage untouched.
File is now ~2,150 lines / ~181 KB (net ~+55 lines vs. the prior redesign).

### Helpers / constants added
- `GSR_CAT_LABEL` — `{ fuel:'Fuel Average', rewards:'Rewards', vendor:'Vendor Programs' }`.
- `gsrCatByGS(gs, m, cat)` — per-GS `{green, meas, pct}` for one category in one month
  (sums `gsrCompute(gs,m).metrics` over the category's sections).
- `gsrCatByGSYtd(gs, cat, m)` — per-GS YTD mean of that category's pct across closed
  seed months ≤ m.

### Function added
- `gsrCatModalHTML(cat, m)` — drill-down modal body. Colored-left-border header card
  (category label + "12-month trend by Growth Strategist" subtitle + network
  `green/meas · pct` for the month, right-aligned) over a table that mirrors Full
  Standings' visual language: sticky header row, sticky first column, `overflow-x:auto`
  container, `--surface2` header, `gsrColor` coding. Columns: **GS Name · Jan–Dec · YTD**
  (14 cols, **no Retention**). Jul–Dec render the muted `%` placeholder. Rows sorted by
  YTD desc → current-month pct desc → GS name asc. No expandable-stops section.

### State / plumbing changed
- Modal state is now two-mode: `gsrModalKind` (`'gs'|'cat'|null`) + `gsrModalCat`
  alongside the existing `gsrModalGS`.
- `gsrOpenModal(gs)` sets `kind='gs'`; new `gsrOpenCatModal(cat)` sets `kind='cat'`
  and renders `gsrCatModalHTML`. `gsrCloseModal()` clears all three. `gsrRerender()`
  refreshes whichever modal kind is open. `gsrToggleFull` unchanged (shell-only).

### Wiring in `gsrRenderFront`
- `catCard(lbl, key)` now carries `onclick="gsrOpenCatModal('<key>')"` + `cursor:pointer`;
  visuals otherwise unchanged. The three top cards stay non-clickable.

### Verify on localhost
- Click each category card → modal opens with that category's 12-month per-GS grid,
  YTD column, no Retention column. Vendor still 0.0% until `roadys_vp_enroll` exists.
- With a category modal open, change the month selector → the modal body follows.
- Open a category modal, then open a GS row scorecard → they swap cleanly (never both).
- Fullscreen toggle + narrow-viewport horizontal scroll behave like Full Standings.
