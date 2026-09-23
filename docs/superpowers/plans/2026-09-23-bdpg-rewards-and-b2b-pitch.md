# Rewards Participation + B2B Pitch Framing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Roady's Rewards Participation as a 5th adjustment term, and rewrite the results section as a prospect-facing B2B pitch with internal-only content separated out.

**Architecture:** The engine gains one additive term alongside the existing four, keeping `officialSubtotal` untouched as the PDF-matching figure. The results section splits into a prospect-facing half (hero, generated narrative, business case, network credibility) and an internal half below a divider (grade, condition-adjusted, analysis), with the export carrying only the former.

**Tech Stack:** Vanilla ES5-style JS in one standalone HTML file, UMD engine modules, Chart.js 4.4.0, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-23-bdpg-rewards-and-b2b-pitch-design.md`

## Global Constraints

- **`officialSubtotal` must always equal `Baseline × (1 + Region% + Amenities% + Review%)` and must never include Pricing or Rewards.** It is what matches Roady's published PDF calculator. The final review verifies this explicitly.
- The formula is **additive**, not multiplicative chaining: `finalGallons = Baseline × (1 + Region% + Amenities% + Review% + Pricing% + Rewards%)`.
- Rewards bands: Participating `+0.05` / Undecided `0.00` (default) / Not participating `-0.05`.
- **44 tests passing, 0 failing, at every commit** (42 existing + Cases E and F). Three existing `finalMathLine` snapshot assertions get updated expected strings — see Task 1.
- `profileAdjustmentBounds()` must NOT include rewards. `calculateNetworkFitGrade()` must stay unaffected by rewards.
- `rewardsLevel` is an engine input and **must** invalidate `state.result`.
- Old saved profiles default to Undecided / 0% and their numbers must not move.
- Never render `undefined` / `null` / `NaN` / `[object Object]`. Escape all free text.
- Continuous text inputs must not trigger a full `innerHTML` rebuild on `input` (focus/caret preservation).
- Do not touch the shared delegated sort handler. Do not modify the dashboard `index.html`.
- Never commit `location-list-2026-09-21.csv` or the calculator PDF (gitignored, public repo).

---

### Task 1: Engine — the rewards term

**Files:**
- Modify: `busDevGallonsConfig.js:57-58` (after `PRICING_DEFAULT`), `:118-133` (the `BDPG_CONFIG` object)
- Modify: `busDevGallonsCalculator.js:59-62` (after `pricingAdjustment`), `:102-136` (`calculateEstimate`), `:233-246` (the exports object)
- Test: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Produces: `BDPG_CONFIG.REWARDS_LEVELS` (array of 3 strings), `BDPG_CONFIG.REWARDS_ADJUST` (map), `BDPG_CONFIG.REWARDS_DEFAULT` (string); `BusDevGallonsCalc.rewardsAdjustment(level) → number`; `calculateEstimate(opts)` gains `opts.rewardsLevel` and returns three new keys: `rewardsPct`, `pricingAdjusted`, `pricingMathLine`.

- [ ] **Step 1: Write the failing tests**

Append to `busDevGallonsCalculator.test.js`:

```js
test('calculateEstimate — case E: case A + Most aggressive pricing + Rewards participating', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)',
    rewardsLevel: "Participating in Roady's Rewards"
  });
  // 12,500 × (1 + .06 + .02 + .02 + .05 + .05) = 12,500 × 1.20
  assert.equal(r.finalGallons, 15000);
  assert.equal(r.officialSubtotal, 13750, 'official must exclude pricing AND rewards');
  assert.equal(r.pricingAdjusted, 14375, 'pricing-adjusted excludes rewards only');
});

test('calculateEstimate — case F: case B + No discounts + Not participating', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Fuel stop', roadway: 'Any',
    regionPct: 0, amenityLevel: 'Very limited', reviewRating: 2.7,
    pricingLevel: 'No discounts', rewardsLevel: 'Not participating'
  });
  // 2,500 × (1 + 0 - .05 - .05 - .05 - .05) = 2,500 × 0.80
  assert.equal(r.finalGallons, 2000);
  assert.equal(r.officialSubtotal, 2250, 'official must exclude pricing AND rewards');
  assert.equal(r.pricingAdjusted, 2125);
});

test('calculateEstimate — officialSubtotal is invariant across every rewards band', () => {
  const subtotals = BDPG_CONFIG.REWARDS_LEVELS.map(level => BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5,
    pricingLevel: 'Aggressive', rewardsLevel: level
  }).officialSubtotal);
  assert.ok(subtotals.every(v => v === 14550), 'officialSubtotal must never change with rewards: ' + subtotals);
});

test('rewardsAdjustment returns 0 for an unknown or absent level', () => {
  assert.equal(BusDevGallonsCalc.rewardsAdjustment(undefined), 0);
  assert.equal(BusDevGallonsCalc.rewardsAdjustment(''), 0);
  assert.equal(BusDevGallonsCalc.rewardsAdjustment('constructor'), 0);
  assert.equal(BusDevGallonsCalc.rewardsAdjustment('Undecided / unknown'), 0);
});

test('an estimate with no rewardsLevel equals one at the default — old profiles do not move', () => {
  const base = {
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)'
  };
  const withoutRewards = BusDevGallonsCalc.calculateEstimate(base);
  const atDefault = BusDevGallonsCalc.calculateEstimate(
    Object.assign({}, base, { rewardsLevel: BDPG_CONFIG.REWARDS_DEFAULT }));
  assert.equal(withoutRewards.finalGallons, 14375, 'unchanged from the pre-rewards value');
  assert.equal(withoutRewards.finalGallons, atDefault.finalGallons);
  assert.equal(withoutRewards.finalMathLine, atDefault.finalMathLine);
});

test('rewards does not widen profileRange, so the Network Fit Grade is unaffected', () => {
  // profileAdjustmentBounds() sums ONLY amenity + review extremes: -0.05 + -0.05
  // and +0.02 + +0.02. Medium truck stop baselines are 7,500 and 12,500.
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Medium truck stop', officialSubtotal: 13750, supportingDetails: {}
  });
  assert.equal(r.rangeLo, 6750);
  assert.equal(r.rangeHi, 13000);
});
```

- [ ] **Step 2: Update the three finalMathLine snapshots**

`finalMathLine` now prints all five terms, so three existing assertions need their expected string updated. Change **only** these three strings — every other assertion in the file stays byte-identical, and `officialMathLine`'s assertion must NOT gain a term:

| test | old expected | new expected |
|---|---|---|
| "renders distinct official and final math lines" | `12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05) = 14,375` | `12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05 + 0.00) = 14,375` |
| "case C @ Aggressive finalMathLine…" | `15,000 × (1 - 0.03 + 0.00 + 0.00 + 0.025) = 14,925` | `15,000 × (1 - 0.03 + 0.00 + 0.00 + 0.025 + 0.00) = 14,925` |
| "case A @ No discounts finalMathLine…" | `12,500 × (1 + 0.06 + 0.02 + 0.02 - 0.05) = 13,125` | `12,500 × (1 + 0.06 + 0.02 + 0.02 - 0.05 + 0.00) = 13,125` |

The surrounding `assert.ok(...includes('0.025'))` / `includes('- 0.05')` / `!includes('+ -0.03')` assertions in those tests keep working unchanged — they guard sign form and precision, which is their real job.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: the new tests fail with `TypeError: BusDevGallonsCalc.rewardsAdjustment is not a function` and undefined `pricingAdjusted`; the three snapshot tests fail on the missing `+ 0.00`.

- [ ] **Step 4: Add the config constants**

In `busDevGallonsConfig.js`, immediately after `var PRICING_DEFAULT = 'Standard / moderate';`:

```js
  // 5th adjustment: Roady's Rewards participation. Additive, same mechanism as
  // Region/Amenities/Review/Pricing, and like Pricing it is deliberately
  // OUTSIDE officialSubtotal -- that figure has to keep matching the published
  // PDF calculator. Default is "Undecided / unknown" (0%), which is also what
  // a profile saved before this term existed resolves to.
  var REWARDS_LEVELS = [
    "Participating in Roady's Rewards",
    'Undecided / unknown',
    'Not participating'
  ];

  var REWARDS_ADJUST = {
    "Participating in Roady's Rewards": 0.05,
    'Undecided / unknown': 0.00,
    'Not participating': -0.05
  };
  var REWARDS_DEFAULT = 'Undecided / unknown';
```

Add all three to the `BDPG_CONFIG` object literal, after `PRICING_DEFAULT: PRICING_DEFAULT,`:

```js
    REWARDS_LEVELS: REWARDS_LEVELS,
    REWARDS_ADJUST: REWARDS_ADJUST,
    REWARDS_DEFAULT: REWARDS_DEFAULT,
```

- [ ] **Step 5: Add `rewardsAdjustment()` to the calculator**

In `busDevGallonsCalculator.js`, immediately after `pricingAdjustment`:

```js
  function rewardsAdjustment(level) {
    if (BDPG_CONFIG.REWARDS_ADJUST.hasOwnProperty(level)) return BDPG_CONFIG.REWARDS_ADJUST[level];
    return BDPG_CONFIG.REWARDS_ADJUST[BDPG_CONFIG.REWARDS_DEFAULT];
  }
```

Add `rewardsAdjustment: rewardsAdjustment,` to the returned exports object, after `pricingAdjustment:`.

- [ ] **Step 6: Extend `calculateEstimate()`**

Replace the body between `var pricingPct = ...` and the `return {` with:

```js
    var pricingPct = pricingAdjustment(opts.pricingLevel);
    var rewardsPct = rewardsAdjustment(opts.rewardsLevel);

    // Three multipliers, each adding one more term to the one above it.
    // officialMultiplier is the line that must never gain a term: it is what
    // reproduces Roady's published calculator.
    var officialMultiplier = 1 + regionPct + amenityPct + review.pct;
    var pricingMultiplier = officialMultiplier + pricingPct;
    var finalMultiplier = pricingMultiplier + rewardsPct;

    var officialSubtotal = Math.round(row.baseline * officialMultiplier);
    var pricingAdjusted = Math.round(row.baseline * pricingMultiplier);
    var finalGallons = Math.round(row.baseline * finalMultiplier);

    var officialMathLine = fmtInt(row.baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) +
      ') = ' + fmtInt(officialSubtotal);
    var pricingMathLine = fmtInt(row.baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) + pctTerm(pricingPct) +
      ') = ' + fmtInt(pricingAdjusted);
    var finalMathLine = fmtInt(row.baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) +
      pctTerm(pricingPct) + pctTerm(rewardsPct) +
      ') = ' + fmtInt(finalGallons);
```

and the return object becomes:

```js
    return {
      baseline: row.baseline,
      regionPct: regionPct,
      amenityPct: amenityPct,
      reviewPct: review.pct,
      pricingPct: pricingPct,
      rewardsPct: rewardsPct,
      reviewFlagged: review.flagged,
      officialSubtotal: officialSubtotal,
      pricingAdjusted: pricingAdjusted,
      finalGallons: finalGallons,
      officialMathLine: officialMathLine,
      pricingMathLine: pricingMathLine,
      finalMathLine: finalMathLine
    };
```

- [ ] **Step 7: Run the tests**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: **44 pass, 0 fail.**

Confirm by hand that `profileAdjustmentBounds()` was not touched — it must still read only `AMENITY_ADJUST` and `REVIEW_BANDS`.

- [ ] **Step 8: Commit**

```bash
git add busDevGallonsConfig.js busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bdpg): add Rewards Participation as a 5th additive adjustment"
```

---

### Task 2: Step 2 rewards control, state wiring, invalidation and migration

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — state literal `:409-426`, `step2Html()` `:1295-1385`, after `onPricingChange` `:1491-1495`, `invalidateResult()` comment block `:1565-1613`, `onGenerate()` `:1668-1691`, `onLoadProfile()` `:2198-2228`, `trackerSummary()` `:2079-2094`, `readSummary()` `:2100-2119`

**Interfaces:**
- Consumes: `BDPG_CONFIG.REWARDS_LEVELS/REWARDS_ADJUST/REWARDS_DEFAULT` from Task 1.
- Produces: `BDPG.state.rewardsLevel` (string); `BDPG.onRewardsChange(value)`; `trackerSummary()` and `readSummary()` both carry `rewardsLevel`.

- [ ] **Step 1: Add the state field**

In the `BDPG.state` literal, change `truckerPathRating: '', pricingLevel: '',` to:

```js
      truckerPathRating: '', pricingLevel: '', rewardsLevel: '',
```

- [ ] **Step 2: Default it in `step2Html()`**

Directly below the existing `if (!s.pricingLevel) s.pricingLevel = BDPG_CONFIG.PRICING_DEFAULT;` add:

```js
    if (!s.rewardsLevel) s.rewardsLevel = BDPG_CONFIG.REWARDS_DEFAULT;
```

- [ ] **Step 3: Build the segmented control**

After the `var segs = ...` block that builds the pricing segments, add:

```js
    // Three fixed tones rather than the pricing row's five-stop gradient:
    // this is a yes / unknown / no posture, not a scale.
    var REWARD_COLS = ['var(--green)', 'var(--yellow)', 'var(--red)'];
    var rsegs = BDPG_CONFIG.REWARDS_LEVELS.map(function (lvl, i) {
      var pct = BDPG_CONFIG.REWARDS_ADJUST[lvl];
      var on = (s.rewardsLevel === lvl);
      return '<button class="' + (on ? 'on' : '') + '"' +
        (on ? ' style="background:' + REWARD_COLS[i] + '"' : '') +
        ' onclick="BDPG.onRewardsChange(' + JSON.stringify(lvl).replace(/"/g, '&quot;') + ')">' +
        BDPG.escHtml(lvl.replace("Participating in Roady's Rewards", 'Participating')) + '<br>' +
        '<span style="opacity:.85">' + (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%</span></button>';
    }).join('');
```

In the `var right = ...` template, immediately after the pricing `'<div class="bdpg-seg">' + segs + '</div>' +` line, insert:

```js
        '<label style="margin-top:14px;display:block">Roady\'s Rewards Participation</label>' +
        '<div class="bdpg-seg">' + rsegs + '</div>' +
```

- [ ] **Step 4: Add the handler**

Directly after `BDPG.onPricingChange`:

```js
  // Mirrors onPricingChange exactly, invalidation guard included -- rewards is
  // an engine input, so a change here strands any result already on screen.
  BDPG.onRewardsChange = function (value) {
    if (BDPG.state.rewardsLevel !== value) BDPG.invalidateResult();
    BDPG.state.rewardsLevel = value;
    BDPG.render();
  };
```

- [ ] **Step 5: Pass it to the engine**

In `onGenerate()`, add to the `calculateEstimate({...})` argument object, after the `pricingLevel:` line:

```js
      rewardsLevel: s.rewardsLevel || BDPG_CONFIG.REWARDS_DEFAULT
```

- [ ] **Step 6: Document it in the invalidation contract**

In the comment block above `BDPG.invalidateResult()`, in the "Inputs that invalidate" list, add a line directly below the `pricingLevel` one:

```
  //   rewardsLevel ........... calculateEstimate
```

- [ ] **Step 7: Migration and persistence**

In `onLoadProfile()`, beside the existing `preEvalOpen` default:

```js
    // A profile saved before the rewards term existed has no rewardsLevel;
    // default it so it resolves to 0% and its stored numbers stay put.
    if (!BDPG.state.rewardsLevel) BDPG.state.rewardsLevel = BDPG_CONFIG.REWARDS_DEFAULT;
```

In `trackerSummary()`, extend the last line to:

```js
      amenityLevel: s.amenityLevel || '', pricingLevel: s.pricingLevel || '',
      rewardsLevel: s.rewardsLevel || ''
```

In `readSummary()`, after the `pricingLevel:` line:

```js
      rewardsLevel: sum.rewardsLevel || st.rewardsLevel || '',
```

- [ ] **Step 8: Verify in a browser**

Serve with `python -m http.server 8791`, open `http://localhost:8791/bus-dev-potential-gallons/`.

1. Fill the ⓪ card and Steps 1–2, Generate. Note Final.
2. Click each rewards segment — the results panel must be **replaced by the "results cleared" notice** every time (that is `invalidateResult()` firing). Re-Generate and confirm Final moves by ±5% of baseline and **Official does not move at all**.
3. Re-click the already-selected segment — must NOT clear the results (the change guard).
4. Seed a profile with no `rewardsLevel` into `localStorage['roadysBDPGProfiles']`, Load it, Generate: the control shows Undecided and the numbers match the pre-rewards values.

- [ ] **Step 9: Run tests and commit**

```bash
node --test busDevGallonsCalculator.test.js   # 44 pass
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Step 2 rewards control, wiring, invalidation and migration"
```

---

### Task 3: Waterfall — five steps become six

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `waterfallData()` `:1696-1714`, the waterfall table inside `resultsHtml()` `:1840-1848`

**Interfaces:**
- Consumes: `e.pricingAdjusted` and `e.rewardsPct` from Task 1.

- [ ] **Step 1: Add the rewards step to `waterfallData()`**

Replace the `steps` array with:

```js
    var steps = [
      { label: 'Baseline',    from: 0,                   to: e.baseline,          neutral: true },
      { label: 'Region',      from: e.baseline,          to: regionAdj },
      { label: 'Amen+Review', from: regionAdj,           to: e.officialSubtotal },
      { label: 'Pricing',     from: e.officialSubtotal,  to: e.pricingAdjusted },
      { label: 'Rewards',     from: e.pricingAdjusted,   to: e.finalGallons },
      { label: 'Final',       from: 0,                   to: e.finalGallons,      neutral: true, accent: true }
    ];
```

- [ ] **Step 2: Add the matching table row**

The function's own comment says the chart and table mirror each other exactly, so both move together. Replace rows 4–5 of the table in `resultsHtml()` with:

```js
        '<tr><td>4. Pricing adjustment (' + (e.pricingPct >= 0 ? '+' : '') + (e.pricingPct * 100).toFixed(1) + '%)</td><td style="text-align:right">' + (e.pricingAdjusted - e.officialSubtotal >= 0 ? '+' : '') + BDPG.fmtGal(e.pricingAdjusted - e.officialSubtotal) + '</td></tr>' +
        '<tr><td>5. Rewards adjustment (' + (e.rewardsPct >= 0 ? '+' : '') + (e.rewardsPct * 100).toFixed(1) + '%)</td><td style="text-align:right">' + (e.finalGallons - e.pricingAdjusted >= 0 ? '+' : '') + BDPG.fmtGal(e.finalGallons - e.pricingAdjusted) + '</td></tr>' +
        '<tr style="font-weight:700;border-top:1px solid var(--border)"><td>6. Final Potential Gallons</td><td style="text-align:right">' + BDPG.fmtGal(e.finalGallons) + '</td></tr>' +
```

- [ ] **Step 3: Verify in a browser**

Generate with Most aggressive + Participating on Medium/Interstate/West-region state. Expect chart bars and table rows to read:

```
1. Baseline                      12,500
2. Region-adjusted (+6.0%)       13,250
3. Official calculator subtotal  13,750
4. Pricing adjustment (+5.0%)      +625
5. Rewards adjustment (+5.0%)      +625
6. Final Potential Gallons       15,000
```

Then switch rewards to Not participating, re-Generate: row 5 reads `-625`, its bar turns red, row 6 reads 13,750 — and row 3 is **still 13,750**, unchanged.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): waterfall shows the rewards step"
```

---

### Task 4: Pre-Evaluation rewards chip

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `preEval()` `:964-1035`, `preEvalHtml()` `:1074-1095`

- [ ] **Step 1: Decouple `preEvalHtml()` from hardcoded indices**

The array is position-coupled: `preEval()` returns 7 chips with the overall signal last, and `preEvalHtml()` reads `chips.slice(0, 6)` and `chips[6]`. Adding a chip without changing both would silently drop a chip or render Rewards as the overall verdict. Make the split structural instead:

```js
    var judged = result.chips.slice(0, result.chips.length - 1);
    var overall = result.chips[result.chips.length - 1];
    var judgementChips = judged.map(function (c) {
```

(the `.map` body is unchanged), and leave `overall` used exactly as before.

- [ ] **Step 2: Add the chip in `preEval()`**

Before the `// #7 Overall signal` block, insert:

```js
    // Rewards posture -- informational only. Deliberately NOT part of the
    // `judged` roll-up below: rewards is a posture the rep sets, not a fact
    // about the prospect's market, and folding it in would let that choice
    // flip a "Strong candidate" verdict.
    var rewardsPct = BusDevGallonsCalc.rewardsAdjustment(s.rewardsLevel);
    var cRewards;
    if (rewardsPct > 0) cRewards = { label: 'Rewards signal', text: 'Rewards: +5%', tone: 'green' };
    else if (rewardsPct < 0) cRewards = { label: 'Rewards signal', text: 'Rewards: −5%', tone: 'red' };
    else cRewards = { label: 'Rewards signal', text: 'Rewards: undecided', tone: 'yellow' };
```

The `judged` line stays exactly `var judged = [c1, c2, c3, c4];` — do not add `cRewards` to it. Change the return to:

```js
    return { chips: [c1, c2, c3, c4, c5, c6, cRewards, c7], signal: signal };
```

- [ ] **Step 3: Verify in a browser**

With the ⓪ card's four prerequisites filled, the panel shows **seven** chips in the grid plus the overall callout below. Set rewards to Participating → green `Rewards: +5%`; Not participating → red `Rewards: −5%`; Undecided → yellow.

Critical check: with all of chips 1–4 green, the overall must still read **"Strong candidate"** when rewards is set to Not participating. If the overall flips to "Review carefully", `cRewards` was wrongly added to `judged`.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Pre-Evaluation rewards chip, excluded from the roll-up"
```

---

### Task 5: Tracker rewards column

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `trackerRowHtml()` `:2280-2382`, `prospectsHtml()` `:2458-2489`

**Interfaces:**
- Consumes: `readSummary().rewardsLevel` from Task 2.

- [ ] **Step 1: Add the cell**

In `trackerRowHtml()`, after the `pricingCell` line:

```js
    // Tone by posture, via the same hasOwn-guarded map style every other
    // lookup in this file uses, so a hand-edited value can't resolve to an
    // inherited Object.prototype member.
    var rewardsCell = '—';
    if (sum.rewardsLevel) {
      var rtone = hasOwn(BDPG.REWARDS_TONES, sum.rewardsLevel) ? BDPG.REWARDS_TONES[sum.rewardsLevel] : 'gray';
      rewardsCell = '<span class="badge tag-' + rtone + '">' + BDPG.escHtml(sum.rewardsLevel) + '</span>';
    }
```

Add the tone map next to `BDPG.PREEVAL_SIGNAL_TONES` (`:2256`):

```js
  BDPG.REWARDS_TONES = {
    "Participating in Roady's Rewards": 'green',
    'Undecided / unknown': 'yellow',
    'Not participating': 'red'
  };
```

Insert the cell into the returned `<tr>`, directly after the pricing `<td>`:

```js
      '<td>' + rewardsCell + '</td>' +
```

- [ ] **Step 2: Add the header and fix the colspan**

In `prospectsHtml()`, add `<th>Rewards</th>` after `<th>Pricing Posture</th>`, and change the empty-state `colspan="11"` to `colspan="12"`.

- [ ] **Step 3: Verify in a browser**

Save three prospects — one per rewards posture — plus one legacy record seeded with no `rewardsLevel`. The tracker shows 12 columns; the three chips are green/yellow/red; the legacy row shows `—` in Rewards and does not break the table. Delete all records and confirm the empty state spans the full 12-column width (no ragged right edge).

Click the Rewards header — the delegated sort handler must sort it alphabetically with `—` last. Do not add any sort code.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): tracker Rewards column"
```

---

### Task 6: Hero reframe

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `resultsHtml()` `:1815-1838` (the `nameHeader` and `hero` blocks)

**Interfaces:**
- Produces: `BDPG.pitchHeroHtml()` — the prospect-facing hero, reused by the export in Task 10.

- [ ] **Step 1: Extract the hero into its own function**

Add above `resultsHtml()`:

```js
  // Prospect-facing hero. Extracted so the Export Pitch Summary renders the
  // identical block rather than a hand-maintained second copy that could
  // drift from what the rep saw on screen.
  BDPG.pitchHeroHtml = function () {
    var e = BDPG.state.result.estimate;
    var annual = e.finalGallons * 12;
    // displayName() falls back to the literal "Prospect" when nothing is
    // entered, which reads badly mid-sentence -- use a neutral phrase instead.
    var raw = BDPG.state.prospect.name || BDPG.state.supportingDetails.prospectName || '';
    var who = raw ? BDPG.escHtml(raw) : 'this location';

    return '<div class="bdpg-hero-card final" style="margin-bottom:14px">' +
      '<div class="bdpg-hero-num" style="font-size:2.3em;line-height:1.15">' +
        'Roady\'s can drive ' + BDPG.fmtGal(e.finalGallons) + ' gallons/month to ' + who + '</div>' +
      '<div style="font-size:.95em;color:var(--muted);margin-top:8px">That\'s ' + BDPG.fmtGal(annual) +
        ' gallons annually — based on your location profile, region, and network data.</div>' +
      '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">' +
        '<span class="bdpg-lbl" style="display:inline">Roady\'s Published Calculator Figure:</span> ' +
        '<b style="font-size:1.15em">' + BDPG.fmtGal(e.officialSubtotal) + ' gal/mo</b>' +
        '<div style="font-size:.72em;color:var(--muted);margin-top:3px">' +
          'Matches Roady\'s published prospective-member calculator.</div>' +
      '</div>' +
    '</div>';
  };
```

Note the label: **"Roady's Published Calculator Figure"**, never "Network Baseline" — "Baseline" already names row 1 of the waterfall (the raw table value), and reusing it for a different number on the same screen is the collision this wording exists to avoid.

- [ ] **Step 2: Use it in `resultsHtml()`**

Replace the `nameHeader` + `hero` variables and their use in the return with `BDPG.pitchHeroHtml()`, keeping the region-variance `asOf` line and the `reviewFlagged` warning immediately after it (both stay).

- [ ] **Step 3: Verify in a browser**

Generate with a prospect named "Westgate Travel Plaza" → the hero reads `Roady's can drive 15,000 gallons/month to Westgate Travel Plaza`. Clear the name, save under the prompt flow, and confirm it reads `…to this location` — never `…to Prospect`. Enter `<img src=x onerror=alert(1)>` as the name and confirm it renders as literal text with no injected node.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): prospect-facing hero"
```

---

### Task 7: How We Get There + Opportunities to Grow

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — new functions near `analysisNarrativeHtml()` `:2016-2045`

**Interfaces:**
- Produces: `BDPG.pitchDriversHtml()` and `BDPG.pitchOpportunitiesHtml()`, both used by Task 9's layout and Task 10's export.

- [ ] **Step 1: Write the drivers generator**

```js
  // Every bullet is generated from the actual selected values -- never a
  // hardcoded list -- and appears ONLY when its signal is positive. Negative
  // and neutral signals are handled by pitchOpportunitiesHtml() instead, so
  // this section never tells a prospect what is wrong with their site.
  BDPG.pitchDrivers = function () {
    var s = BDPG.state, e = s.result.estimate, out = [];

    if (s.roadway === 'Interstate') {
      out.push('Your Interstate location puts you in the path of high-volume fleet corridors — the strongest traffic signal in our network.');
    } else if (s.roadway === 'Highway') {
      out.push('Your highway location sits on a steady regional freight corridor.');
    }
    if (e.regionPct > 0) {
      out.push('The ' + s.result.region + ' region runs +' + (e.regionPct * 100).toFixed(1) +
        '% above network average — your geography works in your favor.');
    }
    if (e.amenityPct > 0) {
      out.push('Your ' + s.amenityLevel + ' amenity rating places you above the network average for driver satisfaction.');
    }
    if (e.reviewPct > 0) {
      out.push('Your ' + Number(s.truckerPathRating).toFixed(1) +
        ' Trucker Path rating clears the 3.6 threshold — drivers already rate you well.');
    }
    if (e.pricingPct > 0) {
      out.push(s.pricingLevel.replace(' (deepest discounts)', '') + ' discount pricing is projected to drive an additional +' +
        (e.pricingPct * 100).toFixed(1) + '% gallon volume above baseline.');
    }
    if (e.rewardsPct > 0) {
      out.push('Participating in Roady\'s Rewards adds an estimated +' + (e.rewardsPct * 100).toFixed(1) +
        '% volume uplift as loyalty members are directed to your stop.');
    }
    return out;
  };

  BDPG.pitchDriversHtml = function () {
    var items = BDPG.pitchDrivers();
    // Omit the whole section rather than render an empty heading.
    if (!items.length) return '';
    return '<div class="bdpg-box" style="margin-top:14px">' +
      '<div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">How We Get There</div></div>' +
      '<ul style="margin:0 0 0 18px;font-size:.9em;line-height:1.7">' +
        items.map(function (t) { return '<li>' + BDPG.escHtml(t) + '</li>'; }).join('') +
      '</ul></div>';
  };
```

- [ ] **Step 2: Write the opportunities generator**

The lever arithmetic is `Math.round(baseline × (targetPct − currentPct))`, the same form `analysisNarrativeHtml()` already uses. Rewards comes first when applicable because it is the actual ask.

```js
  // The mirror of pitchDrivers(): everything that is NOT already a positive
  // signal, phrased as upside the prospect can capture -- never as a
  // diagnosis of what is wrong with their site.
  BDPG.pitchOpportunities = function () {
    var s = BDPG.state, e = s.result.estimate, out = [];

    if (e.rewardsPct < 0.05) {
      out.push('Adding Roady\'s Rewards participation could add an estimated +' +
        ((0.05 - e.rewardsPct) * 100).toFixed(1) + '% ≈ ' +
        BDPG.fmtGal(Math.round(e.baseline * (0.05 - e.rewardsPct))) + ' gal/mo to your projection.');
    }
    if (e.amenityPct < 0.02) {
      out.push('Reaching a "Good / full service" amenity level could add +' +
        ((0.02 - e.amenityPct) * 100).toFixed(1) + '% ≈ ' +
        BDPG.fmtGal(Math.round(e.baseline * (0.02 - e.amenityPct))) + ' gal/mo.');
    }
    if (e.reviewPct < 0.02) {
      out.push('Reaching a 3.6+ Trucker Path rating could add +' +
        ((0.02 - e.reviewPct) * 100).toFixed(1) + '% ≈ ' +
        BDPG.fmtGal(Math.round(e.baseline * (0.02 - e.reviewPct))) + ' gal/mo.');
    }
    var levels = BDPG_CONFIG.PRICING_LEVELS;
    var nextIdx = levels.indexOf(s.pricingLevel) - 1;
    if (nextIdx >= 0) {
      var nextPct = BDPG_CONFIG.PRICING_ADJUST[levels[nextIdx]];
      out.push('Moving to "' + levels[nextIdx].replace(' (deepest discounts)', '') +
        '" discount pricing could add ' +
        BDPG.fmtGal(Math.round(e.baseline * (nextPct - e.pricingPct))) + ' gal/mo.');
    }
    return out;
  };

  BDPG.pitchOpportunitiesHtml = function () {
    var items = BDPG.pitchOpportunities();
    if (!items.length) return '';
    return '<div class="bdpg-box" style="margin-top:14px">' +
      '<div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Opportunities to Grow</div></div>' +
      '<ul style="margin:0 0 0 18px;font-size:.9em;line-height:1.7">' +
        items.map(function (t) { return '<li>' + BDPG.escHtml(t) + '</li>'; }).join('') +
      '</ul></div>';
  };
```

- [ ] **Step 3: Strip the duplicated levers from `analysisNarrativeHtml()`**

The lever list now lives in Opportunities. Delete the `levers` array construction and `leverHtml` from `analysisNarrativeHtml()` and remove the `<b>Levers that would move the number:</b>` block from its return. Keep the two math lines and the `<b>Network Fit:</b>` line — those stay internal.

- [ ] **Step 4: Verify in a browser**

- Medium/Interstate, West state, Good amenities, rating 3.8, Most aggressive, Participating → How We Get There shows 6 bullets with real numbers; Opportunities is **absent entirely** (every signal is already at top band).
- Fuel stop/Any, a 0%-region state, Very limited, rating 2.7, No discounts, Not participating → How We Get There is **absent entirely**; Opportunities lists rewards first, then amenities, review and pricing.
- Confirm no bullet ever prints `NaN`, `undefined` or `%%`, and that a cleared rating ("No rating found") does not produce a bullet reading `NaN Trucker Path rating`.

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): generated How We Get There and Opportunities to Grow"
```

---

### Task 8: What This Means For Your Business + About the Roady's Network

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — new functions near `membershipFitHtml()` `:1876-1895` and `networkContextHtml()` `:2047-2063`

**Interfaces:**
- Produces: `BDPG.pitchBusinessCaseHtml()`, `BDPG.pitchNetworkStripHtml()`.

- [ ] **Step 1: The business case card**

```js
  BDPG.pitchBusinessCaseHtml = function () {
    var r = BDPG.state.result, e = r.estimate, m = r.membership;
    var annual = e.finalGallons * 12;

    // MEMBERSHIP_CONFIG ships all zeros, so this line does not render today.
    // When it can't, the card omits it SILENTLY -- "Membership pricing not
    // configured" is an internal status message and must never appear on a
    // prospect-facing page. The internal section keeps that notice for the rep.
    var payback = '';
    var best = m.valuePerGallonConfigured
      ? m.plans.filter(function (p) { return p.configured; })
               .sort(function (a, b) { return b.coverageMultiple - a.coverageMultiple; })[0]
      : null;
    if (best) {
      payback = '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:.9em">' +
        'At the <b>' + BDPG.escHtml(best.name) + '</b> membership, your membership pays for itself at ' +
        BDPG.fmtGal(best.breakevenGallons) + ' gal/mo — your projection is <b>' + best.coverageMultiple +
        '×</b> that.</div>';
    }

    var stat = 'font-size:.7em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px';
    return '<div class="bdpg-box" style="margin-top:14px">' +
      '<div class="sec-hdr" style="margin-bottom:4px"><div class="sec-title" style="font-size:.85em">What This Means For Your Business</div></div>' +
      '<div style="font-size:.82em;color:var(--muted);margin-bottom:12px">Join Roady\'s and here\'s what your first year looks like.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:34px">' +
        '<div><div style="' + stat + '">Monthly potential</div>' +
          '<div style="font-family:var(--ff);font-size:1.9em;font-weight:800;color:var(--accent);line-height:1">' +
          BDPG.fmtGal(e.finalGallons) + '<span style="font-size:.4em;color:var(--muted);margin-left:6px">gal/mo</span></div></div>' +
        '<div><div style="' + stat + '">Annual potential</div>' +
          '<div style="font-family:var(--ff);font-size:1.9em;font-weight:800;color:var(--accent);line-height:1">' +
          BDPG.fmtGal(annual) + '<span style="font-size:.4em;color:var(--muted);margin-left:6px">gal/yr</span></div></div>' +
      '</div>' + payback +
    '</div>';
  };
```

- [ ] **Step 2: The network credibility strip**

```js
  // Facts about the network, not projections about this prospect -- the point
  // is to establish Roady's scale. A missing figure is OMITTED, never rendered
  // as "—": a dash in a credibility strip shown to a customer reads as a
  // broken page. If there is no network data or no resolved region at all,
  // the whole strip is dropped.
  BDPG.pitchNetworkStripHtml = function () {
    var nc = BDPG.networkContext, r = BDPG.state.result;
    if (!nc || !r.region || !nc.byRegion) return '';
    var rd = nc.byRegion[r.region];
    if (!rd) return '';

    var stats = [];
    if (typeof nc.activeTotal === 'number') {
      stats.push([BDPG.fmtGal(nc.activeTotal), 'active locations across the Roady\'s network']);
    }
    if (typeof rd.total === 'number') {
      stats.push([BDPG.fmtGal(rd.total), 'locations in your region (' + r.region + ')']);
    }
    // byType keys come from the source CSV's Type column while locationType
    // comes from the ⓪ card's own list; they do not always match, which is why
    // this is a hasOwnProperty check and not a plain lookup.
    var lt = BDPG.state.prospect.locationType;
    if (lt && rd.byType && Object.prototype.hasOwnProperty.call(rd.byType, lt)) {
      stats.push([BDPG.fmtGal(rd.byType[lt]), BDPG.escHtml(lt) + ' locations like yours already in the network']);
    }
    if (!stats.length) return '';

    return '<div class="bdpg-box" style="margin-top:14px">' +
      '<div class="sec-hdr" style="margin-bottom:10px"><div class="sec-title" style="font-size:.85em">About the Roady\'s Network</div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:34px">' +
        stats.map(function (s) {
          return '<div><div style="font-family:var(--ff);font-size:1.9em;font-weight:800;color:var(--accent);line-height:1">' +
            s[0] + '</div><div style="font-size:.78em;color:var(--muted);margin-top:3px;max-width:200px">' + s[1] + '</div></div>';
        }).join('') +
      '</div>' +
      (nc.asOf ? '<div style="font-size:.68em;color:var(--muted);margin-top:10px">Network figures as of ' + BDPG.escHtml(nc.asOf) + '.</div>' : '') +
    '</div>';
  };
```

Note `s[1]` is already-escaped or literal copy — do not double-escape it.

- [ ] **Step 3: Verify in a browser**

- With `network-context.json` reachable and a West-region state + Location Type `Fuel Stop`: the strip shows 3 stats (400 / 78 / 4) and the `asOf` footnote.
- Set Location Type to `C-Store` (a value absent from `byType`): the third stat is **gone entirely** — no dash, no empty slot.
- Block the fetch in devtools and reload: the whole strip is absent and nothing throws.
- The business case shows monthly and annual, and **no** membership line and **no** "not configured" text.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): business-case card and network credibility strip"
```

---

### Task 9: Split the results into pitch and internal halves

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `resultsHtml()` `:1815-1863`

**Interfaces:**
- Consumes: `pitchHeroHtml()`, `pitchDriversHtml()`, `pitchOpportunitiesHtml()`, `pitchBusinessCaseHtml()`, `pitchNetworkStripHtml()`.
- Produces: `BDPG.pitchSectionsHtml()` — the prospect-facing half, reused verbatim by Task 10's export.

- [ ] **Step 1: Add the pitch aggregator and the divider**

```js
  // The single definition of "what the prospect sees". resultsHtml() renders
  // it above the divider and the export renders exactly this -- so the
  // leave-behind can never drift from what the rep showed on screen.
  BDPG.pitchSectionsHtml = function () {
    return BDPG.pitchHeroHtml() +
      BDPG.pitchDriversHtml() +
      BDPG.pitchOpportunitiesHtml() +
      BDPG.pitchBusinessCaseHtml() +
      BDPG.pitchNetworkStripHtml();
  };

  BDPG.internalDividerHtml = function () {
    return '<div style="margin:26px 0 14px;padding-top:12px;border-top:2px dashed var(--border2);' +
      'display:flex;align-items:center;gap:10px">' +
      '<span class="badge tag-yellow">INTERNAL</span>' +
      '<span style="font-size:.8em;color:var(--muted)">Not shown to the prospect — excluded from the Export Pitch Summary.</span>' +
    '</div>';
  };
```

- [ ] **Step 2: Rebuild `resultsHtml()`'s return**

```js
    return '<div class="bdpg-results">' +
      BDPG.pitchSectionsHtml() +
      '<div style="margin-top:8px;font-size:.75em;color:var(--muted)">' + BDPG.escHtml(BDPG.regionVarianceAsOfLine()) + '</div>' +
      (e.reviewFlagged ? '<div style="margin-top:6px;color:var(--yellow);font-size:.8em">No Trucker Path rating found — Review% treated as 0%.</div>' : '') +
      waterfall +
      BDPG.internalDividerHtml() +
      rangeSection + amenitySection + netCtx +
      BDPG.conditionAdjustedHtml() + BDPG.membershipFitHtml() + BDPG.analysisNarrativeHtml() +
    '</div>';
```

The waterfall stays **above** the divider: it is the transparent derivation of the headline number and belongs in the pitch. Grade, amenity chart, network-context table, condition-adjusted view, membership fit and analysis all go below.

- [ ] **Step 3: Verify in a browser**

Generate and read down the page: hero → How We Get There → Opportunities → business case → network strip → waterfall → **INTERNAL divider** → grade + range → amenity chart → network context table → condition-adjusted → membership fit → analysis. Nothing above the divider mentions a grade letter, the phrase "non-official", or a lever framed as a deficiency.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): split results into prospect-facing and internal halves"
```

---

### Task 10: Export Pitch Summary — GS name, rename, packet, Copy Summary

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `BDPG.state.prospect` literal `:413`, `prospectHtml()` `:1113-1142`, `resultsWrapHtml()` `:1615-1628`, `exportPdfHtml()` `:1897-1939`, `summaryText()` `:1978-1997`, `trackerRowHtml()` action buttons `:2362-2364`, `onLoadProfile()` prospect default `:2222-2224`

**Interfaces:**
- Consumes: `BDPG.pitchSectionsHtml()` from Task 9.
- Produces: `BDPG.state.prospect.gsName`.

- [ ] **Step 1: Add the GS Name field**

In the `prospect` state literal add `gsName: ''`. In `prospectHtml()`, after the Street Address field:

```js
        '<div class="fg"><label>Prepared by (GS Name)</label>' +
          '<input id="bdpg-prospect-gsname" value="' + BDPG.escHtml(p.gsName || '') + '" oninput="BDPG.onProspectInput(\'gsName\', this.value)"></div>' +
```

It routes through the existing `onProspectInput`, which does **not** call `BDPG.render()` — that is what preserves the caret. It is display-only and must **not** invalidate the result; `onProspectInput` already only refreshes the Generate button for `name`/`city`, so no change is needed there.

In `onLoadProfile()`, extend the pre-Task-4 default object to include `gsName: ''` so an old record gains the key.

- [ ] **Step 2: Rename both buttons**

In `resultsWrapHtml()`: `>Export PDF<` becomes `>Export Pitch Summary<`.
In `trackerRowHtml()`: the `onTrackerExport` button's label `>Export PDF<` becomes `>Export Pitch Summary<`.

- [ ] **Step 3: Rebuild the print packet**

Replace `exportPdfHtml()`'s return with:

```js
    var today = new Date().toISOString().slice(0, 10);
    var preparedBy = BDPG.state.prospect.gsName
      ? '<p style="font-size:.9em">Prepared by ' + BDPG.escHtml(BDPG.state.prospect.gsName) + '</p>' : '';

    return '<div id="bdpg-print-only">' +
      '<h1>Roady\'s Fuel Network — Value Proposition for ' + BDPG.escHtml(BDPG.displayName()) + '</h1>' +
      (loc ? '<h2>' + BDPG.escHtml(loc) + '</h2>' : '') +
      '<p style="font-size:.9em">' + today + '</p>' + preparedBy +
      // Exactly the sections shown above the INTERNAL divider on screen --
      // same function, not a second copy, so the two cannot drift.
      BDPG.pitchSectionsHtml() +
      '<h3>How the number is built</h3>' +
      '<p>' + BDPG.escHtml(BDPG.state.profile) + ' / ' + BDPG.escHtml(BDPG.state.roadway) +
        ' — Baseline ' + BDPG.fmtGal(e.baseline) + ' gal/mo</p>' +
      '<p>Official calculator: ' + BDPG.escHtml(e.officialMathLine) + '</p>' +
      '<p>With pricing: ' + BDPG.escHtml(e.pricingMathLine) + '</p>' +
      '<p>With Roady\'s Rewards (' + BDPG.escHtml(BDPG.state.rewardsLevel) + '): ' + BDPG.escHtml(e.finalMathLine) + '</p>' +
      '<p style="font-size:.85em;color:#666">' + BDPG.escHtml(BDPG.regionVarianceAsOfLine()) + '</p>' +
      chartImg +
    '</div>';
```

Delete the `gradeSection`, `heroPrint` and `membershipLine` locals and their uses — the grade is internal, and the hero and membership line now come from `pitchSectionsHtml()`. Keep the `chartImg` capture logic in `onExportPdf()` untouched.

- [ ] **Step 4: Update Copy Summary**

In `summaryText()`, replace the lines array with:

```js
    var lines = [
      'Roady\'s Fuel Network — Value Proposition for ' + BDPG.displayName(),
      loc || '',
      BDPG.state.prospect.gsName ? 'Prepared by ' + BDPG.state.prospect.gsName : '',
      '',
      'Roady\'s can drive ' + BDPG.fmtGal(e.finalGallons) + ' gal/mo — ' + BDPG.fmtGal(e.finalGallons * 12) + ' gal/yr.',
      '',
      'Location Profile: ' + BDPG.state.profile + ' / ' + BDPG.state.roadway,
      'Official calculator math: ' + e.officialMathLine,
      'Roady\'s Published Calculator Figure: ' + BDPG.fmtGal(e.officialSubtotal),
      'Pricing Strategy: ' + BDPG.state.pricingLevel,
      'Roady\'s Rewards: ' + BDPG.state.rewardsLevel,
      'Final Potential Gallons math: ' + e.finalMathLine,
      'Final Potential Gallons: ' + BDPG.fmtGal(e.finalGallons)
    ].filter(function (l, i) { return l !== '' || i === 0 || true; });
```

then drop the empty strings cleanly with `return lines.filter(function (l, i) { return !(l === '' && lines[i - 1] === ''); }).join('\n');`.

**The Network Fit Grade line is removed from Copy Summary** — Copy Summary is pasted into prospect-facing emails, so it follows the same pitch-only rule as the packet. The membership line stays only under its existing `valuePerGallonConfigured` guard.

- [ ] **Step 5: Verify in a browser**

- Fill GS Name → print preview header reads `Roady's Fuel Network — Value Proposition for Westgate Travel Plaza`, then city/state, date, `Prepared by …`. Clear it → the Prepared-by line is absent, with no blank gap.
- The packet contains the hero, drivers, opportunities, business case and network strip, **and no grade badge, no condition-adjusted view, no analysis**.
- Both Export buttons read "Export Pitch Summary" — the results one and the tracker row one.
- Copy Summary output contains no grade line and no `undefined`.
- Print from another page in the same browser (e.g. the dashboard) and confirm `body.bdpg-print-mode` still gates the rules — the other page prints normally.

- [ ] **Step 6: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Export Pitch Summary with GS name and pitch-only packet"
```

---

### Task 11: Whole-branch polish and invariant checklist

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` as needed

- [ ] **Step 1: Work the invariant checklist in a browser, recording evidence for each**

1. **`officialSubtotal` never includes Pricing or Rewards.** Fix Step 1/Step 2 inputs, then cycle all 5 pricing bands × all 3 rewards bands. The Published Calculator Figure and waterfall row 3 must be byte-identical in all 15 combinations while Final moves.
2. **`rewardsLevel` invalidates.** Generate, change rewards, confirm the results panel is replaced by the stale notice and Save refuses/warns rather than storing a mismatched pair.
3. **Grade unaffected by rewards.** Same inputs across all 3 rewards bands → identical grade letter and range position.
4. **Old profiles.** Seed a record with no `rewardsLevel` and no `gsName`; Load → Undecided, numbers unmoved, no `undefined` anywhere.
5. **Focus preservation.** Type into prospect name, street, city, GS name, notes, and both state fields — caret must survive mid-word in every one.
6. **No `undefined` / `null` / `NaN` / `[object Object]`** across: empty state, partial entry, full result, print packet, tracker with legacy + corrupt records.
7. **`CDO.scales` uncorrupted.** `JSON.stringify(CDO.scales)` after both charts render must equal the original literal with no baked-on `type`.
8. **Print gating.** `body.bdpg-print-mode` still scopes the `@media print` rules.
9. **Tracker.** 12 columns, empty state `colspan="12"`, Rewards column sorts via the delegated handler with no added sort code.
10. **44/44 tests**, and `git diff` shows no change to the delegated sort handler and none to the dashboard `index.html`.

- [ ] **Step 2: Fix anything the checklist surfaces**

Anything genuinely pre-existing and outside this work goes into `FOLLOW-UPS.md` at the repo root (which already exists and has an established entry format) instead of being fixed here.

- [ ] **Step 3: Commit**

```bash
node --test busDevGallonsCalculator.test.js   # 44 pass
git add -A
git commit -m "fix(bdpg): polish pass -- invariant checklist"
```

---

## Self-review

**Spec coverage.** §1.1–1.4 → Task 1. §1.5 guarded by Task 1 Step 1's `profileRange` test and Task 11 check 3. §1.6 needs no code. §1.7 → Task 1. §2.1–2.3 → Task 2. §2.4 → Task 3. §2.5 pre-eval → Task 4; tracker → Task 5; `trackerSummary` → Task 2; Copy Summary and packet → Task 10. §3.1 → Task 9. §3.2 → Task 6. §3.3–3.4 → Task 7. §3.5–3.6 → Task 8. §3.7 → Task 10. §3.8 → Task 10 Step 1. §4 → Task 11. §5 accepted, no task.

**Placeholders.** None: every code step carries real code, and every verification step names concrete inputs and expected values.

**Type consistency.** `rewardsAdjustment` / `rewardsPct` / `pricingAdjusted` / `pricingMathLine` / `rewardsLevel` / `REWARDS_TONES` / `pitchHeroHtml` / `pitchDrivers(Html)` / `pitchOpportunities(Html)` / `pitchBusinessCaseHtml` / `pitchNetworkStripHtml` / `pitchSectionsHtml` / `internalDividerHtml` are each spelled identically at their definition and every later use.

**One gap found and closed during review:** Task 10 originally left `onLoadProfile()`'s pre-Task-4 prospect default without `gsName`, so a legacy record would have produced `undefined` in the GS Name input. Folded into Task 10 Step 1.
