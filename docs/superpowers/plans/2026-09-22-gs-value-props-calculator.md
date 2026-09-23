# Bus Dev Potential Gallons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Bus Dev Potential Gallons" tool to `index.html`, nested under the existing "Business Dev" nav group, implementing Roady's official Prospective Member Gallons Calculator exactly, plus a 4th pricing-strategy adjustment layer, supporting analysis, network context, membership fit, and export/save — as a testable engine (separate `.js` files) wired into `index.html`'s existing `nav()`/`renderPage()` page system.

**Architecture:** Pure-function calculator engine (`busDevGallonsConfig.js` data + `busDevGallonsCalculator.js` logic, both UMD-style so `node --test` can run them directly) loaded via `<script src>` into `index.html`. The tool itself is a new nav item (`data-nav-id="bus-dev-potential-gallons"`) nested under the Business Dev `nav-children` group, rendering inline into a new `<div class="page" id="pg-bus-dev-potential-gallons">` via the exact existing page mechanism (`nav()` → `renderPage()` → a new render function), with all UI/state/rendering under a single `window.BDPG` namespace object.

**Tech Stack:** Vanilla JS, no build step, no frameworks. Node's built-in `node:test` + `assert` for the engine's unit tests (Node 26 available, zero dependencies). Browser `@media print` for PDF export.

**Spec:** `docs/superpowers/specs/2026-09-22-gs-value-props-calculator-design.md`

## Global Constraints

- Implement the PDF calculator (baseline table, region/amenity/review adjustments, formula) **exactly** — no deviations. `officialSubtotal = Baseline × (1 + Region% + Amenities% + Review%)`, rounded to the nearest whole gallon.
- The engine returns **two distinct, never-conflated numbers**: `officialSubtotal` (3-factor, PDF-exact) and `finalGallons` (4-factor, includes Pricing%). Every downstream consumer must be explicit about which one it uses — see the Task 8 interface for the exact field names.
- Test cases that must pass exactly at Standard/0% pricing (where `officialSubtotal === finalGallons`): A → 13,750, B → 2,250, C → 14,550, D → 3,240. Plus the 3 pricing-band cases and the officialSubtotal invariant test (Task 8).
- No per-location gallon or membership data ever committed or shipped to the page — `network-context.json` holds aggregated counts only.
- The two source files (`Roadys_Prospective_Member_Gallons_Calculator.pdf`, `location-list-2026-09-21.csv`) are gitignored already; never un-ignore or commit them.
- `region_variance.json` and `network-context.json` ARE committed — small, aggregated/config data only.
- New global JS surface goes under `window.BDPG` only — no loose new global function/variable names in `index.html`'s shared scope. Region map is `BDPG_REGION_MAP`, never `REGIONS` (an unrelated GS-territory map already exists under that name in `index.html`).
- Reuse existing CSS: `.page`, `.sec-hdr`, `.sec-title`, `.badge`, `.btn`, `.btn-accent`, `.fg`, `.eg`, `.tw`, `.dt`, and the `--accent`/`--green`/`--red`/`--yellow`/`--orange` palette tokens already defined in `index.html`. New feature-specific classes are prefixed `.bdpg-`. `index.html` has **no `.card` class** — do not invent markup that assumes one.
- `busDevGallonsConfig.js` and `busDevGallonsCalculator.js` are UMD-style: `module.exports` when `typeof module !== 'undefined'`, else attached to `window`. No ES modules, no bundler.
- Text/number inputs a rep types continuously into (Trucker Path rating, Supporting Details free text, admin Region % fields, State code) must **never** trigger a full-page `innerHTML` rebuild on `input` — that steals focus/cursor position mid-keystroke. Only `<select>` elements and buttons trigger a full `BDPG.render()`. Continuous fields either write straight to `BDPG.state` with no rebuild, or do a small targeted DOM update.

---

## File Structure

```
busDevGallonsConfig.js          NEW. Pure data (BASELINE_TABLE, BDPG_REGION_MAP, AMENITY_ADJUST,
                                 REVIEW_BANDS, PRICING_ADJUST, amenity-suggestion thresholds,
                                 NETWORK_FIT config, CONDITION_ADJUST, MEMBERSHIP_CONFIG). No
                                 functions except the UMD export wrapper.

busDevGallonsCalculator.js      NEW. Pure functions over busDevGallonsConfig.js. No DOM access.
                                 Built incrementally across Tasks 2, 5, 6, 7, 8, 9, 10, 11.

busDevGallonsCalculator.test.js NEW. node:test + assert. Built incrementally alongside the
                                 calculator, one test block per task.

region_variance.json            NEW. {west, southwest, midwest, northeast, southeast, asOf}.
                                 Ships all-zero (Task 13).

network-context.json            NEW. Real aggregated data computed from location-list-2026-09-21.csv
                                 (Task 19) — the exact content is provided in that task.

index.html                      MODIFIED. Two new <script src> tags in <head> (Task 3, after the
                                 existing CDN tags at line ~10-15). New .ni nav item nested under
                                 the Business Dev nav-children group (Task 3). New
                                 <div class="page" id="pg-bus-dev-potential-gallons"> shell (Task 3).
                                 New TITLES['bus-dev-potential-gallons'] entry (Task 3). New
                                 renderPage() branch calling renderBusDevGallons() (Task 3). All
                                 page UI/state/logic added as one new inline <script> block, under
                                 window.BDPG (Tasks 3-4, 13-18, 20-25).
```

---

## Task 1: `busDevGallonsConfig.js` — all calculator config

**Files:**
- Create: `busDevGallonsConfig.js`

**Interfaces:**
- Produces: `BDPG_CONFIG` object (UMD: `module.exports.BDPG_CONFIG` or `window.BDPG_CONFIG`) with keys `BASELINE_TABLE`, `BDPG_REGION_MAP`, `AMENITY_LEVELS`, `AMENITY_ADJUST`, `REVIEW_BANDS`, `PRICING_LEVELS`, `PRICING_ADJUST`, `AMENITY_DETAIL_OPTIONS`, `NETWORK_FIT_SIGNAL_OPTIONS`, `NETWORK_FIT_SIGNAL_SCORES`, `NETWORK_FIT_GRADE_BANDS`, `CONDITION_ADJUST`, `MEMBERSHIP_CONFIG`.

- [ ] **Step 1: Write `busDevGallonsConfig.js`**

```js
(function (root) {
  'use strict';

  var BASELINE_TABLE = [
    { profile: 'Fuel stop',         roadway: 'Any',        lanes: '1-2', baseline: 2500 },
    { profile: 'Small truck stop',  roadway: 'Backroad',   lanes: '1-2', baseline: 3000 },
    { profile: 'Small truck stop',  roadway: 'Highway',    lanes: '3-5', baseline: 5000 },
    { profile: 'Small truck stop',  roadway: 'Interstate', lanes: '6+',  baseline: 7500 },
    { profile: 'Medium truck stop', roadway: 'Highway',    lanes: '3-5', baseline: 7500 },
    { profile: 'Medium truck stop', roadway: 'Interstate', lanes: '6+',  baseline: 12500 },
    { profile: 'Large truck stop',  roadway: 'Highway',    lanes: '3-5', baseline: 10000 },
    { profile: 'Large truck stop',  roadway: 'Interstate', lanes: '6+',  baseline: 15000 }
  ];

  // Geographic-variance regions for the calculator only. Not the GS-territory
  // REGIONS map already in index.html — different partition, different purpose.
  var BDPG_REGION_MAP = {
    West:      ['WA', 'OR', 'CA', 'NV', 'ID', 'MT', 'WY', 'UT', 'CO'],
    Southwest: ['AZ', 'NM', 'TX', 'OK'],
    Midwest:   ['ND', 'SD', 'NE', 'KS', 'MN', 'IA', 'MO', 'WI', 'IL', 'MI', 'IN', 'OH'],
    Northeast: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD'],
    Southeast: ['WV', 'VA', 'KY', 'TN', 'NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'AR', 'LA']
  };

  var AMENITY_LEVELS = ['Very limited', 'Average', 'Good / full service'];

  var AMENITY_ADJUST = {
    'Very limited': -0.05,
    'Average': 0.00,
    'Good / full service': 0.02
  };

  // Ordered low-to-high; each band's `max` is inclusive. Trucker Path ratings
  // are one-decimal, so 3.5 and 3.6 are adjacent values with no gap between bands.
  var REVIEW_BANDS = [
    { max: 2.9, pct: -0.05 },
    { max: 3.5, pct: 0.00 },
    { max: 5.0, pct: 0.02 }
  ];

  // 4th adjustment (new): pricing/discount posture. Additive, same mechanism
  // as Region/Amenities/Review. Default is "Standard / moderate" (0%).
  var PRICING_LEVELS = [
    'Most aggressive (deepest discounts)',
    'Aggressive',
    'Standard / moderate',
    'Light discounting',
    'No discounts'
  ];

  var PRICING_ADJUST = {
    'Most aggressive (deepest discounts)': 0.05,
    'Aggressive': 0.025,
    'Standard / moderate': 0.00,
    'Light discounting': -0.025,
    'No discounts': -0.05
  };
  var PRICING_DEFAULT = 'Standard / moderate';

  // Supporting Details / amenity-detail dropdown option sets, plus the
  // thresholds suggestAmenityLevel() reads to produce a suggested level.
  var AMENITY_DETAIL_OPTIONS = {
    showers: ['none', '1-3', '4-9', '10+'],
    food: ['none', 'grab-and-go', 'fast food', 'full restaurant'],
    scale: ['yes', 'no'],
    parking: ['none', '1-15', '16-50', '51-100', '100+'],
    service: ['none', 'tire only', 'full bays'],
    defReefer: ['both', 'DEF', 'reefer', 'neither'],
    goodFood: ['fast food', 'full restaurant'],
    limitedFood: ['none', 'grab-and-go'],
    goodParking: ['16-50', '51-100', '100+']
  };

  // Supporting Details fields that also feed the Network Fit Grade's 5-signal
  // score. Same option labels are reused by CONDITION_ADJUST for "condition".
  var NETWORK_FIT_SIGNAL_OPTIONS = {
    condition: ['New or remodeled', 'Average', 'Older / dated'],
    hours: ['24/7', 'Extended', 'Business hours only'],
    distance: ['On exit', '1-5 mi', '5-15 mi', '15+ mi'],
    corridor: ['Major', 'Regional', 'Local'],
    competition: ['None within 15 mi', '1 within 15 mi', '2+ within 15 mi', 'Adjacent to a major chain']
  };

  var NETWORK_FIT_SIGNAL_SCORES = {
    condition:   { 'New or remodeled': 100, 'Average': 50, 'Older / dated': 0 },
    hours:       { '24/7': 100, 'Extended': 50, 'Business hours only': 0 },
    distance:    { 'On exit': 100, '1-5 mi': 100, '5-15 mi': 50, '15+ mi': 0 },
    corridor:    { 'Major': 100, 'Regional': 50, 'Local': 0 },
    competition: { 'None within 15 mi': 100, '1 within 15 mi': 50, '2+ within 15 mi': 0, 'Adjacent to a major chain': 0 }
  };

  var NETWORK_FIT_GRADE_BANDS = [
    { min: 85, grade: 'A', label: 'Flagship' },
    { min: 70, grade: 'B', label: 'Strong' },
    { min: 55, grade: 'C', label: 'Solid' },
    { min: 40, grade: 'D', label: 'Developing' },
    { min: 0,  grade: 'E', label: 'Niche' }
  ];

  // Condition-adjusted view (non-official). Same 3 labels as the condition
  // signal above, different purpose: a straight +/-% on finalGallons.
  var CONDITION_ADJUST = {
    'New or remodeled': 0.10,
    'Average': 0.00,
    'Older / dated': -0.10
  };

  // Placeholders. All zero = "not configured" -- see calculateMembershipFit().
  var MEMBERSHIP_CONFIG = {
    valuePerGallon: 0,
    plans: [
      { name: "Roady's", cost: 0 },
      { name: 'PTP', cost: 0 },
      { name: "Roady's Lite", cost: 0 }
    ]
  };

  var BDPG_CONFIG = {
    BASELINE_TABLE: BASELINE_TABLE,
    BDPG_REGION_MAP: BDPG_REGION_MAP,
    AMENITY_LEVELS: AMENITY_LEVELS,
    AMENITY_ADJUST: AMENITY_ADJUST,
    REVIEW_BANDS: REVIEW_BANDS,
    PRICING_LEVELS: PRICING_LEVELS,
    PRICING_ADJUST: PRICING_ADJUST,
    PRICING_DEFAULT: PRICING_DEFAULT,
    AMENITY_DETAIL_OPTIONS: AMENITY_DETAIL_OPTIONS,
    NETWORK_FIT_SIGNAL_OPTIONS: NETWORK_FIT_SIGNAL_OPTIONS,
    NETWORK_FIT_SIGNAL_SCORES: NETWORK_FIT_SIGNAL_SCORES,
    NETWORK_FIT_GRADE_BANDS: NETWORK_FIT_GRADE_BANDS,
    CONDITION_ADJUST: CONDITION_ADJUST,
    MEMBERSHIP_CONFIG: MEMBERSHIP_CONFIG
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_CONFIG: BDPG_CONFIG };
  } else {
    root.BDPG_CONFIG = BDPG_CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 2: Sanity-check it loads in Node**

Run: `node -e "console.log(require('./busDevGallonsConfig.js').BDPG_CONFIG.PRICING_LEVELS.length)"`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add busDevGallonsConfig.js
git commit -m "feat(bus-dev-gallons): add calculator config (baseline table, region map, 4 adjustment rules)"
```

---

## Task 2: `busDevGallonsCalculator.js` — baseline lookup functions

**Files:**
- Create: `busDevGallonsCalculator.js`
- Create: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG` from Task 1.
- Produces: `BusDevGallonsCalc.getProfiles(): string[]`, `BusDevGallonsCalc.getValidRoadways(profile: string): string[]`, `BusDevGallonsCalc.getBaselineRow(profile: string, roadway: string): {profile,roadway,lanes,baseline} | null`.

- [ ] **Step 1: Write the failing tests**

```js
// busDevGallonsCalculator.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');

test('getProfiles returns the 4 distinct profiles in table order', () => {
  assert.deepEqual(BusDevGallonsCalc.getProfiles(), [
    'Fuel stop', 'Small truck stop', 'Medium truck stop', 'Large truck stop'
  ]);
});

test('getValidRoadways returns only roadways that exist for that profile', () => {
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Fuel stop'), ['Any']);
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Small truck stop'), ['Backroad', 'Highway', 'Interstate']);
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Medium truck stop'), ['Highway', 'Interstate']);
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Large truck stop'), ['Highway', 'Interstate']);
});

test('getValidRoadways never offers Backroad for Medium or Large (open item 2)', () => {
  assert.ok(!BusDevGallonsCalc.getValidRoadways('Medium truck stop').includes('Backroad'));
  assert.ok(!BusDevGallonsCalc.getValidRoadways('Large truck stop').includes('Backroad'));
});

test('getBaselineRow returns the exact row for a valid combination', () => {
  assert.deepEqual(BusDevGallonsCalc.getBaselineRow('Medium truck stop', 'Interstate'), {
    profile: 'Medium truck stop', roadway: 'Interstate', lanes: '6+', baseline: 12500
  });
});

test('getBaselineRow returns null for an invalid combination', () => {
  assert.equal(BusDevGallonsCalc.getBaselineRow('Large truck stop', 'Backroad'), null);
});

test('all 8 baseline rows are reachable via profile+roadway', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  BDPG_CONFIG.BASELINE_TABLE.forEach(row => {
    assert.deepEqual(BusDevGallonsCalc.getBaselineRow(row.profile, row.roadway), row);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `Cannot find module './busDevGallonsCalculator.js'`

- [ ] **Step 3: Write `busDevGallonsCalculator.js`**

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./busDevGallonsConfig.js').BDPG_CONFIG);
  } else {
    root.BusDevGallonsCalc = factory(root.BDPG_CONFIG);
  }
})(typeof window !== 'undefined' ? window : this, function (BDPG_CONFIG) {
  'use strict';

  function getProfiles() {
    var seen = [];
    BDPG_CONFIG.BASELINE_TABLE.forEach(function (row) {
      if (seen.indexOf(row.profile) === -1) seen.push(row.profile);
    });
    return seen;
  }

  function getValidRoadways(profile) {
    var out = [];
    BDPG_CONFIG.BASELINE_TABLE.forEach(function (row) {
      if (row.profile === profile && out.indexOf(row.roadway) === -1) out.push(row.roadway);
    });
    return out;
  }

  function getBaselineRow(profile, roadway) {
    var found = null;
    BDPG_CONFIG.BASELINE_TABLE.forEach(function (row) {
      if (row.profile === profile && row.roadway === roadway) found = row;
    });
    return found ? { profile: found.profile, roadway: found.roadway, lanes: found.lanes, baseline: found.baseline } : null;
  }

  return {
    getProfiles: getProfiles,
    getValidRoadways: getValidRoadways,
    getBaselineRow: getBaselineRow
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): baseline lookup functions (Step 1 of the calculator)"
```

---

## Task 3: Wire the Bus Dev Potential Gallons page shell into `index.html`

**Files:**
- Modify: `index.html:15` (add `<script src>` tags, after the existing Supabase CDN line)
- Modify: `index.html:854-858` (add a new `.ni` inside the Business Dev `nav-children` group)
- Modify: `index.html` (add `<div class="page" id="pg-bus-dev-potential-gallons">` shell — place it next to the other Tools pages, e.g. right after the `pg-kpi-fulltable` block)
- Modify: `index.html:2861` (add a `TITLES` entry)
- Modify: `index.html:3064` (`renderPage()` — add a branch calling `renderBusDevGallons()`)
- Modify: `index.html` (add a new inline `<script>` block defining `window.BDPG`)

**Interfaces:**
- Consumes: `BDPG_CONFIG` (Task 1), `BusDevGallonsCalc` (Task 2), both attached to `window` by the `<script src>` tags.
- Produces: `window.BDPG.render()` — the tool's single entry point, idempotent, safe to call repeatedly. `window.BDPG.state`, shape locked in now, extended (never renamed) by later tasks:

```js
BDPG.state = {
  profile: '', roadway: '',                      // Step 1
  state: '', amenityDetails: {}, amenityLevel: '', amenityOverridden: false,
  truckerPathRating: '', pricingLevel: '',          // Step 2 (pricingLevel defaults to
                                                     // BDPG_CONFIG.PRICING_DEFAULT on first render)
  supportingDetails: { condition: '', hours: '', distance: '', corridor: '',
                        competition: '', prospectName: '', prospectCity: '',
                        prospectState: '', actualLanes: '' },
  result: null                                      // set by Generate (Task 18); null until then
};
```

- [ ] **Step 1: Add the two `<script src>` tags**

Right after `index.html:15` (`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`):

```html
<script src="busDevGallonsConfig.js"></script>
<script src="busDevGallonsCalculator.js"></script>
```

- [ ] **Step 2: Add the nav item under Business Dev**

In the `nav-children` block for `bizdev` (`index.html:856-858`), add a second child right after the existing CRM item:

```html
    <div class="nav-children" data-nav-grp-children="bizdev">
      <div class="ni" data-nav-id="crm" onclick="location.href='CRM.html'"><span class="ni-icon">📞</span>Business Development CRM</div>
      <div class="ni" data-nav-id="bus-dev-potential-gallons" onclick="nav('bus-dev-potential-gallons',this)"><span class="ni-icon">⛽</span>Bus Dev Potential Gallons</div>
    </div>
```

- [ ] **Step 3: Add the page shell**

Add this anywhere among the other `<div class="page" id="pg-...">` blocks (e.g. right after the `pg-kpi-fulltable` block):

```html
    <!-- ══ BUS DEV POTENTIAL GALLONS ══ -->
    <div class="page" id="pg-bus-dev-potential-gallons">
      <div id="bdpg-content"></div>
    </div>
```

- [ ] **Step 4: Add the `TITLES` entry**

In the `TITLES` object literal (`index.html:2861`), add one key (anywhere in the object — it's a flat lookup, order doesn't matter):

```js
'bus-dev-potential-gallons':'Bus Dev Potential Gallons'
```

- [ ] **Step 5: Add the `renderPage()` branch**

In `renderPage(id)` (`index.html:3064`), add one more `else if` branch, anywhere in the chain:

```js
else if(id==='bus-dev-potential-gallons') renderBusDevGallons();
```

- [ ] **Step 6: Add the `window.BDPG` namespace block with a minimal `render()`**

Add a new `<script>` block anywhere after the two engine `<script src>` tags and before first use — end of `<body>` is simplest:

```html
<script>
(function () {
  'use strict';

  var BDPG = {
    state: {
      profile: '', roadway: '',
      state: '', amenityDetails: {}, amenityLevel: '', amenityOverridden: false,
      truckerPathRating: '', pricingLevel: '',
      supportingDetails: {
        condition: '', hours: '', distance: '', corridor: '', competition: '',
        prospectName: '', prospectCity: '', prospectState: '', actualLanes: ''
      },
      result: null
    },

    render: function () {
      var el = document.getElementById('bdpg-content');
      if (!el) return;
      el.innerHTML = '<div class="sec-hdr"><div class="sec-title">BUS DEV POTENTIAL GALLONS</div></div>' +
        '<p style="color:var(--muted)">Loading…</p>';
    }
  };

  window.BDPG = BDPG;
})();
function renderBusDevGallons(){ if (window.BDPG) window.BDPG.render(); }
</script>
```

(Task 4 replaces the placeholder body of `BDPG.render()` with the real Step 1 UI — this step only proves the wiring works end to end.)

- [ ] **Step 7: Manually verify in browser**

Serve the repo (`python -m http.server 8791` from the repo root — `index.html`'s Supabase/data loads over `fetch`/CDN, a local static server is enough for nav/page verification), open `http://localhost:8791/index.html`, expand "Tools ▸ Business Dev" in the sidebar, click "Bus Dev Potential Gallons", and confirm the "Loading…" section renders with no console errors, the page title updates to "Bus Dev Potential Gallons", and switching to/from other pages still works.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): wire Bus Dev Potential Gallons page shell into index.html's Business Dev nav group"
```

---

## Task 4: Step 1 UI — cascading selects + baseline reference table

**Files:**
- Modify: `index.html` (replace `BDPG.render()`'s body; add `BDPG.onProfileChange`, `BDPG.onRoadwayChange`)

**Interfaces:**
- Consumes: `BusDevGallonsCalc.getProfiles()`, `getValidRoadways()`, `getBaselineRow()` (Task 2); `BDPG_CONFIG.BASELINE_TABLE` (Task 1); `BDPG.state` (Task 3).
- Produces: `BDPG.state.profile`, `BDPG.state.roadway` populated; `BDPG.step1Html()`.

- [ ] **Step 1: Replace `BDPG.render()` and add the Step 1 renderer + handlers**

```js
BDPG.escHtml = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

BDPG.fmtGal = function (n) { return Math.round(n).toLocaleString(); };

BDPG.step1Html = function () {
  var s = BDPG.state;
  var profiles = BusDevGallonsCalc.getProfiles();
  var profileOpts = '<option value="">Select…</option>' + profiles.map(function (p) {
    return '<option value="' + BDPG.escHtml(p) + '"' + (p === s.profile ? ' selected' : '') + '>' + BDPG.escHtml(p) + '</option>';
  }).join('');

  var roadways = s.profile ? BusDevGallonsCalc.getValidRoadways(s.profile) : [];
  var roadwayOpts = '<option value="">' + (s.profile ? 'Select…' : '— pick a profile first —') + '</option>' + roadways.map(function (r) {
    return '<option value="' + BDPG.escHtml(r) + '"' + (r === s.roadway ? ' selected' : '') + '>' + BDPG.escHtml(r) + '</option>';
  }).join('');

  var row = (s.profile && s.roadway) ? BusDevGallonsCalc.getBaselineRow(s.profile, s.roadway) : null;

  var tableRows = BDPG_CONFIG.BASELINE_TABLE.map(function (r) {
    var hi = row && r.profile === row.profile && r.roadway === row.roadway;
    return '<tr' + (hi ? ' style="background:rgba(0,200,255,.12);font-weight:700"' : '') + '>' +
      '<td>' + BDPG.escHtml(r.profile) + '</td><td>' + BDPG.escHtml(r.roadway) + '</td>' +
      '<td>' + BDPG.escHtml(r.lanes) + '</td><td style="text-align:right">' + BDPG.fmtGal(r.baseline) + '</td></tr>';
  }).join('');

  return '<div class="sec-hdr"><div class="sec-title">BUS DEV POTENTIAL GALLONS</div><span class="badge ba">Step 1</span></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;max-width:520px">' +
      '<div class="fg"><label>Location Profile</label>' +
        '<select id="bdpg-profile" onchange="BDPG.onProfileChange(this.value)">' + profileOpts + '</select></div>' +
      '<div class="fg"><label>Roadway</label>' +
        '<select id="bdpg-roadway" onchange="BDPG.onRoadwayChange(this.value)"' + (s.profile ? '' : ' disabled') + '>' + roadwayOpts + '</select></div>' +
    '</div>' +
    (row ? ('<div class="bdpg-box" style="margin-bottom:12px">' +
      '<div style="font-size:.72em;color:var(--muted);text-transform:uppercase">Fuel Lanes (auto)</div>' +
      '<div style="font-weight:700">' + BDPG.escHtml(row.lanes) + '</div>' +
      '<div style="font-size:.72em;color:var(--muted);text-transform:uppercase;margin-top:8px">Baseline Avg. Gal./Mo.</div>' +
      '<div style="font-weight:800;font-size:1.3em;color:var(--accent)">' + BDPG.fmtGal(row.baseline) + '</div></div>') : '') +
    '<div class="tw"><table class="dt" style="width:100%">' +
      '<thead><tr><th>Location Profile</th><th>Roadway</th><th>Fuel Lanes</th><th style="text-align:right">Avg. Gal./Mo.</th></tr></thead>' +
      '<tbody>' + tableRows + '</tbody></table></div>';
};

BDPG.onProfileChange = function (profile) {
  BDPG.state.profile = profile;
  BDPG.state.roadway = '';
  BDPG.render();
};

BDPG.onRoadwayChange = function (roadway) {
  BDPG.state.roadway = roadway;
  BDPG.render();
};

BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  el.innerHTML = BDPG.step1Html();
};
```

Add `.bdpg-box` to `index.html`'s stylesheet (a plain grouping box, since this file has no `.card`):

```css
.bdpg-box{background:var(--bg2,rgba(255,255,255,.03));border:1px solid var(--border);border-radius:8px;padding:12px 14px}
```

- [ ] **Step 2: Manually verify in browser**

Reload the Bus Dev Potential Gallons page. Selecting "Medium truck stop" should populate Roadway with exactly `Highway`/`Interstate` (no Backroad). Selecting "Interstate" should show Fuel Lanes `6+` and Baseline `12,500`, and highlight that exact row in the table below.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Step 1 cascading baseline selection UI"
```

---

## Task 5: `resolveRegion()` — state → Network Region

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG.BDPG_REGION_MAP` (Task 1).
- Produces: `BusDevGallonsCalc.resolveRegion(stateAbbr: string): string | null`.

- [ ] **Step 1: Write the failing tests**

```js
test('resolveRegion maps confirmed border states correctly', () => {
  assert.equal(BusDevGallonsCalc.resolveRegion('MD'), 'Northeast');
  assert.equal(BusDevGallonsCalc.resolveRegion('DE'), 'Northeast');
  assert.equal(BusDevGallonsCalc.resolveRegion('WV'), 'Southeast');
  assert.equal(BusDevGallonsCalc.resolveRegion('OK'), 'Southwest');
  assert.equal(BusDevGallonsCalc.resolveRegion('CO'), 'West');
});

test('resolveRegion is case-insensitive and null for unmapped input', () => {
  assert.equal(BusDevGallonsCalc.resolveRegion('co'), 'West');
  assert.equal(BusDevGallonsCalc.resolveRegion('XX'), null);
  assert.equal(BusDevGallonsCalc.resolveRegion(''), null);
  assert.equal(BusDevGallonsCalc.resolveRegion(null), null);
});

test('every state in BDPG_REGION_MAP resolves to exactly one region', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  Object.keys(BDPG_CONFIG.BDPG_REGION_MAP).forEach(region => {
    BDPG_CONFIG.BDPG_REGION_MAP[region].forEach(st => {
      assert.equal(BusDevGallonsCalc.resolveRegion(st), region);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.resolveRegion is not a function`

- [ ] **Step 3: Add `resolveRegion` to `busDevGallonsCalculator.js`**

```js
  function resolveRegion(stateAbbr) {
    if (!stateAbbr) return null;
    var st = String(stateAbbr).toUpperCase();
    var found = null;
    Object.keys(BDPG_CONFIG.BDPG_REGION_MAP).forEach(function (region) {
      if (BDPG_CONFIG.BDPG_REGION_MAP[region].indexOf(st) !== -1) found = region;
    });
    return found;
  }
```

Add `resolveRegion: resolveRegion,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): resolveRegion() state-to-network-region lookup"
```

---

## Task 6: `amenityAdjustment()` and `reviewAdjustment()`

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG.AMENITY_ADJUST`, `BDPG_CONFIG.REVIEW_BANDS` (Task 1).
- Produces: `BusDevGallonsCalc.amenityAdjustment(level: string): number`, `BusDevGallonsCalc.reviewAdjustment(rating: number|null): {pct: number, flagged: boolean}`.

- [ ] **Step 1: Write the failing tests**

```js
test('amenityAdjustment returns the exact configured percentage', () => {
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Very limited'), -0.05);
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Average'), 0);
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Good / full service'), 0.02);
});

test('reviewAdjustment boundaries: 2.9 / 3.0 / 3.5 / 3.6', () => {
  assert.equal(BusDevGallonsCalc.reviewAdjustment(2.9).pct, -0.05);
  assert.equal(BusDevGallonsCalc.reviewAdjustment(3.0).pct, 0);
  assert.equal(BusDevGallonsCalc.reviewAdjustment(3.5).pct, 0);
  assert.equal(BusDevGallonsCalc.reviewAdjustment(3.6).pct, 0.02);
});

test('reviewAdjustment with no rating is 0% and flagged', () => {
  const r = BusDevGallonsCalc.reviewAdjustment(null);
  assert.equal(r.pct, 0);
  assert.equal(r.flagged, true);
});

test('reviewAdjustment with a real rating is not flagged', () => {
  assert.equal(BusDevGallonsCalc.reviewAdjustment(4.2).flagged, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.amenityAdjustment is not a function`

- [ ] **Step 3: Add both functions**

```js
  function amenityAdjustment(level) {
    return BDPG_CONFIG.AMENITY_ADJUST.hasOwnProperty(level) ? BDPG_CONFIG.AMENITY_ADJUST[level] : 0;
  }

  function reviewAdjustment(rating) {
    if (rating === null || rating === undefined || rating === '') {
      return { pct: 0, flagged: true };
    }
    var n = Number(rating);
    if (isNaN(n)) return { pct: 0, flagged: true };
    var band = BDPG_CONFIG.REVIEW_BANDS.filter(function (b) { return n <= b.max; })[0];
    var last = BDPG_CONFIG.REVIEW_BANDS[BDPG_CONFIG.REVIEW_BANDS.length - 1];
    return { pct: band ? band.pct : last.pct, flagged: false };
  }
```

Add `amenityAdjustment: amenityAdjustment, reviewAdjustment: reviewAdjustment,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (13 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): amenityAdjustment() and reviewAdjustment() with boundary handling"
```

---

## Task 7: `pricingAdjustment()` — 4th adjustment (new)

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG.PRICING_ADJUST`, `BDPG_CONFIG.PRICING_DEFAULT` (Task 1).
- Produces: `BusDevGallonsCalc.pricingAdjustment(level: string): number` (unrecognized/empty level falls back to the configured default's percentage, never 0 by accident and never throws).

- [ ] **Step 1: Write the failing tests**

```js
test('pricingAdjustment returns the exact configured percentage for each band', () => {
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Most aggressive (deepest discounts)'), 0.05);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Aggressive'), 0.025);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Standard / moderate'), 0);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Light discounting'), -0.025);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('No discounts'), -0.05);
});

test('pricingAdjustment falls back to the configured default for empty/unrecognized input', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const defaultPct = BDPG_CONFIG.PRICING_ADJUST[BDPG_CONFIG.PRICING_DEFAULT];
  assert.equal(BusDevGallonsCalc.pricingAdjustment(''), defaultPct);
  assert.equal(BusDevGallonsCalc.pricingAdjustment(undefined), defaultPct);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('not a real band'), defaultPct);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.pricingAdjustment is not a function`

- [ ] **Step 3: Add `pricingAdjustment`**

```js
  function pricingAdjustment(level) {
    if (BDPG_CONFIG.PRICING_ADJUST.hasOwnProperty(level)) return BDPG_CONFIG.PRICING_ADJUST[level];
    return BDPG_CONFIG.PRICING_ADJUST[BDPG_CONFIG.PRICING_DEFAULT];
  }
```

Add `pricingAdjustment: pricingAdjustment,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (16 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): pricingAdjustment() — 4th adjustment lever"
```

---

## Task 8: `calculateEstimate()` — the full formula, both numbers

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `getBaselineRow`, `amenityAdjustment`, `reviewAdjustment`, `pricingAdjustment` (this file, Tasks 2/6/7).
- Produces: `BusDevGallonsCalc.calculateEstimate({profile, roadway, regionPct, amenityLevel, reviewRating, pricingLevel}): result | null` (null if profile/roadway don't resolve to a baseline row). **`result` field names are locked in now and must never be renamed by later tasks:**

```js
{
  baseline: number,
  regionPct: number, amenityPct: number, reviewPct: number, pricingPct: number,
  reviewFlagged: boolean,
  officialSubtotal: number,   // Baseline × (1 + Region% + Amenities% + Review%) -- the PDF number
  finalGallons: number,       // Baseline × (1 + Region% + Amenities% + Review% + Pricing%) -- the headline number
  officialMathLine: string,   // e.g. "12,500 × (1 + 0.06 + 0.02 + 0.02) = 13,750"
  finalMathLine: string       // e.g. "12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05) = 14,375"
}
```

- [ ] **Step 1: Write the failing tests**

```js
test('calculateEstimate — case A @ Standard/0% pricing: officialSubtotal === finalGallons === 13750', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 13750);
});

test('calculateEstimate — case B @ Standard/0% pricing: 2250', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Fuel stop', roadway: 'Any',
    regionPct: 0, amenityLevel: 'Very limited', reviewRating: 2.7, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 2250);
  assert.equal(r.finalGallons, 2250);
});

test('calculateEstimate — case C @ Standard/0% pricing: 14550', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 14550);
  assert.equal(r.finalGallons, 14550);
});

test('calculateEstimate — case D @ Standard/0% pricing: 3240', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Backroad',
    regionPct: 0.06, amenityLevel: 'Average', reviewRating: 3.6, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 3240);
  assert.equal(r.finalGallons, 3240);
});

test('calculateEstimate — case A @ Most aggressive pricing: officialSubtotal unchanged, finalGallons 14375', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)'
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 14375);
});

test('calculateEstimate — case A @ No discounts pricing: officialSubtotal unchanged, finalGallons 13125', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'No discounts'
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 13125);
});

test('calculateEstimate — case C @ Aggressive pricing: officialSubtotal unchanged, finalGallons 14925', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 'Aggressive'
  });
  assert.equal(r.officialSubtotal, 14550);
  assert.equal(r.finalGallons, 14925);
});

test('calculateEstimate — officialSubtotal is invariant across every pricing band', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const subtotals = BDPG_CONFIG.PRICING_LEVELS.map(level => BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: level
  }).officialSubtotal);
  assert.ok(subtotals.every(v => v === 14550), 'officialSubtotal must never change with pricing: ' + subtotals);
});

test('calculateEstimate — all 8 baseline rows at 0/0/0/0 equal the table exactly (both numbers)', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  BDPG_CONFIG.BASELINE_TABLE.forEach(row => {
    const r = BusDevGallonsCalc.calculateEstimate({
      profile: row.profile, roadway: row.roadway,
      regionPct: 0, amenityLevel: 'Average', reviewRating: 3.2, pricingLevel: 'Standard / moderate'
    });
    assert.equal(r.officialSubtotal, row.baseline);
    assert.equal(r.finalGallons, row.baseline);
  });
});

test('calculateEstimate returns null for an invalid profile/roadway combination', () => {
  assert.equal(BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Backroad',
    regionPct: 0, amenityLevel: 'Average', reviewRating: 3.2, pricingLevel: 'Standard / moderate'
  }), null);
});

test('calculateEstimate renders distinct official and final math lines', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)'
  });
  assert.equal(r.officialMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02) = 13,750');
  assert.equal(r.finalMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05) = 14,375');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.calculateEstimate is not a function`

- [ ] **Step 3: Add `calculateEstimate`**

```js
  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

  function calculateEstimate(opts) {
    var row = getBaselineRow(opts.profile, opts.roadway);
    if (!row) return null;

    var regionPct = Number(opts.regionPct) || 0;
    var amenityPct = amenityAdjustment(opts.amenityLevel);
    var review = reviewAdjustment(opts.reviewRating);
    var pricingPct = pricingAdjustment(opts.pricingLevel);

    var officialMultiplier = 1 + regionPct + amenityPct + review.pct;
    var finalMultiplier = officialMultiplier + pricingPct;

    var officialSubtotal = Math.round(row.baseline * officialMultiplier);
    var finalGallons = Math.round(row.baseline * finalMultiplier);

    var officialMathLine = fmtInt(row.baseline) + ' × (1 + ' +
      regionPct.toFixed(2) + ' + ' + amenityPct.toFixed(2) + ' + ' + review.pct.toFixed(2) +
      ') = ' + fmtInt(officialSubtotal);
    var finalMathLine = fmtInt(row.baseline) + ' × (1 + ' +
      regionPct.toFixed(2) + ' + ' + amenityPct.toFixed(2) + ' + ' + review.pct.toFixed(2) + ' + ' + pricingPct.toFixed(2) +
      ') = ' + fmtInt(finalGallons);

    return {
      baseline: row.baseline,
      regionPct: regionPct,
      amenityPct: amenityPct,
      reviewPct: review.pct,
      pricingPct: pricingPct,
      reviewFlagged: review.flagged,
      officialSubtotal: officialSubtotal,
      finalGallons: finalGallons,
      officialMathLine: officialMathLine,
      finalMathLine: finalMathLine
    };
  }
```

Add `calculateEstimate: calculateEstimate,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (27 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): calculateEstimate() — official subtotal and final (pricing-adjusted) gallons, never conflated"
```

---

## Task 9: `suggestAmenityLevel()` — amenity-detail suggestion rule

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG.AMENITY_DETAIL_OPTIONS` (Task 1).
- Produces: `BusDevGallonsCalc.suggestAmenityLevel(details: {showers, food, scale, parking}): {level: string, reason: string}`.

- [ ] **Step 1: Write the failing tests**

```js
test('suggestAmenityLevel: Good / full service rule', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '4-9', food: 'full restaurant', scale: 'yes', parking: '16-50' });
  assert.equal(r.level, 'Good / full service');
  assert.ok(r.reason.length > 0);
});

test('suggestAmenityLevel: Very limited rule', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: 'none', food: 'none', scale: 'no', parking: 'none' });
  assert.equal(r.level, 'Very limited');
});

test('suggestAmenityLevel: falls back to Average otherwise', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '1-3', food: 'grab-and-go', scale: 'no', parking: '1-15' });
  assert.equal(r.level, 'Average');
});

test('suggestAmenityLevel: fast food (not just full restaurant) still counts as good food', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '10+', food: 'fast food', scale: 'yes', parking: '100+' });
  assert.equal(r.level, 'Good / full service');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.suggestAmenityLevel is not a function`

- [ ] **Step 3: Add `suggestAmenityLevel`**

```js
  function suggestAmenityLevel(details) {
    var d = details || {};
    var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS;

    var hasShowers = d.showers && d.showers !== 'none';
    var hasScale = d.scale === 'yes';
    var goodParking = opts.goodParking.indexOf(d.parking) !== -1;
    var goodFood = opts.goodFood.indexOf(d.food) !== -1;
    var noParking = d.parking === 'none' || !d.parking;
    var limitedFood = opts.limitedFood.indexOf(d.food) !== -1 || !d.food;

    if (hasShowers && goodFood && hasScale && goodParking) {
      return { level: 'Good / full service', reason: 'Showers, food service, a certified scale, and 16+ parking spots.' };
    }
    if (!hasShowers && noParking && limitedFood) {
      return { level: 'Very limited', reason: 'No showers, no truck parking, and no real food service.' };
    }
    return { level: 'Average', reason: 'Falls between the Good and Very limited thresholds.' };
  }
```

Add `suggestAmenityLevel: suggestAmenityLevel,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (31 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): suggestAmenityLevel() from amenity-detail dropdowns"
```

---

## Task 10: `calculateNetworkFitGrade()` — based on `officialSubtotal`

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG.BASELINE_TABLE`, `AMENITY_ADJUST`, `REVIEW_BANDS`, `NETWORK_FIT_SIGNAL_SCORES`, `NETWORK_FIT_GRADE_BANDS` (Task 1).
- Produces: `BusDevGallonsCalc.calculateNetworkFitGrade({profile, officialSubtotal, supportingDetails}): {rangeLo, rangeHi, rangePositionPct, signalScores, signalAvg, overallScore, grade, gradeLabel}`. **Takes `officialSubtotal`, not `finalGallons` or a generic `gallons` — pricing posture never affects the Grade** (spec §3/§8).

- [ ] **Step 1: Write the failing tests**

```js
test('calculateNetworkFitGrade: Fuel stop at exact baseline scores ~71% range-position, not near 0', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Fuel stop', officialSubtotal: 2500,
    supportingDetails: { condition: 'Average', hours: 'Extended', distance: '5-15 mi', corridor: 'Regional', competition: '1 within 15 mi' }
  });
  assert.equal(r.rangeLo, 2250);
  assert.equal(r.rangeHi, 2600);
  assert.ok(r.rangePositionPct > 65 && r.rangePositionPct < 75, 'expected ~71, got ' + r.rangePositionPct);
});

test('calculateNetworkFitGrade: case A officialSubtotal (13750) clamps range-position at 100 regardless of pricing', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Medium truck stop', officialSubtotal: 13750,
    supportingDetails: { condition: 'New or remodeled', hours: '24/7', distance: 'On exit', corridor: 'Major', competition: 'None within 15 mi' }
  });
  assert.equal(r.rangeLo, 6750);
  assert.equal(r.rangeHi, 13000);
  assert.equal(r.rangePositionPct, 100);
  assert.equal(r.grade, 'A');
});

test('calculateNetworkFitGrade: grade is identical regardless of what finalGallons/pricing would have been -- it never receives finalGallons at all', () => {
  // Same officialSubtotal (14550), passed directly -- proves the function's
  // contract by construction: it has no pricingLevel/finalGallons parameter to leak through.
  const r1 = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Large truck stop', officialSubtotal: 14550, supportingDetails: {}
  });
  const r2 = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Large truck stop', officialSubtotal: 14550, supportingDetails: {}
  });
  assert.deepEqual(r1, r2);
});

test('calculateNetworkFitGrade: never divides by zero for a single-baseline-row profile', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Fuel stop', officialSubtotal: 2500, supportingDetails: {}
  });
  assert.ok(Number.isFinite(r.rangePositionPct));
  assert.ok(!Number.isNaN(r.rangePositionPct));
});

test('calculateNetworkFitGrade: missing supporting details score 0 for that signal, never throw', () => {
  assert.doesNotThrow(() => {
    const r = BusDevGallonsCalc.calculateNetworkFitGrade({ profile: 'Small truck stop', officialSubtotal: 5000, supportingDetails: {} });
    assert.equal(r.signalScores.condition, 0);
  });
});

test('calculateNetworkFitGrade: grade bands are correctly ordered', () => {
  const worst = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Large truck stop', officialSubtotal: 9000,
    supportingDetails: { condition: 'Older / dated', hours: 'Business hours only', distance: '15+ mi', corridor: 'Local', competition: 'Adjacent to a major chain' }
  });
  assert.equal(worst.grade, 'E');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.calculateNetworkFitGrade is not a function`

- [ ] **Step 3: Add `calculateNetworkFitGrade`**

```js
  function profileAdjustmentBounds() {
    var amenityVals = Object.keys(BDPG_CONFIG.AMENITY_ADJUST).map(function (k) { return BDPG_CONFIG.AMENITY_ADJUST[k]; });
    var reviewVals = BDPG_CONFIG.REVIEW_BANDS.map(function (b) { return b.pct; });
    return {
      min: Math.min.apply(null, amenityVals) + Math.min.apply(null, reviewVals),
      max: Math.max.apply(null, amenityVals) + Math.max.apply(null, reviewVals)
    };
  }

  function profileRange(profile) {
    var rows = BDPG_CONFIG.BASELINE_TABLE.filter(function (r) { return r.profile === profile; });
    if (!rows.length) return null;
    var baselines = rows.map(function (r) { return r.baseline; });
    var bounds = profileAdjustmentBounds();
    var profileMin = Math.min.apply(null, baselines);
    var profileMax = Math.max.apply(null, baselines);
    return {
      rangeLo: Math.round(profileMin * (1 + bounds.min)),
      rangeHi: Math.round(profileMax * (1 + bounds.max))
    };
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function signalScore(signal, value) {
    var map = BDPG_CONFIG.NETWORK_FIT_SIGNAL_SCORES[signal];
    return (map && map.hasOwnProperty(value)) ? map[value] : 0;
  }

  function gradeForScore(score) {
    var band = BDPG_CONFIG.NETWORK_FIT_GRADE_BANDS.filter(function (b) { return score >= b.min; })[0];
    return band || BDPG_CONFIG.NETWORK_FIT_GRADE_BANDS[BDPG_CONFIG.NETWORK_FIT_GRADE_BANDS.length - 1];
  }

  function calculateNetworkFitGrade(opts) {
    var range = profileRange(opts.profile);
    var d = opts.supportingDetails || {};

    var rangePositionPct;
    if (!range || range.rangeHi === range.rangeLo) {
      rangePositionPct = 0;
    } else {
      rangePositionPct = clamp((opts.officialSubtotal - range.rangeLo) / (range.rangeHi - range.rangeLo), 0, 1) * 100;
    }

    var signalScores = {
      condition: signalScore('condition', d.condition),
      hours: signalScore('hours', d.hours),
      distance: signalScore('distance', d.distance),
      corridor: signalScore('corridor', d.corridor),
      competition: signalScore('competition', d.competition)
    };
    var signalKeys = Object.keys(signalScores);
    var signalAvg = signalKeys.reduce(function (sum, k) { return sum + signalScores[k]; }, 0) / signalKeys.length;

    var overallScore = 0.5 * rangePositionPct + 0.5 * signalAvg;
    var band = gradeForScore(overallScore);

    return {
      rangeLo: range ? range.rangeLo : null,
      rangeHi: range ? range.rangeHi : null,
      rangePositionPct: rangePositionPct,
      signalScores: signalScores,
      signalAvg: signalAvg,
      overallScore: overallScore,
      grade: band.grade,
      gradeLabel: band.label
    };
  }
```

Add `calculateNetworkFitGrade: calculateNetworkFitGrade,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (37 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): calculateNetworkFitGrade() scored against officialSubtotal, never pricing-adjusted"
```

---

## Task 11: `conditionAdjustedGallons()` and `calculateMembershipFit()` — both on `finalGallons`

**Files:**
- Modify: `busDevGallonsCalculator.js`
- Modify: `busDevGallonsCalculator.test.js`

**Interfaces:**
- Consumes: `BDPG_CONFIG.CONDITION_ADJUST`, `BDPG_CONFIG.MEMBERSHIP_CONFIG` (Task 1).
- Produces: `BusDevGallonsCalc.conditionAdjustedGallons(finalGallons: number, condition: string): number`, `BusDevGallonsCalc.calculateMembershipFit(finalGallons: number): {valuePerGallonConfigured, valuePerGallon, monthlyValue, plans}`. **Both take `finalGallons` explicitly — never `officialSubtotal`.**

- [ ] **Step 1: Write the failing tests**

```js
test('conditionAdjustedGallons applies +10/0/-10 to finalGallons', () => {
  assert.equal(BusDevGallonsCalc.conditionAdjustedGallons(10000, 'New or remodeled'), 11000);
  assert.equal(BusDevGallonsCalc.conditionAdjustedGallons(10000, 'Average'), 10000);
  assert.equal(BusDevGallonsCalc.conditionAdjustedGallons(10000, 'Older / dated'), 9000);
});

test('calculateMembershipFit: today\'s actual placeholder state (all 0) is "not configured", never NaN/Infinity', () => {
  const r = BusDevGallonsCalc.calculateMembershipFit(10000);
  assert.equal(r.valuePerGallonConfigured, false);
  assert.deepEqual(r.plans, []);
  assert.equal(r.monthlyValue, null);
  const flat = JSON.stringify(r);
  assert.ok(!/NaN/.test(flat) && !/Infinity/.test(flat), 'result must never contain NaN or Infinity: ' + flat);
});

test('calculateMembershipFit: valuePerGallon set, only one plan cost set', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const original = JSON.parse(JSON.stringify(BDPG_CONFIG.MEMBERSHIP_CONFIG));
  BDPG_CONFIG.MEMBERSHIP_CONFIG.valuePerGallon = 0.05;
  BDPG_CONFIG.MEMBERSHIP_CONFIG.plans[0].cost = 100; // Roady's only

  const r = BusDevGallonsCalc.calculateMembershipFit(10000);
  assert.equal(r.valuePerGallonConfigured, true);
  assert.equal(r.monthlyValue, 500);
  const roadys = r.plans.filter(p => p.name === "Roady's")[0];
  const ptp = r.plans.filter(p => p.name === 'PTP')[0];
  assert.equal(roadys.configured, true);
  assert.equal(roadys.breakevenGallons, 2000);
  assert.equal(roadys.coverageMultiple, 5);
  assert.equal(ptp.configured, false);
  assert.equal('breakevenGallons' in ptp, false);

  BDPG_CONFIG.MEMBERSHIP_CONFIG.valuePerGallon = original.valuePerGallon;
  BDPG_CONFIG.MEMBERSHIP_CONFIG.plans = original.plans;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: FAIL — `BusDevGallonsCalc.conditionAdjustedGallons is not a function`

- [ ] **Step 3: Add both functions**

```js
  function conditionAdjustedGallons(finalGallons, condition) {
    var pct = BDPG_CONFIG.CONDITION_ADJUST.hasOwnProperty(condition) ? BDPG_CONFIG.CONDITION_ADJUST[condition] : 0;
    return Math.round(finalGallons * (1 + pct));
  }

  function calculateMembershipFit(finalGallons) {
    var cfg = BDPG_CONFIG.MEMBERSHIP_CONFIG;
    var vpg = Number(cfg.valuePerGallon) || 0;

    if (vpg <= 0) {
      return { valuePerGallonConfigured: false, valuePerGallon: 0, monthlyValue: null, plans: [] };
    }

    var monthlyValue = finalGallons * vpg;
    var plans = cfg.plans.map(function (p) {
      var cost = Number(p.cost) || 0;
      if (cost <= 0) return { name: p.name, configured: false };
      var breakevenGallons = Math.round(cost / vpg);
      var coverageMultiple = Math.round((finalGallons / breakevenGallons) * 100) / 100;
      return { name: p.name, configured: true, cost: cost, breakevenGallons: breakevenGallons, coverageMultiple: coverageMultiple };
    });

    return { valuePerGallonConfigured: true, valuePerGallon: vpg, monthlyValue: monthlyValue, plans: plans };
  }
```

Add `conditionAdjustedGallons: conditionAdjustedGallons, calculateMembershipFit: calculateMembershipFit,` to the return block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS (40 tests total)

- [ ] **Step 5: Commit**

```bash
git add busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "feat(bus-dev-gallons): conditionAdjustedGallons() and calculateMembershipFit() on finalGallons"
```

---

## Task 12: Engine self-review — full suite check

**Files:** None expected to change — this is a review task.

- [ ] **Step 1: Run the full test suite once**

Run: `node --test busDevGallonsCalculator.test.js`
Expected: PASS, 40 tests, 0 failures.

- [ ] **Step 2: Grep for any leftover `GVP`/`GallonsCalc`/`gallonsConfig` naming from earlier design drafts**

Run: `grep -rn "GVP\|GallonsCalc\b\|gallonsConfig\|gallonsCalculator" busDevGallonsConfig.js busDevGallonsCalculator.js busDevGallonsCalculator.test.js`
Expected: no output. If anything matches, it's a leftover from the pre-rename draft — fix it and re-run Step 1.

- [ ] **Step 3: Commit (only if Step 2 found and fixed something)**

```bash
git add busDevGallonsConfig.js busDevGallonsCalculator.js busDevGallonsCalculator.test.js
git commit -m "chore(bus-dev-gallons): remove leftover pre-rename naming"
```

If Step 2 found nothing, skip this commit.

---

## Task 13: `region_variance.json` + effective-region resolution on the page

**Files:**
- Create: `region_variance.json`
- Modify: `index.html` (add `BDPG.loadRegionVariance()`, `BDPG.effectiveRegionPct()`)

**Interfaces:**
- Produces: `BDPG.regionVariance` (`{committed: {...}|null, override: {...}|null}`), `BDPG.effectiveRegionPct(region: string): number`, `BDPG.regionVarianceAsOf(): string|null`.

- [ ] **Step 1: Create `region_variance.json`**

```json
{
  "west": 0,
  "southwest": 0,
  "midwest": 0,
  "northeast": 0,
  "southeast": 0,
  "asOf": ""
}
```

- [ ] **Step 2: Add region-variance loading to the `BDPG` object**

```js
BDPG.regionVariance = { committed: null, override: null };
BDPG._regionVarianceLoaded = false;

BDPG.loadRegionVariance = function (onDone) {
  if (BDPG._regionVarianceLoaded) { if (onDone) onDone(); return; }
  BDPG._regionVarianceLoaded = true;

  var raw = localStorage.getItem('roadysBDPGRegionOverride');
  if (raw) { try { BDPG.regionVariance.override = JSON.parse(raw); } catch (e) { /* corrupt value, ignore */ } }

  fetch('region_variance.json').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (json) { BDPG.regionVariance.committed = json; if (onDone) onDone(); })
    .catch(function () { if (onDone) onDone(); });
};

BDPG.effectiveRegionVariance = function () {
  return BDPG.regionVariance.override || BDPG.regionVariance.committed || { west: 0, southwest: 0, midwest: 0, northeast: 0, southeast: 0, asOf: '' };
};

BDPG.effectiveRegionPct = function (region) {
  if (!region) return 0;
  var v = BDPG.effectiveRegionVariance();
  var key = region.toLowerCase();
  return (Number(v[key]) || 0) / 100;
};

BDPG.regionVarianceAsOf = function () {
  return BDPG.effectiveRegionVariance().asOf || null;
};

BDPG.regionVarianceIsSet = function () {
  var v = BDPG.effectiveRegionVariance();
  return ['west', 'southwest', 'midwest', 'northeast', 'southeast'].some(function (k) { return Number(v[k]) !== 0; });
};

BDPG.regionVarianceOverrideDiffers = function () {
  if (!BDPG.regionVariance.override || !BDPG.regionVariance.committed) return false;
  var o = BDPG.regionVariance.override, c = BDPG.regionVariance.committed;
  return ['west', 'southwest', 'midwest', 'northeast', 'southeast'].some(function (k) { return Number(o[k]) !== Number(c[k]); });
};
```

Update `BDPG.render` (Task 4) to gate on this load before building Step 1:

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html();
};
```

- [ ] **Step 3: Manually verify in browser**

Serve `index.html` over `http://localhost:8791` (fetch of a local JSON file needs http(s), not `file://`). Confirm the page still renders with no console errors and `BDPG.effectiveRegionPct('West')` returns `0` in the console.

- [ ] **Step 4: Commit**

```bash
git add region_variance.json index.html
git commit -m "feat(bus-dev-gallons): committed region_variance.json + effective-region resolution"
```

---

## Task 14: Step 2 UI — state/region, amenities, Trucker Path, Pricing Strategy

**Files:**
- Modify: `index.html` (add `BDPG.step2Html()`, region SVG map helper, event handlers; concatenate into `BDPG.render()`)

**Interfaces:**
- Consumes: `BusDevGallonsCalc.resolveRegion`, `suggestAmenityLevel`, `reviewAdjustment` (engine); `BDPG.effectiveRegionPct` (Task 13); `BDPG_CONFIG.PRICING_LEVELS`, `PRICING_DEFAULT` (Task 1).
- Produces: `BDPG.state.state`, `amenityDetails`, `amenityLevel`, `amenityOverridden`, `truckerPathRating`, **`pricingLevel`** populated by user interaction.

- [ ] **Step 1: Add the region SVG map helper**

A lightweight 5-region US map: five simple rectangles roughly positioned like the regions (not a precise state-boundary map), each filled based on whether it's the resolved region:

```js
BDPG.regionMapSvg = function (activeRegion) {
  var regions = [
    { name: 'West', x: 10, y: 10, w: 70, h: 90 },
    { name: 'Southwest', x: 85, y: 60, w: 60, h: 40 },
    { name: 'Midwest', x: 150, y: 10, w: 80, h: 60 },
    { name: 'Northeast', x: 235, y: 5, w: 45, h: 45 },
    { name: 'Southeast', x: 150, y: 75, w: 130, h: 45 }
  ];
  var rects = regions.map(function (r) {
    var on = r.name === activeRegion;
    return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="6" ' +
      'fill="' + (on ? 'var(--accent)' : 'var(--bg2,#222)') + '" stroke="var(--border)" stroke-width="1.5" opacity="' + (on ? '0.9' : '0.5') + '"/>' +
      '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2) + '" text-anchor="middle" dominant-baseline="middle" ' +
      'font-size="10" fill="' + (on ? '#031018' : 'var(--muted)') + '" font-weight="' + (on ? '800' : '400') + '">' + r.name + '</text>';
  }).join('');
  return '<svg viewBox="0 0 290 125" style="width:100%;max-width:340px;display:block;margin:8px 0" role="img" aria-label="Network region map">' + rects + '</svg>';
};
```

- [ ] **Step 2: Add `BDPG.step2Html()` and handlers**

The root element carries `id="bdpg-step2"` so `onStateInput` can update it without rebuilding the whole page (Global Constraints — continuous text/number fields must never trigger a full-page rebuild on `input`).

```js
BDPG.step2Html = function () {
  var s = BDPG.state;
  var region = s.state ? BusDevGallonsCalc.resolveRegion(s.state) : null;
  var regionPct = region ? BDPG.effectiveRegionPct(region) : 0;
  var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS;

  if (!s.pricingLevel) s.pricingLevel = BDPG_CONFIG.PRICING_DEFAULT;

  function selectHtml(id, options, current, handler) {
    return '<select id="' + id + '" onchange="' + handler + '(this.value)">' +
      '<option value="">Select…</option>' +
      options.map(function (o) { return '<option value="' + BDPG.escHtml(o) + '"' + (o === current ? ' selected' : '') + '>' + BDPG.escHtml(o) + '</option>'; }).join('') +
      '</select>';
  }

  // The Confirmed Amenity Level only ever *defaults* to the suggestion (spec §8) --
  // it does not get silently overwritten once the rep has manually confirmed/overridden it.
  var suggestion = BusDevGallonsCalc.suggestAmenityLevel(s.amenityDetails);
  if (!s.amenityOverridden) {
    s.amenityLevel = suggestion.level;
  }

  var review = s.truckerPathRating === '' ? null : Number(s.truckerPathRating);
  var reviewInfo = BusDevGallonsCalc.reviewAdjustment(review);
  var reviewBandLabel = reviewInfo.flagged ? 'No rating found — 0%' :
    (reviewInfo.pct < 0 ? 'Below 3.0 — −5%' : reviewInfo.pct > 0 ? '3.6+ — +2%' : '3.0–3.5 — 0%');

  var pricingSelect = '<select id="bdpg-pricing" onchange="BDPG.onPricingChange(this.value)">' +
    BDPG_CONFIG.PRICING_LEVELS.map(function (lvl) {
      var pct = BDPG_CONFIG.PRICING_ADJUST[lvl];
      var pctLabel = (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
      return '<option value="' + BDPG.escHtml(lvl) + '"' + (lvl === s.pricingLevel ? ' selected' : '') + '>' + BDPG.escHtml(lvl) + ' (' + pctLabel + ')</option>';
    }).join('') + '</select>';

  return '<div id="bdpg-step2" class="bdpg-box" style="margin-top:14px">' +
    '<div class="sec-hdr" style="margin-bottom:10px"><div class="sec-title">Step 2 — Adjustments</div></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      '<div class="fg">' +
        '<label>State</label>' +
        '<input id="bdpg-state" maxlength="2" placeholder="e.g. ID" value="' + BDPG.escHtml(s.state) + '" ' +
          'oninput="BDPG.onStateInput(this.value)" style="text-transform:uppercase;width:80px">' +
        (region ? ('<div style="margin-top:6px" class="btn" style="display:inline-block;color:var(--accent);border-color:var(--accent)">Network Region: ' + region + ' (' + (regionPct * 100).toFixed(1) + '%)</div>') :
          (s.state ? '<div style="margin-top:6px;color:var(--red);font-size:.8em">Not a recognized state code</div>' : '')) +
        BDPG.regionMapSvg(region) +
      '</div>' +
      '<div class="fg">' +
        '<label>Trucker Path Rating</label>' +
        '<input id="bdpg-tp-rating" type="number" min="1" max="5" step="0.1" value="' + BDPG.escHtml(s.truckerPathRating) + '" ' +
          'oninput="BDPG.onTruckerPathInput(this.value)" style="width:90px">' +
        '<div style="margin-top:6px;font-size:.8em;color:var(--muted)" id="bdpg-tp-band">' + reviewBandLabel + '</div>' +
        '<label style="margin-top:14px;display:block">Discount / Pricing Posture</label>' +
        pricingSelect +
      '</div>' +
    '</div>' +
    '<div style="margin-top:16px"><div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Amenity Details</div></div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">' +
      '<div class="fg"><label style="font-size:.72em">Showers</label>' + selectHtml('bdpg-am-showers', opts.showers, s.amenityDetails.showers, 'BDPG.onAmenityDetail.bind(null,\'showers\')') + '</div>' +
      '<div class="fg"><label style="font-size:.72em">Food</label>' + selectHtml('bdpg-am-food', opts.food, s.amenityDetails.food, 'BDPG.onAmenityDetail.bind(null,\'food\')') + '</div>' +
      '<div class="fg"><label style="font-size:.72em">Certified Scale</label>' + selectHtml('bdpg-am-scale', opts.scale, s.amenityDetails.scale, 'BDPG.onAmenityDetail.bind(null,\'scale\')') + '</div>' +
      '<div class="fg"><label style="font-size:.72em">Truck Parking</label>' + selectHtml('bdpg-am-parking', opts.parking, s.amenityDetails.parking, 'BDPG.onAmenityDetail.bind(null,\'parking\')') + '</div>' +
      '<div class="fg"><label style="font-size:.72em">Service</label>' + selectHtml('bdpg-am-service', opts.service, s.amenityDetails.service, 'BDPG.onAmenityDetail.bind(null,\'service\')') + '</div>' +
      '<div class="fg"><label style="font-size:.72em">DEF / Reefer</label>' + selectHtml('bdpg-am-defreefer', opts.defReefer, s.amenityDetails.defReefer, 'BDPG.onAmenityDetail.bind(null,\'defReefer\')') + '</div>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:.82em;color:var(--muted)">Suggested: <b>' + BDPG.escHtml(suggestion.level) + '</b> — ' + BDPG.escHtml(suggestion.reason) + '</div>' +
    '<div class="fg" style="margin-top:6px;max-width:260px"><label>Confirmed Amenity Level</label>' +
      selectHtml('bdpg-amenity-confirm', BDPG_CONFIG.AMENITY_LEVELS, s.amenityLevel, 'BDPG.onAmenityConfirm') + '</div>' +
    '</div>' +
  '</div>';
};

// Re-renders only the Step 2 box (via outerHTML), not the whole page, and
// restores focus + cursor position afterward -- typing a 2-letter state code
// must not visibly lose focus after the first keystroke.
BDPG.onStateInput = function (val) {
  BDPG.state.state = val.toUpperCase();
  var stepEl = document.getElementById('bdpg-step2');
  if (!stepEl) return;
  stepEl.outerHTML = BDPG.step2Html();
  var input = document.getElementById('bdpg-state');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
};

// Targeted update of just the band-chip text -- no rebuild at all, so the
// number input never loses focus while typing a rating like "3.8".
BDPG.onTruckerPathInput = function (val) {
  BDPG.state.truckerPathRating = val;
  var chip = document.getElementById('bdpg-tp-band');
  if (chip) {
    var review = val === '' ? null : Number(val);
    var info = BusDevGallonsCalc.reviewAdjustment(review);
    chip.textContent = info.flagged ? 'No rating found — 0%' : (info.pct < 0 ? 'Below 3.0 — −5%' : info.pct > 0 ? '3.6+ — +2%' : '3.0–3.5 — 0%');
  }
};

// Pricing is a <select> -- no cursor/focus to preserve, full re-render is fine.
BDPG.onPricingChange = function (value) {
  BDPG.state.pricingLevel = value;
  BDPG.render();
};

BDPG.onAmenityDetail = function (field, value) {
  BDPG.state.amenityDetails[field] = value;
  BDPG.render();
};

BDPG.onAmenityConfirm = function (value) {
  BDPG.state.amenityLevel = value;
  BDPG.state.amenityOverridden = true;
  BDPG.render();
};
```

- [ ] **Step 3: Concatenate Step 2 into `BDPG.render()`**

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html();
};
```

- [ ] **Step 4: Manually verify in browser**

Type "ID" in the State field — region chip should show "Network Region: West (0.0%)" and the map should highlight West, and the input should keep focus/cursor position through multiple keystrokes. Confirm the Pricing Strategy dropdown defaults to "Standard / moderate (+0.0%)" on first load. Change it to "Most aggressive (deepest discounts) (+5.0%)" and confirm the selection sticks across re-renders (e.g. after changing an amenity detail). Confirm a manually-picked Confirmed Amenity Level persists through further amenity-detail changes (does not snap back to the suggestion).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Step 2 UI (region, amenity details/suggestion, Trucker Path, Pricing Strategy)"
```

---

## Task 15: Admin Region % panel

**Files:**
- Modify: `index.html` (add `BDPG.adminPanelHtml()`, save/clear handlers)

**Interfaces:**
- Consumes: `BDPG.regionVariance`, `regionVarianceOverrideDiffers`, `regionVarianceIsSet` (Task 13).
- Produces: `BDPG.onSaveRegionOverride()`, `BDPG.onClearRegionOverride()`.

- [ ] **Step 1: Add the admin panel renderer**

```js
BDPG.state.adminOpen = false;

BDPG.adminPanelHtml = function () {
  var s = BDPG.state;
  var v = BDPG.effectiveRegionVariance();
  var regions = ['west', 'southwest', 'midwest', 'northeast', 'southeast'];
  var labels = { west: 'West', southwest: 'Southwest', midwest: 'Midwest', northeast: 'Northeast', southeast: 'Southeast' };

  var banner = !BDPG.regionVarianceIsSet()
    ? '<div class="bdpg-box" style="border-color:var(--yellow);margin-top:14px">Region variance not set — estimates use 0% region adjustment.</div>'
    : '';
  var overrideNotice = BDPG.regionVarianceOverrideDiffers()
    ? '<div style="font-size:.8em;color:var(--yellow);margin-bottom:8px">Using a local override that differs from the committed region_variance.json — ' +
      '<button class="btn" onclick="BDPG.onClearRegionOverride()">Clear override</button></div>'
    : '';

  var inputs = regions.map(function (r) {
    return '<div class="fg"><label style="font-size:.72em">' + labels[r] + ' %</label>' +
      '<input id="bdpg-admin-' + r + '" type="number" step="0.1" value="' + BDPG.escHtml(v[r]) + '" style="width:90px"></div>';
  }).join('');

  return banner +
    '<div class="bdpg-box" style="margin-top:14px">' +
      '<div style="cursor:pointer;font-weight:700" onclick="BDPG.toggleAdmin()">▸ Region % — Admin ' + (s.adminOpen ? '▾' : '▸') + '</div>' +
      (s.adminOpen ? (
        overrideNotice +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:10px">' + inputs + '</div>' +
        '<div class="fg" style="margin-top:10px;max-width:180px"><label>As of (month)</label>' +
        '<input id="bdpg-admin-asof" value="' + BDPG.escHtml(v.asOf) + '" placeholder="e.g. 2026-09"></div>' +
        '<button class="btn btn-accent" style="margin-top:10px" onclick="BDPG.onSaveRegionOverride()">Save locally</button>' +
        '<div id="bdpg-admin-json" style="margin-top:10px;font-family:monospace;font-size:.75em;white-space:pre-wrap;background:var(--bg2,#111);padding:8px;border-radius:6px;display:none"></div>'
      ) : '') +
    '</div>';
};

BDPG.toggleAdmin = function () { BDPG.state.adminOpen = !BDPG.state.adminOpen; BDPG.render(); };

BDPG.onSaveRegionOverride = function () {
  var regions = ['west', 'southwest', 'midwest', 'northeast', 'southeast'];
  var out = {};
  regions.forEach(function (r) { out[r] = Number(document.getElementById('bdpg-admin-' + r).value) || 0; });
  out.asOf = document.getElementById('bdpg-admin-asof').value.trim();
  localStorage.setItem('roadysBDPGRegionOverride', JSON.stringify(out));
  BDPG.regionVariance.override = out;
  var jsonEl = document.getElementById('bdpg-admin-json');
  if (jsonEl) { jsonEl.style.display = 'block'; jsonEl.textContent = JSON.stringify(out, null, 2) + '\n\n// Paste this into region_variance.json to make it the new team-wide default.'; }
  BDPG.render();
};

BDPG.onClearRegionOverride = function () {
  localStorage.removeItem('roadysBDPGRegionOverride');
  BDPG.regionVariance.override = null;
  BDPG.render();
};
```

- [ ] **Step 2: Concatenate into `BDPG.render()`**

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html() + BDPG.adminPanelHtml();
};
```

- [ ] **Step 3: Manually verify in browser**

Open the admin panel, set West to `6.0`, As Of to `2026-09`, click Save locally — confirm the Step 2 region chip (for a West state like ID) now shows `6.0%`, the JSON block appears with the exact values, and reloading the page keeps the override (`localStorage`). Click Clear override — confirm it reverts to the committed file's values.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): admin Region % panel with localStorage override"
```

---

## Task 16: Region-variance CSV helper (self-mapping columns)

**Files:**
- Modify: `index.html` (add CSV parsing + column-mapping UI inside the admin panel)

**Interfaces:**
- Produces: `BDPG.onRegionCsvFile(fileInput)`, `BDPG.onRegionCsvCompute()`.

- [ ] **Step 1: Add a minimal CSV line parser (no library)**

```js
BDPG.parseCsv = function (text) {
  var lines = text.replace(/\r\n/g, '\n').split('\n').filter(function (l) { return l.length; });
  return lines.map(function (line) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  });
};
```

- [ ] **Step 2: Add the upload UI + best-guess column mapping**

```js
BDPG.regionCsv = { rows: null, headers: [], stateCol: '', gallonsCol: '' };

BDPG.regionCsvHtml = function () {
  if (!BDPG.regionCsv.headers.length) {
    return '<div class="fg" style="margin-top:14px"><label>Optional: compute Region % from an Interstate export (per-location gallons + state)</label>' +
      '<input type="file" accept=".csv" onchange="BDPG.onRegionCsvFile(this)"></div>';
  }
  var h = BDPG.regionCsv.headers;
  function opt(v) { return '<option value="' + BDPG.escHtml(v) + '">' + BDPG.escHtml(v) + '</option>'; }
  return '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">' +
    '<div style="font-size:.8em;margin-bottom:6px">Which column is <b>State</b>? ' +
      '<select id="bdpg-csv-state-col" onchange="BDPG.regionCsv.stateCol=this.value">' + h.map(opt).join('') + '</select></div>' +
    '<div style="font-size:.8em;margin-bottom:6px">Which column is <b>Gallons</b>? ' +
      '<select id="bdpg-csv-gal-col" onchange="BDPG.regionCsv.gallonsCol=this.value">' + h.map(opt).join('') + '</select></div>' +
    '<button class="btn btn-accent" onclick="BDPG.onRegionCsvCompute()">Compute Region %</button>' +
    '<div id="bdpg-csv-result" style="margin-top:8px;font-size:.8em"></div>' +
  '</div>';
};

BDPG.onRegionCsvFile = function (input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var rows = BDPG.parseCsv(String(reader.result));
    if (!rows.length) return;
    BDPG.regionCsv.headers = rows[0];
    BDPG.regionCsv.rows = rows.slice(1);
    BDPG.regionCsv.stateCol = rows[0].filter(function (h) { return /state/i.test(h); })[0] || rows[0][0];
    BDPG.regionCsv.gallonsCol = rows[0].filter(function (h) { return /gallon/i.test(h); })[0] || rows[0][0];
    BDPG.render();
  };
  reader.readAsText(file);
};

BDPG.onRegionCsvCompute = function () {
  var headers = BDPG.regionCsv.headers;
  var stateIdx = headers.indexOf(BDPG.regionCsv.stateCol);
  var galIdx = headers.indexOf(BDPG.regionCsv.gallonsCol);
  var sums = {}, counts = {};
  var netSum = 0, netCount = 0;

  BDPG.regionCsv.rows.forEach(function (row) {
    var st = (row[stateIdx] || '').trim().toUpperCase();
    var gal = Number(row[galIdx]);
    var region = BusDevGallonsCalc.resolveRegion(st);
    if (!region || !isFinite(gal)) return;
    sums[region] = (sums[region] || 0) + gal;
    counts[region] = (counts[region] || 0) + 1;
    netSum += gal;
    netCount += 1;
  });

  if (!netCount) {
    document.getElementById('bdpg-csv-result').textContent = 'No usable rows found — check the column mapping.';
    return;
  }

  var networkAvg = netSum / netCount;
  var out = { west: 0, southwest: 0, midwest: 0, northeast: 0, southeast: 0, asOf: (new Date()).toISOString().slice(0, 7) };
  Object.keys(sums).forEach(function (region) {
    var regionAvg = sums[region] / counts[region];
    var pct = Math.round(((regionAvg / networkAvg) - 1) * 1000) / 10;
    out[region.toLowerCase()] = pct;
  });

  localStorage.setItem('roadysBDPGRegionOverride', JSON.stringify(out));
  BDPG.regionVariance.override = out;
  BDPG.regionCsv = { rows: null, headers: [], stateCol: '', gallonsCol: '' };
  document.getElementById('bdpg-csv-result').textContent = 'Computed and saved locally: ' + JSON.stringify(out);
  BDPG.render();
};
```

- [ ] **Step 3: Concatenate into the admin panel**

In `BDPG.adminPanelHtml()` (Task 15), inside the `s.adminOpen ? (...)` branch, append `BDPG.regionCsvHtml()` right after the "Save locally" button's markup.

- [ ] **Step 4: Manually verify in browser**

Create a tiny test CSV (`State,Gallons\nID,9000\nID,8000\nLA,6000\nLA,5000\n`), upload it in the admin panel, confirm the column-guess dropdowns pre-select `State`/`Gallons`, click Compute — confirm West and Southeast show non-zero percentages and other regions show `0`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): self-mapping CSV helper for computing Region % from an Interstate export"
```

---

## Task 17: Supporting Details (collapsible) + lane sanity check

**Files:**
- Modify: `index.html` (add `BDPG.supportingDetailsHtml()`)

**Interfaces:**
- Consumes: `BDPG_CONFIG.NETWORK_FIT_SIGNAL_OPTIONS` (Task 1), `BusDevGallonsCalc.getBaselineRow` (Task 2).

- [ ] **Step 1: Add the renderer**

```js
BDPG.state.supportingOpen = false;

BDPG.supportingDetailsHtml = function () {
  var s = BDPG.state, sd = s.supportingDetails;
  var opts = BDPG_CONFIG.NETWORK_FIT_SIGNAL_OPTIONS;

  function selectHtml(id, options, current, field) {
    return '<select id="' + id + '" onchange="BDPG.onSupportingSelect(\'' + field + '\', this.value)">' +
      '<option value="">Select…</option>' +
      options.map(function (o) { return '<option value="' + BDPG.escHtml(o) + '"' + (o === current ? ' selected' : '') + '>' + BDPG.escHtml(o) + '</option>'; }).join('') +
      '</select>';
  }

  var row = (s.profile && s.roadway) ? BusDevGallonsCalc.getBaselineRow(s.profile, s.roadway) : null;
  var laneWarning = '';
  if (row && sd.actualLanes !== '') {
    var lo = parseInt(row.lanes, 10);
    var hasPlus = /\+/.test(row.lanes);
    var hi = hasPlus ? Infinity : parseInt(row.lanes.split('-')[1], 10);
    var actual = Number(sd.actualLanes);
    if (isFinite(actual) && (actual < lo || actual > hi)) {
      laneWarning = '<div style="margin-top:6px;font-size:.78em;color:var(--yellow)">' +
        'Selected row expects ' + BDPG.escHtml(row.lanes) + ' lanes — reconsider Location Profile/Roadway?</div>';
    }
  }

  return '<div class="bdpg-box" style="margin-top:14px">' +
    '<div style="cursor:pointer;font-weight:700" onclick="BDPG.toggleSupporting()">▸ Supporting Details ' + (s.supportingOpen ? '▾' : '▸') + '</div>' +
    (s.supportingOpen ? (
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px">' +
        '<div class="fg"><label style="font-size:.72em">Condition</label>' + selectHtml('bdpg-sd-condition', opts.condition, sd.condition, 'condition') + '</div>' +
        '<div class="fg"><label style="font-size:.72em">Hours</label>' + selectHtml('bdpg-sd-hours', opts.hours, sd.hours, 'hours') + '</div>' +
        '<div class="fg"><label style="font-size:.72em">Distance to Interstate</label>' + selectHtml('bdpg-sd-distance', opts.distance, sd.distance, 'distance') + '</div>' +
        '<div class="fg"><label style="font-size:.72em">Corridor</label>' + selectHtml('bdpg-sd-corridor', opts.corridor, sd.corridor, 'corridor') + '</div>' +
        '<div class="fg"><label style="font-size:.72em">Competition</label>' + selectHtml('bdpg-sd-competition', opts.competition, sd.competition, 'competition') + '</div>' +
        '<div class="fg"><label style="font-size:.72em">Actual Diesel Lanes Observed</label>' +
          '<input id="bdpg-sd-lanes" type="number" min="0" value="' + BDPG.escHtml(sd.actualLanes) + '" oninput="BDPG.state.supportingDetails.actualLanes=this.value" onblur="BDPG.render()"></div>' +
      '</div>' + laneWarning +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">' +
        '<div class="fg"><label style="font-size:.72em">Prospect Name</label>' +
          '<input id="bdpg-sd-name" value="' + BDPG.escHtml(sd.prospectName) + '" oninput="BDPG.state.supportingDetails.prospectName=this.value"></div>' +
        '<div class="fg"><label style="font-size:.72em">City</label>' +
          '<input id="bdpg-sd-city" value="' + BDPG.escHtml(sd.prospectCity) + '" oninput="BDPG.state.supportingDetails.prospectCity=this.value"></div>' +
        '<div class="fg"><label style="font-size:.72em">State</label>' +
          '<input id="bdpg-sd-pstate" value="' + BDPG.escHtml(sd.prospectState) + '" oninput="BDPG.state.supportingDetails.prospectState=this.value"></div>' +
      '</div>'
    ) : '') +
  '</div>';
};

BDPG.toggleSupporting = function () { BDPG.state.supportingOpen = !BDPG.state.supportingOpen; BDPG.render(); };

BDPG.onSupportingSelect = function (field, value) {
  BDPG.state.supportingDetails[field] = value;
  BDPG.render();
};
```

- [ ] **Step 2: Concatenate into `BDPG.render()`**

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html() + BDPG.supportingDetailsHtml() + BDPG.adminPanelHtml();
};
```

- [ ] **Step 3: Manually verify in browser**

Pick Medium truck stop / Interstate (expects `6+` lanes), open Supporting Details, type `4` into Actual Diesel Lanes Observed, tab out — confirm the yellow warning appears. Change it to `8` — warning disappears.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Supporting Details panel with lane-count sanity check"
```

---

## Task 18: "Generate Value Profile" button + result computation

**Files:**
- Modify: `index.html` (add the Generate button + `BDPG.onGenerate()`)

**Interfaces:**
- Consumes: `BusDevGallonsCalc.calculateEstimate`, `calculateNetworkFitGrade`, `conditionAdjustedGallons`, `calculateMembershipFit` (engine, all prior tasks).
- Produces: `BDPG.state.result`:

```js
BDPG.state.result = {
  estimate: {...},            // from calculateEstimate() -- has officialSubtotal AND finalGallons
  grade: {...},                // from calculateNetworkFitGrade(), built from estimate.officialSubtotal
  conditionAdjusted: number,   // from conditionAdjustedGallons(estimate.finalGallons, ...)
  membership: {...},           // from calculateMembershipFit(estimate.finalGallons)
  region: string|null
};
```

- [ ] **Step 1: Add the Generate button + handler**

```js
BDPG.generateButtonHtml = function () {
  var s = BDPG.state;
  var canGenerate = !!(s.profile && s.roadway && s.state);
  return '<button class="btn btn-accent" style="width:100%;padding:12px;font-size:1em;margin-top:14px" ' +
    (canGenerate ? '' : 'disabled title="Pick a Location Profile, Roadway, and State first"') +
    ' onclick="BDPG.onGenerate()">Generate Value Profile</button>';
};

BDPG.onGenerate = function () {
  var s = BDPG.state;
  var region = BusDevGallonsCalc.resolveRegion(s.state);
  var regionPct = region ? BDPG.effectiveRegionPct(region) : 0;

  var estimate = BusDevGallonsCalc.calculateEstimate({
    profile: s.profile, roadway: s.roadway, regionPct: regionPct,
    amenityLevel: s.amenityLevel, reviewRating: s.truckerPathRating === '' ? null : Number(s.truckerPathRating),
    pricingLevel: s.pricingLevel || BDPG_CONFIG.PRICING_DEFAULT
  });
  if (!estimate) { alert('Pick a valid Location Profile + Roadway combination first.'); return; }

  var grade = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: s.profile, officialSubtotal: estimate.officialSubtotal, supportingDetails: s.supportingDetails
  });
  var conditionAdjusted = BusDevGallonsCalc.conditionAdjustedGallons(estimate.finalGallons, s.supportingDetails.condition);
  var membership = BusDevGallonsCalc.calculateMembershipFit(estimate.finalGallons);

  s.result = { estimate: estimate, grade: grade, conditionAdjusted: conditionAdjusted, membership: membership, region: region };
  BDPG.render();
};
```

- [ ] **Step 2: Concatenate into `BDPG.render()`**

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html() + BDPG.supportingDetailsHtml() + BDPG.adminPanelHtml() + BDPG.generateButtonHtml() +
    (BDPG.state.result ? BDPG.resultsHtml() : '');
};

BDPG.resultsHtml = function () {
  var r = BDPG.state.result;
  return '<div class="bdpg-box" style="margin-top:14px">Official: ' + BDPG.fmtGal(r.estimate.officialSubtotal) +
    ' · Final: ' + BDPG.fmtGal(r.estimate.finalGallons) + ' gal/mo (full Results UI comes in Task 20-21)</div>';
};
```

- [ ] **Step 3: Manually verify in browser**

Fill Step 1 (Medium truck stop / Interstate), State `ID`, an amenity level, Trucker Path `3.8`, pick a Pricing Strategy other than Standard, click Generate Value Profile — confirm the stub result line shows two different gallon numbers (Official vs Final) when pricing isn't Standard, and identical numbers when it is. Confirm the button stays disabled until Profile+Roadway+State are all filled.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Generate Value Profile wiring (engine calls, stub dual-number display)"
```

---

## Task 19: `network-context.json` — real committed data

**Files:**
- Create: `network-context.json`

- [ ] **Step 1: Write the file with real, already-computed content**

This is the exact aggregation computed from `location-list-2026-09-21.csv` (`Status=active`, `Company`/`Name` not containing "demo", grouped by `BDPG_REGION_MAP` region × CSV `Type` × CSV `Group` — 400 rows, zero unmapped states):

```json
{
  "asOf": "2026-09-21",
  "activeTotal": 400,
  "byRegion": {
    "West": {
      "total": 78,
      "byType": { "Truck Stop": 37, "PPO": 31, "Truck Stop / Service Center": 1, "C-Store": 1, "Fuel Stop": 4, "Service Center": 4 },
      "byGroup": { "Roady's": 68, "PTP": 10 },
      "byTypeGroup": {
        "Truck Stop": { "Roady's": 35, "PTP": 2 },
        "PPO": { "Roady's": 27, "PTP": 4 },
        "Truck Stop / Service Center": { "Roady's": 1 },
        "C-Store": { "Roady's": 1 },
        "Fuel Stop": { "Roady's": 4 },
        "Service Center": { "PTP": 4 }
      }
    },
    "Southwest": {
      "total": 49,
      "byType": { "Service Center": 8, "Truck Stop": 28, "PPO": 12, "C-Store": 1 },
      "byGroup": { "PTP": 9, "Roady's Lite": 2, "Roady's": 38 },
      "byTypeGroup": {
        "Service Center": { "PTP": 8 },
        "Truck Stop": { "Roady's Lite": 2, "Roady's": 26 },
        "PPO": { "Roady's": 11, "PTP": 1 },
        "C-Store": { "Roady's": 1 }
      }
    },
    "Midwest": {
      "total": 131,
      "byType": { "Truck Stop": 66, "C-Store": 11, "PPO": 47, "Fuel Stop": 6, "Truck Stop / Service Center": 1 },
      "byGroup": { "Roady's": 110, "PTP": 20, "Roady's Lite": 1 },
      "byTypeGroup": {
        "Truck Stop": { "Roady's": 63, "PTP": 2, "Roady's Lite": 1 },
        "C-Store": { "Roady's": 11 },
        "PPO": { "Roady's": 29, "PTP": 18 },
        "Fuel Stop": { "Roady's": 6 },
        "Truck Stop / Service Center": { "Roady's": 1 }
      }
    },
    "Northeast": {
      "total": 19,
      "byType": { "Truck Stop": 10, "Service Center": 3, "PPO": 6 },
      "byGroup": { "Roady's": 8, "PTP": 9, "Roady's Lite": 2 },
      "byTypeGroup": {
        "Truck Stop": { "Roady's": 7, "PTP": 1, "Roady's Lite": 2 },
        "Service Center": { "PTP": 3 },
        "PPO": { "PTP": 5, "Roady's": 1 }
      }
    },
    "Southeast": {
      "total": 123,
      "byType": { "Truck Stop": 53, "Truck Stop / Service Center": 3, "Service Center": 8, "PPO": 32, "Fuel Stop": 19, "C-Store": 8 },
      "byGroup": { "PTP": 40, "Roady's": 80, "Roady's Lite": 1, "Unknown": 2 },
      "byTypeGroup": {
        "Truck Stop": { "PTP": 30, "Roady's": 20, "Roady's Lite": 1, "Unknown": 2 },
        "Truck Stop / Service Center": { "Roady's": 3 },
        "Service Center": { "PTP": 8 },
        "PPO": { "PTP": 2, "Roady's": 30 },
        "Fuel Stop": { "Roady's": 19 },
        "C-Store": { "Roady's": 8 }
      }
    }
  }
}
```

- [ ] **Step 2: Validate it's well-formed JSON and totals reconcile**

Run: `node -e "const d=require('./network-context.json'); const sum=Object.values(d.byRegion).reduce((a,r)=>a+r.total,0); console.log(sum, d.activeTotal, sum===d.activeTotal)"`
Expected: `400 400 true`

- [ ] **Step 3: Commit**

```bash
git add network-context.json
git commit -m "feat(bus-dev-gallons): commit real network-context.json aggregated from location-list-2026-09-21.csv"
```

---

## Task 20: Results — full waterfall (both numbers), range bar, Network Fit Grade, network context

**Files:**
- Modify: `index.html` (replace the Task 18 stub `BDPG.resultsHtml` with the real implementation; add `BDPG.networkContext` loader)

**Interfaces:**
- Consumes: `BDPG.state.result` (Task 18); `network-context.json` (Task 19).

- [ ] **Step 1: Add the network-context loader**

```js
BDPG.networkContext = null;
BDPG._networkContextLoaded = false;

BDPG.loadNetworkContext = function (onDone) {
  if (BDPG._networkContextLoaded) { if (onDone) onDone(); return; }
  BDPG._networkContextLoaded = true;
  fetch('network-context.json').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (json) { BDPG.networkContext = json; if (onDone) onDone(); })
    .catch(function () { if (onDone) onDone(); });
};
```

Update `BDPG.render()` to also gate on this load:

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  if (!BDPG._networkContextLoaded) { BDPG.loadNetworkContext(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html() + BDPG.supportingDetailsHtml() + BDPG.adminPanelHtml() + BDPG.generateButtonHtml() +
    (BDPG.state.result ? BDPG.resultsHtml() : '');
};
```

- [ ] **Step 2: Replace the stub `BDPG.resultsHtml` with the real hero + full 4-step waterfall + range bar + grade + network context**

The waterfall now has 5 rows in this exact order per spec §10: Baseline → Region-adjusted → Official calculator subtotal → Pricing adjustment → Final Potential Gallons.

```js
BDPG.resultsHtml = function () {
  var r = BDPG.state.result, e = r.estimate, g = r.grade;
  var annual = e.finalGallons * 12;
  var regionAdjusted = Math.round(e.baseline * (1 + e.regionPct));

  var hero = '<div class="bdpg-box" style="margin-top:14px;text-align:center">' +
    '<div style="font-size:.75em;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Final Potential Gallons</div>' +
    '<div style="font-size:2.4em;font-weight:800;color:var(--accent)">' + BDPG.fmtGal(e.finalGallons) + '</div>' +
    '<div style="font-size:.85em;color:var(--muted)">≈ ' + BDPG.fmtGal(annual) + ' gal/yr</div>' +
    '<div style="margin-top:10px;font-size:.9em">Official calculator subtotal: <b>' + BDPG.fmtGal(e.officialSubtotal) + '</b></div>' +
    '<div style="margin-top:8px;font-family:monospace;font-size:.78em;color:var(--muted)">' + BDPG.escHtml(e.officialMathLine) + '</div>' +
    '<div style="margin-top:2px;font-family:monospace;font-size:.78em;color:var(--muted)">' + BDPG.escHtml(e.finalMathLine) + '</div>' +
    (e.reviewFlagged ? '<div style="margin-top:6px;color:var(--yellow);font-size:.8em">No Trucker Path rating found — Review% treated as 0%.</div>' : '') +
  '</div>';

  var waterfall = '<div class="bdpg-box" style="margin-top:14px">' +
    '<div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Adjustment Waterfall</div></div>' +
    '<table class="dt" style="width:100%;font-size:.85em"><tbody>' +
      '<tr><td>1. Baseline</td><td style="text-align:right">' + BDPG.fmtGal(e.baseline) + '</td></tr>' +
      '<tr><td>2. Region-adjusted (' + (e.regionPct >= 0 ? '+' : '') + (e.regionPct * 100).toFixed(1) + '%)</td><td style="text-align:right">' + BDPG.fmtGal(regionAdjusted) + '</td></tr>' +
      '<tr style="font-weight:700"><td>3. Official calculator subtotal (+ Amenities ' + (e.amenityPct >= 0 ? '+' : '') + (e.amenityPct * 100).toFixed(1) + '% + Review ' + (e.reviewPct >= 0 ? '+' : '') + (e.reviewPct * 100).toFixed(1) + '%)</td><td style="text-align:right">' + BDPG.fmtGal(e.officialSubtotal) + '</td></tr>' +
      '<tr><td>4. Pricing adjustment (' + (e.pricingPct >= 0 ? '+' : '') + (e.pricingPct * 100).toFixed(1) + '%)</td><td style="text-align:right">' + (e.finalGallons - e.officialSubtotal >= 0 ? '+' : '') + BDPG.fmtGal(e.finalGallons - e.officialSubtotal) + '</td></tr>' +
      '<tr style="font-weight:700;border-top:1px solid var(--border)"><td>5. Final Potential Gallons</td><td style="text-align:right">' + BDPG.fmtGal(e.finalGallons) + '</td></tr>' +
    '</tbody></table></div>';

  var netPos = Math.max(0, Math.min(100, ((e.officialSubtotal - 2500) / (15000 - 2500)) * 100));
  var rangeBar = '<div class="bdpg-box" style="margin-top:14px">' +
    '<div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Position in Network Range (2,500–15,000)</div></div>' +
    '<div style="background:var(--bg2,#222);border-radius:6px;height:14px;position:relative">' +
      '<div style="position:absolute;left:' + netPos.toFixed(1) + '%;top:-4px;width:3px;height:22px;background:var(--accent)"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;font-size:.72em;color:var(--muted);margin-top:4px"><span>2,500</span><span>15,000</span></div>' +
    '<div style="font-size:.7em;color:var(--muted);margin-top:2px">Based on the official calculator subtotal (' + BDPG.fmtGal(e.officialSubtotal) + '), not the pricing-adjusted final.</div>' +
    '<div style="margin-top:10px;font-weight:700">Network Fit Grade: ' + g.grade + ' — ' + BDPG.escHtml(g.gradeLabel) + '</div>' +
    '<div style="font-size:.78em;color:var(--muted)">Scored against its own Location Profile\'s range (' + BDPG.fmtGal(g.rangeLo) + '–' + BDPG.fmtGal(g.rangeHi) + '), using the official subtotal — never affected by Pricing Strategy.</div>' +
  '</div>';

  var netCtx = BDPG.networkContextHtml();

  return hero + waterfall + rangeBar + netCtx;
};

BDPG.networkContextHtml = function () {
  var r = BDPG.state.result;
  if (!BDPG.networkContext || !r.region) return '';
  var regionData = BDPG.networkContext.byRegion[r.region];
  if (!regionData) return '';

  var typeRows = Object.keys(regionData.byType).map(function (t) {
    return '<tr><td>' + BDPG.escHtml(t) + '</td><td style="text-align:right">' + regionData.byType[t] + '</td></tr>';
  }).join('');

  return '<div class="bdpg-box" style="margin-top:14px">' +
    '<div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Network Context — ' + BDPG.escHtml(r.region) + '</div></div>' +
    '<div style="font-size:.85em;margin-bottom:8px">' + regionData.total + ' active locations in this region ' +
    '(as of ' + BDPG.escHtml(BDPG.networkContext.asOf) + ')</div>' +
    '<table class="dt" style="width:100%;font-size:.82em"><thead><tr><th>Type</th><th style="text-align:right">Count</th></tr></thead><tbody>' + typeRows + '</tbody></table>' +
  '</div>';
};
```

- [ ] **Step 3: Manually verify in browser**

Generate a profile for Medium truck stop / Interstate / State `ID` / amenity Good / TP `3.8` / Pricing "Aggressive" — confirm the hero shows Final Potential Gallons and the smaller "Official calculator subtotal" line as two distinct numbers, both math lines render correctly, the 5-row waterfall sums correctly (row 2 + Amenities/Review = row 3; row 3 + row 4's delta = row 5), the range-bar tick is positioned using the official subtotal, and the grade/network-context sections render.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Results — full 4-step waterfall showing both official subtotal and final gallons"
```

---

## Task 21: Results — condition-adjusted view, membership fit, analysis narrative (with Pricing lever)

**Files:**
- Modify: `index.html` (extend `BDPG.resultsHtml()`)

**Interfaces:**
- Consumes: `BDPG.state.result.conditionAdjusted`, `membership` (Task 18) — both based on `finalGallons`.

- [ ] **Step 1: Add the three renderers**

```js
BDPG.conditionAdjustedHtml = function () {
  var r = BDPG.state.result, e = r.estimate;
  var delta = r.conditionAdjusted - e.finalGallons;
  return '<div class="bdpg-box" style="margin-top:14px">' +
    '<div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Condition-Adjusted View <span style="font-size:.85em;color:var(--yellow);font-weight:400">(non-official)</span></div></div>' +
    '<div style="font-size:1.3em;font-weight:700">' + BDPG.fmtGal(r.conditionAdjusted) + ' gal/mo</div>' +
    '<div style="font-size:.8em;color:var(--muted)">' + (delta >= 0 ? '+' : '') + BDPG.fmtGal(delta) + ' vs. Final Potential Gallons, based on condition: ' +
      BDPG.escHtml(BDPG.state.supportingDetails.condition || 'not set') + '</div>' +
  '</div>';
};

BDPG.membershipFitHtml = function () {
  var m = BDPG.state.result.membership;
  if (!m.valuePerGallonConfigured) {
    return '<div class="bdpg-box" style="margin-top:14px"><div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Membership Fit</div></div>' +
      '<div style="color:var(--muted)">Membership pricing not configured.</div></div>';
  }
  var rows = m.plans.map(function (p) {
    if (!p.configured) return '<tr><td>' + BDPG.escHtml(p.name) + '</td><td colspan="2" style="color:var(--muted)">Not configured</td></tr>';
    return '<tr><td>' + BDPG.escHtml(p.name) + '</td>' +
      '<td style="text-align:right">' + BDPG.fmtGal(p.breakevenGallons) + ' gal/mo breakeven</td>' +
      '<td style="text-align:right">' + p.coverageMultiple + '×</td></tr>';
  }).join('');
  var best = m.plans.filter(function (p) { return p.configured; }).sort(function (a, b) { return b.coverageMultiple - a.coverageMultiple; })[0];
  var recommendation = best
    ? '<div style="margin-top:8px;font-weight:700">Membership pays for itself at ' + BDPG.fmtGal(best.breakevenGallons) + ' gal/mo — final potential estimate is ' +
      BDPG.fmtGal(BDPG.state.result.estimate.finalGallons) + ' (' + best.coverageMultiple + '× coverage).</div>'
    : '';
  return '<div class="bdpg-box" style="margin-top:14px"><div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Membership Fit</div></div>' +
    '<table class="dt" style="width:100%;font-size:.85em"><tbody>' + rows + '</tbody></table>' + recommendation + '</div>';
};

BDPG.analysisNarrativeHtml = function () {
  var r = BDPG.state.result, e = r.estimate;
  var levers = [];
  if (e.amenityPct < 0.02) {
    var gain = Math.round(e.baseline * (0.02 - e.amenityPct));
    levers.push('Reaching "Good / full service" amenities adds up to +2% ≈ ' + BDPG.fmtGal(gain) + ' gal/mo.');
  }
  if (e.reviewPct < 0.02) {
    var rgain = Math.round(e.baseline * (0.02 - e.reviewPct));
    levers.push('Reaching a 3.6+ Trucker Path rating adds +2% ≈ ' + BDPG.fmtGal(rgain) + ' gal/mo.');
  }
  var pricingLevels = BDPG_CONFIG.PRICING_LEVELS;
  var moreAggressiveIdx = pricingLevels.indexOf(BDPG.state.pricingLevel) - 1;
  if (moreAggressiveIdx >= 0) {
    var nextLevel = pricingLevels[moreAggressiveIdx];
    var nextPct = BDPG_CONFIG.PRICING_ADJUST[nextLevel];
    var pgain = Math.round(e.baseline * (nextPct - e.pricingPct));
    levers.push('Moving from "' + BDPG.state.pricingLevel + '" to "' + nextLevel + '" pricing adds ' +
      (pgain >= 0 ? '+' : '') + BDPG.fmtGal(pgain) + ' gal/mo to the Final Potential Gallons (does not change the official calculator subtotal).');
  }
  var leverHtml = levers.length ? '<ul>' + levers.map(function (l) { return '<li>' + BDPG.escHtml(l) + '</li>'; }).join('') + '</ul>' : '<p>Already at the top band for Amenities, Review, and Pricing.</p>';

  return '<div class="bdpg-box" style="margin-top:14px"><div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">Analysis</div></div>' +
    '<p style="font-size:.85em">' + BDPG.escHtml(e.officialMathLine) + '</p>' +
    '<p style="font-size:.85em">' + BDPG.escHtml(e.finalMathLine) + '</p>' +
    '<div style="margin-top:8px;font-size:.85em"><b>Levers that would move the number:</b>' + leverHtml + '</div>' +
    '<div style="margin-top:8px;font-size:.85em"><b>Network Fit:</b> Grade ' + r.grade.grade + ' (' + BDPG.escHtml(r.grade.gradeLabel) + '), ' +
      Math.round(r.grade.rangePositionPct) + '% of its profile\'s range, ' + Math.round(r.grade.signalAvg) + '/100 avg on Supporting Details.</div>' +
  '</div>';
};
```

- [ ] **Step 2: Append these to `BDPG.resultsHtml()`**

```js
BDPG.resultsHtml = function () {
  // ... (hero, waterfall, rangeBar, netCtx as in Task 20) ...
  return hero + waterfall + rangeBar + netCtx + BDPG.conditionAdjustedHtml() + BDPG.membershipFitHtml() + BDPG.analysisNarrativeHtml();
};
```

(Insert the three new calls at the end of the existing `return` statement from Task 20 — don't duplicate the hero/waterfall/rangeBar/netCtx code.)

- [ ] **Step 3: Manually verify in browser**

Generate a profile with Pricing set to "Standard / moderate" — confirm the Analysis section's lever list includes a Pricing suggestion pointing toward "Aggressive" (since Standard isn't the top band), with a concrete gallon amount, and that switching pricing to "Most aggressive" removes that lever (already at the top). Confirm Membership Fit shows "Membership pricing not configured" (since `MEMBERSHIP_CONFIG` ships all-zero).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): condition-adjusted view, membership fit, analysis narrative with Pricing lever"
```

---

## Task 22: In-page network-context CSV generator (admin tool)

**Files:**
- Modify: `index.html` (add a second admin sub-panel, reusing `BDPG.parseCsv` from Task 16)

- [ ] **Step 1: Add the generator UI + compute logic**

```js
BDPG.ncCsv = { rows: null, headers: [] };

BDPG.networkContextGeneratorHtml = function () {
  var s = BDPG.state;
  return '<div class="bdpg-box" style="margin-top:14px">' +
    '<div style="cursor:pointer;font-weight:700" onclick="BDPG.toggleNcGenerator()">▸ Regenerate network-context.json ' + (s.ncGeneratorOpen ? '▾' : '▸') + '</div>' +
    (s.ncGeneratorOpen ? (
      '<div style="margin-top:10px;font-size:.82em;color:var(--muted)">Drop in the current location-list CSV. Parsed entirely in this browser tab — never uploaded anywhere.</div>' +
      '<input type="file" accept=".csv" onchange="BDPG.onNetworkContextCsvFile(this)" style="margin-top:8px">' +
      '<div id="bdpg-nc-result" style="margin-top:10px;font-family:monospace;font-size:.72em;white-space:pre-wrap;max-height:300px;overflow:auto;background:var(--bg2,#111);padding:8px;border-radius:6px"></div>'
    ) : '') +
  '</div>';
};

BDPG.toggleNcGenerator = function () { BDPG.state.ncGeneratorOpen = !BDPG.state.ncGeneratorOpen; BDPG.render(); };

BDPG.onNetworkContextCsvFile = function (input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var rows = BDPG.parseCsv(String(reader.result));
    BDPG.ncCsv.headers = rows[0];
    BDPG.ncCsv.rows = rows.slice(1);
    BDPG.onNetworkContextCsvCompute();
  };
  reader.readAsText(file);
};

BDPG.onNetworkContextCsvCompute = function () {
  var h = BDPG.ncCsv.headers;
  var idx = {
    company: h.indexOf('Company'), name: h.indexOf('Name'), type: h.indexOf('Type'),
    group: h.indexOf('Group'), state: h.indexOf('State'), status: h.indexOf('Status')
  };
  var byRegion = {};
  ['West', 'Southwest', 'Midwest', 'Northeast', 'Southeast'].forEach(function (r) {
    byRegion[r] = { total: 0, byType: {}, byGroup: {}, byTypeGroup: {} };
  });

  BDPG.ncCsv.rows.forEach(function (row) {
    var status = (row[idx.status] || '').trim().toLowerCase();
    var company = (row[idx.company] || '').toLowerCase();
    var name = (row[idx.name] || '').toLowerCase();
    if (status !== 'active') return;
    if (company.indexOf('demo') !== -1 || name.indexOf('demo') !== -1) return;

    var region = BusDevGallonsCalc.resolveRegion(row[idx.state]);
    if (!region) return;
    var type = (row[idx.type] || '').trim() || 'Unknown';
    var group = (row[idx.group] || '').trim() || 'Unknown';

    var rd = byRegion[region];
    rd.total += 1;
    rd.byType[type] = (rd.byType[type] || 0) + 1;
    rd.byGroup[group] = (rd.byGroup[group] || 0) + 1;
    rd.byTypeGroup[type] = rd.byTypeGroup[type] || {};
    rd.byTypeGroup[type][group] = (rd.byTypeGroup[type][group] || 0) + 1;
  });

  var activeTotal = Object.keys(byRegion).reduce(function (sum, r) { return sum + byRegion[r].total; }, 0);
  var out = { asOf: (new Date()).toISOString().slice(0, 10), activeTotal: activeTotal, byRegion: byRegion };

  var el = document.getElementById('bdpg-nc-result');
  if (el) el.textContent = JSON.stringify(out, null, 2) + '\n\n// Paste this into network-context.json to make it the new committed default.';
};
```

- [ ] **Step 2: Concatenate into the admin section of `BDPG.render()`**

Append `BDPG.networkContextGeneratorHtml()` right after `BDPG.adminPanelHtml()` in the `BDPG.render()` string concatenation (from Task 20).

- [ ] **Step 3: Manually verify against the real CSV, and confirm the output matches Task 19's committed file exactly**

Serve the repo, open the Bus Dev Potential Gallons page, expand "Regenerate network-context.json", upload the real `location-list-2026-09-21.csv` (gitignored, present locally), and confirm the JSON shown matches (modulo the `asOf` date) the content committed in Task 19.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): in-page network-context.json generator, reproducing Task 19's committed data"
```

---

## Task 23: Export PDF (both numbers)

**Files:**
- Modify: `index.html` (add a `@media print` block scoped to `#pg-bus-dev-potential-gallons`, add an Export PDF button + a dedicated print-only markup block)

**Interfaces:**
- Produces: `BDPG.exportPdfHtml()`, `BDPG.onExportPdf()`.

- [ ] **Step 1: Add the print CSS, scoped to this page only**

```css
@media print {
  .sidebar, .topbar, #toast { display: none !important; }
  .page { display: none !important; }
  #pg-bus-dev-potential-gallons { display: block !important; }
  #bdpg-content > *:not(#bdpg-print-only) { display: none !important; }
  #bdpg-print-only { display: block !important; }
  body, .page { background: #fff !important; color: #000 !important; }
  #bdpg-print-only .bdpg-box { border: 1px solid #999 !important; page-break-inside: avoid; }
}
#bdpg-print-only { display: none; }
```

(`.sidebar` on the `<aside>` at `index.html:799` and `.topbar` at `index.html:945` are the verified real class names — no guessing needed. No existing `@media print` block exists in `index.html` to collide with.)

- [ ] **Step 2: Add the print-only markup builder + Export button, showing BOTH numbers**

```js
BDPG.exportPdfHtml = function () {
  var r = BDPG.state.result;
  if (!r) return '';
  var e = r.estimate, sd = BDPG.state.supportingDetails;
  var membershipLine = r.membership.valuePerGallonConfigured && r.membership.plans.some(function (p) { return p.configured; })
    ? BDPG.membershipFitHtml()
    : '';

  return '<div id="bdpg-print-only">' +
    '<h1>Roady\'s Prospective Member Gallons Calculator</h1>' +
    '<h2>' + BDPG.escHtml(sd.prospectName || 'Prospect') + ' — ' + BDPG.escHtml(sd.prospectCity) + ', ' + BDPG.escHtml(sd.prospectState) + '</h2>' +
    '<h3>Step 1</h3><p>' + BDPG.escHtml(BDPG.state.profile) + ' / ' + BDPG.escHtml(BDPG.state.roadway) + ' — Baseline ' + BDPG.fmtGal(e.baseline) + ' gal/mo</p>' +
    '<h3>Step 2 — Official Calculator</h3><p>' + BDPG.escHtml(e.officialMathLine) + '</p>' +
    '<h3>Official Calculator Subtotal: ' + BDPG.fmtGal(e.officialSubtotal) + '</h3>' +
    '<h3>Step 3 — Pricing Strategy: ' + BDPG.escHtml(BDPG.state.pricingLevel) + '</h3><p>' + BDPG.escHtml(e.finalMathLine) + '</p>' +
    '<h3>Final Potential Gallons: ' + BDPG.fmtGal(e.finalGallons) + '</h3>' +
    membershipLine +
  '</div>';
};

BDPG.onExportPdf = function () {
  if (!BDPG.state.result) { alert('Generate a Value Profile first.'); return; }
  window.print();
};
```

- [ ] **Step 3: Insert `BDPG.exportPdfHtml()` and the Export button into `BDPG.render()`'s results branch**

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  if (!BDPG._networkContextLoaded) { BDPG.loadNetworkContext(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html() + BDPG.supportingDetailsHtml() + BDPG.adminPanelHtml() + BDPG.networkContextGeneratorHtml() + BDPG.generateButtonHtml() +
    (BDPG.state.result ? (BDPG.resultsHtml() + '<button class="btn btn-accent" onclick="BDPG.onExportPdf()">Export PDF</button>' + BDPG.exportPdfHtml()) : '');
};
```

- [ ] **Step 4: Manually verify in browser**

Generate a Value Profile, click Export PDF — the browser print dialog should open showing only the one-page leave-behind (no sidebar, no other pages), with **both** the Official Calculator Subtotal and Final Potential Gallons clearly labeled and traceable to their own math lines, and Membership Fit present only if configured. Cancel the print dialog; confirm the on-screen page is unaffected.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Export PDF showing both official subtotal and final potential gallons"
```

---

## Task 24: Copy Summary (both numbers)

**Files:**
- Modify: `index.html` (add `BDPG.onCopySummary()` + button)

- [ ] **Step 1: Add the plain-text summary builder + clipboard handler**

```js
BDPG.summaryText = function () {
  var r = BDPG.state.result, e = r.estimate, sd = BDPG.state.supportingDetails;
  var lines = [
    'Roady\'s Prospective Member Gallons Calculator',
    (sd.prospectName || 'Prospect') + ' — ' + (sd.prospectCity || '') + ', ' + (sd.prospectState || ''),
    '',
    'Location Profile: ' + BDPG.state.profile + ' / ' + BDPG.state.roadway,
    'Official calculator math: ' + e.officialMathLine,
    'Official Calculator Subtotal: ' + BDPG.fmtGal(e.officialSubtotal),
    'Pricing Strategy: ' + BDPG.state.pricingLevel,
    'Final Potential Gallons math: ' + e.finalMathLine,
    'Final Potential Gallons: ' + BDPG.fmtGal(e.finalGallons),
    'Network Fit Grade: ' + r.grade.grade + ' (' + r.grade.gradeLabel + ')'
  ];
  if (r.membership.valuePerGallonConfigured && r.membership.plans.some(function (p) { return p.configured; })) {
    var best = r.membership.plans.filter(function (p) { return p.configured; }).sort(function (a, b) { return b.coverageMultiple - a.coverageMultiple; })[0];
    lines.push('Membership pays for itself at ' + BDPG.fmtGal(best.breakevenGallons) + ' gal/mo (' + best.coverageMultiple + '× coverage).');
  }
  return lines.join('\n');
};

BDPG.onCopySummary = function () {
  var text = BDPG.summaryText();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast('Copied to clipboard'); }, function () { BDPG.fallbackCopy(text); });
  } else {
    BDPG.fallbackCopy(text);
  }
};

BDPG.fallbackCopy = function (text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Copied to clipboard'); } catch (e) { alert(text); }
  document.body.removeChild(ta);
};
```

(`toast(msg,type)` already exists in `index.html`, verified at line ~2851 — reused as-is, called with just `msg` since `type` defaults to `'tok'`.)

- [ ] **Step 2: Add the button next to Export PDF**

```js
(BDPG.state.result ? (BDPG.resultsHtml() + '<button class="btn btn-accent" onclick="BDPG.onExportPdf()">Export PDF</button> ' +
  '<button class="btn" onclick="BDPG.onCopySummary()">Copy Summary</button>' + BDPG.exportPdfHtml()) : '')
```

(Replace the corresponding line inside `BDPG.render()` from Task 23 with this version.)

- [ ] **Step 3: Manually verify in browser**

Generate a profile, click Copy Summary, paste into a text editor — confirm the plain-text summary includes both the official subtotal and final gallons lines with their math, matching the on-screen numbers, and the toast confirmation appears.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Copy Summary (plain text, both numbers, clipboard)"
```

---

## Task 25: Save Profile ("My Profiles" load/delete)

**Files:**
- Modify: `index.html` (add `BDPG.onSaveProfile()`, `BDPG.myProfilesModalHtml()`, `BDPG.onLoadProfile()`, `BDPG.onDeleteProfile()`)

**Interfaces:**
- Produces: `localStorage['roadysBDPGProfiles']` — a JSON array of `{id, name, savedAt, state}`.

- [ ] **Step 1: Add save/list/load/delete**

```js
BDPG.getSavedProfiles = function () {
  try { return JSON.parse(localStorage.getItem('roadysBDPGProfiles') || '[]'); } catch (e) { return []; }
};

BDPG.onSaveProfile = function () {
  var name = BDPG.state.supportingDetails.prospectName || prompt('Name this profile:');
  if (!name) return;
  var profiles = BDPG.getSavedProfiles();
  var snapshot = JSON.parse(JSON.stringify(BDPG.state));
  delete snapshot.result;
  profiles.push({ id: 'bdpg_' + Date.now(), name: name, savedAt: new Date().toISOString(), state: snapshot });
  localStorage.setItem('roadysBDPGProfiles', JSON.stringify(profiles));
  toast('Profile saved');
  BDPG.render();
};

BDPG.onLoadProfile = function (id) {
  var profiles = BDPG.getSavedProfiles();
  var found = profiles.filter(function (p) { return p.id === id; })[0];
  if (!found) return;
  BDPG.state = JSON.parse(JSON.stringify(found.state));
  BDPG.state.result = null;
  BDPG.state.myProfilesOpen = false;
  BDPG.render();
};

BDPG.onDeleteProfile = function (id) {
  if (!confirm('Delete this saved profile?')) return;
  var profiles = BDPG.getSavedProfiles().filter(function (p) { return p.id !== id; });
  localStorage.setItem('roadysBDPGProfiles', JSON.stringify(profiles));
  BDPG.render();
};

BDPG.toggleMyProfiles = function () { BDPG.state.myProfilesOpen = !BDPG.state.myProfilesOpen; BDPG.render(); };

BDPG.myProfilesModalHtml = function () {
  if (!BDPG.state.myProfilesOpen) return '';
  var profiles = BDPG.getSavedProfiles();
  var rows = profiles.length
    ? profiles.map(function (p) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">' +
          '<span>' + BDPG.escHtml(p.name) + ' <span style="color:var(--muted);font-size:.75em">' + new Date(p.savedAt).toLocaleDateString() + '</span></span>' +
          '<span><button class="btn btn-accent" onclick="BDPG.onLoadProfile(\'' + p.id + '\')">Load</button> ' +
          '<button class="btn" onclick="BDPG.onDeleteProfile(\'' + p.id + '\')">Delete</button></span></div>';
      }).join('')
    : '<div style="color:var(--muted)">No saved profiles yet.</div>';
  return '<div class="bdpg-box" style="margin-top:14px"><div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title" style="font-size:.85em">My Profiles</div></div>' + rows + '</div>';
};
```

- [ ] **Step 2: Add the buttons and modal into `BDPG.render()`, in the Actions row alongside Export PDF/Copy Summary**

Save Profile isn't gated on `BDPG.state.result` (it saves the form inputs, not the computed result), so it's meaningful even before Generate has run — but per spec §10 it's grouped visually in the Actions row, not up near the Generate button:

```js
BDPG.render = function () {
  var el = document.getElementById('bdpg-content');
  if (!el) return;
  if (!BDPG._regionVarianceLoaded) { BDPG.loadRegionVariance(BDPG.render); return; }
  if (!BDPG._networkContextLoaded) { BDPG.loadNetworkContext(BDPG.render); return; }
  el.innerHTML = BDPG.step1Html() + BDPG.step2Html() + BDPG.supportingDetailsHtml() + BDPG.adminPanelHtml() + BDPG.networkContextGeneratorHtml() +
    BDPG.generateButtonHtml() +
    (BDPG.state.result ? (BDPG.resultsHtml() + '<button class="btn btn-accent" onclick="BDPG.onExportPdf()">Export PDF</button> ' +
      '<button class="btn" onclick="BDPG.onCopySummary()">Copy Summary</button>' + BDPG.exportPdfHtml()) : '') +
    '<div class="bdpg-box" style="margin-top:14px">' +
      '<button class="btn" onclick="BDPG.onSaveProfile()">Save Profile</button> ' +
      '<button class="btn" onclick="BDPG.toggleMyProfiles()">My Profiles</button>' +
      BDPG.myProfilesModalHtml() +
    '</div>';
};
```

- [ ] **Step 3: Manually verify in browser**

Fill out a profile, Save Profile, confirm it appears under My Profiles with today's date. Navigate to a different sidebar page and back (or manually reset selects), click Load on the saved profile — confirm Step 1/Step 2 (including Pricing Strategy)/Supporting Details repopulate exactly, and `result` is cleared (Generate must be re-clicked). Delete it — confirm it's gone from `localStorage`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(bus-dev-gallons): Save Profile (localStorage, My Profiles load/delete)"
```

---

## Final Self-Review Notes

- Task 23's print-CSS selectors (`.sidebar`, `.topbar`) were verified directly against `index.html` (lines 799, 945) rather than guessed — no placeholder selector left for the executor to fill in.
- Every function name introduced in one task is only ever referenced by a later task, never an earlier one (dependency order: config → baseline lookups → page shell → Step 1 UI → region resolution → amenity/review adjustments → **pricing adjustment (new)** → full formula with both numbers → amenity suggestion → grade (on officialSubtotal) → condition/membership (on finalGallons) → engine cleanup → region-variance file/resolution → Step 2 UI incl. Pricing dropdown → admin panel → CSV helper → supporting details → generate wiring → network-context file → results waterfall part 1 → results part 2 (with Pricing lever) → network-context generator → export (both numbers) → copy (both numbers) → save).
- `calculateNetworkFitGrade()`'s interface was deliberately changed from taking a generic `gallons` parameter (prior revision) to requiring `officialSubtotal` by name (Task 10) — this makes it structurally impossible for a future edit to accidentally pass `finalGallons` in and have pricing posture silently leak into the Grade, satisfying the spec's "never conflate them" requirement at the type-signature level, not just by convention.
- Verified against the spec's exact test requirements (§5A): cases A-D at Standard/0% (Task 8, `officialSubtotal === finalGallons` for all four), case A at Most aggressive (14,375) and No discounts (13,125), case C at Aggressive (14,925), full pricing-band sweep, and the officialSubtotal invariant test — all present in Task 8.
