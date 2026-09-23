# BDPG Standalone Page + Prospect Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Bus Dev Potential Gallons tool from `index.html` into its own page at `/bus-dev-potential-gallons`, then add a Prospect Profile header, a Pre-Evaluation panel, and a Prospects tracker sub-tab.

**Architecture:** A new `bus-dev-potential-gallons/index.html` carries the tool plus trimmed copies of ~85 lines of shared helpers (map machinery, chart machinery, `toast`) and the CSS the tool uses. The engine files stay external and shared via `../` paths. `index.html` loses the tool and gains a link-out nav item. New UI lives on the same `window.BDPG` namespace.

**Tech Stack:** Vanilla JS (ES5 style), existing CDN deps only — Chart.js 4.4.0, d3-geo 3.1.0, topojson-client 3.1.0. **No new libraries.**

**Spec:** `docs/superpowers/specs/2026-09-23-bdpg-standalone-and-prospect-tracker-design.md` — read §2 for verified line numbers, §3 for rulings, §4 for the design, §5 for invariants.

## Global Constraints

- **NO LOGIC CHANGES.** `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`, `busDevGallonsCalculator.test.js` **byte-identical** at every commit. Verify with `git diff --stat` — if any appears, the task is wrong. `node --test busDevGallonsCalculator.test.js` → **42/42** before every commit.
- Existing UI keeps writing the **same `BDPG.state` fields with the same values**. New fields (`prospect.*`, `preEvalSignal`) are presentation/record-keeping only and feed **no calculation**.
- **The State field is not duplicated.** The Prospect header's State input writes `BDPG.state.state` — the same field the map click and Step 2 fallback write.
- **Colors** from `:root` tokens or established constants only. Region colors fixed: West `#00D68F`, Southwest `#FF6B35`, Midwest `#FFD60A`, Northeast `#7C3AED`, Southeast `#FF4757`; cyan `--accent` reserved for selection.
- **Continuous text/number inputs never trigger a full rebuild on `input`** — prospect Name/Street/City/Notes, the typed state code, the rating slider, prospect city/state in Supporting Details, lane count.
- The `onStateInput` behavior cluster (focus/cursor restore → `#bdpg-generate-btn` refresh → step-card ✓ sync → `BDPG.renderMap()`) must survive every task that touches it.
- Print rules stay `body.bdpg-print-mode`-prefixed.
- All new globals on `window.BDPG`.
- Never commit `location-list-2026-09-21.csv`, the calculator PDF, server logs, or screenshot artifacts. If the CSV shows as modified (CRLF noise), leave it unstaged.

---

## File Structure

```
bus-dev-potential-gallons/index.html   NEW — the standalone tool.
                                         <head>: 3 CDN tags, ../busDevGallonsConfig.js,
                                         ../busDevGallonsCalculator.js, <style> (palette +
                                         components + .bdpg-* + print rules)
                                         <body>: header, sub-tab bar, 2 panels, #toast,
                                         <script> (ported helpers + window.BDPG)

index.html                             MODIFIED — tool removed; nav item becomes a link-out.
                                         Removes: .bdpg-* CSS, bdpg print rules, the
                                         window.BDPG block (17038-18234), renderBusDevGallons,
                                         #pg-bus-dev-potential-gallons, TITLES entry,
                                         renderPage branch, 2 engine <script src> tags.
                                         KEEPS untouched: loadUSTopojson/STATE_PATHS/
                                         STATE_NAMES/hexToRgba/getCentroid, CHS/CDO/mkchart,
                                         toast — ~25 charts and 2 maps depend on them.
```

---

## Task 1: Standalone page scaffold

**Files:** Create `bus-dev-potential-gallons/index.html`

**Interfaces:**
- Produces: a working standalone tool at `/bus-dev-potential-gallons/`. Same `window.BDPG` API as the dashboard version.

- [ ] **Step 1: Create the directory and page skeleton**

`<head>` order matters — engine files must load before the inline script runs:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bus Dev Potential Gallons — Roady's Command Center</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/d3-geo@3.1.0/dist/d3-geo.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script>
<script src="../busDevGallonsConfig.js"></script>
<script src="../busDevGallonsCalculator.js"></script>
<style>/* see Step 2 */</style>
</head>
<body>
  <div class="bdpg-page-hd">
    <div class="bdpg-page-title">⛽ Bus Dev Potential Gallons</div>
    <div style="flex:1"></div>
    <button class="btn" onclick="BDPG.toggleTheme()">🌙</button>
  </div>
  <div class="container" id="bdpg-content"></div>
  <div class="toast" id="toast"></div>
<script>/* see Step 3 */</script>
</body>
</html>
```

- [ ] **Step 2: Port the CSS**

Copy from `index.html` verbatim (do not redesign): the `:root` block (19–25) **and** the full `body.day-mode` override (26–31); the component classes the tool uses — `.cc/.cc-lbl/.cw`, `.dt/.tw`, `.btn/.btn-accent`, `.tag-green/-red/-yellow/-blue/-orange/-gray`, `.fg`, `.sec-hdr/.sec-title`, `.badge`, `.map-tooltip*`, `.toast`, `.impl-sub-tab`; the entire `.bdpg-*` block starting at line 530; and the `body.bdpg-print-mode` print rules (889–924).

Add a minimal page chrome block (new, since there's no dashboard shell):

```css
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--fb);}
.bdpg-page-hd{display:flex;align-items:center;gap:14px;padding:14px 22px;border-bottom:1px solid var(--border);background:var(--surface);}
.bdpg-page-title{font-family:var(--ff);font-size:1.4em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
.container{max-width:1500px;margin:0 auto;padding:18px 22px;}
```

Also carry over the two `@font-face`/Google-font links if `index.html` loads Barlow Condensed / DM Sans externally — check how it sources `--ff`/`--fb` and mirror it. If those fonts come from a `<link>`, copy the `<link>`; if they're system-stack fallbacks only, nothing to do.

- [ ] **Step 3: Port the JS**

In order: the shared helpers, then the `window.BDPG` block.

Helpers, copied verbatim from `index.html`: `CHS`, `CDO`, `mkchart()` (2985–2991); `toast()` (2994–2999); `FIPS_TO_STATE` (10561), `loadUSTopojson()` (10575), `usTopoLoaded`/`usTopoPromise` declarations, `STATE_NAMES` (10601), `hexToRgba()` (10698), `getCentroid()` (10703).

Then the entire `var BDPG = { … }` block through `window.BDPG = BDPG;` (17038–18232), **unchanged**.

Replace the `renderBusDevGallons()` wrapper with a direct boot call at the end:

```js
document.addEventListener('DOMContentLoaded', function () { BDPG.render(); });
```

Add the theme toggle the page header references (the dashboard's lives elsewhere):

```js
BDPG.toggleTheme = function () {
  document.body.classList.toggle('day-mode');
  try { localStorage.setItem('roadysBDPGTheme', document.body.classList.contains('day-mode') ? 'day' : 'night'); } catch (e) {}
};
// restore on load, before first render
try { if (localStorage.getItem('roadysBDPGTheme') === 'day') document.body.classList.add('day-mode'); } catch (e) {}
```

- [ ] **Step 4: Verify**

Serve the repo root (`python -m http.server 8791`), open `http://localhost:8791/bus-dev-potential-gallons/`. Confirm, against the dashboard version as reference:
- All three step cards render; the map loads and is colored by region; clicking a state selects it.
- Generate produces results; the waterfall, range bar, grade badge, and amenity chart all draw.
- Export PDF, Copy Summary, Save Profile, My Profiles all work.
- The typed state code preserves focus; the rating slider updates live without a rebuild.
- Theme toggle flips day/night and persists across reload.
- **Zero console errors**, including no 404s for the `../` engine/JSON paths.

Run `node --test busDevGallonsCalculator.test.js` (42/42) and `git diff --stat` (only the new file).

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): standalone page at /bus-dev-potential-gallons"
```

---

## Task 2: Remove the tool from `index.html`; nav becomes a link-out

**Files:** Modify `index.html`

- [ ] **Step 1: Delete the tool's code**

Remove, in this order (work bottom-up so earlier line numbers stay valid):
1. `renderBusDevGallons()` (18234) and the `window.BDPG` block (17038–18232).
2. The `renderPage()` branch (3225): `else if(id==='bus-dev-potential-gallons') renderBusDevGallons();`
3. The `TITLES` entry (3004): `,'bus-dev-potential-gallons':'Bus Dev Potential Gallons'`
4. The page shell (1372): `<div class="page" id="pg-bus-dev-potential-gallons">…</div>`
5. The two engine `<script src>` tags (`busDevGallonsConfig.js`, `busDevGallonsCalculator.js`).
6. The `.bdpg-*` CSS block (from 530) and the `body.bdpg-print-mode` print rules (889–924).

**Do NOT remove**: `loadUSTopojson`/`FIPS_TO_STATE`/`STATE_PATHS`/`STATE_NAMES`/`hexToRgba`/`getCentroid`, `CHS`/`CDO`/`mkchart`, `toast`, or the `#toast` element. ~25 charts, two maps, and dozens of call sites depend on them.

- [ ] **Step 2: Convert the nav item to a link-out**

Replace line 995 with the same shape the other standalone tools use (`window.open`, `↗` affordance):

```html
      <div class="ni" data-nav-id="bus-dev-potential-gallons" onclick="window.open('bus-dev-potential-gallons/','_blank')"><span class="ni-icon">⛽</span>Bus Dev Potential Gallons<span class="expand-icon" style="font-size:.7em;margin-left:auto;color:var(--accent)">↗</span></div>
```

(Match the exact markup the neighbouring link-out items use — copy their structure rather than inventing one.)

- [ ] **Step 3: Verify the dashboard is otherwise untouched**

- Every other nav item still navigates; no console errors anywhere.
- **The Territory map and the GS Metrics map still render** (they share the helpers you deliberately kept).
- Spot-check three charts on different tabs still draw.
- Printing the Dashboard tab is normal (the bdpg print rules are gone; nothing else referenced them).
- `grep -n "bdpg\|BDPG" index.html` → **no matches**, confirming a complete extraction.
- Clicking the Bus Dev nav item opens the new page in a tab.

Run the test suite (42/42) and `git diff --stat` (only `index.html`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor(bdpg): remove tool from dashboard, link out to standalone page"
```

---

## Task 3: Sub-tab bar

**Files:** Modify `bus-dev-potential-gallons/index.html`

**Interfaces:**
- Produces: `BDPG.activeTab` (`'calc' | 'prospects'`), `BDPG.switchTab(name)`, `BDPG.prospectsHtml()` (stub this task).

- [ ] **Step 1: Add the bar and panel split**

Markup above `#bdpg-content`:

```html
<div class="bdpg-subtabs">
  <button id="bdpg-tab-calc" class="impl-sub-tab active" onclick="BDPG.switchTab('calc')">⛽ Potential Gallons</button>
  <button id="bdpg-tab-prospects" class="impl-sub-tab" onclick="BDPG.switchTab('prospects')">📋 Prospects</button>
</div>
```

```css
.bdpg-subtabs{display:flex;gap:4px;padding:0 22px;border-bottom:2px solid var(--border);background:var(--surface);}
```

```js
BDPG.activeTab = 'calc';
BDPG.switchTab = function (name) {
  BDPG.activeTab = name;
  document.getElementById('bdpg-tab-calc').classList.toggle('active', name === 'calc');
  document.getElementById('bdpg-tab-prospects').classList.toggle('active', name === 'prospects');
  BDPG.render();
};
```

`BDPG.render()` gains a tab branch at the top — the calculator's existing body becomes the `'calc'` arm, untouched:

```js
if (BDPG.activeTab === 'prospects') { el.innerHTML = BDPG.prospectsHtml(); return; }
```

Stub for this task: `BDPG.prospectsHtml = function () { return '<div class="cc"><div class="cc-lbl">Prospects</div><div style="color:var(--muted)">Tracker coming in a later task.</div></div>'; };`

**Important:** the early return must come *after* the region-variance / network-context load gates, so switching tabs never bypasses them.

- [ ] **Step 2: Verify**

Tabs switch; the calculator panel is unchanged and retains its state across a switch away and back (state lives in `BDPG.state`, not the DOM); map and charts redraw correctly on return; no console errors.

Tests 42/42; diff only the new page.

- [ ] **Step 3: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Potential Gallons | Prospects sub-tab bar"
```

---

## Task 4: Prospect Profile card (⓪)

**Files:** Modify `bus-dev-potential-gallons/index.html`

**Interfaces:**
- Produces: `BDPG.state.prospect = {name, street, city, locationType, notes}`, `BDPG.prospectHtml()`, `BDPG.onProspectInput(field, value)`, `BDPG.onLocationType(value)`, `BDPG.prospectDone()`, `BDPG.displayName()`.

- [ ] **Step 1: Extend state (additively)**

In the `BDPG.state` initializer add — **without touching any existing key**:

```js
prospect: { name: '', street: '', city: '', locationType: '', notes: '' },
```

- [ ] **Step 2: Add the card**

```js
BDPG.LOCATION_TYPES = ['Truck Stop', 'Fuel Stop', 'Service Center', 'Truck Stop / Service Center', 'C-Store'];

BDPG.prospectDone = function () {
  var p = BDPG.state.prospect;
  return !!(p.name && p.city && BDPG.state.state);
};

BDPG.displayName = function () {
  return BDPG.state.prospect.name || BDPG.state.supportingDetails.prospectName || 'Prospect';
};

// Continuous text fields: write state, never re-render (focus preservation).
BDPG.onProspectInput = function (field, value) { BDPG.state.prospect[field] = value; };
```

`BDPG.prospectHtml()` returns the fields in a `.bdpg-grid-3`, with a required marker helper (`'<span style="color:var(--red)">*</span>'`) on Name, City, State. The **State input writes `BDPG.state.state`** via the existing `BDPG.onStateInput` so the map and region resolution react exactly as they do for a map click — do not create a parallel state field or a parallel handler.

Location Type renders as a `.bdpg-seg` segmented control over `BDPG.LOCATION_TYPES`, calling `BDPG.onLocationType(v)` (Task 5 gives it its coupling behavior; this task just sets `prospect.locationType` and re-renders).

Wire it into `render()`'s calc arm as the first card: `BDPG.stepCardOpen(0, 'Prospect Profile', BDPG.prospectDone()) + BDPG.prospectHtml() + BDPG.stepCardClose()`.

`stepCardOpen`'s glyph array is `['①','②','③']` indexed `num-1`; passing `0` yields `undefined` and falls back to `String(num)` → `"0"`. Extend the array to `['⓪','①','②','③']` indexed by `num` instead, and update the three existing call sites (1, 2, 3) accordingly — verify all four badges render correctly afterward.

- [ ] **Step 3: Extend the Generate gating**

```js
var can = !!(BDPG.prospectDone() && s.profile && s.roadway && s.state);
```
Tooltip when disabled: `"Complete Prospect Profile, Steps 1 and 2 to generate."`

Because the prospect Name/City inputs don't re-render, the Generate button would go stale — add the same targeted `#bdpg-generate-btn` `outerHTML` refresh that `onStateInput` already performs, called from `onProspectInput` for the `name` and `city` fields.

- [ ] **Step 4: Use the display name in results and export**

Replace the prospect-name source in `resultsHtml`/`exportPdfHtml`/`summaryText` with `BDPG.displayName()`. Do not change any number or label.

- [ ] **Step 5: Verify**

⓪ card renders first with the three required asterisks; typing Name/City preserves focus and enables Generate at the right moment; typing State selects it on the map and resolves the region; all four step badges (⓪①②③) render; the display name appears in results, export, and Copy Summary.

Tests 42/42; diff only the new page.

- [ ] **Step 6: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Prospect Profile header card with required-field gating"
```

---

## Task 5: Location Type → Step 1 coupling

**Files:** Modify `bus-dev-potential-gallons/index.html`

- [ ] **Step 1: Implement the coupling in `onLocationType` only**

It must fire **on change only**, never during a render, or it would fight a manual card choice.

```js
BDPG.LOCTYPE_PROFILE = {
  'Fuel Stop':                   { auto: 'Fuel stop', roadway: 'Any' },
  'Service Center':              { suggest: ['Medium truck stop', 'Large truck stop'] },
  'Truck Stop / Service Center': { suggest: ['Medium truck stop', 'Large truck stop'] }
};

BDPG.onLocationType = function (v) {
  var s = BDPG.state;
  s.prospect.locationType = v;
  var rule = BDPG.LOCTYPE_PROFILE[v];
  s.autoSetNote = '';
  s.suggestProfiles = [];
  if (rule && rule.auto) {
    s.profile = rule.auto; s.roadway = rule.roadway;
    s.autoSetNote = v + ' type selected — baseline auto-set.';
  } else if (rule && rule.suggest) {
    s.suggestProfiles = rule.suggest;
  }
  BDPG.render();
};
```

- [ ] **Step 2: Reflect it in Step 1**

In `step1Html`, add `.suggest` to cards whose profile is in `s.suggestProfiles`, and render `s.autoSetNote` under the grid when set. CSS:

```css
.bdpg-bcard.suggest{border-color:var(--yellow);box-shadow:0 0 10px rgba(255,214,10,.2);}
```

In `onBaselineCardClick`, clear `s.autoSetNote` — a manual pick always wins and the stale note must not linger.

- [ ] **Step 3: Verify**

Fuel Stop auto-selects `Fuel stop / Any`, dims truck-stop cards, and shows the note; clicking any other card overrides it and clears the note. Service Center / Truck Stop-Service Center outline Medium+Large **without** selecting, and Generate stays disabled until a card is actually clicked. Truck Stop and C-Store couple to nothing.

Tests 42/42; diff only the new page.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Location Type couples to Step 1 baseline selection"
```

---

## Task 6: Pre-Evaluation panel

**Files:** Modify `bus-dev-potential-gallons/index.html`

**Interfaces:**
- Produces: `BDPG.preEval()` → `{chips: [{label, text, tone}], signal: 'Strong'|'Moderate'|'Review'}`, `BDPG.preEvalHtml()`. Sets `BDPG.state.prospect.preEvalSignal`.

- [ ] **Step 1: Compute**

`BDPG.preEval()` returns the seven chips of spec §4.5. Tones are `'green'|'yellow'|'red'|'blue'`, mapping to the existing `.tag-*` classes. Chips 5 and 6 are always `'blue'` (informational) and are **excluded from the roll-up**. Roll-up: any red → `Review`; all of chips 1–4 green → `Strong`; otherwise `Moderate`.

Data sources — read-only, no recomputation of anything the engine owns:
- Region: `BusDevGallonsCalc.resolveRegion(BDPG.state.state)`
- Region %: `BDPG.effectiveRegionPct(region) * 100`
- Counts: `BDPG.networkContext.byRegion[region].total` and `.byType[locationType]` (guard every hop — the file may not have loaded, the region may be absent, the type may not exist in that region → render `—` and tone `yellow`)
- Baseline range: min/max `baseline` over `BDPG_CONFIG.BASELINE_TABLE` rows whose `profile` matches the mapped profile
- Estimated profile: the `BDPG.LOCTYPE_PROFILE` mapping from Task 5, else the closest sensible row; rendered as `"Fuel stop · Any · 1–2 lanes · 2,500 baseline"`

Store the signal: `BDPG.state.prospect.preEvalSignal = result.signal;`

- [ ] **Step 2: Render**

Collapsible card between ⓪ and Step 1 (`BDPG.state.preEvalOpen`, default open), header *"Pre-Evaluation"* plus the muted line *"complete the calculator below for a full analysis."* Chips as `<span class="badge tag-{tone}">`. Renders only when Name + City + State + Location Type are all present; otherwise a muted prompt naming what's still missing.

- [ ] **Step 3: Verify**

With a West state, Fuel Stop type, name+city filled: region chip green, network-presence chip reads the real count from `network-context.json` (West = 78 → green), type-in-network chip reads `byType['Fuel Stop']`, baseline-range chip shows `2,500–2,500`, estimated-profile chip shows the Fuel stop row, and the roll-up is consistent with the four judgement chips. Region-performance chip is yellow while `region_variance.json` ships zeros. Nothing in the pre-eval changes any calculator output — generate before and after toggling it and confirm identical numbers.

Tests 42/42; diff only the new page.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Pre-Evaluation panel with seven status chips"
```

---

## Task 7: Extend the saved record (defensively)

**Files:** Modify `bus-dev-potential-gallons/index.html`

- [ ] **Step 1: Save the new fields**

`BDPG.onSaveProfile` already deep-copies `BDPG.state` and deletes `result`. Because `prospect` lives on `BDPG.state`, it is carried automatically — **verify that rather than assuming**, and additionally persist a flat summary on the record so the tracker doesn't have to re-derive anything:

```js
profiles.push({
  id: 'bdpg_' + Date.now(),
  name: BDPG.displayName(),
  savedAt: new Date().toISOString(),
  state: snapshot,
  summary: BDPG.trackerSummary()   // see Step 2
});
```

- [ ] **Step 2: `BDPG.trackerSummary()`**

Captures what the table shows, from the *current* state and result:

```js
BDPG.trackerSummary = function () {
  var s = BDPG.state, r = s.result, e = r ? r.estimate : null;
  return {
    name: BDPG.displayName(),
    locationType: s.prospect.locationType || '',
    city: s.prospect.city || '',
    stateCode: s.state || '',
    region: s.state ? BusDevGallonsCalc.resolveRegion(s.state) : '',
    profile: s.profile || '', roadway: s.roadway || '',
    officialSubtotal: e ? e.officialSubtotal : null,
    finalGallons: e ? e.finalGallons : null,
    grade: r && r.grade ? r.grade.grade : '', gradeLabel: r && r.grade ? r.grade.gradeLabel : '',
    preEvalSignal: s.prospect.preEvalSignal || '',
    amenityLevel: s.amenityLevel || '', pricingLevel: s.pricingLevel || ''
  };
};
```

A profile saved **before generating** has `null` gallons and empty grade — legitimate, and the table must render those as `—`.

- [ ] **Step 3: Defensive read helper**

```js
// Profiles saved before this release have no `prospect` and no `summary`.
// Every field falls back to a dash; nothing here may ever render "undefined".
BDPG.readSummary = function (p) {
  var sum = p.summary || {};
  var st = p.state || {};
  var pr = st.prospect || {};
  return {
    name: sum.name || p.name || pr.name || '—',
    locationType: sum.locationType || pr.locationType || '',
    city: sum.city || pr.city || '',
    stateCode: sum.stateCode || st.state || '',
    region: sum.region || (st.state ? BusDevGallonsCalc.resolveRegion(st.state) : '') || '',
    profile: sum.profile || st.profile || '', roadway: sum.roadway || st.roadway || '',
    officialSubtotal: (sum.officialSubtotal === 0 || sum.officialSubtotal) ? sum.officialSubtotal : null,
    finalGallons: (sum.finalGallons === 0 || sum.finalGallons) ? sum.finalGallons : null,
    grade: sum.grade || '', gradeLabel: sum.gradeLabel || '',
    preEvalSignal: sum.preEvalSignal || pr.preEvalSignal || '',
    amenityLevel: sum.amenityLevel || st.amenityLevel || '',
    pricingLevel: sum.pricingLevel || st.pricingLevel || '',
    savedAt: p.savedAt || ''
  };
};
```

Note the `=== 0 ||` guards: a legitimate zero must not collapse to `null`.

- [ ] **Step 4: Verify**

Save a fully-generated profile and confirm the record carries `prospect` and `summary`. Then hand-craft an old-shape record in the console (`{id, name, savedAt, state:{profile,roadway,state}}` with no `prospect`/`summary`), write it into `localStorage['roadysBDPGProfiles']`, and confirm `BDPG.readSummary` returns dashes/empties for everything missing — **no `undefined`, no throw**. Confirm Load still works for both shapes.

Tests 42/42; diff only the new page.

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): extend saved profile record with prospect + tracker summary"
```

---

## Task 8: Prospects tracker table

**Files:** Modify `bus-dev-potential-gallons/index.html`

- [ ] **Step 1: Replace the `prospectsHtml` stub**

Render `<div class="tw"><table class="dt">…` — `class="dt"` is what buys free click-to-sort from the delegated handler, so **do not** hand-roll sort handlers.

Columns per spec §4.6. Cells:
- Name + `<span class="badge tag-gray">` type badge
- `City, ST` + region chip (`.badge` tinted with `BDPG.REGION_COLORS[region]`)
- `"Large · Interstate"` (or `—`)
- Official / Final via `BDPG.fmtGal`, or `—` when null; Final followed by a small pricing-posture indicator
- Grade badge via `BDPG.GRADE_COLORS`
- Pre-eval chip (`.tag-green/-yellow/-red`)
- Amenity level, pricing posture, saved date (`toLocaleDateString`)
- Actions: `Load` / `Export PDF` / `Delete`

Default sort **saved date descending** — sort the array before rendering; the delegated handler then re-sorts on click.

- [ ] **Step 2: Actions**

```js
BDPG.onTrackerLoad = function (id) { BDPG.onLoadProfile(id); BDPG.switchTab('calc'); };
BDPG.onTrackerExport = function (id) {
  BDPG.onLoadProfile(id);
  BDPG.switchTab('calc');
  BDPG.onGenerate();      // export needs a result; loading clears it by design
  BDPG.onExportPdf();
};
```
Delete reuses the existing `confirm()`-gated `BDPG.onDeleteProfile`, then re-renders the tracker.

Guard `onTrackerExport`: if `onGenerate` can't produce a result (an incomplete old profile), `toast` a message and stop rather than opening an empty print dialog.

- [ ] **Step 3: Empty state**

```html
<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--muted)">📋 No prospects evaluated yet — complete a profile above and save it.</td></tr>
```

- [ ] **Step 4: Verify**

Save 3–4 profiles with different grades, pricing postures, and types. All columns populate; clicking each header sorts ascending then descending; Load reopens in the calculator with the right values; Export PDF produces the packet; Delete removes after confirm. Delete all → empty state. Add an old-shape record → renders with dashes, no crash.

Tests 42/42; diff only the new page.

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Prospects tracker table with sorting and row actions"
```

---

## Task 9: Tracker summary row

**Files:** Modify `bus-dev-potential-gallons/index.html`

- [ ] **Step 1: Compute and render**

Below the table, a `.cc` card:
- **Average Official** and **Average Final** — mean over records where that number is non-null; records missing it are **excluded from the denominator**, not counted as zero. Show `—` if none qualify.
- **Grade distribution** — five chips, always all five shown even at zero: `A ×3`, `B ×1`, … colored A `--accent`, B `--green`, C `--yellow`, D `--orange`, E `--red` (reuse `BDPG.GRADE_COLORS`).
- **Signal counts** — three chips: Strong (green), Moderate (yellow), Review (red), each with its count.

Chips use the existing `.badge` + `.tag-*` classes; per ruling 4 these are **chips with counts, never plain text**.

- [ ] **Step 2: Verify**

With a known set (e.g. 2×A, 1×C, 1 ungraded), the chips read `A ×2`, `B ×0`, `C ×1`, `D ×0`, `E ×0` and the ungraded record is excluded from the grade chips but still counted in the table. Averages match hand arithmetic over only the records that have numbers. Empty tracker → summary hidden or all-zero chips (pick one; say which).

Tests 42/42; diff only the new page.

- [ ] **Step 3: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): tracker summary row with grade and signal chips"
```

---

## Task 10: Whole-branch polish + invariant checklist

- [ ] **Step 1: Run the checklist**

1. `node --test busDevGallonsCalculator.test.js` → 42/42.
2. `git diff --stat feat/bus-dev-gallons-ui..HEAD` → only `index.html`, `bus-dev-potential-gallons/index.html`, and the two docs. **No engine file.**
3. End-to-end on the standalone page: Medium/Interstate + West state (+6% override) + Good + 3.8 + Standard → Official **13,750**, Final **13,750**; switch to Most aggressive → Final **14,375**, Official **13,750**.
4. Both numbers labelled distinctly on screen, in print, in Copy Summary.
5. Continuous inputs never rebuild on `input` (prospect name/street/city/notes, typed state, slider, lanes).
6. `onStateInput` still does all four of: focus/cursor restore, generate-button refresh, step-card sync, `renderMap()`.
7. `grep -n "bdpg\|BDPG" index.html` → no matches.
8. The dashboard's own tabs, charts, maps, and printing all still work.
9. `/bus-dev-potential-gallons/` loads clean with no console errors and no 404s.

- [ ] **Step 2: Fix anything surfaced, re-run, commit if changed**

```bash
git add -A
git commit -m "fix(bdpg): polish pass — invariant checklist fixes"
```

---

## Self-Review Notes

- **Task 4 changes `stepCardOpen`'s glyph indexing** (to admit ⓪). That helper is used by Tasks 4/5/6 and the three pre-existing step cards — the task explicitly re-verifies all four badges.
- **Task 4 touches the Generate gating and adds a button refresh to `onProspectInput`**, mirroring the existing `onStateInput` fix. Both must coexist.
- **Task 3's early return in `render()` must sit after the load gates**, or a tab switch could skip region-variance/network-context loading.
- **Task 7's `=== 0 ||` guards** exist so a legitimate zero isn't coerced to `—`.
- The standalone page duplicates ~85 lines of *infrastructure* by design (spec ruling 5); it does **not** duplicate the tool, which exists in exactly one place after Task 2.
