# Bus Dev Potential Gallons — UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Bus Dev Potential Gallons UI as a guided three-step wizard with a real interactive US map, visual selectors, and charted results — matching the GS Metrics visual language exactly, with zero changes to the calculator engine.

**Architecture:** All work is inside `index.html`: new CSS in the existing `<style>` block (prefixed `.bdpg-`), and rewritten HTML-builder functions + handlers on the existing `window.BDPG` namespace. The US map is a third instance of the existing TopoJSON map machinery (`loadUSTopojson` / `STATE_PATHS` / `STATE_NAMES` / `hexToRgba` / `getCentroid`), suffixed `-bdpg`. Charts go through the existing `mkchart(id, cfg)` + `CDO` Chart.js wrapper, drawn in a post-render pass because `BDPG.render()` assigns `innerHTML` wholesale.

**Tech Stack:** Vanilla JS (ES5 style, matching the file), existing CDN deps only — Chart.js 4.4.0, d3-geo 3.1.0, topojson-client 3.1.0. **No new libraries.**

**Spec:** `docs/superpowers/specs/2026-09-22-bus-dev-gallons-ui-overhaul-design.md` (read §2 for verified facts about the existing code, §4 for the design, §5 for the invariant checklist)

## Global Constraints

- **No logic changes.** `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`, and `busDevGallonsCalculator.test.js` must be **byte-identical** at every commit. Verify with `git diff --stat` — if any of those three files appears, the task is wrong.
- `node --test busDevGallonsCalculator.test.js` → **42/42 passing** before every commit.
- Handlers may be rewritten but must write **the same `BDPG.state` fields with the same values** as today. No new fields feed the engine.
- **Colors:** only `:root` variables (`--accent #00C8FF`, `--green #00D68F`, `--red #FF4757`, `--yellow #FFD60A`, `--orange #FF6B35`, `--purple #7C3AED`, `--teal #0891B2`, `--dim #3A4A6B`, `--muted #6B7A99`, `--text #E8EDF8`, `--surface #0D1225`, `--surface2 #121830`, `--border #1E2A45`, `--border2 #2A3A5C`) or existing constants. Build translucent fills with the existing `hexToRgba(hex, alpha)`.
- **BDPG region colors (fixed, user-approved):** West `#00D68F`, Southwest `#FF6B35`, Midwest `#FFD60A`, Northeast `#7C3AED`, Southeast `#FF4757`. **Cyan `--accent` is reserved for selection/active state and is never a region fill.**
- **Fonts:** `var(--ff)` (Barlow Condensed) for headers/numbers/uppercase labels, `var(--fb)` (DM Sans) for body text.
- **Continuous inputs must never trigger a full `innerHTML` rebuild on `input`**: the typed state abbreviation, the Trucker Path slider, prospect name/city/state, and the lane-count field. They update state directly and/or do targeted DOM updates.
- All new globals on `window.BDPG` only. No new loose globals.
- `officialSubtotal` and `finalGallons` stay distinctly labeled everywhere (screen, print, copy).
- Do not touch `BDPG.adminPanelHtml`, `BDPG.networkContextGeneratorHtml`, the CSV handlers, `BDPG.onGenerate`'s engine calls, `BDPG.summaryText`, or the profile save/load functions except where a task explicitly says so.
- Never commit `location-list-2026-09-21.csv`, `Roadys_Prospective_Member_Gallons_Calculator.pdf`, or any server log. If `git status` shows the CSV as modified (CRLF noise), leave it — do not stage it.
- Commit only `index.html` unless a task says otherwise.

---

## File Structure

```
index.html    MODIFIED (the only file this plan touches)
  <style> block   — new .bdpg-* rules appended near the existing .bdpg-box rule (~line 528)
                    and a mirrored #bdpg-usa-svg path rule set near the #usa-svg rules (~line 595)
  window.BDPG     — rewritten: regionMapSvg (deleted), step1Html, step2Html,
                    supportingDetailsHtml, generateButtonHtml, resultsHtml, exportPdfHtml
                    added: renderMap, drawCharts, waterfallChart, amenityProfileChart,
                    onBaselineCardClick, onMapStateClick, onRatingSlider, onAmenityCycle
                    untouched: engine calls, admin panels, CSV handlers, profiles, summaryText
```

---

## Task 1: CSS foundation + wizard shell

**Files:** Modify `index.html` (style block + `BDPG.render`)

**Interfaces:**
- Produces: `.bdpg-step`, `.bdpg-step.done`, `.bdpg-badge`, `.bdpg-grid-3`, `.bdpg-callout` CSS classes; `BDPG.stepCardOpen(n, title, isDone)` / `BDPG.stepCardClose()` HTML helpers used by every later task.

- [ ] **Step 1: Add the CSS block**

Append near the existing `.bdpg-box` rule (~line 528):

```css
/* ── Bus Dev Potential Gallons — wizard shell ── */
.bdpg-step{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:14px;position:relative;}
.bdpg-step.done{border-left:3px solid var(--green);}
.bdpg-step-hd{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.bdpg-badge{width:28px;height:28px;flex:0 0 auto;border-radius:50%;background:var(--surface2);border:1px solid var(--border2);color:var(--muted);display:flex;align-items:center;justify-content:center;font-family:var(--ff);font-weight:800;font-size:1em;}
.bdpg-step.done .bdpg-badge{background:rgba(0,214,143,.15);border-color:var(--green);color:var(--green);}
.bdpg-step-title{font-family:var(--ff);font-size:1.15em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text);}
.bdpg-check{color:var(--green);font-size:.9em;font-weight:700;margin-left:auto;}
.bdpg-grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;}
.bdpg-callout{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-top:12px;}
.bdpg-lbl{font-size:.7em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
```

- [ ] **Step 2: Add the step-card helpers**

Add to the `BDPG` object (anywhere among the other `BDPG.xxx = function` assignments):

```js
// Step cards are built by every step-rendering function; keeping the chrome in
// one helper is what stops the three cards from drifting apart visually.
BDPG.stepCardOpen = function (num, title, isDone) {
  var glyph = ['①', '②', '③'][num - 1] || String(num);
  return '<div class="bdpg-step' + (isDone ? ' done' : '') + '">' +
    '<div class="bdpg-step-hd">' +
      '<div class="bdpg-badge">' + glyph + '</div>' +
      '<div class="bdpg-step-title">' + BDPG.escHtml(title) + '</div>' +
      (isDone ? '<div class="bdpg-check">✓</div>' : '') +
    '</div>';
};
BDPG.stepCardClose = function () { return '</div>'; };

// Step completion: Step 1 done when profile+roadway resolve to a real baseline
// row; Step 2 done when the typed/clicked state resolves to a known region.
BDPG.step1Done = function () {
  var s = BDPG.state;
  return !!(s.profile && s.roadway && BusDevGallonsCalc.getBaselineRow(s.profile, s.roadway));
};
BDPG.step2Done = function () {
  return !!(BDPG.state.state && BusDevGallonsCalc.resolveRegion(BDPG.state.state));
};
```

- [ ] **Step 3: Wrap the three existing sections in step cards**

In `BDPG.render()`, wrap the existing calls so the shell is visible immediately (content rewrites come in later tasks):

```js
el.innerHTML =
  BDPG.stepCardOpen(1, 'Step 1 — Select Location Profile', BDPG.step1Done()) + BDPG.step1Html() + BDPG.stepCardClose() +
  BDPG.stepCardOpen(2, 'Step 2 — Adjustments', BDPG.step2Done()) + BDPG.step2Html() + BDPG.stepCardClose() +
  BDPG.stepCardOpen(3, 'Step 3 — Supporting Details', false) + BDPG.supportingDetailsHtml() + BDPG.stepCardClose() +
  BDPG.adminPanelHtml() + BDPG.networkContextGeneratorHtml() + BDPG.generateButtonHtml() +
  /* ...the rest of the existing concatenation, unchanged... */;
```

Note: `step1Html`/`step2Html`/`supportingDetailsHtml` currently emit their own `.bdpg-box` wrapper and their own heading. Remove **only** those outer wrappers and headings (the step card now provides both); leave their inner content alone for now.

- [ ] **Step 4: Verify**

Serve locally (`python -m http.server 8791`), open Tools ▸ Business Dev ▸ Bus Dev Potential Gallons. Confirm: three numbered step cards render; picking a profile+roadway turns Step 1's badge green with a ✓; typing a valid state does the same for Step 2; no console errors; everything still functions as before.

Run `node --test busDevGallonsCalculator.test.js` (42/42) and `git diff --stat` (only `index.html`).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): wizard shell — step cards, numbered badges, completion state"
```

---

## Task 2: Step 1 visual baseline selector grid

**Files:** Modify `index.html` (CSS + `BDPG.step1Html`, `BDPG.onBaselineCardClick`)

**Interfaces:**
- Consumes: `BDPG_CONFIG.BASELINE_TABLE`, `BDPG.stepCardOpen` (Task 1).
- Produces: `BDPG.onBaselineCardClick(profile, roadway)` — sets both state fields atomically and re-renders.

- [ ] **Step 1: Add CSS**

```css
.bdpg-bcard{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:12px;cursor:pointer;transition:all .15s;text-align:left;}
.bdpg-bcard:hover{border-color:var(--border2);transform:translateY(-1px);}
.bdpg-bcard.dim{opacity:.45;}
.bdpg-bcard.on{border-color:var(--accent);background:rgba(0,200,255,.08);box-shadow:0 0 14px rgba(0,200,255,.25);}
.bdpg-bcard-ico{font-size:1.3em;line-height:1;margin-bottom:6px;}
.bdpg-bcard-name{font-family:var(--ff);font-size:1em;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text);}
.bdpg-bcard-sub{font-size:.72em;color:var(--muted);margin-top:2px;}
.bdpg-bcard-gal{font-family:var(--ff);font-size:1.35em;font-weight:800;color:var(--muted);margin-top:8px;}
.bdpg-bcard.on .bdpg-bcard-gal{color:var(--accent);}
.bdpg-rangebar{position:relative;height:8px;background:var(--surface);border:1px solid var(--border);border-radius:5px;margin-top:8px;}
.bdpg-rangebar-tick{position:absolute;top:-4px;width:3px;height:14px;background:var(--accent);border-radius:2px;}
.bdpg-rangebar-ends{display:flex;justify-content:space-between;font-size:.66em;color:var(--muted);margin-top:4px;}
```

- [ ] **Step 2: Rewrite `BDPG.step1Html`**

Replace its entire body. It no longer emits a wrapper/heading (the step card supplies those) and no longer emits the cascading selects:

```js
BDPG.step1Html = function () {
  var s = BDPG.state;
  var ICONS = { 'Fuel stop': '⛽', 'Small truck stop': '🚏',
                'Medium truck stop': '🚛', 'Large truck stop': '🏙' };
  // Cards are generated from BASELINE_TABLE itself -- never a hand-copied
  // duplicate of it, so the grid can't drift from the config.
  var cards = BDPG_CONFIG.BASELINE_TABLE.map(function (r) {
    var on = (r.profile === s.profile && r.roadway === s.roadway);
    var dim = (s.profile && r.profile !== s.profile && !on);
    return '<div class="bdpg-bcard' + (on ? ' on' : '') + (dim ? ' dim' : '') + '" ' +
      'onclick="BDPG.onBaselineCardClick(' + JSON.stringify(r.profile).replace(/"/g, '&quot;') +
      ',' + JSON.stringify(r.roadway).replace(/"/g, '&quot;') + ')">' +
      '<div class="bdpg-bcard-ico">' + (ICONS[r.profile] || '📍') + '</div>' +
      '<div class="bdpg-bcard-name">' + BDPG.escHtml(r.profile) + '</div>' +
      '<div class="bdpg-bcard-sub">' + BDPG.escHtml(r.roadway) + ' · ' + BDPG.escHtml(r.lanes) + ' lanes</div>' +
      '<div class="bdpg-bcard-gal">' + BDPG.fmtGal(r.baseline) + '</div>' +
      '<div class="bdpg-bcard-sub">avg gal/mo</div>' +
    '</div>';
  }).join('');

  var row = (s.profile && s.roadway) ? BusDevGallonsCalc.getBaselineRow(s.profile, s.roadway) : null;
  var callout = '';
  if (row) {
    var pos = Math.max(0, Math.min(100, ((row.baseline - 2500) / 12500) * 100));
    callout = '<div class="bdpg-callout">' +
      '<div class="bdpg-lbl">Selected Baseline</div>' +
      '<div style="font-family:var(--ff);font-size:2em;font-weight:800;color:var(--accent);line-height:1">' +
        BDPG.fmtGal(row.baseline) + '<span style="font-size:.45em;color:var(--muted);margin-left:8px">avg gal/mo baseline</span></div>' +
      '<div class="bdpg-rangebar"><div class="bdpg-rangebar-tick" style="left:' + pos.toFixed(1) + '%"></div></div>' +
      '<div class="bdpg-rangebar-ends"><span>2,500</span><span>15,000</span></div>' +
    '</div>';
  } else {
    callout = '<div class="bdpg-callout" style="color:var(--muted);font-size:.85em">Pick a location profile above to set the baseline.</div>';
  }

  return '<div class="bdpg-grid-3">' + cards + '</div>' + callout;
};

BDPG.onBaselineCardClick = function (profile, roadway) {
  // Sets the same two fields the old cascading selects set -- one click instead
  // of two, same resulting state.
  BDPG.state.profile = profile;
  BDPG.state.roadway = roadway;
  BDPG.render();
};
```

- [ ] **Step 3: Verify**

In the browser: all 8 cards render with icons, names, roadway+lanes, and gallons. Clicking "Medium truck stop / Interstate" highlights it cyan, shows "12,500 avg gal/mo baseline" in the callout with the tick at 80% ((12500−2500)/12500), dims the non-Medium cards (still clickable — click a Large card and confirm it switches), and turns Step 1's badge green.

Run the test suite (42/42) and `git diff --stat` (only `index.html`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): Step 1 visual baseline selector grid with range callout"
```

---

## Task 3: Interactive US map + region chip strip

**Files:** Modify `index.html` (CSS + delete `BDPG.regionMapSvg`, add `BDPG.renderMap` and friends; `BDPG.step2Html` left-column)

**Interfaces:**
- Consumes: `loadUSTopojson()`, `STATE_PATHS`, `STATE_NAMES`, `hexToRgba()`, `getCentroid()` (all existing module globals in `index.html`); `BusDevGallonsCalc.resolveRegion`, `BDPG.effectiveRegionPct`, `BDPG.networkContext`.
- Produces: `BDPG.REGION_COLORS`, `BDPG.renderMap()`, `BDPG.onMapStateClick(abbr)`, `BDPG.mapTip(evt, abbr)`, `BDPG.mapTipHide()`, `BDPG.regionChipsHtml()`.

- [ ] **Step 1: Add CSS (mirroring the existing `#usa-svg` rules for the new id)**

```css
#bdpg-usa-svg{width:100%;height:auto;display:block;}
#bdpg-usa-svg path{cursor:pointer;stroke:#0A0E1A;stroke-width:.5;transition:all .15s;}
#bdpg-usa-svg path:hover{opacity:.85;stroke-width:1.5;stroke:#fff;filter:drop-shadow(0 0 4px rgba(255,255,255,.3));}
#bdpg-usa-svg path.sel{stroke:var(--accent);stroke-width:2.2;filter:drop-shadow(0 0 7px rgba(0,200,255,.7));}
#bdpg-usa-svg path.nomap{cursor:default;}
body.day-mode #bdpg-usa-svg path{stroke:#D8DCE3;}
.bdpg-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.bdpg-chip{display:flex;align-items:center;gap:7px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;font-size:.72em;}
.bdpg-chip.on{border-color:var(--accent);box-shadow:0 0 10px rgba(0,200,255,.3);}
.bdpg-chip-dot{width:10px;height:10px;border-radius:3px;flex:0 0 auto;}
.bdpg-chip-name{font-weight:700;color:var(--text);}
.bdpg-chip-meta{color:var(--muted);}
```

- [ ] **Step 2: Add the region colors + map renderer**

```js
// BDPG region fills. Cyan (--accent) is deliberately NOT here: it is reserved
// for the selected-state highlight, which must read against every region color.
BDPG.REGION_COLORS = {
  West: '#00D68F', Southwest: '#FF6B35', Midwest: '#FFD60A',
  Northeast: '#7C3AED', Southeast: '#FF4757'
};

BDPG.mapHtml = function () {
  return '<div style="position:relative">' +
    '<svg id="bdpg-usa-svg" viewBox="0 0 900 550" xmlns="http://www.w3.org/2000/svg"><g id="bdpg-states-group"></g></svg>' +
    '<div class="map-tooltip" id="bdpg-map-tip"></div>' +
  '</div>';
};

// Third instance of the shared TopoJSON map (Territory and GS Metrics are the
// other two). loadUSTopojson() is memoized, so this costs no extra fetch.
BDPG.renderMap = function () {
  var sg = document.getElementById('bdpg-states-group');
  if (!sg) return;
  if (typeof usTopoLoaded === 'undefined' || !usTopoLoaded) {
    sg.innerHTML = '<text x="450" y="280" text-anchor="middle" fill="var(--muted)" font-size="14">Loading map…</text>';
    loadUSTopojson().then(function () { BDPG.renderMap(); });
    return;
  }
  var sel = BDPG.state.state;
  var activeRegion = sel ? BusDevGallonsCalc.resolveRegion(sel) : null;
  var html = '';
  Object.keys(STATE_PATHS).forEach(function (st) {
    var region = BusDevGallonsCalc.resolveRegion(st);
    var isSel = (st === sel);
    var fill, cls;
    if (!region) {
      fill = hexToRgba('#3A4A6B', 0.35); cls = 'nomap';
    } else {
      fill = hexToRgba(BDPG.REGION_COLORS[region], region === activeRegion ? 0.85 : 0.55);
      cls = isSel ? 'sel' : '';
    }
    html += '<path id="bdpg-st-' + st + '" d="' + STATE_PATHS[st] + '" fill="' + fill + '" class="' + cls + '"' +
      ' onmouseenter="BDPG.mapTip(event,\'' + st + '\')" onmouseleave="BDPG.mapTipHide()"' +
      (region ? ' onclick="BDPG.onMapStateClick(\'' + st + '\')"' : '') + '/>' +
      '<text x="' + getCentroid(STATE_PATHS[st], 'x') + '" y="' + getCentroid(STATE_PATHS[st], 'y') +
      '" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.9)" font-size="9" font-weight="600"' +
      ' font-family="var(--ff)" pointer-events="none" style="text-shadow:0 1px 2px rgba(0,0,0,.6)">' + st + '</text>';
  });
  sg.innerHTML = html;
};

BDPG.mapTip = function (e, st) {
  var tt = document.getElementById('bdpg-map-tip');
  if (!tt) return;
  var region = BusDevGallonsCalc.resolveRegion(st);
  var name = (typeof STATE_NAMES !== 'undefined' && STATE_NAMES[st]) ? STATE_NAMES[st] : st;
  var body;
  if (region) {
    var pct = BDPG.effectiveRegionPct(region) * 100;
    body = BDPG.escHtml(name) + ' — ' + BDPG.escHtml(region) + ' — ' +
           (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  } else {
    body = BDPG.escHtml(name) + ' — not in any network region';
  }
  tt.innerHTML = '<div class="map-tooltip-state">' + body + '</div>';
  tt.style.display = 'block';
  tt.style.left = (e.clientX + 12) + 'px';
  tt.style.top = (e.clientY - 10) + 'px';
};
BDPG.mapTipHide = function () {
  var tt = document.getElementById('bdpg-map-tip');
  if (tt) tt.style.display = 'none';
};

BDPG.onMapStateClick = function (st) {
  // Same field the typed input sets; a click is just a second path to it.
  BDPG.state.state = st;
  BDPG.render();
};

BDPG.regionChipsHtml = function () {
  var active = BDPG.state.state ? BusDevGallonsCalc.resolveRegion(BDPG.state.state) : null;
  var nc = BDPG.networkContext;
  return '<div class="bdpg-chips">' + Object.keys(BDPG.REGION_COLORS).map(function (r) {
    var pct = BDPG.effectiveRegionPct(r) * 100;
    var count = (nc && nc.byRegion && nc.byRegion[r]) ? nc.byRegion[r].total : null;
    return '<div class="bdpg-chip' + (r === active ? ' on' : '') + '">' +
      '<span class="bdpg-chip-dot" style="background:' + BDPG.REGION_COLORS[r] + '"></span>' +
      '<span class="bdpg-chip-name">' + BDPG.escHtml(r) + '</span>' +
      '<span class="bdpg-chip-meta">' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '% · ' +
        (count === null ? '—' : count + ' loc') + '</span>' +
    '</div>';
  }).join('') + '</div>';
};
```

- [ ] **Step 3: Delete `BDPG.regionMapSvg` and wire the map into `step2Html`'s left column**

Remove the whole `BDPG.regionMapSvg = function (activeRegion) {...}` block (the grey-rectangle placeholder) and its call site inside `step2Html`. In its place the left column emits:

```js
BDPG.mapHtml() +
'<div class="fg" style="margin-top:8px;max-width:180px"><label>Or type state code</label>' +
  '<input id="bdpg-state" maxlength="2" placeholder="e.g. ID" value="' + BDPG.escHtml(s.state) + '" ' +
  'oninput="BDPG.onStateInput(this.value)" style="text-transform:uppercase"></div>' +
BDPG.regionChipsHtml()
```

Keep the existing region chip/"not a recognized state code" note logic that follows.

- [ ] **Step 4: Call `renderMap()` after render**

At the end of `BDPG.render()`, immediately after the `innerHTML` assignment, add:

```js
BDPG.renderMap();
```

`BDPG.onStateInput`'s scoped `#bdpg-step2` `outerHTML` replacement also destroys the map, so add `BDPG.renderMap();` at the end of `onStateInput` too (after the existing focus restore and the Generate-button refresh). Keep its focus/cursor restore exactly as-is.

- [ ] **Step 5: Verify**

In the browser: the real US map renders with states colored by BDPG region (West green, Southwest orange, Midwest yellow, Northeast purple, Southeast red). Hovering Idaho shows "Idaho — West — +0.0%" (0.0% because `region_variance.json` ships zeros). Clicking Idaho sets the state, outlines it cyan, brightens the West region, turns Step 2's badge green, and lights the West chip. Typing "LA" in the fallback input selects Louisiana and keeps keyboard focus through both keystrokes. Chips show location counts from `network-context.json` (West 78, Southeast 123, etc.). Alaska/Hawaii render grey and are not clickable.

Test suite 42/42; `git diff --stat` shows only `index.html`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): real interactive US map (3rd TopoJSON instance) + region chip strip"
```

---

## Task 4: Step 2 right column — rating slider, pricing segments, amenity cards

**Files:** Modify `index.html` (CSS + `BDPG.step2Html` right column, `BDPG.onRatingSlider`, `BDPG.onAmenityCycle`)

**Interfaces:**
- Consumes: `BDPG_CONFIG.PRICING_LEVELS`, `PRICING_ADJUST`, `AMENITY_DETAIL_OPTIONS`, `AMENITY_LEVELS`; `BusDevGallonsCalc.reviewAdjustment`, `suggestAmenityLevel`.
- Produces: `BDPG.onRatingSlider(v)`, `BDPG.onRatingClear()`, `BDPG.onAmenityCycle(field)`, `BDPG.starsHtml(v)`, `BDPG.ratingBandHtml(v)`.

- [ ] **Step 1: Add CSS**

```css
.bdpg-2col{display:grid;grid-template-columns:1.15fr 1fr;gap:18px;}
@media(max-width:1000px){.bdpg-2col{grid-template-columns:1fr;}}
.bdpg-seg{display:flex;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
.bdpg-seg button{flex:1;background:var(--surface2);border:none;border-right:1px solid var(--border);color:var(--muted);padding:9px 4px;font-family:var(--fb);font-size:.68em;font-weight:700;cursor:pointer;transition:all .15s;line-height:1.3;}
.bdpg-seg button:last-child{border-right:none;}
.bdpg-seg button:hover{color:var(--text);}
.bdpg-seg button.on{color:#06101E;}
.bdpg-stars{font-size:1.15em;letter-spacing:2px;color:var(--yellow);}
.bdpg-acard{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:10px;cursor:pointer;text-align:center;transition:all .15s;}
.bdpg-acard:hover{border-color:var(--border2);}
.bdpg-acard.set{border-color:var(--accent);background:rgba(0,200,255,.07);}
.bdpg-acard-ico{font-size:1.4em;line-height:1;}
.bdpg-acard-f{font-size:.64em;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:5px;}
.bdpg-acard-v{font-size:.76em;font-weight:700;color:var(--text);margin-top:3px;min-height:1.1em;}
.bdpg-acard:not(.set) .bdpg-acard-v{color:var(--dim);}
```

- [ ] **Step 2: Add the rating + amenity helpers**

```js
BDPG.starsHtml = function (v) {
  var n = Number(v) || 0, out = '';
  for (var i = 1; i <= 5; i++) out += (n >= i ? '★' : (n >= i - 0.5 ? '★' : '☆'));
  return '<span class="bdpg-stars">' + out + '</span>';
};
BDPG.ratingBandHtml = function (v) {
  var info = BusDevGallonsCalc.reviewAdjustment(v === '' ? null : Number(v));
  var txt, col;
  if (info.flagged) { txt = 'No rating found — 0%'; col = 'var(--muted)'; }
  else if (info.pct < 0) { txt = 'Below 3.0 — −5%'; col = 'var(--red)'; }
  else if (info.pct > 0) { txt = '3.6+ — +2%'; col = 'var(--green)'; }
  else { txt = '3.0–3.5 — 0%'; col = 'var(--muted)'; }
  return '<span style="color:' + col + ';font-weight:700">' + txt + '</span>';
};

// Targeted DOM update only -- a slider drag must never rebuild the panel.
BDPG.onRatingSlider = function (v) {
  BDPG.state.truckerPathRating = v;
  var num = document.getElementById('bdpg-tp-num');
  var st = document.getElementById('bdpg-tp-stars');
  var band = document.getElementById('bdpg-tp-band');
  if (num) num.textContent = v === '' ? '—' : Number(v).toFixed(1);
  if (st) st.innerHTML = BDPG.starsHtml(v);
  if (band) band.innerHTML = BDPG.ratingBandHtml(v);
};
BDPG.onRatingClear = function () {
  BDPG.state.truckerPathRating = '';
  BDPG.render();
};

// Each click advances to the next option for that field, wrapping. Writes the
// same amenityDetails values the old <select>s wrote.
BDPG.onAmenityCycle = function (field) {
  var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS[field] || [];
  if (!opts.length) return;
  var cur = BDPG.state.amenityDetails[field];
  var i = opts.indexOf(cur);
  BDPG.state.amenityDetails[field] = opts[(i + 1) % opts.length];
  BDPG.render();
};
```

- [ ] **Step 3: Rewrite the right column in `step2Html`**

The function now returns `'<div id="bdpg-step2" class="bdpg-2col">' + LEFT + RIGHT + '</div>'`, where LEFT is Task 3's map block. RIGHT is:

```js
var rv = s.truckerPathRating;
var AICONS = { showers:'🚿', food:'🍔', scale:'⚖️',
               parking:'🅿️', service:'🔧', defReefer:'❄️' };
var ALABELS = { showers:'Showers', food:'Food', scale:'Scale',
                parking:'Parking', service:'Service', defReefer:'DEF / Reefer' };

var ratingBlock =
  '<div class="bdpg-lbl">Trucker Path Rating</div>' +
  '<div style="display:flex;align-items:center;gap:12px">' +
    '<input type="range" min="1" max="5" step="0.1" style="flex:1" ' +
      'value="' + (rv === '' ? '3' : BDPG.escHtml(rv)) + '" oninput="BDPG.onRatingSlider(this.value)">' +
    '<span id="bdpg-tp-num" style="font-family:var(--ff);font-size:1.5em;font-weight:800;color:var(--text);min-width:2.2em;text-align:right">' +
      (rv === '' ? '—' : Number(rv).toFixed(1)) + '</span>' +
  '</div>' +
  '<div style="display:flex;align-items:center;gap:10px;margin-top:4px">' +
    '<span id="bdpg-tp-stars">' + BDPG.starsHtml(rv) + '</span>' +
    '<span id="bdpg-tp-band" style="font-size:.76em">' + BDPG.ratingBandHtml(rv) + '</span>' +
    '<button class="btn" style="margin-left:auto;font-size:.66em" onclick="BDPG.onRatingClear()">No rating found</button>' +
  '</div>';

var segs = BDPG_CONFIG.PRICING_LEVELS.map(function (lvl, i) {
  var pct = BDPG_CONFIG.PRICING_ADJUST[lvl];
  var on = (s.pricingLevel === lvl);
  // green -> yellow -> red across the row, matching the waterfall's
  // positive-adjustment-is-green convention.
  var col = ['var(--green)','#7FD98C','var(--yellow)','var(--orange)','var(--red)'][i];
  return '<button class="' + (on ? 'on' : '') + '"' +
    (on ? ' style="background:' + col + '"' : '') +
    ' onclick="BDPG.onPricingChange(' + JSON.stringify(lvl).replace(/"/g,'&quot;') + ')">' +
    BDPG.escHtml(lvl.replace(' (deepest discounts)','')) + '<br>' +
    '<span style="opacity:.85">' + (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%</span></button>';
}).join('');

var acards = Object.keys(AICONS).map(function (f) {
  var v = s.amenityDetails[f];
  return '<div class="bdpg-acard' + (v ? ' set' : '') + '" onclick="BDPG.onAmenityCycle(\'' + f + '\')">' +
    '<div class="bdpg-acard-ico">' + AICONS[f] + '</div>' +
    '<div class="bdpg-acard-f">' + ALABELS[f] + '</div>' +
    '<div class="bdpg-acard-v">' + BDPG.escHtml(v || 'tap to set') + '</div>' +
  '</div>';
}).join('');
```

Keep the existing suggestion line and the Confirmed Amenity Level `<select>` (with its `amenityOverridden` semantics) exactly as they are, rendered below the amenity cards.

- [ ] **Step 4: Verify**

Dragging the slider updates the number, stars, and band chip live with no focus loss and no panel rebuild; 3.5 shows "3.0–3.5 — 0%" and 3.6 shows "3.6+ — +2%". "No rating found" clears it to the flagged state. The pricing segmented control shows 5 buttons green→red with percentages; clicking sets the level and the active button fills with its color. Clicking an amenity card cycles its value and updates the suggested level live; a manually-confirmed amenity level still survives a card click.

Test suite 42/42; `git diff --stat` only `index.html`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): Step 2 right column — rating slider, pricing segments, amenity toggle cards"
```

---

## Task 5: Step 3 Supporting Details grid

**Files:** Modify `index.html` (`BDPG.supportingDetailsHtml`; remove `BDPG.toggleSupporting` usage)

- [ ] **Step 1: Rewrite `supportingDetailsHtml`**

Drop the collapsible wrapper and the `▸ Supporting Details` toggle line entirely (the Step 3 card header replaces them). Return just the fields, in `<div class="bdpg-grid-3">`: the five Network-Fit selects (condition, hours, distance, corridor, competition) via the existing `BDPG.onSupportingSelect`, the lane-count number input with its existing out-of-range warning logic intact, and the three prospect text inputs with their existing no-re-render `oninput` handlers intact. Leave `BDPG.toggleSupporting` defined but unreferenced (harmless), or delete it if nothing else calls it.

- [ ] **Step 2: Verify**

All nine fields visible without clicking anything, laid out in a responsive 3-column grid. The lane warning still appears for Medium/Interstate + 4 lanes on blur. Typing in Prospect Name keeps focus.

Test suite 42/42.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): Step 3 Supporting Details always-visible 3-column grid"
```

---

## Task 6: Generate button + results hero + slide-in

**Files:** Modify `index.html` (CSS + `BDPG.generateButtonHtml`, results hero portion of `BDPG.resultsHtml`)

- [ ] **Step 1: Add CSS**

```css
.bdpg-go{width:100%;padding:15px;margin:16px 0;background:var(--accent);color:#000;border:none;border-radius:10px;font-family:var(--ff);font-size:1.3em;font-weight:800;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .15s;}
.bdpg-go:hover:not(:disabled){filter:brightness(1.1);box-shadow:0 0 22px rgba(0,200,255,.45);}
.bdpg-go:disabled{opacity:.45;cursor:not-allowed;background:var(--surface2);color:var(--muted);}
.bdpg-results{animation:bdpgIn .22s ease-out;}
@keyframes bdpgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bdpg-hero{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;}
@media(max-width:820px){.bdpg-hero{grid-template-columns:1fr;}}
.bdpg-hero-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;position:relative;overflow:hidden;}
.bdpg-hero-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
.bdpg-hero-card.final::before{background:var(--accent);}
.bdpg-hero-card.official::before{background:var(--muted);}
.bdpg-hero-num{font-family:var(--ff);font-weight:800;line-height:1;}
.bdpg-hero-card.final .bdpg-hero-num{font-size:3.2em;color:var(--accent);}
.bdpg-hero-card.official .bdpg-hero-num{font-size:2.2em;color:var(--text);}
.bdpg-hero-math{font-family:monospace;font-size:.68em;color:var(--muted);margin-top:8px;word-break:break-word;}
```

- [ ] **Step 2: Rewrite `generateButtonHtml`**

```js
BDPG.generateButtonHtml = function () {
  var s = BDPG.state;
  var can = !!(s.profile && s.roadway && s.state);   // unchanged condition
  return '<button id="bdpg-generate-btn" class="bdpg-go"' + (can ? '' : ' disabled title="Complete Steps 1 and 2 to generate."') +
    ' onclick="BDPG.onGenerate()">🚛 Generate Value Profile</button>';
};
```

- [ ] **Step 3: Replace the hero portion of `resultsHtml`**

Wrap the whole results return in `'<div class="bdpg-results">' + ... + '</div>'`, and replace the current hero block with:

```js
var hero = '<div class="bdpg-hero">' +
  '<div class="bdpg-hero-card final">' +
    '<div class="bdpg-lbl">Final Potential Gallons</div>' +
    '<div class="bdpg-hero-num">' + BDPG.fmtGal(e.finalGallons) + '</div>' +
    '<div style="font-size:.8em;color:var(--muted);margin-top:4px">gal/mo · ≈ ' + BDPG.fmtGal(e.finalGallons * 12) + ' gal/yr</div>' +
    '<div class="bdpg-hero-math">' + BDPG.escHtml(e.finalMathLine) + '</div>' +
  '</div>' +
  '<div class="bdpg-hero-card official">' +
    '<div class="bdpg-lbl">Official Calculator Subtotal</div>' +
    '<div class="bdpg-hero-num">' + BDPG.fmtGal(e.officialSubtotal) + '</div>' +
    '<div style="font-size:.8em;color:var(--muted);margin-top:4px">gal/mo · traces to the printed calculator</div>' +
    '<div class="bdpg-hero-math">' + BDPG.escHtml(e.officialMathLine) + '</div>' +
  '</div>' +
'</div>';
```

Keep the existing `reviewFlagged` note and the region-variance as-of line beneath the hero, unchanged in content.

- [ ] **Step 4: Verify**

Button is dim + tooltipped until profile, roadway, and state are all set, then goes full cyan. Generating shows both numbers large and labeled, with their math lines; results fade/slide in. At Aggressive pricing the two numbers differ; at Standard they match.

Test suite 42/42.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): cyan Generate button + dual-number results hero with slide-in"
```

---

## Task 7: Results charts — waterfall, range bar, grade badge, amenity profile

**Files:** Modify `index.html` (CSS + `BDPG.drawCharts`, `BDPG.waterfallData`, `BDPG.amenityProfileData`, `BDPG.gradeBadgeHtml`, `BDPG.rangeBarHtml`; `resultsHtml` additions; `BDPG.render` post-pass)

**Interfaces:**
- Consumes: `mkchart`, `CDO` (existing globals); `BDPG.state.result.estimate` / `.grade`.
- Produces: `BDPG.drawCharts()` called after every `render()`; canvases `bdpg-waterfall`, `bdpg-amenity`.

- [ ] **Step 1: Add CSS**

```css
.bdpg-grade{text-align:center;padding:16px;border-radius:10px;border:1px solid var(--border);}
.bdpg-grade-l{font-family:var(--ff);font-size:3.4em;font-weight:800;line-height:1;}
.bdpg-grade-lbl{font-family:var(--ff);font-size:1em;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-top:4px;}
.bdpg-nrange{position:relative;height:30px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin:10px 0 4px;}
.bdpg-nrange-m{position:absolute;top:-5px;height:40px;width:3px;border-radius:2px;}
.bdpg-nrange-m.final{background:var(--accent);box-shadow:0 0 8px rgba(0,200,255,.7);}
.bdpg-nrange-m.official{background:var(--text);opacity:.85;}
.bdpg-nrange-key{display:flex;gap:16px;font-size:.7em;color:var(--muted);margin-top:8px;}
```

- [ ] **Step 2: Add the chart builders**

```js
// Mirrors the five rows of the on-screen waterfall table exactly, so the chart
// and the table can never disagree. Presentation arithmetic only -- every
// number comes from the engine's estimate object.
BDPG.waterfallData = function (e) {
  var regionAdj = Math.round(e.baseline * (1 + e.regionPct));
  var steps = [
    { label: 'Baseline',    from: 0,                   to: e.baseline,          neutral: true },
    { label: 'Region',      from: e.baseline,          to: regionAdj },
    { label: 'Amen+Review', from: regionAdj,           to: e.officialSubtotal },
    { label: 'Pricing',     from: e.officialSubtotal,  to: e.finalGallons },
    { label: 'Final',       from: 0,                   to: e.finalGallons,      neutral: true, accent: true }
  ];
  return {
    labels: steps.map(function (s) { return s.label; }),
    data: steps.map(function (s) { return [s.from, s.to]; }),
    colors: steps.map(function (s) {
      if (s.accent) return 'rgba(0,200,255,.75)';
      if (s.neutral) return 'rgba(58,74,107,.85)';
      return s.to >= s.from ? 'rgba(0,214,143,.7)' : 'rgba(255,71,87,.7)';
    })
  };
};

// Ordinal position of each selected option within its own config array, 0-100.
// Presentation-only: this scale is not an engine concept and feeds no formula.
// `compare` is the clean hook for a future per-region average dataset.
BDPG.amenityProfileData = function (details, compare) {
  var fields = ['showers','food','scale','parking','service','defReefer'];
  var labels = { showers:'Showers', food:'Food', scale:'Scale', parking:'Parking', service:'Service', defReefer:'DEF/Reefer' };
  return {
    labels: fields.map(function (f) { return labels[f]; }),
    data: fields.map(function (f) {
      var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS[f] || [];
      var i = opts.indexOf(details[f]);
      return (i < 0 || opts.length < 2) ? 0 : Math.round((i / (opts.length - 1)) * 100);
    }),
    compare: compare || null
  };
};

BDPG.drawCharts = function () {
  var r = BDPG.state.result;
  if (!r) return;
  if (document.getElementById('bdpg-waterfall')) {
    var w = BDPG.waterfallData(r.estimate);
    mkchart('bdpg-waterfall', {
      type: 'bar',
      data: { labels: w.labels, datasets: [{ label: 'gal/mo', data: w.data, backgroundColor: w.colors, borderRadius: 3 }] },
      options: Object.assign({}, CDO, { plugins: { legend: { display: false } } })
    });
  }
  if (document.getElementById('bdpg-amenity')) {
    var a = BDPG.amenityProfileData(BDPG.state.amenityDetails);
    mkchart('bdpg-amenity', {
      type: 'bar',
      data: { labels: a.labels, datasets: [{ label: 'Score', data: a.data, backgroundColor: 'rgba(0,200,255,.6)', borderRadius: 3 }] },
      options: Object.assign({}, CDO, {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: Object.assign({}, CDO.scales.x, { max: 100 }), y: CDO.scales.y }
      })
    });
  }
};

BDPG.GRADE_COLORS = { A: 'var(--accent)', B: 'var(--green)', C: 'var(--yellow)', D: 'var(--orange)', E: 'var(--red)' };

BDPG.gradeBadgeHtml = function (g) {
  var col = BDPG.GRADE_COLORS[g.grade] || 'var(--muted)';
  return '<div class="bdpg-grade" style="border-color:' + col + '">' +
    '<div class="bdpg-grade-l" style="color:' + col + '">' + BDPG.escHtml(g.grade) + '</div>' +
    '<div class="bdpg-grade-lbl" style="color:' + col + '">' + BDPG.escHtml(g.gradeLabel) + '</div>' +
  '</div>';
};

BDPG.rangeBarHtml = function (e) {
  function pos(v) { return Math.max(0, Math.min(100, ((v - 2500) / 12500) * 100)); }
  return '<div class="bdpg-nrange">' +
      '<div class="bdpg-nrange-m official" style="left:' + pos(e.officialSubtotal).toFixed(1) + '%"></div>' +
      '<div class="bdpg-nrange-m final" style="left:' + pos(e.finalGallons).toFixed(1) + '%"></div>' +
    '</div>' +
    '<div class="bdpg-rangebar-ends"><span>2,500</span><span>15,000</span></div>' +
    '<div class="bdpg-nrange-key">' +
      '<span><span style="display:inline-block;width:10px;height:3px;background:var(--accent);vertical-align:middle"></span> Final ' + BDPG.fmtGal(e.finalGallons) + '</span>' +
      '<span><span style="display:inline-block;width:10px;height:3px;background:var(--text);vertical-align:middle"></span> Official ' + BDPG.fmtGal(e.officialSubtotal) + '</span>' +
    '</div>';
};
```

- [ ] **Step 3: Add the sections to `resultsHtml` and call `drawCharts`**

After the hero, insert (replacing the existing text-table waterfall's position — **keep the existing 5-row table** below the chart; chart and table together, they must agree):

```js
'<div class="cc" style="margin-top:14px"><div class="cc-lbl">Adjustment Waterfall</div>' +
  '<div class="cw" style="height:220px"><canvas id="bdpg-waterfall"></canvas></div></div>' +
'<div class="bdpg-hero" style="margin-top:14px">' +
  '<div class="cc"><div class="cc-lbl">Position in Network Range</div>' + BDPG.rangeBarHtml(e) +
    '<div style="font-size:.68em;color:var(--muted);margin-top:6px">Grade is scored from the official subtotal and is never affected by Pricing Strategy.</div></div>' +
  BDPG.gradeBadgeHtml(r.grade) +
'</div>' +
'<div class="cc" style="margin-top:14px"><div class="cc-lbl">Your Amenity Profile</div>' +
  '<div class="cw" style="height:180px"><canvas id="bdpg-amenity"></canvas></div>' +
  '<div style="font-size:.68em;color:var(--muted)">This prospect’s own amenity levels. No network average available yet.</div></div>'
```

In `BDPG.render()`, after `BDPG.renderMap();`, add `BDPG.drawCharts();`.

- [ ] **Step 4: Verify**

Generate with Medium/Interstate, ID, Good amenities, TP 3.8, Aggressive pricing. The waterfall shows 5 bars; the Final bar's top equals the hero's Final number and bar 3's top equals the Official subtotal; Pricing's bar is green (aggressive raises volume). Switch to No discounts — the Pricing bar turns red. The range bar shows two distinct markers. The grade badge shows its letter in the right color. "Your Amenity Profile" shows six horizontal bars. Re-generating repeatedly does not leak chart instances (no console warnings, charts redraw cleanly).

Test suite 42/42.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): results charts — waterfall, range bar, grade badge, amenity profile"
```

---

## Task 8: Print / Export PDF

**Files:** Modify `index.html` (print CSS + `BDPG.exportPdfHtml`, `BDPG.onExportPdf`)

- [ ] **Step 1: Capture the waterfall as a static image at export time**

A live `<canvas>` is unreliable across print pipelines; a data-URI `<img>` is not. In `BDPG.onExportPdf`, **before** setting the print-mode class and calling `window.print()`:

```js
BDPG.printChartImg = '';
try {
  if (typeof CHS !== 'undefined' && CHS['bdpg-waterfall']) {
    BDPG.printChartImg = CHS['bdpg-waterfall'].toBase64Image();
  }
} catch (err) { BDPG.printChartImg = ''; }   // packet still prints without it
```

Then re-render the print-only block (or rebuild `#bdpg-print-only`'s innerHTML from `BDPG.exportPdfHtml()`) so the image is present before printing.

- [ ] **Step 2: Extend `exportPdfHtml`**

Keep the existing structure (prospect header, Step 1 baseline, official math + subtotal, pricing + final math + final, membership only-if-configured, region-variance as-of line). Add, print-styled in black-on-white:

- the hero as two bordered blocks with both numbers large and labeled;
- `BDPG.printChartImg ? '<img src="' + BDPG.printChartImg + '" style="width:100%;max-width:560px;border:1px solid #999">' : ''`;
- the grade badge as a bordered box (no glow) and the range bar with solid borders instead of shadows.

- [ ] **Step 3: Keep the print gating exactly as-is**

Do not change the `body.bdpg-print-mode` gating or its `afterprint` cleanup — that ruling protects every other page's printing. Add any new print rules under the same `body.bdpg-print-mode` prefix.

- [ ] **Step 4: Verify**

Generate a profile, click Export PDF, inspect print preview (or `page.emulateMedia({media:'print'})`): only the leave-behind renders; both numbers appear large and labeled with their math lines; the waterfall appears as an image; the grade badge renders; Membership Fit is absent (all-zero config). Cancel; confirm the screen is unaffected and that printing a different page (e.g. Dashboard) is still normal.

Test suite 42/42.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bdpg-ui): print packet — hero, static waterfall image, grade badge"
```

---

## Task 9: Whole-branch polish pass

**Files:** Possibly `index.html`

- [ ] **Step 1: Run the invariant checklist from spec §5**

1. `node --test busDevGallonsCalculator.test.js` → 42/42.
2. `git diff --stat feat/bus-dev-potential-gallons..HEAD` → **only `index.html`**. If any engine file appears, stop and report.
3. Walk the UI end to end: cases A–D through the new controls still produce 13,750 / 2,250 / 14,550 / 3,240 at Standard pricing (Medium/Interstate + West state + Good + 3.8 → confirm against the hero).
4. Both numbers labeled distinctly on screen, in print, and in Copy Summary.
5. Continuous inputs (typed state, slider, prospect fields, lanes) never rebuild the panel on `input`.
6. `grep -n "new Chart(" index.html` → only inside `mkchart`.
7. No new loose globals: every new function is `BDPG.*`.
8. Other pages/tabs still render and print correctly.

- [ ] **Step 2: Fix anything the checklist surfaces**, then re-run it.

- [ ] **Step 3: Commit (only if Step 2 changed something)**

```bash
git add index.html
git commit -m "fix(bdpg-ui): polish pass — invariant checklist fixes"
```

---

## Self-Review Notes

- **Spec coverage:** map (T3), Step 1 grid (T2), Step 2 two-column + slider/segments/amenity cards (T3/T4), Supporting Details grid (T5), wizard shell + Generate (T1/T6), charts incl. waterfall/range/grade/amenity (T7), print (T8), invariants (T9). All spec §4 subsections have a task.
- **Waterfall is 5 bars, not 6** — deliberately mirroring the existing on-screen table so chart and table can never disagree (spec §4.6 item 2).
- **`BDPG.onStateInput` is touched by two tasks** (T3 adds a `renderMap()` call at its end). Its focus-restore and Generate-button refresh must survive both — T3's verify step covers it.
- **Interface order:** `stepCardOpen/step1Done/step2Done` (T1) → used by T2–T6; `mapHtml/renderMap` (T3) → used by T4's two-column layout; `drawCharts` (T7) → called from `render()` which T1 already restructured. No task references a function defined later.
