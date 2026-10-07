# Calculator UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Potential Gallons calculator's Step 2 adjustments into a numbered seven-row "Adjustment Steps" flow, each row carrying its own contribution percentage, without changing one number the engine produces.

**Architecture:** A new unit-tested module `bdpgSteps.js` owns every pure decision about what each step displays — order, numbering, titles, value formatting. `bus-dev-potential-gallons/index.html` renders seven rows through one shared row primitive that reads from it. The engine files are not touched at all; the step values come from live state via helpers that already exist, because `BDPG.state.result` does not exist while a rep is still typing.

**Tech Stack:** Vanilla ES5-style browser JS, no build step; UMD modules loaded by plain `<script>` tags; `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-06-calculator-ui-redesign-design.md`

## Global Constraints

- **No formula change.** `busDevGallonsCalculator.js` and `busDevGallonsConfig.js` are **untouched**. Any diff to either file is a defect, not a judgement call.
- `node --test *.test.js` starts at **297 passing** and must never go down. No existing test may be edited or weakened.
- **ES5 in `bdpgSteps.js`** — `var`/`function`, no `let`/`const`/arrow functions/`async`/template literals. Test files may use modern syntax. `bus-dev-potential-gallons/index.html`'s inline script is ES5-style too: follow the surrounding code.
- **`suggestAmenityLevel` and `AMENITY_ADJUST` logic do not change.** Only the input widget changes.
- **State shape does not change:** `s.amenityDetails`, `s.amenityLevel`, `s.restroomLevel`, `s.state`, `s.truckerPathRating`, `s.rewardsLevel`. Saved prospect records, the draft autosave and the prospects table must keep working untouched.
- **The results panel does not change** — official subtotal, adjustments, total projected gallons, and its single combined Amenities row all stay exactly as they are.
- **JS identifiers keep their names.** `pricingPct`, `pricingTone`, `currentPricingPct`, `onPricingSlider` and friends are not renamed; only user-visible strings are.
- **The three-card wizard stays.** Step 1's selector, `step1Done()`/`step2Done()`, `updateStepCardBadge`, the tab navigation and the guide prose naming three steps are all out of scope.
- `amenityLevelPct` is the amenity **level's** term only. `amenityPct` is the formula's **combined** term (`amenityLevelPct + restroomPct`). Never use one name for the other.
- Branch off `main` before the first commit. The user runs `git push`; this plan commits locally only.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `bdpgSteps.js` | The seven steps: order, numbering, titles, value formatting. Pure, no DOM. | Create |
| `bdpgSteps.test.js` | Unit tests for `BDPG_STEPS.rows()` | Create |
| `bus-dev-potential-gallons/index.html` | The step-row primitive, the seven-row layout, amenity dropdowns, renames, removals | Modify |

Five tasks. Task 1 is the tested foundation Tasks 3 and 4 render through. Task 2 is string-only and deliberately runs **before** the restructure, so Task 3 moves already-correct text instead of chasing renamed strings through moved code.

---

## Task 1: `bdpgSteps.js` — the tested step module

**Files:**
- Create: `bdpgSteps.js`
- Create: `bdpgSteps.test.js`
- Modify: `bus-dev-potential-gallons/index.html` (one `<script>` tag)

**Interfaces:**
- Consumes: nothing. This module is self-contained and has no dependencies.
- Produces: `BDPG_STEPS.rows(input)` → an array of **exactly seven** row objects, each `{ n, title, subtitle, value, valueText, valueKind }`. Tasks 3 and 4 render from it.

`input` is an object with these keys:

```
baseline        number|null   gal/mo; null when no profile is chosen
profile         string        e.g. 'Large truck stop'
roadway         string        e.g. 'Interstate'
regionPct       number|null   null when no state has been entered
reviewPct       number
amenityLevelPct number        the amenity LEVEL's term ONLY, never the combined amenityPct
restroomPct     number
rewardsPct      number
pricingPct      number
```

Output fields: `n` is 1-7; `title` is the step heading; `subtitle` is extra text under the title (only step 1 uses it); `value` is the raw number (or `null`); `valueText` is the formatted string for the right-hand slot; `valueKind` is `'gallons'`, `'pct'` or `'none'`.

- [ ] **Step 1: Write the failing tests**

Create `bdpgSteps.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BDPG_STEPS } = require('./bdpgSteps.js');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');

// A fully-populated input, so each test can vary one field.
function input(over) {
  return Object.assign({
    baseline: 42000,
    profile: 'Large truck stop',
    roadway: 'Interstate',
    regionPct: -0.042,
    reviewPct: 0.02,
    amenityLevelPct: 0.02,
    restroomPct: 0.02,
    rewardsPct: 0.015,
    pricingPct: 0.06
  }, over || {});
}

function byN(rows, n) { return rows.filter(r => r.n === n)[0]; }

// ── shape ───────────────────────────────────────────────────────────────

test('returns exactly seven rows, numbered 1-7 in order', () => {
  const rows = BDPG_STEPS.rows(input());
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(r => r.n), [1, 2, 3, 4, 5, 6, 7]);
});

test('every row carries the full field set, never undefined', () => {
  // The HTML renders these straight into markup; an undefined would print
  // the literal string "undefined" into a customer-facing sheet.
  BDPG_STEPS.rows(input()).forEach(r => {
    assert.equal(typeof r.title, 'string');
    assert.equal(typeof r.subtitle, 'string');
    assert.equal(typeof r.valueText, 'string');
    assert.ok(['gallons', 'pct', 'none'].indexOf(r.valueKind) !== -1);
  });
});

test('titles are the seven agreed step names in the agreed order', () => {
  assert.deepEqual(BDPG_STEPS.rows(input()).map(r => r.title), [
    'Profile / Roadway / Lanes',
    'Region',
    'Trucker Path Rating',
    'Amenities',
    'Restroom / Shower Condition',
    "Roady's Rewards Participation",
    'Discount Pricing Strategy'
  ]);
});

// ── step 1: baseline gallons, not a percentage ──────────────────────────

test('step 1 shows baseline gallons with a thousands separator', () => {
  const r = byN(BDPG_STEPS.rows(input()), 1);
  assert.equal(r.value, 42000);
  assert.equal(r.valueText, '42,000 gal/mo');
  assert.equal(r.valueKind, 'gallons');
});

test('step 1 subtitle joins profile and roadway', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 1).subtitle,
    'Large truck stop · Interstate');
});

test('step 1 subtitle keeps whichever part exists', () => {
  // Joining only when BOTH exist drops a roadway that is genuinely there.
  assert.equal(byN(BDPG_STEPS.rows(input({ profile: '' })), 1).subtitle, 'Interstate');
  assert.equal(byN(BDPG_STEPS.rows(input({ roadway: '' })), 1).subtitle, 'Large truck stop');
  assert.equal(byN(BDPG_STEPS.rows(input({ profile: '', roadway: '' })), 1).subtitle, '');
});

test('no profile chosen shows a dash, never null or NaN', () => {
  const r = byN(BDPG_STEPS.rows(input({ baseline: null })), 1);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
  assert.equal(r.valueKind, 'none');
});

// ── steps 2-7: signed percentages ───────────────────────────────────────

test('each adjustment step reads its own input', () => {
  const rows = BDPG_STEPS.rows(input());
  assert.equal(byN(rows, 2).value, -0.042);
  assert.equal(byN(rows, 3).value, 0.02);
  assert.equal(byN(rows, 4).value, 0.02);
  assert.equal(byN(rows, 5).value, 0.02);
  assert.equal(byN(rows, 6).value, 0.015);
  assert.equal(byN(rows, 7).value, 0.06);
});

test('positive percentages carry a plus and one decimal', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 3).valueText, '+2.0%');
});

test('negative percentages carry a minus sign', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 2).valueText, '−4.2%');
});

test('zero renders as 0.0% with no sign', () => {
  // A "+" on zero asserts an increase that is not there, and zero is the
  // resting value of four of these six steps.
  const r = byN(BDPG_STEPS.rows(input({ rewardsPct: 0 })), 6);
  assert.equal(r.value, 0);
  assert.equal(r.valueText, '0.0%');
  assert.equal(r.valueKind, 'pct');
});

test('no state entered shows a dash rather than 0.0%', () => {
  // 0.0% would assert that the region was looked up and found neutral.
  const r = byN(BDPG_STEPS.rows(input({ regionPct: null })), 2);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
  assert.equal(r.valueKind, 'none');
});

test('a junk percentage degrades to a dash instead of printing NaN', () => {
  const r = byN(BDPG_STEPS.rows(input({ reviewPct: 'lots' })), 3);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
});

test('rows() survives being called with nothing at all', () => {
  const rows = BDPG_STEPS.rows();
  assert.equal(rows.length, 7);
  assert.equal(byN(rows, 1).valueText, '—');
});

// ── the invariant that ties steps 4 and 5 to the formula ────────────────

test('steps 4 and 5 sum to the formula\'s single combined amenity term', () => {
  // The formula has ONE amenity term; the step flow shows it as two rows
  // because they are two separate inputs. This pins the two surfaces to each
  // other rather than to a hand-computed constant: if either helper ever
  // changes, this fails rather than the UI quietly disagreeing with the math.
  const amenityLevel = 'Good / full service';
  const restroomLevel = 'Clean / updated';

  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop',
    roadway: 'Interstate',
    regionPct: 0,
    amenityLevel: amenityLevel,
    restroomLevel: restroomLevel,
    reviewRating: '',
    pricingLevel: 0,
    rewardsLevel: ''
  });
  assert.ok(e, 'expected a real estimate for this profile/roadway pair');

  const rows = BDPG_STEPS.rows(input({
    amenityLevelPct: BusDevGallonsCalc.amenityAdjustment(amenityLevel),
    restroomPct: BusDevGallonsCalc.restroomAdjustment(restroomLevel)
  }));

  const sum = byN(rows, 4).value + byN(rows, 5).value;
  assert.ok(Math.abs(sum - e.amenityPct) < 1e-9,
    'steps 4+5 (' + sum + ') must equal the formula amenityPct (' + e.amenityPct + ')');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bdpgSteps.test.js`
Expected: FAIL — `Cannot find module './bdpgSteps.js'`.

- [ ] **Step 3: Implement the module**

Create `bdpgSteps.js`, matching `bdpgStats.js`'s UMD wrapper exactly:

```js
(function (root) {
  'use strict';

  // The seven Adjustment Steps: their order, numbering, titles and the
  // formatting of the contribution each one shows.
  //
  // This lives outside index.html because it is a pure decision about what
  // the rep is told, and a pure decision belongs somewhere `node --test` can
  // reach it. The previous phase shipped two blocking defects that both lived
  // in untested rendering glue; this is the seam that stops that repeating.
  //
  // Deliberately NOT part of busDevGallonsCalculator.js: nothing here is on
  // the estimate path, and that file is contractually untouched by this work.
  // This module reads numbers the engine already produced and decides how to
  // say them. It never computes one.

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function str(v) {
    return typeof v === 'string' ? v : '';
  }

  // One decimal, signed, with the same U+2212 minus the rest of the page uses.
  //
  // Zero gets NO sign: "+0.0%" asserts an increase that is not there, and zero
  // is the resting value of four of these six adjustments.
  function fmtPct(n) {
    var p = n * 100;
    var sign = p > 0 ? '+' : (p < 0 ? '−' : '');
    return sign + Math.abs(p).toFixed(1) + '%';
  }

  function fmtGal(n) {
    return Math.round(n).toLocaleString('en-US') + ' gal/mo';
  }

  // Both parts when both exist, whichever one exists otherwise. Joining only
  // on "both present" would silently drop a roadway that is genuinely set.
  function joinDot(a, b) {
    var parts = [];
    if (a) parts.push(a);
    if (b) parts.push(b);
    return parts.join(' · ');
  }

  function pctRow(n, title, value) {
    var v = num(value);
    return {
      n: n,
      title: title,
      subtitle: '',
      value: v,
      valueText: v === null ? '—' : fmtPct(v),
      valueKind: v === null ? 'none' : 'pct'
    };
  }

  function rows(input) {
    var i = input || {};
    var baseline = num(i.baseline);

    return [
      {
        n: 1,
        title: 'Profile / Roadway / Lanes',
        subtitle: joinDot(str(i.profile), str(i.roadway)),
        value: baseline,
        valueText: baseline === null ? '—' : fmtGal(baseline),
        valueKind: baseline === null ? 'none' : 'gallons'
      },
      pctRow(2, 'Region', i.regionPct),
      pctRow(3, 'Trucker Path Rating', i.reviewPct),
      // amenityLevelPct, NOT the formula's combined amenityPct -- steps 4 and
      // 5 are the two halves of that one term. See the invariant test.
      pctRow(4, 'Amenities', i.amenityLevelPct),
      pctRow(5, 'Restroom / Shower Condition', i.restroomPct),
      pctRow(6, "Roady's Rewards Participation", i.rewardsPct),
      pctRow(7, 'Discount Pricing Strategy', i.pricingPct)
    ];
  }

  var BDPG_STEPS = {
    rows: rows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_STEPS: BDPG_STEPS };
  } else {
    root.BDPG_STEPS = BDPG_STEPS;
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bdpgSteps.test.js`
Expected: PASS, all 15.

- [ ] **Step 5: Load the module in the page**

In `bus-dev-potential-gallons/index.html`, add a script tag directly after the `bdpgStats.js` one (currently line 21), carrying the same version query string the sibling tags use:

```html
<script src="../bdpgSteps.js?v=2026-10-06"></script>
```

Confirm by reading the surrounding tags that the relative path (`../`) and the version string match their neighbours.

- [ ] **Step 6: Run the whole suite and report the real numbers**

Run: `node --test *.test.js`
Baseline is 297 and this task adds 15, so 312 is expected — but report what you actually see rather than matching a predicted figure.

- [ ] **Step 7: Commit**

```bash
git add bdpgSteps.js bdpgSteps.test.js bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): tested step module for the Adjustment Steps flow"
```

---

## Task 2: Renames and removals

String-only. No structure moves in this task, which is why it runs before the restructure: Task 3 then carries already-correct text instead of chasing renamed strings through relocated code.

**Files:**
- Modify: `bus-dev-potential-gallons/index.html`

**Interfaces:** none produced or consumed.

- [ ] **Step 1: Rename the eight user-visible strings**

"Discount / Aggregator Posture" becomes **"Discount Pricing Strategy"**. Locate each by its text, not by line number — the numbers below are advisory and will drift.

| Advisory line | Current text | Change to |
|---|---|---|
| `:4254` | `…Trucker Path review score, pricing posture and Rewards participation` | `…Trucker Path review score, discount pricing strategy and Rewards participation` |
| `:5697` | aria-label `Discount and aggregator posture. Centre is this profile's average; …` | `Discount pricing strategy. Centre is this profile's average; …` (keep the rest of the sentence and the HTML entity for the apostrophe exactly as-is) |
| `:5769` | section label `Discount / Aggregator Posture` | `Discount Pricing Strategy` |
| `:5997` | `At this posture, the baseline reads ` | `At this pricing strategy, the baseline reads ` |
| `:6512` | `Moving your discount posture from ` | `Moving your discount pricing strategy from ` |
| `:6747` | `Discount / aggregator posture: ` | `Discount pricing strategy: ` |
| `:6829` | `Your discount and aggregator posture is projected to add ` | `Your discount pricing strategy is projected to add ` |
| `:8167` | `<th>Pricing Posture</th>` | `<th>Pricing Strategy</th>` |

**Do not rename any JS identifier.** `pricingPct`, `pricingTone`, `currentPricingPct`, `onPricingSlider`, `pricingRange`, `PRICING_POSITIONS_PER_SIDE` and every other symbol keep their names. Only the quoted strings above change.

**Do not touch** `:1590`'s `Gallons definition: fleet/aggregator contributed gallons with a discount only…`. That defines what *gallons* mean, not the posture control; renaming it would misstate the gallons definition.

- [ ] **Step 2: Move the percentile detail into a tooltip**

`BDPG.pricingAnchorNoteHtml(pr)` currently renders a visible `<div>`. Its text becomes a `title` attribute on the three range labels instead.

Replace the function so it returns the tooltip **text** rather than markup, and rename it `BDPG.pricingAnchorTitle` to say what it now is:

```js
  // The provenance of the slider's two ends, as tooltip text rather than a
  // visible line. Without it the percentages look arbitrary; with it they are
  // attributable to named percentiles of a stated sample -- which a rep still
  // needs when somebody in a meeting asks where +150% came from.
  BDPG.pricingAnchorTitle = function (pr) {
    var r = pr || BDPG.pricingRange();
    if (r.source !== 'profile') {
      return 'Range is the default ' + BDPG.fmtSignedPct(r.min) + ' to ' + BDPG.fmtSignedPct(r.max) +
        ': this profile has ' + r.n + ' reporting location' + (r.n === 1 ? '' : 's') +
        ', short of the ' + BDPG_STATS.DYNAMIC_BASELINE_MIN_N +
        ' needed to measure its own spread.';
    }
    return 'Ends are this profile’s observed spread over ' + r.n + ' reporting locations: ' +
      'p10 ' + BDPG.fmtGal(r.low) + ' gal/mo (' + BDPG.fmtSignedPct(r.lowPct) + ') · ' +
      'average ' + BDPG.fmtGal(r.mid) + ' (0%) · ' +
      'p90 ' + BDPG.fmtGal(r.high) + ' gal/mo (' + BDPG.fmtSignedPct(r.highPct) + ')';
  };
```

Read the existing function body before writing this and carry over its exact
final lines — the snippet above reproduces the p90 clause from the visible
version, and it must match what the function actually renders today.

Then put the text on the three range labels. The labels currently sit in a
three-column grid; add `title` to the wrapper so one attribute covers all three:

```js
      '<div title="' + BDPG.escHtml(BDPG.pricingAnchorTitle(pr)) + '" ' +
          'style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:.72em;' +
          'color:var(--muted);margin-top:2px">' +
```

`escHtml` is required — the text contains `·` and `'` and goes into an
attribute.

- [ ] **Step 3: Delete the two visible lines**

In the pricing control's markup, delete the `#bdpg-pricing-desc` div entirely:

```js
      '<div id="bdpg-pricing-desc" style="font-size:.74em;color:var(--muted);margin-top:4px">' +
        BDPG.pricingDescription(pcur) + '</div>' +
```

and change the trailing `BDPG.pricingAnchorNoteHtml(pr);` call to end the
expression without it.

Then delete `BDPG.pricingDescription` itself — it becomes unreferenced.

**Grep for `pricingDescription`, `pricingAnchorNoteHtml` and `bdpg-pricing-desc`
and confirm zero remain.** There is a live-update path that patches
`#bdpg-pricing-desc` while the slider is dragged (near `BDPG.pricingGallonsLineHtml`
is re-applied at `:6043`); that patch must go too, or it will throw on a
missing element.

- [ ] **Step 4: Verify**

- Extract the inline `<script>` to a temp file and run `node --check` on it. State how you extracted it and what the command printed.
- Run `node --test *.test.js` — must be unchanged from Task 1's total.
- Grep for `posture` across the file and list every remaining hit, confirming each is either a JS identifier, a code comment, or the deliberately-kept gallons definition at `:1590`.

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Discount Pricing Strategy replaces aggregator-posture wording"
```

---

## Task 3: The seven-row Adjustment Steps layout

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `BDPG.step2Html` and the CSS block

**Interfaces:**
- Consumes: `BDPG_STEPS.rows(input)` from Task 1.
- Produces: `BDPG.stepRowHtml(row, bodyHtml)` — used by this task and read by Task 4.

- [ ] **Step 1: Add the step-row CSS**

Add beside the existing `.bdpg-acard` rules, matching the file's dark tokens:

```css
.bdpg-astep{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start;
  padding:14px 0;border-top:1px solid var(--border);}
.bdpg-astep:first-child{border-top:none;}
.bdpg-astep-n{display:inline-flex;align-items:center;justify-content:center;
  width:22px;height:22px;border-radius:50%;background:var(--surface);
  border:1px solid var(--border);color:var(--accent);font-family:var(--ff);
  font-size:.72em;font-weight:800;margin-right:8px;flex-shrink:0;}
.bdpg-astep-t{font-weight:800;font-size:.85em;letter-spacing:.04em;
  text-transform:uppercase;color:var(--text);display:flex;align-items:center;}
.bdpg-astep-sub{font-size:.76em;color:var(--muted);margin:2px 0 0 30px;}
.bdpg-astep-body{margin:10px 0 0 30px;}
.bdpg-astep-v{font-family:var(--ff);font-size:1.25em;font-weight:800;
  text-align:right;white-space:nowrap;min-width:5.5em;}
.bdpg-astep-v.none{color:var(--muted);}
.bdpg-astep-v.gallons{color:var(--text);}
```

Percentage tone is set inline per row in Step 2 below, not in CSS, because it
depends on the sign.

- [ ] **Step 2: Add the row primitive**

One function renders all seven rows. Seven hand-built rows drift apart — the
previous phase's whole-branch review found exactly that, one rule hand-copied
into three places that had to be collapsed before merge.

```js
  // One primitive for all seven Adjustment Steps. The number, title, subtitle
  // and right-hand value come from BDPG_STEPS.rows(); the body is whatever
  // control that step owns. Adding a step means adding it to bdpgSteps.js and
  // passing a body here -- never hand-building another row.
  BDPG.stepRowHtml = function (row, bodyHtml) {
    var tone = 'var(--muted)';
    if (row.valueKind === 'pct' && row.value !== null) {
      tone = row.value > 0 ? 'var(--green)' : (row.value < 0 ? 'var(--red)' : 'var(--muted)');
    } else if (row.valueKind === 'gallons') {
      tone = 'var(--accent)';
    }
    return '<div class="bdpg-astep">' +
      '<div>' +
        '<div class="bdpg-astep-t"><span class="bdpg-astep-n">' + row.n + '</span>' +
          BDPG.escHtml(row.title) + '</div>' +
        (row.subtitle ? '<div class="bdpg-astep-sub">' + BDPG.escHtml(row.subtitle) + '</div>' : '') +
        (bodyHtml ? '<div class="bdpg-astep-body">' + bodyHtml + '</div>' : '') +
      '</div>' +
      '<div class="bdpg-astep-v ' + row.valueKind + '" style="color:' + tone + '">' +
        BDPG.escHtml(row.valueText) + '</div>' +
    '</div>';
  };
```

- [ ] **Step 3: Build the row inputs from live state**

Inside `BDPG.step2Html`, after the existing `regionPct`, `levelPct` and `pcur`
are computed, assemble the module input. **Reuse those three — do not
recompute them.**

```js
    // Live from state, NOT from BDPG.state.result: invalidateResult() nulls
    // the result on every input change, so it does not exist while the rep is
    // still working -- which is exactly when these figures must be on screen.
    var baseRow = BDPG.currentBaseline();
    var stepRows = BDPG_STEPS.rows({
      baseline:        baseRow && isNum(baseRow.baseline) ? baseRow.baseline : null,
      profile:         s.profile || '',
      roadway:         s.roadway || '',
      regionPct:       region ? regionPct : null,
      reviewPct:       BusDevGallonsCalc.reviewAdjustment(s.truckerPathRating).pct,
      amenityLevelPct: levelPct,
      restroomPct:     BusDevGallonsCalc.restroomAdjustment(s.restroomLevel || BDPG_CONFIG.RESTROOM_DEFAULT),
      rewardsPct:      BusDevGallonsCalc.rewardsAdjustment(s.rewardsLevel),
      pricingPct:      pcur
    });
    function stepRow(n, body) { return BDPG.stepRowHtml(stepRows[n - 1], body); }
```

Before writing this, confirm against the file that `s.profile` and `s.roadway`
are the actual state keys Step 1 writes, and that `isNum` is in scope here. If
either differs, use what the file actually has and say so in your report.

- [ ] **Step 4: Replace the two-column layout with the seven rows**

`BDPG.step2Html` currently returns
`'<div id="bdpg-step2" class="bdpg-2col">' + left + right + '</div>'`.

Replace the `left` / `right` construction with the seven stacked rows. Every
control is **carried over unchanged** — only its container moves:

```js
    var body =
      stepRow(1, '') +
      stepRow(2,
        BDPG.mapHtml() +
        '<div class="fg" style="margin-top:8px;max-width:180px"><label>Or type state code</label>' +
          '<input id="bdpg-state" maxlength="2" placeholder="e.g. ID" value="' + BDPG.escHtml(s.state) + '" ' +
          'oninput="BDPG.onStateInput(this.value)" style="text-transform:uppercase"></div>' +
        BDPG.regionChipsHtml()) +
      stepRow(3, ratingBody) +
      stepRow(4, amenityBody) +
      stepRow(5, restroomBody) +
      stepRow(6, '<div class="bdpg-seg">' + rsegs + '</div>') +
      stepRow(7, segs);

    return '<div id="bdpg-step2">' + body + '</div>';
```

Four adjustments to the carried-over pieces:

1. `ratingBlock` currently opens with its own `<div class="bdpg-lbl">Trucker Path Rating</div>`. The row primitive supplies the title now, so **drop that one line** and call the remainder `ratingBody`. Everything else in it — the range input, the `#bdpg-tp-num` readout, `#bdpg-tp-stars`, `#bdpg-tp-band`, the "No rating found" button — is untouched.
2. `BDPG.restroomSelectHtml()` likewise opens with its own `bdpg-lbl` title. Drop that line from the function and let it return just the `<select>`; call the result `restroomBody`. Keep the per-option `(+2%)` text in the options exactly as it is.
3. The `Roady's Rewards Participation` and `Discount / Aggregator Posture` (now `Discount Pricing Strategy`) `bdpg-lbl` labels are likewise dropped — the row titles replace them.
4. The region's "Network Region: X (Y%)" chip and the "Not a recognized state code" warning currently sit above the map in `left`. Keep **both** inside step 2's body, in the same order relative to the map as today.

`amenityBody` is Task 4's; for this task pass the existing amenity markup
(`acards` + `amenityNotice` + `suggestLine`) unchanged so the layout can be
verified before the widget swap.

Keep the `id="bdpg-step2"` wrapper — `onStateInput` replaces it by `outerHTML`
and `renderMap()` rebuilds the map inside it.

**Preserve the side effect:** `step2Html` assigns `s.amenityLevel` from the
derived suggestion. That assignment must survive the restructure, or the level
goes stale. Do not "tidy" it away.

- [ ] **Step 5: Verify the layout in a browser**

The page sits behind a Supabase login gate and you have no credentials; do not
seek any. Serve the repo locally on a free port with a small static node
server, open the calculator, remove the gate overlay if one appears, and drive
the real page.

**Use the real code path for every fixture.** Do not hand-write state objects
into `BDPG.state` where a real control can set them: choose the profile through
Step 1's actual selector, type the state code into the real input, drag the
real sliders. A previous phase shipped dead code because its fixtures bypassed
the function that produces the state, and three reviews verified rendering
production could never reach.

Assert from the live DOM:
- exactly seven `.bdpg-astep` rows, numbered 1-7 in order
- step 1 shows the chosen profile and roadway and a `gal/mo` figure matching Step 1's own baseline display
- the map, the state input and the region chips are all inside step 2
- the star slider still moves and `#bdpg-tp-num` still updates
- the rewards buttons still select and the pricing slider still drags
- the results panel is unchanged — generate once and compare the three figures against a run from `main`

- [ ] **Step 6: Verify focus restoration — the critical regression check**

`onStateInput` replaces `#bdpg-step2` wholesale via `outerHTML` and then
restores focus and caret to `#bdpg-state`. The restructure moves that input
into a step body inside the same replaced subtree, so this is easy to break
silently.

With the page served and the calculator open:

1. Click into the "Or type state code" field.
2. Type `I`, then `D`, as two separate keystrokes.
3. After **each** keystroke assert from the live DOM:
   - `document.activeElement.id === 'bdpg-state'`
   - the field's value is `I` then `ID` (upper-cased)
   - `selectionStart === selectionEnd === value.length`
4. Confirm the map redrew for the resulting region rather than disappearing — `renderMap()` runs after the swap and the map now lives inside the replaced subtree.
5. Confirm the Generate button's disabled state updated.

Report each assertion's actual result. If focus is lost on the second
keystroke, that is this task's defect — fix it before committing.

- [ ] **Step 7: Run the suite and commit**

Run: `node --test *.test.js` — must be unchanged from Task 1's total. Confirm
the inline `<script>` parses via `node --check` on the extracted body.

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): numbered Adjustment Steps replace the two-column layout"
```

---

## Task 4: Amenity dropdowns

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — the amenity card markup and `BDPG.onAmenityCycle`

**Interfaces:**
- Consumes: `BDPG.stepRowHtml` from Task 3.
- Produces: `BDPG.onAmenitySelect(field, value)`, replacing `BDPG.onAmenityCycle(field)`.

- [ ] **Step 1: Build the dropdown rows**

Replace the `acards` construction. Options are **generated from
`BDPG_CONFIG.AMENITY_DETAIL_OPTIONS`** — never hand-written, because
`suggestAmenityLevel` matches exact strings (`d.scale === 'yes'`,
`opts.goodParking.indexOf(d.parking)`) and a hand-typed list could drift from
the rule that reads it.

```js
    // One row per amenity: icon + label on the left, its dropdown on the right.
    // Options come from AMENITY_DETAIL_OPTIONS so the widget cannot drift from
    // the rule that reads these exact strings.
    var arows = Object.keys(AICONS).map(function (f) {
      var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS[f] || [];
      var cur = s.amenityDetails[f];
      // "not assessed" is a real option, not a placeholder: it is the
      // difference between "we checked, there are none" and "nobody looked",
      // and amenityAnsweredCount() -- and the N-of-4 warning below -- depend
      // on that distinction staying expressible.
      var optHtml = '<option value=""' + (cur ? '' : ' selected') + '>— not assessed —</option>' +
        opts.map(function (o) {
          return '<option value="' + BDPG.escHtml(o) + '"' + (o === cur ? ' selected' : '') + '>' +
            BDPG.escHtml(o) + '</option>';
        }).join('');
      return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0">' +
          '<span style="width:1.4em;text-align:center">' + AICONS[f] + '</span>' +
          '<span style="font-size:.8em;color:var(--muted);flex:1">' + BDPG.escHtml(ALABELS[f]) + '</span>' +
          '<select style="max-width:190px" ' +
            'aria-label="' + BDPG.escHtml(ALABELS[f]) + '" ' +
            'onchange="BDPG.onAmenitySelect(' + JSON.stringify(f).replace(/"/g, '&quot;') + ',this.value)">' +
            optHtml +
          '</select>' +
        '</div>';
    }).join('');

    var amenityBody = arows + amenityNotice + suggestLine;
```

Pass `amenityBody` as step 4's body in place of the Task 3 placeholder.

- [ ] **Step 2: Replace the cycle handler**

```js
  // Replaces onAmenityCycle. Two differences from it, both deliberate:
  //
  // 1. Guarded on a real change. The cycle always advanced, so it could
  //    invalidate unconditionally; a dropdown re-selecting the same value is
  //    a no-op and must not strand a generated result.
  // 2. Validates the incoming value. A select posts whatever is in the DOM,
  //    so anything not in the option list -- including '' -- stores undefined
  //    (unset) rather than a value the rule would then try to match on.
  BDPG.onAmenitySelect = function (field, value) {
    var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS[field];
    if (!opts) return;
    var next = opts.indexOf(value) >= 0 ? value : undefined;
    if (BDPG.state.amenityDetails[field] === next) return;
    BDPG.invalidateResult();
    BDPG.state.amenityDetails[field] = next;
    BDPG.render();
  };
```

Delete `BDPG.onAmenityCycle`, then grep for `onAmenityCycle` and `bdpg-acard`
and confirm zero remain. Remove the now-unused `.bdpg-acard*` CSS rules.

- [ ] **Step 3: Verify in a browser**

Serve locally and drive the **real** controls — set every amenity through its
actual dropdown, never by assigning to `BDPG.state.amenityDetails`.

- all six dropdowns render, each opening on `— not assessed —` for a fresh prospect
- the options in each match `AMENITY_DETAIL_OPTIONS` exactly, in order
- selecting Showers `4-9`, Food `full restaurant`, Scale `yes`, Parking `100+` yields `Amenity level: Good / full service` and step 4's right-hand value changes to match
- answering only two of the four rule fields still shows the yellow `Based on 2 of 4 answers` warning
- setting every dropdown back to `— not assessed —` returns the line to `Amenity level: not assessed (+0.0%)` and step 4 to `0.0%`
- re-selecting a value that is already chosen does **not** clear a generated result: generate, re-pick the same option, and confirm the results panel is still showing
- picking a different value **does** clear it

- [ ] **Step 4: Re-run the focus check from Task 3 Step 6**

Six new focusable `<select>` elements now live inside the subtree
`onStateInput` replaces. Re-run that exact check — type `I` then `D` into the
state field and assert focus, value and caret after each keystroke. Report the
actual results; do not assume Task 3's pass still holds.

- [ ] **Step 5: Run the suite and commit**

Run: `node --test *.test.js` — unchanged from Task 1's total. Confirm the
inline `<script>` parses.

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): amenity dropdowns replace the tap-to-cycle tiles"
```

---

## Task 5: Whole-flow verification against an unchanged engine

The one task that proves the headline claim: the numbers did not move.

**Files:** none modified. This task produces evidence, and a fix only if it finds a discrepancy.

**Interfaces:** none.

- [ ] **Step 1: Confirm the engine files are untouched**

```bash
git diff --stat main -- busDevGallonsCalculator.js busDevGallonsConfig.js
```

Expected: **empty output**. Any diff here is a Global Constraint violation —
stop and report it rather than explaining it.

- [ ] **Step 2: Compare a full estimate against `main`**

Check out `main` into a temporary worktree so both versions can be driven side
by side:

```bash
git worktree add ../bdpg-main-ref main
```

Serve both. In each, build the **same** prospect through the real controls:
profile `Large truck stop`, roadway `Interstate`, state `ID`, Trucker Path
`4.2`, Showers `4-9`, Food `full restaurant`, Scale `yes`, Parking `100+`,
DEF `yes`, Laundry `no`, Restroom `Clean / updated`, Rewards `Participating`,
pricing slider left at centre (0%).

Generate on both and compare, figure by figure:
- the official subtotal
- every adjustment line
- the total projected gallons
- the three math lines

**Every figure must match exactly.** A difference is a defect in this phase,
not an acceptable rounding change.

Then remove the reference worktree:

```bash
git worktree remove ../bdpg-main-ref
```

- [ ] **Step 3: Confirm the step percentages agree with the results panel**

On the redesigned page, with the prospect above generated, assert:
- step 2's value equals the results panel's Region adjustment
- step 3's equals its Trucker Path adjustment
- **step 4 + step 5 equals the panel's single combined Amenities figure** — the §0.3 invariant, checked on the rendered page rather than only in the unit test
- step 6 equals its Rewards adjustment
- step 7 equals its pricing adjustment

- [ ] **Step 4: Confirm nothing downstream regressed**

- Save the prospect, reload, reopen it: every amenity dropdown, the restroom select, the rating and the pricing position all restore to what was saved
- The prospects table lists it, with the renamed `Pricing Strategy` column populated
- Export / pitch output carries the renamed strings and no remaining "posture" wording
- The draft autosave still fires — change one dropdown and confirm the draft indicator updates

- [ ] **Step 5: Report**

State each comparison and its actual result. If every figure matched, say so
plainly with the figures. If any did not, report the discrepancy rather than
adjusting anything to make it agree.

---

## Self-Review

**Spec coverage.** §0.1 no formula change → Global Constraints + Task 5 Step 1. §0.2 live state, not a generated estimate → Task 3 Step 3, with the reason in a comment. §0.3 steps 4+5 split one term → Task 1's invariant test and Task 5 Step 3. §0.4 wizard stays, #1 is a recap → Task 3 Step 4 (`stepRow(1, '')`, body empty, subtitle from profile/roadway). §0.5 "not assessed" survives → Task 4 Step 1 and its verification. §0.6 options generated → Task 4 Step 1. §1.1 row primitive → Task 3 Step 2. §1.2 `bdpgSteps.js` → Task 1. §2 layout → Task 3 Step 4. §3 amenities → Task 4. §4 removals + tooltip → Task 2 Steps 2-3. §5 renames → Task 2 Step 1. §7.1 focus → Task 3 Step 6 and Task 4 Step 4, twice because both tasks change that subtree. §7.2 real-path fixtures → stated in Task 3 Step 5 and Task 4 Step 3. §8 testing → Task 1.

**Placeholder scan.** No TBD/TODO. Every code step carries its code. Three steps ask the implementer to confirm a fact against the file before writing (Task 2 Step 2's carried-over final lines, Task 3 Step 3's state key names, Task 3 Step 4's chip ordering) — each is a stated verification with a report-back, not an unspecified edit.

**Type consistency.** `BDPG_STEPS.rows(input)` returns `{n, title, subtitle, value, valueText, valueKind}` in Task 1 and is consumed with exactly those fields by `BDPG.stepRowHtml` in Task 3. `amenityLevelPct` is used consistently and never confused with the formula's `amenityPct`. `BDPG.pricingAnchorTitle` is defined and used only in Task 2. `BDPG.onAmenitySelect(field, value)` is defined and used only in Task 4. `stepRow(n, body)` is a local helper defined and used only within `step2Html`.

**Known limits, stated rather than hidden.** `bus-dev-potential-gallons/index.html` has no automated coverage and this plan adds none to it — `bdpgSteps.js` is the response, moving every pure decision into a tested module. The browser checks in Tasks 3, 4 and 5 are the only verification the rendering itself gets. Step 7's percentage shows one decimal (`+98.0%`) while the pricing slider's own large readout shows whole numbers (`+98%`); this is a deliberate precision difference, not a disagreement, and should not be "fixed" into a special case inside a module whose whole point is uniform formatting.
