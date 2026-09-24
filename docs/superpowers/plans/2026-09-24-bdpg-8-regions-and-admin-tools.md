# 8-Region Model, Network Baselines, Tutorial & Weights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-region model with 8, add real network baselines as display context, region sliders, a tutorial widget, and an admin-only Weights tab.

**Architecture:** The region map moves to 8 keys with a parallel display-name map; network baselines are a new config block that never enters the formula; grade weights move from hardcoded constants into config with validation; all admin controls consolidate behind a PIN into a third sub-tab.

**Tech Stack:** Vanilla ES5 in one standalone HTML file, UMD engine modules, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-24-bdpg-8-regions-and-admin-tools-design.md`

## Global Constraints

- **`officialSubtotal` = `Baseline × (1 + Region% + Amenities% + Review%)`**, never Pricing or Rewards. `BDPG_NETWORK_BASELINES` is display context and must appear nowhere in `calculateEstimate()`.
- The **PDF baseline table is untouched**. The five adjustment bands are untouched.
- The region slider is a **±10 manual nudge**, default from committed `region_variance.json` (0 today). Network baselines are **not** its default and never feed the formula.
- **No saved profile's stored gallons may change.**
- Region migration is by **re-derivation from the stored state code**, never by name-mapping — old `West` splits into `Northwest` + `West`, so name-mapping is provably wrong.
- Weights affect only the Network Fit Grade.
- 48 existing tests pass; new tests per spec §8 (5 in Task 1, 3 in Task 2 → **56 total**).
- **Generate is blocked** until a Confirmed Amenity Level is explicitly selected (Task 11).
- The admin PIN is **user-set, 4 digits, stored in `localStorage`**, with no PIN set by default — never a hardcoded constant.
- Never commit `location-list-2026-09-21.csv` or any gallon report (`*.csv` is gitignored).
- ES5 (`var`, no arrows, no template literals). Escape all free text. Caret preserved on continuous inputs. No `undefined`/`null`/`NaN`/`[object Object]`.
- `window.print()` hangs headless — stub it and use `emulateMedia({media:'print'})`.

---

### Task 1: Config — 8 regions, display names, network baselines, weights

**Files:** Modify `busDevGallonsConfig.js`; Test `busDevGallonsCalculator.test.js`

**Produces:** `BDPG_CONFIG.BDPG_REGION_MAP` (8 keys), `.BDPG_REGION_DISPLAY`, `.BDPG_NETWORK_BASELINES`, `.NETWORK_BASELINE_META`, `.WEIGHT_CONFIG`

- [ ] **Step 1: Write the failing tests**

```js
test('BDPG_REGION_MAP has exactly 8 regions covering all 50 states once', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const keys = Object.keys(BDPG_CONFIG.BDPG_REGION_MAP);
  assert.equal(keys.length, 8);
  const seen = {};
  keys.forEach(r => BDPG_CONFIG.BDPG_REGION_MAP[r].forEach(st => {
    assert.ok(!seen[st], st + ' appears in two regions');
    seen[st] = r;
  }));
  assert.equal(Object.keys(seen).length, 50, 'expected 50 states, got ' + Object.keys(seen).length);
  assert.ok(!seen.DC, 'DC must stay unmapped');
});

test('new region assignments resolve correctly', () => {
  const m = { AK:'Northwest', HI:'West', WA:'Northwest', CA:'West', TX:'Texas',
              OK:'Southwest', MI:'Upper Midwest', IA:'Upper Midwest',
              OH:'Midwest', NE:'Midwest', MD:'Northeast', WV:'Southeast' };
  Object.keys(m).forEach(st => assert.equal(BusDevGallonsCalc.resolveRegion(st), m[st], st));
});

test('display, baseline and region maps share exactly the same 8 keys', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const r = Object.keys(BDPG_CONFIG.BDPG_REGION_MAP).sort();
  assert.deepEqual(Object.keys(BDPG_CONFIG.BDPG_REGION_DISPLAY).sort(), r);
  assert.deepEqual(Object.keys(BDPG_CONFIG.BDPG_NETWORK_BASELINES).sort(), r);
});

test('each network baseline pct matches its own avg over the overall avg', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const overall = BDPG_CONFIG.NETWORK_BASELINE_META.overallAvgGalMo;
  Object.keys(BDPG_CONFIG.BDPG_NETWORK_BASELINES).forEach(r => {
    const b = BDPG_CONFIG.BDPG_NETWORK_BASELINES[r];
    const derived = Math.round(((b.avgGalMo / overall) - 1) * 1000) / 1000;
    assert.equal(Math.round(b.pctVsNetwork * 1000) / 1000, derived, r);
  });
});

test('WEIGHT_CONFIG has six pillars summing to 100', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const w = BDPG_CONFIG.WEIGHT_CONFIG;
  const keys = ['rangePosition','condition','hours','distance','corridor','competition'];
  assert.deepEqual(Object.keys(w).sort(), keys.slice().sort());
  assert.equal(keys.reduce((s,k) => s + w[k], 0), 100);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js` — expect failures on region count, AK/HI/TX resolution, and the three missing config blocks.

- [ ] **Step 3: Replace `BDPG_REGION_MAP` and add the three new blocks**

Use the exact literals from spec §1.1 and §2.1, including the comment above `BDPG_NETWORK_BASELINES` explaining it is display context only and why (five of eight fall outside the ±10 slider range). Add `WEIGHT_CONFIG` from spec §5.1 with a comment noting the defaults reproduce the pre-change `0.5/0.5` behaviour exactly.

Export all four on `BDPG_CONFIG`.

- [ ] **Step 4: Run tests — expect the five new ones green**

The existing `resolveRegion` tests for `MD`/`DE`/`WV`/`OK`/`CO` must still pass unchanged; they were chosen because they hold under both maps. If any other existing test fails, report it rather than editing it.

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsConfig.js busDevGallonsCalculator.test.js
git commit -m "feat(bdpg): 8-region map, display names, network baselines, weight config"
```

---

### Task 2: Engine — weighted Network Fit Grade

**Files:** Modify `busDevGallonsCalculator.js:190-225`; Test `busDevGallonsCalculator.test.js`

**Consumes:** `BDPG_CONFIG.WEIGHT_CONFIG` (Task 1)
**Produces:** `calculateNetworkFitGrade(opts)` accepting optional `opts.weights`; `BusDevGallonsCalc.resolveWeights(w)`

- [ ] **Step 1: Write the failing tests**

```js
test('default weights reproduce the pre-change grade exactly', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Medium truck stop', officialSubtotal: 9000,
    supportingDetails: { condition:'Average', hours:'24/7', distance:'On exit',
                         corridor:'Regional', competition:'1 within 15 mi' }
  });
  // 0.5*rangePosition + 0.5*mean(50,100,100,50,50) === same under 50/10/10/10/10/10
  assert.equal(Math.round(r.overallScore * 1000) / 1000,
               Math.round((0.5 * r.rangePositionPct + 0.5 * r.signalAvg) * 1000) / 1000);
});

test('resolveWeights falls back to defaults for a set that does not sum to 100', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  assert.deepEqual(BusDevGallonsCalc.resolveWeights({ rangePosition: 90, condition: 90,
    hours: 10, distance: 10, corridor: 10, competition: 10 }), BDPG_CONFIG.WEIGHT_CONFIG);
  assert.deepEqual(BusDevGallonsCalc.resolveWeights({ rangePosition: 'x', condition: 10,
    hours: 10, distance: 10, corridor: 10, competition: 60 }), BDPG_CONFIG.WEIGHT_CONFIG);
  assert.deepEqual(BusDevGallonsCalc.resolveWeights(null), BDPG_CONFIG.WEIGHT_CONFIG);
});

test('a valid custom weight set changes the grade but never officialSubtotal', () => {
  const inputs = { profile: 'Medium truck stop', officialSubtotal: 9000,
    supportingDetails: { condition:'New or remodeled', hours:'24/7', distance:'On exit',
                         corridor:'Major', competition:'None within 15 mi' } };
  const base = BusDevGallonsCalc.calculateNetworkFitGrade(inputs);
  const tilted = BusDevGallonsCalc.calculateNetworkFitGrade(Object.assign({}, inputs,
    { weights: { rangePosition: 0, condition: 20, hours: 20, distance: 20, corridor: 20, competition: 20 } }));
  assert.notEqual(base.overallScore, tilted.overallScore);
  assert.equal(tilted.overallScore, 100, 'all five signals maxed with no range weight');
  const est = BusDevGallonsCalc.calculateEstimate({ profile:'Medium truck stop', roadway:'Interstate',
    regionPct: 0.06, amenityLevel:'Good / full service', reviewRating: 3.8,
    pricingLevel:'Standard / moderate', rewardsLevel:'Undecided / unknown' });
  assert.equal(est.officialSubtotal, 13750, 'weights must never touch the official figure');
});
```

- [ ] **Step 2: Run to verify they fail** — `resolveWeights is not a function`.

- [ ] **Step 3: Implement**

```js
  var WEIGHT_KEYS = ['rangePosition', 'condition', 'hours', 'distance', 'corridor', 'competition'];

  // A weight set reaches here from localStorage, so it can be anything. A set
  // that is not six finite numbers in 0..100 summing to exactly 100 is not
  // "close enough" -- it would silently produce a grade nobody configured, so
  // it is discarded whole rather than patched. Same stance as isNum/hasOwn
  // elsewhere in this project.
  function resolveWeights(w) {
    if (!w) return BDPG_CONFIG.WEIGHT_CONFIG;
    var total = 0;
    for (var i = 0; i < WEIGHT_KEYS.length; i++) {
      var v = w[WEIGHT_KEYS[i]];
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100) return BDPG_CONFIG.WEIGHT_CONFIG;
      total += v;
    }
    return total === 100 ? w : BDPG_CONFIG.WEIGHT_CONFIG;
  }
```

In `calculateNetworkFitGrade`, after `signalAvg` is computed, replace the
`overallScore` line with:

```js
    var w = resolveWeights(opts.weights);
    var overallScore = (w.rangePosition * rangePositionPct +
                        w.condition * signalScores.condition +
                        w.hours * signalScores.hours +
                        w.distance * signalScores.distance +
                        w.corridor * signalScores.corridor +
                        w.competition * signalScores.competition) / 100;
```

Add `weights: w` to the returned object so callers can show what was used, and
export `resolveWeights`.

- [ ] **Step 4: Run tests — all green, 48 + Task 1's 5 + these 3.**

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bdpg): Network Fit Grade reads configurable pillar weights"
```

---

### Task 3: Page — region key scheme and stale-override handling

**Files:** Modify `region_variance.json`; `bus-dev-potential-gallons/index.html` (`effectiveRegionVariance` `:529`, `effectiveRegionPct` `:533`, `regionVarianceIsSet` `:569`, `regionVarianceOverrideDiffers` `:574`)

**Produces:** `BDPG.REGION_KEYS` (from config), exact-key variance lookup, `BDPG.regionOverrideWasReset` flag

- [ ] **Step 1: Rewrite `region_variance.json`**

```json
{
  "Northwest": 0, "West": 0, "Southwest": 0, "Texas": 0,
  "Upper Midwest": 0, "Midwest": 0, "Northeast": 0, "Southeast": 0,
  "asOf": ""
}
```

- [ ] **Step 2: Switch the lookup to exact keys**

`effectiveRegionPct()` currently lowercases the region name. `"Upper Midwest"`
would become a space-bearing key. Replace with a `hasOwn`-guarded exact lookup:

```js
  BDPG.REGION_KEYS = Object.keys(BDPG_CONFIG.BDPG_REGION_MAP);

  BDPG.effectiveRegionPct = function (region) {
    if (!region) return 0;
    var v = BDPG.effectiveRegionVariance();
    // Exact key, no case transform: region keys now contain spaces
    // ("Upper Midwest"), and a lowercased space-bearing key is a silent
    // mismatch that reads as 0% rather than failing.
    if (!hasOwn(v, region)) return 0;
    var n = Number(v[region]);
    return isFinite(n) ? n / 100 : 0;
  };
```

Build the zero fallback and the two `.some()` region lists from
`BDPG.REGION_KEYS` rather than hardcoded arrays, so they can never drift again.

- [ ] **Step 3: Discard an incompatible stored override**

In `loadRegionVariance()`, after parsing the stored override, require it to
carry every one of the 8 keys. If not, discard it and set
`BDPG.regionOverrideWasReset = true`:

```js
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        var ok = parsed && typeof parsed === 'object' &&
          BDPG.REGION_KEYS.every(function (k) { return hasOwn(parsed, k); });
        if (ok) { BDPG.regionVariance.override = parsed; }
        else {
          // A 5-region override cannot be carried forward: old "West" covered
          // WA/OR/ID/MT/WY as well as CA/NV/UT/CO, so its number describes a
          // different set of states than any new region. Applying it to the
          // new "West" would silently attribute Pacific-Northwest performance
          // to California. Discarded whole and reported.
          localStorage.removeItem('roadysBDPGRegionOverride');
          BDPG.regionOverrideWasReset = true;
        }
      } catch (e) { localStorage.removeItem('roadysBDPGRegionOverride'); BDPG.regionOverrideWasReset = true; }
    }
```

Surface a one-line notice in the admin panel when the flag is set.

- [ ] **Step 4: Verify in a browser**

Serve `python -m http.server 8791`. Seed a 5-key lowercase override into
`localStorage['roadysBDPGRegionOverride']`, reload, and confirm: it is removed,
the notice shows, every region reads 0.0%, and no console error. Then seed a
valid 8-key override and confirm it is honoured.

- [ ] **Step 5: Commit**

```bash
git add region_variance.json bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): exact-key region variance for the 8-region model"
```

---

### Task 4: Map, colours, AK/HI, region chips

**Files:** `bus-dev-potential-gallons/index.html` — `REGION_COLORS` `:1237`, `renderMap()` `:1251`, `mapTip()` `:1282`, `regionChipsHtml()` `:1312`

- [ ] **Step 1: Extend `REGION_COLORS` to 8**

Use the table in spec §1.4 verbatim. Keep the comment explaining cyan is
reserved for the selected-state highlight, and extend it to note that teal is
the closest hue to cyan and was checked against the selection ring.

- [ ] **Step 2: Verify AK and HI render as insets**

`d3.geoAlbersUsa()` composites Alaska and Hawaii; `FIPS_TO_STATE` already maps
`02` and `15`, so both already have `STATE_PATHS` entries and are drawn today —
greyed, because `resolveRegion()` returned null. With Task 1 they resolve, so
they should become coloured and clickable with no projection change.

**Confirm this on screen.** If either is missing or misplaced, stop and report
it — do not hand-place an inset.

- [ ] **Step 3: Confirm the chip row handles 8**

`regionChipsHtml()` iterates `REGION_COLORS`, so it produces 8 automatically.
`.bdpg-chips` is `flex-wrap:wrap`. Confirm it wraps cleanly at 1500px and at a
narrow width rather than overflowing.

- [ ] **Step 4: Verify**

All 8 regions coloured and distinguishable in both themes; AK/HI clickable and
selecting them sets the state; DC still grey and inert; tooltip shows region
and %.

**Gate on the teal contrast check.** The user approved teal conditionally. Before
committing, select a teal (Northwest) state and confirm the cyan selection ring
separates clearly from the fill, in **both** themes — measure it (computed
colours, or a screenshot you actually look at), and report the result. If it
does not separate, **stop and report** rather than substituting another hue.

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): 8-region map colours with AK and HI mapped"
```

---

### Task 5: Display names on prospect-facing surfaces + network-average line

**Files:** `bus-dev-potential-gallons/index.html` — new `regionDisplayName()`; pitch driver bullet (~`:2448`), network strip (~`:2587`), `pitchHeroHtml()`, `networkContextHtml()`

- [ ] **Step 1: Add the helper**

```js
  // Prospect-facing copy uses the long display name ("Heartland / Central
  // Plains"); internal surfaces keep the short key, which matches the config
  // and the admin panel. Falls back to the key so an unmapped value degrades
  // to something readable rather than empty.
  BDPG.regionDisplayName = function (key) {
    return hasOwn(BDPG_CONFIG.BDPG_REGION_DISPLAY, key)
      ? BDPG_CONFIG.BDPG_REGION_DISPLAY[key] : (key || '');
  };
```

- [ ] **Step 2: Switch the prospect-facing call sites**

The pitch driver bullet currently reads `'The ' + s.result.region + ' region runs …'`
and the network strip `'locations in your region (' + r.region + ')'`. Both go
through `regionDisplayName()`. The exported packet inherits this automatically
because it renders `pitchSectionsHtml()`.

- [ ] **Step 3: Add the network-average line to the results**

In the pitch half, beneath the Published Calculator Figure:

```js
  BDPG.networkAverageLineHtml = function () {
    var r = BDPG.state.result;
    var key = r && r.region;
    if (!key || !hasOwn(BDPG_CONFIG.BDPG_NETWORK_BASELINES, key)) return '';
    var b = BDPG_CONFIG.BDPG_NETWORK_BASELINES[key];
    var meta = BDPG_CONFIG.NETWORK_BASELINE_META;
    return '<div style="margin-top:6px;font-size:.85em">' +
      '<span class="bdpg-lbl" style="display:inline">Roady\'s Network Average (your region):</span> ' +
      '<b>' + BDPG.fmtGal(b.avgGalMo) + ' gal/mo</b>' +
      '<div style="font-size:.72em;color:var(--muted);margin-top:2px">' +
        BDPG.escHtml(BDPG.regionDisplayName(key)) + ' · 12mo avg, ' + meta.locations +
        ' locations, as of ' + BDPG.escHtml(meta.asOf) + '</div>' +
    '</div>';
  };
```

Omitted entirely when the region is unresolved — never dashed on a
prospect-facing page.

- [ ] **Step 4: Verify**

A Southeast prospect shows `10,373 gal/mo` and `Southeast / Gulf States`; the
driver bullet reads the long name; an unresolved state shows neither line and
throws nothing; the packet matches the screen.

- [ ] **Step 5: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): region display names and the network-average context line"
```

---

### Task 6: Saved-profile migration by re-derivation

**Files:** `bus-dev-potential-gallons/index.html` — `readSummary()` (~`:2667`), `onLoadProfile()`, `trackerRowHtml()`

- [ ] **Step 1: Re-derive, never trust the stored region**

In `readSummary()`, invert the current precedence:

```js
      // Region is DERIVED from the stored state code, never read from the
      // stored region string. The 5->8 split is not a rename: old "West"
      // covered WA/OR/ID/MT/WY as well as CA/NV/UT/CO, so a stored "West"
      // cannot be mapped to a new region without guessing which half it meant.
      // The state code is unambiguous and every record has one (State is
      // required before Generate).
      region: stateCode ? str(BusDevGallonsCalc.resolveRegion(stateCode)) : '',
```

- [ ] **Step 2: Flag records that cannot be re-derived**

When `stateCode` is missing or `resolveRegion()` returns null but the record
otherwise has data, the tracker's Location cell shows
`region updated — re-select state` in `tag-yellow`, and `onLoadProfile()`
toasts the same message once.

- [ ] **Step 3: Verify**

Seed three legacy records: one with `state:'OR'` and stored `region:'West'`
(must now show **Northwest**); one with `state:'TX'` and stored
`region:'Southwest'` (must now show **Texas**); one with no state code (must
show the flag, not crash). Confirm **no record's stored gallons change** —
compare `summary.officialSubtotal` before and after loading each.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "fix(bdpg): re-derive saved-profile regions from the state code"
```

---

### Task 7: Region-variance sliders

**Files:** `bus-dev-potential-gallons/index.html` — `adminPanelHtml()` `:586`, `onSaveRegionOverride()` `:623`

- [ ] **Step 1: Replace the number inputs with sliders**

Per region: a `range` input (`min="-10" max="10" step="0.1"`), a live numeric
readout, a **Reset** button snapping to the committed value, and the read-only
network-data context line. Texas additionally renders
`⚠ low sample confidence (n=13)` from its `lowSample`/`n` fields — read from
config, not hardcoded.

The live readout updates on `input` **without a re-render** (same rule as every
other continuous control on this page).

- [ ] **Step 2: Save reads the sliders**

`onSaveRegionOverride()` iterates `BDPG.REGION_KEYS` and reads each slider by
id. It already calls `invalidateResult()` — keep that.

- [ ] **Step 3: Verify**

Eight sliders; dragging updates the readout live without losing the handle;
Reset restores the committed value; Save persists and invalidates a generated
result; the Texas marker shows and no other region has one; the network-data
line shows the real figure (e.g. Midwest `21,737 gal/mo · +76.1%`) while the
slider itself stays in ±10.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): region variance sliders with network-data context"
```

---

### Task 8: Tutorial widget

**Files:** `bus-dev-potential-gallons/index.html` — page header (`:274`), `render()` (`:473`), new `BDPG.tutorialHtml()`

- [ ] **Step 1: Build it**

A `.bdpg-step`-styled card with 5 tabs, collapsed by default, state in
`BDPG.state.tutorialOpen` / `BDPG.state.tutorialTab`. A `?` button in the page
header toggles it. Tab clicks patch only the card, never a full render.

Content per spec §4. **Every percentage is read from config** — e.g. the
Adjustments section derives its numbers from `AMENITY_ADJUST`,
`REVIEW_BANDS`, `PRICING_ADJUST`, `REWARDS_ADJUST` rather than repeating
literals that a future band change would falsify.

- [ ] **Step 2: Exclude it from the unsaved-work signature**

Add `tutorialOpen` and `tutorialTab` to `SIG_SKIP` — a disclosure toggle is not
unsaved work.

- [ ] **Step 3: Verify**

Collapsed on load; `?` opens and closes; all 5 tabs switch without re-render
and without losing caret focus elsewhere; the quoted percentages match config
(change a band in the console and confirm the copy follows); toggling it does
not mark the profile dirty; legible in both themes.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): collapsible how-it-works tutorial widget"
```

---

### Task 9: PIN gate, Weights tab, admin consolidation

**Files:** `bus-dev-potential-gallons/index.html` — sub-tab bar (`:279`), `switchTab()`, `render()`, `adminPanelHtml()`, `networkContextGeneratorHtml()`, `onGenerate()`

- [ ] **Step 1: The PIN gate — user-set 4 digits, never hardcoded**

Per spec §5.4. **Do not invent a constant PIN.**

- Default state: **no PIN set** → admin controls fully visible and usable. The
  tool must not arrive locked with a secret nobody was told.
- **Set PIN**: 4 digits entered twice, stored in `localStorage`
  (`roadysBDPGAdminPin`). Validate exactly four digits; reject anything else
  with a message rather than storing it.
- Once set, the PIN gates **all** admin controls — Weights tab, region sliders,
  network-context generator.
- **Change PIN** inside the admin tab: current PIN, then the new one twice.
- Unlock is per session (`BDPG.adminUnlocked`, not persisted); the stored PIN
  persists.

```js
  // NOT security. The page is public, the stored PIN sits in localStorage where
  // anyone can read or delete it, and every value it guards is editable there
  // directly. It exists so a rep cannot change grade weights by wandering into
  // the wrong panel -- an accident guard, nothing more.
```

- [ ] **Step 2: The Weights tab**

Third sub-tab `⚙ Weights`, rendered only when unlocked. Six sliders (0–100,
step 5), a live **Total** that turns red off 100, **Reset to defaults**, and
save to `localStorage`. **Saving is blocked unless the total is exactly 100** —
persisting a set the reader will discard is worse than refusing.

Saving calls `invalidateResult()`: a displayed grade computed under other
weights is the same stale-pair defect this branch already guards.

- [ ] **Step 3: Wire weights into the grade**

`onGenerate()` passes the effective weights into
`calculateNetworkFitGrade({... weights: BDPG.effectiveWeights() })`.
`effectiveWeights()` returns the stored set or the config defaults;
`resolveWeights()` in the engine re-validates regardless.

- [ ] **Step 4: Move the admin controls**

The region-variance panel and the network-context generator move out of the
calculator tab into this tab. Remove their calls from `render()`'s calc branch.

- [ ] **Step 5: Verify**

With **no PIN set**: admin controls visible and usable, no prompt. Set a PIN of
`1234`: reload, controls now gated, wrong PIN refused, right PIN unlocks for the
session, reload re-locks. Reject `123`, `12345` and `abcd` at Set-PIN time with
a message and no write. Change PIN requires the current one. Clearing
`localStorage` returns the page to the unset state rather than locking it
permanently.

Then: six sliders; total indicator red at 95 and 105 and save refused; Reset
restores 50/10/10/10/10/10; a saved valid set changes an open grade after
re-Generate; a hand-edited invalid set in `localStorage` falls back to defaults
without throwing; region sliders and the generator work from their new home;
the calc tab no longer shows them.

- [ ] **Step 6: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): admin Weights tab behind a PIN, all admin controls consolidated"
```

---

### Task 10: `network-context.json` for 8 regions

**Files:** `network-context.json`; `bus-dev-potential-gallons/index.html` — `onNetworkContextCsvCompute()` `:677`

- [ ] **Step 1: Derive the region list from config**

Replace the hardcoded `['West','Southwest','Midwest','Northeast','Southeast']`
with `Object.keys(BDPG_CONFIG.BDPG_REGION_MAP)` so the generator can never
again drift from the map.

- [ ] **Step 2: Regenerate the committed file**

Run the generator against `location-list-2026-09-21.csv` (present on disk,
gitignored — **never commit it**) and write the 8-region result to
`network-context.json`.

**`activeTotal` must remain 400** — the same rows repartitioned. Confirm the
eight counts sum to 400; any other total means rows were dropped or
double-counted, and is a finding.

- [ ] **Step 3: Verify**

The committed file has 8 regions; counts sum to 400; the region chips show
per-region counts; the network strip and Network Context table read the new
file; `git status` does not list the CSV.

- [ ] **Step 4: Commit**

```bash
git add network-context.json bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): regenerate network context for the 8-region model"
```

---

### Task 11: Amenity confirmation gate

**Files:** `bus-dev-potential-gallons/index.html` — `generateButtonHtml()` (~`:2260`), `step2Html()`'s amenity block (~`:1452`), `onAmenityConfirm()`

Generate is **blocked**, not merely warned, until the rep explicitly selects a
Confirmed Amenity Level. This supersedes the previous branch's "warn, do not
block" ruling — the user asked for the gate.

The reason is unchanged: `suggestAmenityLevel({})` returns "Very limited"
(−5%) for an unsurveyed site, so *unanswered* reads identically to *answered
badly*, and that −5% lands inside `officialSubtotal` — the figure the packet
advertises as reproducing Roady's published calculator.

- [ ] **Step 1: Add the prerequisite**

```js
  // An explicit confirmation, not merely a suggestion that was adopted by
  // default. Tapping the six amenity cards produces real data and therefore a
  // real suggestion, but the rep still has to confirm it -- that final click is
  // what turns an assumption into a decision, and it is the only thing that
  // distinguishes "surveyed and genuinely sparse" from "nobody asked yet".
  BDPG.amenityConfirmed = function () {
    return !!BDPG.state.amenityOverridden &&
      BDPG_CONFIG.AMENITY_LEVELS.indexOf(BDPG.state.amenityLevel) >= 0;
  };
```

In `generateButtonHtml()`, add it to `can` and name it in the disabled `title`
as its own missing prerequisite alongside the ⓪ card and Steps 1–2.

- [ ] **Step 2: Keep the notice, and point it at the gate**

The existing yellow assumption notice stays — it explains *why* Generate is
disabled. Extend its closing sentence to say the confirmation is now required.

- [ ] **Step 3: Verify**

Fresh page, ⓪ + Steps 1–2 complete, amenity untouched → Generate **disabled**,
title names the amenity confirmation. Tap the six cards but do not confirm →
still disabled (this is the case that separates a real gate from a proxy for
"any amenity interaction"). Pick a Confirmed Amenity Level → enabled. Load a
legacy profile saved with a confirmed level → enabled without re-confirming.
Load one saved without → disabled with the notice.

**Confirm no stored figure moved:** `suggestAmenityLevel()` is untouched, so
re-generating a legacy profile must reproduce its stored `officialSubtotal`
exactly.

- [ ] **Step 4: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): require an explicit Confirmed Amenity Level before Generate"
```

---

### Task 12: Polish and invariant checklist

- [ ] **Step 1: Work the checklist, recording evidence for each**

1. **`officialSubtotal` invariant** — all 5 pricing × 3 rewards, Published
   Calculator Figure byte-identical while Final moves.
2. **Network baselines never enter the formula** — grep
   `BDPG_NETWORK_BASELINES` and confirm no hit inside `calculateEstimate()` or
   any `regionPct` path.
3. **No saved profile's gallons changed** — load each seeded legacy record and
   compare stored figures before/after.
4. **Region migration** — OR→Northwest, TX→Texas, missing state→flag.
5. **All 50 states** clickable and correctly coloured; DC inert; AK/HI work.
6. **Weights** — defaults reproduce prior grades; invalid sets fall back.
7. **Focus preservation** on every continuous input including the new sliders.
8. **No `undefined`/`null`/`NaN`/`[object Object]`** across empty, partial,
   full, legacy, corrupt, and the packet.
9. **Pitch/internal boundary** — 0 internal terms above the divider or in the
   packet on a low-grade prospect.
10. **Print** — both classes set and cleared; packet renders.
11. **Tests** green; dashboard `index.html` untouched; no internal file
    committed anywhere in the branch.

- [ ] **Step 2: Fix what it surfaces; file genuinely pre-existing items in `FOLLOW-UPS.md`**

- [ ] **Step 3: Commit**

---

## Self-review

**Spec coverage.** §1.1–1.2 → Tasks 1, 3. §1.3 → Task 5. §1.4–1.5 → Task 4.
§2 → Tasks 1, 5. §3 → Task 7. §4 → Task 8. §5 → Tasks 1, 2, 9. §6 → Task 10.
§7 → Task 6. §8 → Tasks 1, 2. §9 → Task 11. §10 accepted, no task.

**Placeholder scan.** Every code step carries real code; every verification
step names concrete inputs and expected values.

**Type consistency.** `BDPG_REGION_DISPLAY` / `BDPG_NETWORK_BASELINES` /
`NETWORK_BASELINE_META` / `WEIGHT_CONFIG` / `resolveWeights` /
`BDPG.REGION_KEYS` / `regionDisplayName` / `networkAverageLineHtml` /
`effectiveWeights` / `regionOverrideWasReset` are spelled identically at
definition and every use.

**Ordering check.** Task 3 (exact-key lookup) must precede Task 4 and Task 7,
which read `effectiveRegionPct` for the new region names — otherwise every new
region silently reads 0% while looking correct. Task 1 precedes everything.
Task 2 is independent of the region work and could run any time before Task 9.
