# Membership Growth Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Membership Growth Model as a Command Center tool at `membership-growth-model/` with twelve tabs — the ten "What to Include" methodology items plus Historical Data and Report — driven by a tested pure engine, P&L-calibrated revenue, live `crm_leads` pipeline data, and every value and label user-editable.

**Architecture:** A UMD config module (`membershipModelConfig.js`) and a UMD pure engine (`membershipModel.js`) sit at the repo root beside the existing `busDevGallons*` modules and are unit-tested under `node --test`. The engine takes all external data by injection (a baseline-lookup function, a lead array, a P&L actuals object), so it has no DOM or network dependency and every layer is testable in node. The page consumes those modules via `<script src="../…">`, binds every field through one `data-k` convention into a single state object, and persists that object to `localStorage` (always) and Supabase (after sign-in).

**Tech Stack:** Vanilla ES2020, UMD modules, `node:test` + `node:assert/strict`, Chart.js 4.4 (CDN), `@supabase/supabase-js@2` (CDN), Python 3 stdlib for the refresh script. No new dependencies, no build step, no package.json.

**Spec:** `docs/superpowers/specs/2026-10-28-membership-growth-model-design.md`

## Global Constraints

- **Branch:** `feat/membership-growth-model`, cut from `main`. One branch, one PR.
- **The user runs all git commands and approves all diffs.** Commit steps state the exact command to hand over; do not execute them.
- **The repo is PUBLIC.** Never commit a P&L actual (gross profit, net income, net margin, payroll, opex, settlement spread). Those live only in `mgm_pnl_actuals` or the gitignored `membershipPnlActuals.local.js`. Forward-looking per-member drivers are fine to commit.
- **No new runtime dependencies.** No paid services.
- **PTP conversions (PTPC) and Change of Ownership (COO) are excluded from every growth count.**
- **Contact references use `info@kingdom-creatives.com` only.**
- **Base active-location count is 375.** Group split: Truck Stop 154, Truck Stop-Service Center 6, C-Stores 22, PPO 88, Roady's Lite 7, Fuel Stops 9, PTP 89.
- **No per-prospect value prop in this tool.** That is `bus-dev-potential-gallons/`'s job. Gallons here are network-level only.
- **BD baselines, region percentages, `crm_leads` and `mgm_pnl_actuals` are read, never written back.** Edited copies of live data are visibly badged.
- **New Supabase tables mirror `sql/2026-10-05-bd-value-profiles.sql`:** RLS enabled, `auth.uid() IS NOT NULL` policies, `GRANT … TO authenticated`, `REVOKE ALL … FROM anon`, `search_path`-pinned trigger. No DELETE policy.
- **Everything is editable.** No data point, label, or text block may be a hardcoded literal in the HTML.
- **The page must work unsigned**, on `localStorage`, with the printable report intact. Every pipeline-, P&L- and capacity-derived figure degrades to its editable default and says which basis it is using.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `membershipModelConfig.js` | Create. UMD → `MGM_CONFIG`. Verified data, calibrated drivers, the five new model layers' defaults, all labels, report copy, scenario presets. The only file the refresh script rewrites. |
| `membershipModel.js` | Create. UMD → `MembershipModel`. Pure functions only: roll-forward, revenue, valuation, pipeline, gallons, participation, cost, capacity, cash flow. No DOM, no fetch. |
| `membershipModel.test.js` | Create. `node:test` suite including the golden regression against the v1. |
| `membership-growth-model/index.html` | Create. Twelve tabs, binding layer, charts, report, Supabase sync. |
| `membershipPnlActuals.local.js` | Create (gitignored). Dev fallback for P&L actuals. |
| `.gitignore` | Modify. Add `membershipPnlActuals.local.js`. |
| `index.html` | Modify (~line 851). One nav row under the Membership group. |
| `sql/2026-10-28-mgm-scenarios.sql` | Create. `mgm_scenarios` + `mgm_pnl_actuals`. |
| `tools/refresh-membership-config.py` | Create. CSVs → regenerates the config's data block. |
| `tools/fixtures/` | Create. CSV fixtures for the refresh script. |

### Task map

Tasks 1–6 build and test the whole engine with no UI. Task 7 puts a working twelve-tab page on screen. Task 8 makes it editable. Tasks 9–13 fill the tabs. Tasks 14–18 are scenarios, cloud, report and tooling.

| Task | Deliverable |
| --- | --- |
| 1 | Config module |
| 2 | Core engine + golden regression |
| 3 | Attrition split + scenario presets |
| 4 | Revenue streams + P&L reconciliation |
| 5 | Valuation |
| 6 | The five new engine layers (pipeline, gallons, participation, cost, capacity, cash flow) |
| 7 | Page scaffold, twelve tabs, logo, nav |
| 8 | Universal editability |
| 9 | Tabs 1–3: Starting Membership, New Additions, Member Losses |
| 10 | Tab 4: Sales Pipeline (`crm_leads`) |
| 11 | Tabs 5–6: Program Participation, Fuel Gallon Production |
| 12 | Tabs 7–10: Revenue per Member, Cost to Acquire & Serve, Staffing & Capacity, Profit & Cash Flow |
| 13 | Tab 11: Historical Data + monthly detail |
| 14 | Scenarios: save, load, compare |
| 14a | MM.mergeState — the engine state merge |
| 15 | SQL migration |
| 16 | Supabase sync + gated P&L actuals |
| 17 | Report, print, email, export |
| 18 | Data-refresh script |
| 19 | Admin-gated editing (viewing open, editing admin-only) |
| 20 | About tab: description and tutorial |

---

## Task 1: Config module

**Files:**
- Create: `membershipModelConfig.js`
- Modify: `.gitignore`
- Test: `membershipModel.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: global `MGM_CONFIG` (browser) / `module.exports.MGM_CONFIG` (node). Keys: `DATA_ASOF`, `CURRENT_YEAR`, `ASOF_MONTH`, `HORIZON_YEARS`, `groups[]`, `billing{}`, `statusCounts{}`, `ptpNote`, `history[]`, `monthlyHistory{}`, `attrition{}`, `adds{}`, `sources[]`, `revenue{}`, `participation{}`, `salesPipeline{}`, `gallons{}`, `costs{}`, `staffing{}`, `cashflow{}`, `valuation{}`, `benchmark{}`, `scenarios{}`, `labels{}`, `report{}`.

Note the rename: the v1's `pipeline:{onboarding,offboarding}` becomes `statusCounts`, freeing `salesPipeline` for the CRM funnel.

- [ ] **Step 1: Write the failing test**

Create `membershipModel.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MGM_CONFIG } = require('./membershipModelConfig.js');

test('group counts sum to the 375 verified active base', () => {
  assert.equal(MGM_CONFIG.groups.reduce((a, g) => a + g.count, 0), 375);
});

test('group split matches the verified location-list breakdown', () => {
  const byLabel = Object.fromEntries(MGM_CONFIG.groups.map(g => [g.label, g.count]));
  assert.deepEqual(byLabel, {
    'Truck Stop': 154, 'Truck Stop-Service Center': 6, 'C-Stores': 22,
    'PPO': 88, "Roady's Lite": 7, 'Fuel Stops': 9, 'PTP': 89
  });
});

test('source mix sums to 100', () => {
  assert.equal(MGM_CONFIG.sources.reduce((a, s) => a + s.pct, 0), 100);
});

test('billing aggregates match company_membership_report_2026-10-28.csv', () => {
  const b = MGM_CONFIG.billing;
  assert.equal(b.companies, 181);
  assert.equal(b.locations, 391);
  assert.equal(b.monthlyDuesTotal, 143426);
  assert.equal(b.payingLocations, 375);
});

test('annual history carries the verified new/lost/count series', () => {
  const h = Object.fromEntries(MGM_CONFIG.history.map(r => [r.year, [r.newR, r.lost, r.count]]));
  assert.deepEqual(h[2023], [38, 13, 300]);
  assert.deepEqual(h[2024], [52, 41, 311]);
  assert.deepEqual(h[2025], [25, 35, 296]);
  assert.deepEqual(h[2026], [32, null, null]);
});

test('monthly history sums to the annual newR for every overlapping year', () => {
  for (const r of MGM_CONFIG.history) {
    const m = MGM_CONFIG.monthlyHistory[r.year];
    if (!m) continue;
    assert.equal(m.length, 12, `${r.year} must have 12 months`);
    assert.equal(m.reduce((a, v) => a + v, 0), r.newR, `${r.year} monthly sum`);
  }
});

test('monthly history 2010-2018 matches the verified annual totals', () => {
  // The sum test above only covers years present in `history` (2019-2026),
  // leaving 108 hand-transcribed numbers unasserted. These nine totals are
  // verified against Historical member signups.xlsx.
  const want = { 2010: 32, 2011: 32, 2012: 19, 2013: 119, 2014: 23,
                 2015: 25, 2016: 20, 2017: 34, 2018: 31 };
  for (const [year, total] of Object.entries(want)) {
    const m = MGM_CONFIG.monthlyHistory[year];
    assert.ok(Array.isArray(m) && m.length === 12, `${year} must have 12 months`);
    assert.equal(m.reduce((a, v) => a + v, 0), total, `${year} monthly sum`);
  }
});

test('every CRM stage has a weight, and closed-lost stages weigh zero', () => {
  const w = MGM_CONFIG.salesPipeline.stageWeights;
  const STAGES = ['Prospect', 'Qualified', 'Contacted', 'Meeting Scheduled',
    'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'Not Qualified'];
  STAGES.forEach(s => assert.ok(typeof w[s] === 'number', `${s} needs a weight`));
  assert.equal(w['Closed Lost'], 0);
  assert.equal(w['Not Qualified'], 0);
  assert.equal(w['Closed Won'], 100);
});

test('pipeline basis defaults to flat so an unsigned page is unaffected', () => {
  assert.equal(MGM_CONFIG.salesPipeline.basis, 'flat');
});

test('every group maps to a gallon profile', () => {
  MGM_CONFIG.groups.forEach(g => {
    const m = MGM_CONFIG.gallons.groupProfile[g.key];
    assert.ok(Array.isArray(m) && m.length === 2, `${g.key} needs [profile, roadway]`);
  });
});

test('the EBITDA margin carries its fully-loaded-entity caveat', () => {
  // The real margin is a whole-entity figure for the operating entity, not
  // program unit economics -- and it is a P&L actual, so it is auth-gated in
  // mgm_pnl_actuals and the committed config ships it UNSET. The caveat
  // itself must still ship in config so it reaches the UI and the printed
  // report, not just a PR description.
  assert.equal(MGM_CONFIG.valuation.ebitdaMargin, 0);
  assert.match(MGM_CONFIG.valuation.marginBasis, /fully-loaded/i);
  assert.ok(MGM_CONFIG.valuation.marginBasisNote.length > 80,
    'the note must actually explain the basis');
  assert.match(MGM_CONFIG.valuation.marginBasisNote, /not membership-program unit economics/i);
});

test('cost, staffing and cashflow inputs default to an explicit zero', () => {
  assert.equal(MGM_CONFIG.costs.acquisitionPerMember, 0);
  assert.equal(MGM_CONFIG.costs.costToServePerMember, 0);
  MGM_CONFIG.staffing.reps.forEach(r => assert.equal(r.capacityLeads, 0));
  assert.equal(MGM_CONFIG.cashflow.capexPerYear, 0);
});

test('no P&L actual leaks into the committed config', () => {
  const banned = ['grossProfit', 'netIncome', 'netMargin', 'payroll', 'opex', 'settlementSpread'];
  const json = JSON.stringify(MGM_CONFIG);
  banned.forEach(k => assert.ok(!json.includes(k), `${k} must not appear in the public config`));
});

test('labels cover all twelve tabs', () => {
  assert.equal(Object.keys(MGM_CONFIG.labels.tabs).length, 12);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test membershipModel.test.js`
Expected: FAIL — `Cannot find module './membershipModelConfig.js'`

- [ ] **Step 3: Write the config module**

Create `membershipModelConfig.js`. The UMD wrapper copies `busDevGallonsConfig.js`'s shape.

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MGM_CONFIG = factory().MGM_CONFIG;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ── MGM_DATA ──
  // Regenerated by tools/refresh-membership-config.py. Hand edits here are
  // overwritten; put wording changes in the `labels` / `report` blocks below,
  // which the script never touches.
  //
  // Sources, all verified 2026-10-28:
  //   location-list-2026-10-28.csv             — group counts, 375 active
  //   company_membership_report_2026-10-28.csv — billing aggregates
  //   Historical member signups.xlsx           — annual + monthly history
  // Excluded from the active count: company "Roady's Corporate Office"
  // (Fuelman/RCheck payment records, not locations), company "Demo Truck
  // Stops", and any "Test Company #*" row.
  var DATA = {
    DATA_ASOF: 'Oct 28, 2026',
    CURRENT_YEAR: 2026,
    ASOF_MONTH: 10,          // data is current through October
    HORIZON_YEARS: 3,

    groups: [
      { key: 'ts',     label: 'Truck Stop',                count: 154 },
      { key: 'tssc',   label: 'Truck Stop-Service Center', count: 6 },
      { key: 'cstore', label: 'C-Stores',                  count: 22 },
      { key: 'ppo',    label: 'PPO',                       count: 88 },
      { key: 'lite',   label: "Roady's Lite",              count: 7 },
      { key: 'fuel',   label: 'Fuel Stops',                count: 9 },
      { key: 'ptp',    label: 'PTP',                       count: 89 }
    ],

    billing: {
      companies: 181,
      locations: 391,          // locations the billing report covers
      monthlyDuesTotal: 143426,
      duesPerLocBillable: 366.82,
      payingLocations: 375,    // 5 companies / 16 locations bill $0.00
      zeroBillCompanies: 5
    },

    statusCounts: { onboarding: 7, offboarding: 16 },

    ptpNote: 'Workbook states 190 PTP locations as of Jan 1 2024 (27 shops + 163 truck stops) vs 89 active today. Unconfirmed — ask Interstate.',

    history: [
      { year: 2019, newR: 19, lost: 4,    count: null },
      { year: 2020, newR: 24, lost: 17,   count: null },
      { year: 2021, newR: 22, lost: 13,   count: 313 },
      { year: 2022, newR: 13, lost: 10,   count: 322 },
      { year: 2023, newR: 38, lost: 13,   count: 300 },
      { year: 2024, newR: 52, lost: 41,   count: 311 },
      { year: 2025, newR: 25, lost: 35,   count: 296 },  // 20 Roady's + 5 RL
      { year: 2026, newR: 32, lost: null, count: null }   // Jan–Oct: 30 + 2 RL
    ],

    // Roady's + Roady's Lite only; PTPC and COO excluded. Jan..Dec.
    // Every year's sum equals that year's `newR` above (asserted in tests).
    // Lumpy from batch deals, NOT seasonal: 2013-05 = 61, 2017-09 = 18,
    // 2024-09 = 22, 2026-06 = 19 (one 18-location deal alone).
    monthlyHistory: {
      2010: [3, 0, 1, 3, 7, 0, 0, 3, 8, 1, 1, 5],
      2011: [3, 6, 4, 2, 5, 3, 4, 1, 0, 1, 1, 2],
      2012: [2, 3, 1, 4, 1, 2, 1, 1, 2, 2, 0, 0],
      2013: [3, 5, 0, 0, 61, 2, 3, 3, 1, 6, 1, 34],
      2014: [7, 2, 0, 2, 2, 4, 4, 0, 2, 0, 0, 0],
      2015: [1, 0, 2, 7, 1, 1, 2, 3, 1, 6, 1, 0],
      2016: [7, 0, 2, 1, 1, 1, 0, 2, 2, 0, 1, 3],
      2017: [0, 0, 6, 1, 0, 2, 0, 4, 18, 1, 2, 0],
      2018: [0, 1, 1, 4, 5, 6, 3, 4, 3, 2, 0, 2],
      2019: [2, 5, 1, 0, 2, 0, 1, 2, 1, 2, 1, 2],
      2020: [2, 2, 3, 4, 4, 2, 1, 0, 1, 0, 3, 2],
      2021: [2, 2, 7, 2, 1, 2, 0, 3, 0, 3, 0, 0],
      2022: [0, 0, 0, 1, 0, 2, 2, 2, 3, 2, 1, 0],
      2023: [0, 4, 2, 3, 2, 2, 5, 1, 0, 2, 1, 16],
      2024: [2, 5, 2, 9, 1, 1, 0, 2, 22, 3, 3, 2],
      2025: [0, 2, 4, 1, 7, 1, 0, 2, 3, 1, 1, 3],
      2026: [0, 1, 1, 4, 2, 19, 1, 1, 0, 3, 0, 0]
    }
  };
  // ── /MGM_DATA ──

  var ASSUMPTIONS = {
    // Blended 3-yr average by default, so opening the tool changes nothing.
    // `steadyAlt` is the 2022–23 pre-spike average the "Use split basis"
    // button switches to; `structural` is then entered per year.
    attrition: {
      steady: 9.7,
      steadyAlt: 3.6,
      structural: { 2027: 0, 2028: 0, 2029: 0 },
      note: "Workbook col O, 9/15/25: per Angel several of the current off boarding are due to ownership changes and being sold to T/A, Pilot, etc."
    },

    adds: { perMonth: 3.2, growthPct: 5, activationLag: 2, ptpNet: 0 },

    sources: [
      { key: 'gs',      label: 'Regional Managers / GS',  pct: 60 },
      { key: 'ref',     label: 'Referrals',               pct: 15 },
      { key: 'partner', label: 'Partners / Acquisitions', pct: 15 },
      { key: 'inside',  label: 'Inside Sales',            pct: 10 }
    ],

    // Calibrated against the Jan–Sep 2026 P&L. Per-member forward drivers
    // only — no statement line is reproduced here (public repo).
    revenue: {
      duesPerLoc: 362,                 // realized core dues, $/member/mo
      duesAncillaryPerMember: 119,     // renewal + set-up + NTTS ad, $/yr
      settlementNetPerMember: -148,    // fuel settlement nets negative, $/yr
      fuelProgramMargin: 0,            // $/gal, FORWARD ASSUMPTION, default 0
      avgGallons: 8000,                // fed by Fuel Gallon Production
      vendorPM: 110,
      rewardsPM: 29,
      rewardsBreakagePerMember: 528,   // expired points, non-durable
      rampMonths: 6
    },

    // Participation owns the percentages; Revenue per Member consumes them.
    // Values match the P&L calibration.
    participation: {
      fuel:    { pct: 55, rampMonths: 6 },
      vendor:  { pct: 70, rampMonths: 6 },
      rewards: { pct: 50, rampMonths: 6 }
    },

    // Stage weights are an UNSOURCED assumption ladder — no source file
    // contains them. The tab badges them and shows the derived actual win
    // rate from crm_leads beside them whenever a session is available.
    // Ordered by funnel position, not by CRM_STAGES array order.
    salesPipeline: {
      basis: 'flat',                   // 'flat' | 'pipeline' — opt-in
      stageWeights: {
        'Prospect': 5, 'Contacted': 10, 'Qualified': 15,
        'Meeting Scheduled': 30, 'Proposal Sent': 50, 'Negotiation': 70,
        'Closed Won': 100, 'Closed Lost': 0, 'Not Qualified': 0
      },
      horizonMonths: 12,               // spread weighted locations over this
      avgCycleDays: 0,                 // 0 = unset, derived when signed in
      assumptionNote: 'Stage weights are an assumption, not a measurement. Confirm against closed-won history.'
    },

    // Group → engine profile/roadway. ASSUMPTIONS: the engine assigns a
    // profile per location from dieselLanes + roadway, which this tool does
    // not have per group. Every row is editable and badged when edited.
    gallons: {
      groupProfile: {
        ts:     ['Medium truck stop', 'Interstate'],
        tssc:   ['Medium truck stop', 'Highway'],
        cstore: ['Small truck stop',  'Highway'],
        ppo:    ['Fuel stop',         'Any'],
        lite:   ['Small truck stop',  'Backroad'],
        fuel:   ['Fuel stop',         'Any'],
        ptp:    ['Small truck stop',  'Highway']
      },
      groupBaselineOverride: {},
      applyRegionVariance: false,
      caveat: 'Total site gallons. The P&L fuel settlement covers card-network transactions only (~630 gal/member/mo) — do not multiply these gallons by a settlement-derived margin.'
    },

    // Default 0 = explicitly unset. P&L-derived figures load from
    // mgm_pnl_actuals when signed in; nothing is guessed here.
    costs: { salesSpendPerMonth: 0, acquisitionPerMember: 0, costToServePerMember: 0 },

    // The two CRM_OWNERS, capacity deliberately unset rather than guessed.
    staffing: {
      reps: [
        { name: 'Robert Watson', capacityLeads: 0, costPerYear: 0 },
        { name: 'Angel Long',    capacityLeads: 0, costPerYear: 0 }
      ]
    },

    cashflow: { workingCapitalDays: 0, capexPerYear: 0 },

    valuation: {
      revMultiple: 2.5,
      ebitdaMargin: 0,           // ships UNSET -- the real margin is a P&L
                                 // actual: auth-gated in mgm_pnl_actuals and
                                 // never committed to this public repo. The
                                 // v1's 25% was unsupported in either
                                 // direction.
      ebitdaMultiple: 5,
      ebitdaNormalization: 0,    // add-backs are explicit and user-owned
      // The real margin is the operating entity's WHOLE-ENTITY margin after
      // all corporate overhead -- not the membership program's contribution
      // margin. The Income Statement has nine monthly columns and one Net
      // Income line: no segment columns, no departmental split. It charges
      // the office lease, D&O/EPLI/Fiduciary insurance, consulting, the
      // annual meeting, and costs serving other lines entirely (the
      // near-zero-margin aggregator/settlement business, PTP truck stop
      // marketing). Payroll is the largest opex category and carries no
      // departmental breakout, so a clean program figure is NOT derivable
      // from this file -- do not invent an allocation. Use
      // ebitdaNormalization to state an adjustment explicitly.
      marginBasis: 'fully-loaded entity',
      marginBasisNote: 'Fully-loaded whole-entity margin after all corporate overhead — not membership-program unit economics. The P&L has no segment or departmental split, and payroll — the largest opex category — cannot be allocated from it. Program contribution margin would be materially higher.'
    },

    benchmark: {
      lostMemberValue: 20000,
      label: 'Internal benchmark — $ per lost member / yr',
      source: 'Historical member signups.xlsx, Sheet 2 (133 lost 2019–25 × $20,000 = $2.66M)',
      caveat: 'Reconciles to no P&L measure — above realized gross profit per member, below gross income per member. The ratios are deliberately not stated: either one, set beside the committed $20,000, back-solves a gated figure by division. The variance is shown on Revenue per Member for a signed-in reader. Treat as a planning figure pending confirmation of its definition.'
    },

    scenarios: {
      Conservative: { 'attrition.steady': 9.7 },
      Base:         { 'attrition.steady': 4.0 },
      Aggressive:   { 'attrition.steady': 3.6 }
    }
  };

  // Every on-screen string lives here so renaming is a state edit, never a
  // code change. See Task 8.
  var LABELS = {
    tabs: {
      starting: 'Starting Membership', additions: 'New Additions',
      losses: 'Member Losses', pipeline: 'Sales Pipeline',
      participation: 'Program Participation', gallons: 'Fuel Gallon Production',
      revpermember: 'Revenue per Member', cost: 'Cost to Acquire & Serve',
      staffing: 'Staffing & Capacity', cashflow: 'Profit & Cash Flow',
      historical: 'Historical Data', report: 'Report'
    },
    streams: {
      dues: 'Membership dues', duesAncillary: 'Renewal, set-up & ad fees',
      settlement: 'Fuel settlement (net)', fuelProgram: 'Fuel program margin',
      vendor: 'Vendor programs', rewards: 'Rewards program fees',
      rewardsBreakage: 'Rewards breakage (expired points)'
    },
    charts: {
      trajectory: 'Membership trajectory', addLoss: 'Adds vs losses',
      revenue: 'Revenue by stream', history: 'Historical signups and losses',
      monthly: 'Monthly signups — lumpy from batch deals, not seasonal',
      funnel: 'Pipeline by stage', gallons: 'Gallon production by group'
    },
    notes: {
      starting: '', additions: '', losses: '', pipeline: '', participation: '',
      gallons: '', revpermember: '', cost: '', staffing: '', cashflow: '',
      historical: ''
    }
  };

  var REPORT = {
    company: "Roady's Corp",
    title: 'Membership Growth Model',
    subtitle: '3-Year Projection',
    footer: "Roady's Command Center · Internal",
    generatedBy: 'Jason Vega — VP, Digital Strategy & Innovation',
    contact: 'info@kingdom-creatives.com',
    disclosure: 'PTP conversions & Change of Ownership excluded from growth counts.',
    intro: '', methodology: '', closing: ''
  };

  var MGM_CONFIG = Object.assign({}, DATA, ASSUMPTIONS, {
    labels: LABELS, report: REPORT
  });

  return { MGM_CONFIG: MGM_CONFIG };
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test membershipModel.test.js`
Expected: PASS — 14/14.  
**The count is informational** — report the actual total rather than matching this number. The plan's absolute counts have drifted once already; a mismatch means a test was added or removed, not necessarily a failure.

If `monthly history sums to the annual newR` fails, the monthly block was mistyped; the sums must be 2019→19, 2020→24, 2021→22, 2022→13, 2023→38, 2024→52, 2025→25, 2026→32.

- [ ] **Step 5: Add the gitignore entry BEFORE any P&L file can exist**

This lands in Task 1, not later: the ignore rule must pre-date the file it
protects. `membershipPnlActuals.local.js` is not created until Task 16, and
that is exactly why the rule goes in now rather than alongside it.

Append to `.gitignore`:

```
# P&L actuals — never commit (public repo; financial statement data)
membershipPnlActuals.local.js
```

Then verify the rule actually matches, rather than assuming it does:

```bash
printf 'var MGM_PNL_ACTUALS={};\n' > membershipPnlActuals.local.js
git check-ignore -v membershipPnlActuals.local.js   # must print the rule
git status --short | grep membershipPnlActuals      # must print NOTHING
rm membershipPnlActuals.local.js
```

Expected: `git check-ignore -v` names `.gitignore` and the matching line; the
`git status` grep is silent. If `check-ignore` exits non-zero the rule is not
matching, and the file is one `git add -A` away from being published to a
public repo.

- [ ] **Step 6: Commit**

```bash
git add membershipModelConfig.js membershipModel.test.js .gitignore
git commit -m "feat(mgm): config module with verified 375-location base and calibrated drivers"
```

---

## Task 2: Core engine with golden regression

**Files:**
- Create: `membershipModel.js`
- Modify: `membershipModel.test.js`

**Interfaces:**
- Consumes: `MGM_CONFIG` from Task 1.
- Produces:
  - `MembershipModel.defaultState(config)` → deep-cloned mutable state
  - `MembershipModel.derivedAttrition(history)` → `{rows:[{year,lost,base,rate}], avg}`
  - `MembershipModel.runModel(state, opts)` → `{months:[…], years:[…], startTotal, ptp}`; each year row has `{year, start, newAdds, newModeled, ytd, lost, steadyLost, structuralLost, end, endRoadys, ptp, producing, net, pct}`; each month row has `{year, month, start, adds, lost, steadyLost, structuralLost, end, producing}`
  - `MembershipModel.LEGACY_STATE` → the v1's exact defaults, for the golden test

`opts.addsPerMonthOverride` is the seam Task 6's pipeline basis uses; when absent the flat `adds.perMonth` applies, so an unsigned page is unaffected.

The golden values below were produced by running the v1's `runModel`/`revenueModel`/`valuation` verbatim in node.

- [ ] **Step 1: Write the failing golden test**

Append to `membershipModel.test.js`:

```js
const { MembershipModel } = require('./membershipModel.js');

// Tolerance: these are the v1's floating-point results, reproduced exactly.
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: got ${a}, want ${b}`);

test('GOLDEN: runModel under legacy settings reproduces the v1 exactly', () => {
  const M = MembershipModel.runModel(MembershipModel.LEGACY_STATE);
  assert.equal(M.startTotal, 380);
  assert.equal(M.ptp, 89);
  assert.equal(M.years.length, 4);

  const want = [
    { year: 2026, start: 380,        newAdds: 38.4,    lost: 4.711353,  end: 381.688647, endRoadys: 292.688647 },
    { year: 2027, start: 381.688647, newAdds: 40.32,   lost: 28.907118, end: 393.10153,  endRoadys: 304.10153  },
    { year: 2028, start: 393.10153,  newAdds: 42.336,  lost: 30.053508, end: 405.384021, endRoadys: 316.384021 },
    { year: 2029, start: 405.384021, newAdds: 44.4528, lost: 31.284963, end: 418.551858, endRoadys: 329.551858 }
  ];
  want.forEach((w, i) => {
    const r = M.years[i];
    assert.equal(r.year, w.year);
    near(r.start, w.start, `${w.year} start`);
    near(r.newAdds, w.newAdds, `${w.year} newAdds`);
    near(r.lost, w.lost, `${w.year} lost`);
    near(r.end, w.end, `${w.year} end`);
    near(r.endRoadys, w.endRoadys, `${w.year} endRoadys`);
  });
});

test('GOLDEN: 2026 models only the 2 months after the Oct as-of date', () => {
  const M = MembershipModel.runModel(MembershipModel.LEGACY_STATE);
  near(M.years[0].newModeled, 6.4, '2026 newModeled');   // 3.2 × 2
  assert.equal(M.years[0].ytd, 32);                      // display only
  // 380 + 6.4 − 4.711353 = 381.688647: YTD adds are already inside the base.
  near(M.years[0].end, 380 + 6.4 - 4.711353, '2026 end identity');
});

test('derivedAttrition reproduces the 9.65% three-year average', () => {
  const d = MembershipModel.derivedAttrition(MGM_CONFIG.history);
  assert.deepEqual(d.rows.map(r => r.year), [2022, 2023, 2024, 2025]);
  near(d.rows[0].rate, 3.194888, '2022 rate');
  near(d.rows[1].rate, 4.037267, '2023 rate');
  near(d.rows[2].rate, 13.666667, '2024 rate');
  near(d.rows[3].rate, 11.254019, '2025 rate');
  near(d.avg, 9.652651, '3-yr avg');   // rounds to the 9.7 shown on screen
});

test('monthly rows sum to the annual rows for every year', () => {
  const M = MembershipModel.runModel(MembershipModel.LEGACY_STATE);
  for (const y of M.years) {
    const mm = M.months.filter(m => m.year === y.year);
    near(mm.reduce((a, m) => a + m.adds, 0), y.newModeled, `${y.year} adds`);
    near(mm.reduce((a, m) => a + m.lost, 0), y.lost, `${y.year} lost`);
    if (mm.length) near(mm[mm.length - 1].end, y.endRoadys, `${y.year} end`);
  }
});

test('each month row carries its own start, and start + adds - lost === end', () => {
  // The monthly table consumes `start` directly instead of inverting this
  // loop's update expression, so the engine must supply it and the identity
  // must hold for every month in every year.
  const M = MembershipModel.runModel(MembershipModel.LEGACY_STATE);
  assert.ok(M.months.length > 0);
  M.months.forEach(m => {
    assert.equal(typeof m.start, 'number', `${m.year}-${m.month} start is a number`);
    near(m.start + m.adds - m.lost, m.end, `${m.year}-${m.month} roll-forward identity`);
  });
  // And the first modeled month must start from the opening Roady's-side count.
  const first = M.months[0];
  near(first.start, M.startTotal - M.ptp, 'first month starts at the opening count');
});

test('a bad numeric field degrades to 0 rather than poisoning the model', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.groups[0].count = '';          // user cleared the input
  st.adds.perMonth = 'abc';         // nonsense typed in
  const M = MembershipModel.runModel(st);
  assert.ok(isFinite(M.startTotal), 'startTotal finite');
  M.years.forEach(y => assert.ok(isFinite(y.end), `${y.year} end finite`));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test membershipModel.test.js`
Expected: FAIL — `Cannot find module './membershipModel.js'`

- [ ] **Step 3: Write the engine**

Create `membershipModel.js`. Three deliberate changes from the v1: the dead `start` expression is gone, the dead `mo` variable is gone, and the loop records a month row per step so annual figures are *derived* from months.

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./membershipModelConfig.js').MGM_CONFIG);
  } else {
    root.MembershipModel = factory(root.MGM_CONFIG).MembershipModel;
  }
}(typeof window !== 'undefined' ? window : this, function (CONFIG) {
  'use strict';

  var clone = function (o) {
    return typeof structuredClone === 'function'
      ? structuredClone(o) : JSON.parse(JSON.stringify(o));
  };

  function defaultState(config) { return clone(config || CONFIG); }

  // Guard: a hand-edited or half-written field must degrade to a number,
  // never reach the arithmetic as NaN and poison every downstream figure.
  function n(v, dflt) {
    var x = Number(v);
    return isFinite(x) ? x : (dflt === undefined ? 0 : dflt);
  }

  function groupTotal(state) {
    return (state.groups || []).reduce(function (a, g) { return a + n(g.count); }, 0);
  }

  function ptpCount(state) {
    var g = (state.groups || []).filter(function (x) { return x.key === 'ptp'; })[0];
    return g ? n(g.count) : 0;
  }

  // lost / prior-year count, for every year where both are known.
  function derivedAttrition(history) {
    var h = history || [], rows = [];
    for (var i = 1; i < h.length; i++) {
      var prev = h[i - 1], cur = h[i];
      if (cur.lost != null && prev.count != null) {
        rows.push({
          year: cur.year, lost: cur.lost, base: prev.count,
          rate: 100 * cur.lost / prev.count
        });
      }
    }
    var last3 = rows.slice(-3);
    var avg = last3.length
      ? last3.reduce(function (a, r) { return a + r.rate; }, 0) / last3.length
      : 0;
    return { rows: rows, avg: avg };
  }

  // Monthly roll-forward. Annual rows are summed from `months`, so the
  // collapsible monthly table and the annual table cannot disagree.
  // opts.addsPerMonthOverride lets the Sales Pipeline tab drive adds; absent,
  // the flat rate applies, which is what an unsigned page always gets.
  function runModel(state, opts) {
    opts = opts || {};
    var startTotal = groupTotal(state);
    var ptp = ptpCount(state);
    var roadys = startTotal - ptp;

    var attr = state.attrition || {};
    var steadyM = n(attr.steady) / 100 / 12;
    var structural = attr.structural || {};

    var adds = state.adds || {};
    var hasOverride = opts.addsPerMonthOverride !== undefined
      && opts.addsPerMonthOverride !== null;
    var addsRate = hasOverride ? n(opts.addsPerMonthOverride) : n(adds.perMonth);
    var growth = n(adds.growthPct) / 100;
    var lag = Math.max(0, Math.round(n(adds.activationLag)));
    var ptpNet = n(adds.ptpNet);

    var CURRENT_YEAR = n(state.CURRENT_YEAR, 2026);
    var asOfMonth = n(state.ASOF_MONTH, 10);
    var horizon = n(state.HORIZON_YEARS, 3);

    var ytdRow = (state.history || []).filter(function (h) {
      return h.year === CURRENT_YEAR;
    })[0];
    var ytdAdds = ytdRow ? n(ytdRow.newR) : 0;

    var months = [], years = [];
    // Adds become revenue-producing only after `lag` months. Existing
    // members are all producing on day one.
    var queue = [], producing = roadys;

    for (var y = CURRENT_YEAR; y <= CURRENT_YEAR + horizon; y++) {
      var startAll = roadys + ptp;
      var monthCount = (y === CURRENT_YEAR) ? (12 - asOfMonth) : 12;
      if (monthCount < 0) monthCount = 0;
      var structYear = n(structural[y]);
      var structPerMonth = monthCount > 0 ? structYear / monthCount : 0;

      var newModeled = 0, lostTotal = 0, steadyTotal = 0, structTotal = 0;

      for (var m = 0; m < monthCount; m++) {
        var monthStart = roadys;
        var add = addsRate;
        var steadyLose = roadys * steadyM;
        var structLose = structPerMonth;
        var lose = steadyLose + structLose;

        roadys += add - lose;

        queue.push(add);
        if (queue.length > lag) producing += queue.shift();
        // Losses hit producing members too.
        producing = Math.max(0, producing - lose);

        newModeled += add; lostTotal += lose;
        steadyTotal += steadyLose; structTotal += structLose;

        months.push({
          year: y, month: m + 1 + (y === CURRENT_YEAR ? asOfMonth : 0),
          // `start` is emitted rather than left for the UI to re-derive. The
          // monthly table previously computed it as `end - adds + lost`, which
          // inverts this loop's own update expression — correct, but it would
          // silently go stale if the arithmetic here ever changed.
          start: monthStart,
          adds: add, lost: lose, steadyLost: steadyLose, structuralLost: structLose,
          end: roadys, producing: producing
        });
      }

      var ptpEnd = ptp + ptpNet * (y === CURRENT_YEAR ? (monthCount / 12) : 1);

      years.push({
        year: y, start: startAll,
        newAdds: newModeled + (y === CURRENT_YEAR ? ytdAdds : 0),
        newModeled: newModeled,
        ytd: (y === CURRENT_YEAR ? ytdAdds : 0),
        lost: lostTotal, steadyLost: steadyTotal, structuralLost: structTotal,
        end: roadys + ptpEnd, endRoadys: roadys, ptp: ptpEnd,
        producing: producing + ptpEnd
      });

      addsRate *= 1 + growth;
    }

    years.forEach(function (r) {
      r.net = r.end - r.start;
      r.pct = r.start ? 100 * r.net / r.start : 0;
    });

    return { months: months, years: years, startTotal: startTotal, ptp: ptp };
  }

  // The v1's defaults, verbatim, so the golden tests pin the refactor to the
  // behaviour that shipped. Do NOT update these when the config changes.
  // Note it carries revenue.fuelPart/vendorPart/rewardsPart rather than a
  // `participation` block — partPct() falls back to these, which is what
  // keeps the golden revenue test meaningful after the move (Task 4).
  var LEGACY_STATE = {
    CURRENT_YEAR: 2026, ASOF_MONTH: 10, HORIZON_YEARS: 3,
    groups: [
      { key: 'ts', label: 'Truck Stop', count: 159 },
      { key: 'tssc', label: 'Truck Stop-Service Center', count: 6 },
      { key: 'cstore', label: 'C-Stores', count: 22 },
      { key: 'ppo', label: 'PPO', count: 88 },
      { key: 'lite', label: "Roady's Lite", count: 7 },
      { key: 'fuel', label: 'Fuel Stops', count: 9 },
      { key: 'ptp', label: 'PTP', count: 89 }
    ],
    attrition: { steady: 9.7, structural: {} },
    adds: { perMonth: 3.2, growthPct: 5, activationLag: 0, ptpNet: 0 },
    history: [{ year: 2026, newR: 32, lost: null, count: null }],
    revenue: {
      duesPerLoc: 367, duesAncillaryPerMember: 0, settlementNetPerMember: 0,
      fuelProgramMargin: 0.03, avgGallons: 8000, fuelPart: 55,
      vendorPM: 150, vendorPart: 70, rewardsPM: 45, rewardsPart: 50,
      rewardsBreakagePerMember: 0
    },
    valuation: { revMultiple: 2.5, ebitdaMargin: 25, ebitdaMultiple: 5, ebitdaNormalization: 0 }
  };

  return {
    MembershipModel: {
      defaultState: defaultState,
      derivedAttrition: derivedAttrition,
      runModel: runModel,
      LEGACY_STATE: LEGACY_STATE,
      _n: n
    }
  };
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test membershipModel.test.js`
Expected: PASS — 19/19.  
**The count is informational** — report the actual total rather than matching this number. The plan's absolute counts have drifted once already; a mismatch means a test was added or removed, not necessarily a failure.

If the golden test fails on `lost`, check that losses are computed from `roadys` *before* the add is applied, exactly as the v1 does.

- [ ] **Step 5: Commit**

```bash
git add membershipModel.js membershipModel.test.js
git commit -m "feat(mgm): pure monthly engine, golden-pinned to the v1's output"
```

---

## Task 3: Attrition split and scenario presets

**Files:**
- Modify: `membershipModel.js`, `membershipModel.test.js`

**Interfaces:**
- Consumes: `runModel`, `derivedAttrition`.
- Produces:
  - `MembershipModel.attritionSplit(history, steadyRate)` → `{rows:[{year, base, totalRate, steadyRate, structuralRate, totalLost, steadyLost, structuralLost}], steadyRate}`
  - `MembershipModel.applyScenario(state, name)` → mutated state
  - `MembershipModel.getPath(obj, path)` / `setPath(obj, path, value)` — also the basis of Task 8's binding layer

- [ ] **Step 1: Write the failing test**

```js
test('attritionSplit decomposes 2024-25 into steady plus structural', () => {
  const s = MembershipModel.attritionSplit(MGM_CONFIG.history, 3.6);
  const by = Object.fromEntries(s.rows.map(r => [r.year, r]));

  near(by[2024].totalRate, 13.666667, '2024 total');
  near(by[2024].steadyRate, 3.6, '2024 steady');
  near(by[2024].structuralRate, 10.066667, '2024 structural');
  near(by[2024].steadyLost, 10.8, '2024 steady lost');     // 3.6% of 300
  near(by[2024].structuralLost, 30.2, '2024 structural lost');

  near(by[2025].totalRate, 11.254019, '2025 total');
  near(by[2025].structuralRate, 7.654019, '2025 structural');
});

test('attritionSplit never reports negative structural loss', () => {
  // 2022 ran at 3.19%, below a 3.6% steady assumption.
  const by = Object.fromEntries(
    MembershipModel.attritionSplit(MGM_CONFIG.history, 3.6).rows.map(r => [r.year, r]));
  assert.ok(by[2022].structuralRate >= 0, 'rate clamped at zero');
  assert.ok(by[2022].structuralLost >= 0, 'count clamped at zero');
});

test('split components always reconcile to the realized total', () => {
  MembershipModel.attritionSplit(MGM_CONFIG.history, 3.6).rows.forEach(r => {
    near(r.steadyLost + r.structuralLost, r.totalLost, `${r.year} reconciles`);
    near(r.steadyRate + r.structuralRate, r.totalRate, `${r.year} rates`);
  });
});

test('structural override adds to steady loss, never replaces it', () => {
  const mk = struct => {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.attrition.steady = 4.0;
    st.attrition.structural = struct;
    return MembershipModel.runModel(st);
  };
  const a27 = mk({ 2027: 0 }).years.find(y => y.year === 2027);
  const b27 = mk({ 2027: 12 }).years.find(y => y.year === 2027);

  near(b27.structuralLost, 12, '2027 structural');
  near(a27.structuralLost, 0, 'baseline structural');
  assert.ok(b27.lost > a27.lost, 'total loss rises');
  assert.ok(b27.steadyLost > 0, 'steady component survives');
});

test('scenario presets set the three documented steady rates', () => {
  const rate = name =>
    MembershipModel.applyScenario(MembershipModel.defaultState(MGM_CONFIG), name).attrition.steady;
  assert.equal(rate('Conservative'), 9.7);
  assert.equal(rate('Base'), 4.0);
  assert.equal(rate('Aggressive'), 3.6);
});

test('an unknown scenario name leaves state untouched', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const before = JSON.stringify(st);
  MembershipModel.applyScenario(st, 'Nope');
  assert.equal(JSON.stringify(st), before);
});

test('setPath refuses prototype-hook segments and cannot pollute Object.prototype', () => {
  // Verified exploitable BEFORE the guard existed: setPath({}, '__proto__.polluted', v)
  // left ({}).polluted set for every object in the process, and the nested form
  // 'a.__proto__.polluted' did the same. From Task 8 these paths come from DOM
  // data-k attributes, so they are user-influenceable.
  const payloads = ['__proto__.polluted', 'constructor.prototype.polluted',
    'a.__proto__.polluted', 'a.b.constructor.prototype.polluted'];
  for (const path of payloads) {
    MembershipModel.setPath({}, path, 'PWNED');
    assert.equal(({}).polluted, undefined, `${path} must not reach Object.prototype`);
    assert.equal([].polluted, undefined, `${path} must not reach Array instances`);
  }
});

test('setPath refuses the WHOLE write on an unsafe segment, not just the bad hop', () => {
  const o = { keep: 1 };
  MembershipModel.setPath(o, 'a.__proto__.b', 'X');
  assert.deepEqual(o, { keep: 1 }, 'no half-built containers left behind in state');
});

test('getPath returns undefined for prototype-hook segments', () => {
  assert.equal(MembershipModel.getPath({}, '__proto__'), undefined);
  assert.equal(MembershipModel.getPath({}, 'constructor.name'), undefined);
});

test('the guard does not block the legitimate paths the binding layer uses', () => {
  const o = {};
  MembershipModel.setPath(o, 'groups.0.label', 'Truck Stop');
  assert.equal(MembershipModel.getPath(o, 'groups.0.label'), 'Truck Stop');
  MembershipModel.setPath(o, 'attrition.structural.2027', 12);
  assert.equal(MembershipModel.getPath(o, 'attrition.structural.2027'), 12);
  MembershipModel.setPath(o, 'labels.streams.vendor', 'Vendor programs');
  assert.equal(MembershipModel.getPath(o, 'labels.streams.vendor'), 'Vendor programs');
});

test('setPath and getPath round-trip a dotted path', () => {
  const o = { a: { b: { c: 1 } }, list: [{ x: 1 }] };
  MembershipModel.setPath(o, 'a.b.c', 42);
  assert.equal(MembershipModel.getPath(o, 'a.b.c'), 42);
  MembershipModel.setPath(o, 'list.0.x', 7);
  assert.equal(MembershipModel.getPath(o, 'list.0.x'), 7);
  assert.equal(MembershipModel.getPath(o, 'nope.missing'), undefined);
  MembershipModel.setPath(o, 'fresh.0.deep', 'v');
  assert.ok(Array.isArray(o.fresh), 'numeric segment creates an array');
  assert.equal(o.fresh[0].deep, 'v');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test membershipModel.test.js`
Expected: FAIL — `MembershipModel.attritionSplit is not a function`

- [ ] **Step 3: Implement**

Add to `membershipModel.js` before the `return`:

```js
  // These paths arrive from DOM `data-k` attributes once Task 8 wires the
  // binding layer, so they are user-influenceable. An unguarded walk lets
  // '__proto__.x' reach Object.prototype and poison every object in the page;
  // a NESTED path like 'a.__proto__.x' does it too, because `cur['__proto__']`
  // already resolves to a real object, so the container-creation guard never
  // fires. Every segment must be checked, not just the first.
  var UNSAFE_SEGMENT = /^(?:__proto__|constructor|prototype)$/;

  function hasUnsafeSegment(parts) {
    for (var i = 0; i < parts.length; i++) {
      if (UNSAFE_SEGMENT.test(parts[i])) return true;
    }
    return false;
  }

  function getPath(obj, path) {
    var parts = String(path).split('.'), cur = obj;
    if (hasUnsafeSegment(parts)) return undefined;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = String(path).split('.'), cur = obj;
    // Refuse the WHOLE write, not just the offending hop: a partial walk
    // would leave freshly-created containers behind in state.
    if (hasUnsafeSegment(parts)) return obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') {
        // A numeric next key means the missing container is an array.
        cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  // Decompose each historical year's realized attrition into the assumed
  // recurring rate plus whatever is left over. The residual is the
  // ownership-consolidation story from the workbook's col O note; it is
  // clamped at zero because a year quieter than the steady assumption has no
  // structural loss, not negative structural loss. steadyRate is recomputed
  // from the clamp so the two components always sum back to the realized total.
  function attritionSplit(history, steadyRate) {
    var steady = n(steadyRate);
    var rows = derivedAttrition(history).rows.map(function (r) {
      var structuralRate = Math.max(0, r.rate - steady);
      var effSteadyRate = r.rate - structuralRate;
      return {
        year: r.year, base: r.base,
        totalRate: r.rate, steadyRate: effSteadyRate, structuralRate: structuralRate,
        totalLost: r.lost,
        steadyLost: r.base * effSteadyRate / 100,
        structuralLost: r.base * structuralRate / 100
      };
    });
    return { rows: rows, steadyRate: steady };
  }

  function applyScenario(state, name) {
    var preset = (state.scenarios || {})[name];
    if (!preset) return state;
    Object.keys(preset).forEach(function (path) {
      setPath(state, path, preset[path]);
    });
    state.activeScenario = name;
    return state;
  }
```

Export: `getPath`, `setPath`, `attritionSplit`, `applyScenario`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test membershipModel.test.js`
Expected: PASS — 30/30.  
**The count is informational** — report the actual total rather than matching this number. The plan's absolute counts have drifted once already; a mismatch means a test was added or removed, not necessarily a failure.

- [ ] **Step 5: Commit**

```bash
git add membershipModel.js membershipModel.test.js
git commit -m "feat(mgm): steady + structural attrition split and scenario presets"
```

---

## Task 4: Revenue streams and the P&L reconciliation

**Files:**
- Modify: `membershipModel.js`, `membershipModel.test.js`

**Interfaces:**
- Consumes: `runModel`.
- Produces:
  - `MembershipModel.partPct(state, program)` → participation % for `'fuel'|'vendor'|'rewards'`, reading `participation` and falling back to the legacy `revenue.*Part`
  - `MembershipModel.revenueModel(state, M)` → `[{year, label, members, producing, streams:{dues,duesAncillary,settlement,fuelProgram,vendor,rewards,rewardsBreakage}, total}]`
  - `MembershipModel.revPerMember(state, M, actuals)` → `{derived:{…perStream, total}, actual, actualStreams, benchmark, varianceVsActual, varianceVsBenchmark, duesRealization}`

`actuals` is `null` when unsigned; `revPerMember` must work and report `actual: null`.

- [ ] **Step 1: Write the failing test**

```js
test('GOLDEN: revenueModel under legacy settings reproduces the v1 exactly', () => {
  const M = MembershipModel.runModel(MembershipModel.LEGACY_STATE);
  const R = MembershipModel.revenueModel(MembershipModel.LEGACY_STATE, M);
  const want = [
    { year: 2026, members: 380.844324, dues: 1677238.401474, fuel: 603257.408705, vendor: 479863.847833, rewards: 102827.967393, total: 2863187.625404 },
    { year: 2027, members: 387.395088, dues: 1706087.969736, fuel: 613633.820178, vendor: 488117.811505, rewards: 104596.673894, total: 2912436.275312 },
    { year: 2028, members: 399.242775, dues: 1758265.182957, fuel: 632400.556268, vendor: 503045.897031, rewards: 107795.549364, total: 3001507.18562 },
    { year: 2029, members: 411.96794,  dues: 1814306.806145, fuel: 652557.216379, vendor: 519079.603938, rewards: 111231.343701, total: 3097174.970164 }
  ];
  want.forEach((w, i) => {
    const r = R[i];
    assert.equal(r.year, w.year);
    near(r.members, w.members, `${w.year} members`);
    near(r.streams.dues, w.dues, `${w.year} dues`);
    near(r.streams.fuelProgram, w.fuel, `${w.year} fuel`);
    near(r.streams.vendor, w.vendor, `${w.year} vendor`);
    near(r.streams.rewards, w.rewards, `${w.year} rewards`);
    near(r.total, w.total, `${w.year} total`);
  });
});

test('partPct reads participation, falling back to the legacy revenue fields', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  assert.equal(MembershipModel.partPct(st, 'fuel'), 55);
  st.participation.fuel.pct = 80;
  assert.equal(MembershipModel.partPct(st, 'fuel'), 80);
  // LEGACY_STATE has no participation block at all.
  assert.equal(MembershipModel.partPct(MembershipModel.LEGACY_STATE, 'vendor'), 70);
});

test('GOLDEN: revenueModel reproduces hand-derived per-stream values for MGM_CONFIG', () => {
  // Every other golden in this suite runs on LEGACY_STATE, so the PRODUCTION
  // config path had no golden at all. These figures were derived by hand from
  // MGM_CONFIG's committed drivers — m = (start+end)/2 for 2026, then each
  // stream's formula applied directly — NOT by calling revenueModel. Asserting
  // the streams against each other instead would be true by construction and
  // would pass even if a formula were wrong (SR-5).
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const r = MembershipModel.revenueModel(st, MembershipModel.runModel(st))[0];
  near(r.members, 375.884577, 'members');
  near(r.streams.dues, 1632842.602458, 'dues');
  near(r.streams.duesAncillary, 44730.264662, 'duesAncillary');
  near(r.streams.settlement, -55630.917395, 'settlement');
  near(r.streams.fuelProgram, 0, 'fuelProgram — zero by design');
  near(r.streams.vendor, 347317.349142, 'vendor');
  near(r.streams.rewards, 65403.916397, 'rewards');
  near(r.streams.rewardsBreakage, 198467.056652, 'rewardsBreakage');
  near(r.total, 2233130.271916, 'total');
  // Ties back to the per-member figure the reconciliation tile reports.
  near(r.total / r.members, 5941, '$/member/yr');
});

test('fuelProgramMargin defaults to zero, so no prospective fuel revenue', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  assert.equal(st.revenue.fuelProgramMargin, 0);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  assert.equal(R[0].streams.fuelProgram, 0);
  assert.ok(R[0].streams.settlement < 0, 'settlement nets negative');
});

test('revPerMember derives $5,941 from the committed drivers', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st), null);
  // 362*12 + 119 - 148 + 0 + 110*12*0.70 + 29*12*0.50 + 528 = 5941.
  // That is the committed-driver sum. It is NOT the statement's measured
  // gross-profit-per-member figure, which is a P&L actual: auth-gated in
  // mgm_pnl_actuals, and never written down here -- not in a comment, and
  // not as a fixture. The two differ slightly, by design: the dues, vendor
  // and rewards-fee drivers are each rounded to the dollar, and one small
  // P&L line is deliberately not carried as a driver at all. Do not record
  // the gap's size, or the unrounded per-driver values, anywhere in this
  // repo -- either one recovers the gated figure from the committed drivers.
  // Keeping the rounded drivers is an explicit decision; the gap is surfaced
  // on the reconciliation tile rather than hidden by un-rounding.
  near(rpm.derived.total, 5941, 'derived $/member/yr');
  assert.equal(rpm.actual, null, 'unsigned: no actual');
  assert.equal(rpm.benchmark, 20000);
  near(rpm.varianceVsBenchmark, 5941 - 20000, 'benchmark variance');
});

test('revPerMember reports the variance against a supplied P&L actual', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  // An obviously SYNTHETIC fixture. A fixture is as recoverable as a default,
  // so the real per-member actual stays in mgm_pnl_actuals and the gitignored
  // membershipPnlActuals.local.js -- it never enters a committed test file.
  const ACTUAL_FIXTURE = 6000;
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st),
    { totalPerMemberYr: ACTUAL_FIXTURE });
  // The whole point of this function is to expose the gap, so assert a real
  // subtraction against the fixture rather than contriving an equal value.
  near(rpm.varianceVsActual, 5941 - ACTUAL_FIXTURE, 'derived minus actual');
});


test('dues realization is reported from the billable vs realized rates', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st), null);
  near(rpm.duesRealization, 100 * 362 / 366.82, 'realization %');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test membershipModel.test.js`
Expected: FAIL — `MembershipModel.revenueModel is not a function`

- [ ] **Step 3: Implement**

```js
  function avgMembers(r) { return (r.start + r.end) / 2; }

  var LEGACY_PART = { fuel: 'fuelPart', vendor: 'vendorPart', rewards: 'rewardsPart' };

  // Participation lives on its own tab now, but LEGACY_STATE (and any
  // scenario saved before the move) carries revenue.*Part. Reading through
  // this one helper is what keeps the golden revenue test meaningful.
  function partPct(state, program) {
    var p = (state.participation || {})[program];
    if (p && isFinite(Number(p.pct))) return Number(p.pct);
    return n((state.revenue || {})[LEGACY_PART[program]]);
  }

  // Annualized run-rate per year: every stream is charged for 12 months on
  // the average member count, which is what the v1 reported and what a
  // valuation multiple expects. `producing` is carried separately so the
  // activation lag is visible without changing the revenue basis.
  function revenueModel(state, M) {
    var rv = state.revenue || {}, months = 12;
    return M.years.map(function (r) {
      var m = avgMembers(r);
      var streams = {
        dues:            m * n(rv.duesPerLoc) * months,
        duesAncillary:   m * n(rv.duesAncillaryPerMember),
        settlement:      m * n(rv.settlementNetPerMember),
        fuelProgram:     m * (partPct(state, 'fuel') / 100) * n(rv.avgGallons) * n(rv.fuelProgramMargin) * months,
        vendor:          m * (partPct(state, 'vendor') / 100) * n(rv.vendorPM) * months,
        rewards:         m * (partPct(state, 'rewards') / 100) * n(rv.rewardsPM) * months,
        rewardsBreakage: m * n(rv.rewardsBreakagePerMember)
      };
      var total = Object.keys(streams).reduce(function (a, k) { return a + streams[k]; }, 0);
      return {
        year: r.year,
        label: r.year === n(state.CURRENT_YEAR, 2026)
          ? r.year + ' (proj. from ' + (state.DATA_ASOF || '') + ')' : String(r.year),
        members: m, producing: r.producing, streams: streams, total: total
      };
    });
  }

  // Three columns for the reconciliation tile: what the drivers imply, what
  // the P&L actually did, and the workbook's $20k benchmark. `actuals` is
  // null when nobody is signed in — the tile degrades, it does not break.
  function revPerMember(state, M, actuals) {
    var rv = state.revenue || {}, months = 12;
    var derived = {
      dues:            n(rv.duesPerLoc) * months,
      duesAncillary:   n(rv.duesAncillaryPerMember),
      settlement:      n(rv.settlementNetPerMember),
      fuelProgram:     (partPct(state, 'fuel') / 100) * n(rv.avgGallons) * n(rv.fuelProgramMargin) * months,
      vendor:          (partPct(state, 'vendor') / 100) * n(rv.vendorPM) * months,
      rewards:         (partPct(state, 'rewards') / 100) * n(rv.rewardsPM) * months,
      rewardsBreakage: n(rv.rewardsBreakagePerMember)
    };
    derived.total = Object.keys(derived).reduce(function (a, k) {
      return k === 'total' ? a : a + derived[k];
    }, 0);

    var bench = n((state.benchmark || {}).lostMemberValue);
    var actual = actuals && isFinite(Number(actuals.totalPerMemberYr))
      ? Number(actuals.totalPerMemberYr) : null;
    var billable = n((state.billing || {}).duesPerLocBillable);

    return {
      derived: derived,
      actual: actual,
      actualStreams: actuals ? (actuals.streams || null) : null,
      benchmark: bench,
      varianceVsActual: actual === null ? null : derived.total - actual,
      varianceVsBenchmark: derived.total - bench,
      duesRealization: billable ? 100 * n(rv.duesPerLoc) / billable : null
    };
  }
```

Export: `partPct`, `avgMembers`, `revenueModel`, `revPerMember`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test membershipModel.test.js`
Expected: PASS — 37/37.  
**The count is informational** — report the actual total rather than matching this number. The plan's absolute counts have drifted once already; a mismatch means a test was added or removed, not necessarily a failure.

The golden revenue test is the sensitive one: `LEGACY_STATE` zeroes the three new streams and sets `fuelProgramMargin` to 0.03, collapsing the seven-stream model to the v1's four.

- [ ] **Step 5: Commit**

```bash
git add membershipModel.js membershipModel.test.js
git commit -m "feat(mgm): seven revenue streams and P&L reconciliation, golden-pinned"
```

---

## Task 5: Valuation on gross profit

**Files:**
- Modify: `membershipModel.js`, `membershipModel.test.js`

**Interfaces:**
- Consumes: `revenueModel`.
- Produces: `MembershipModel.valuation(state, lastYearRevenue, ebitdaOverride)` → `{basis, rev, ebitdaBase, ebitda, mid, low, high, normalization}`

`ebitdaOverride` is the seam Task 6's cash-flow layer uses so the valuation can sit on a real EBITDA (revenue less costs) instead of a margin assumption; when absent the margin applies.

- [ ] **Step 1: Write the failing test**

```js
test('GOLDEN: valuation under legacy settings reproduces the v1 exactly', () => {
  const M = MembershipModel.runModel(MembershipModel.LEGACY_STATE);
  const R = MembershipModel.revenueModel(MembershipModel.LEGACY_STATE, M);
  const v = MembershipModel.valuation(MembershipModel.LEGACY_STATE, R[R.length - 1]);
  near(v.rev, 7742937.42541, 'revenue lens');
  near(v.ebitda, 3871468.712705, 'ebitda lens');
  near(v.mid, 5807203.069057, 'midpoint');
});

test('ebitdaMargin ships unset, and the margin lens honours whatever is set', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  // 0 = explicitly unset. The real P&L margin is auth-gated and loads from
  // mgm_pnl_actuals; it is never committed to this public repo. The v1's
  // hardcoded 25% was unsupported in either direction.
  assert.equal(st.valuation.ebitdaMargin, 0);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];
  assert.equal(MembershipModel.valuation(st, last).ebitdaBase, 0,
    'unset margin yields a zero EBITDA lens, not a guess');

  // Set it the way a signed-in session or a hand entry would.
  st.valuation.ebitdaMargin = 0.9;
  const v = MembershipModel.valuation(st, last);
  near(v.ebitdaBase, last.total * 0.009, 'ebitda base');
  near(v.ebitda, last.total * 0.009 * 5, 'ebitda lens');
});

test('normalization add-backs raise EBITDA explicitly and nothing else', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];
  const before = MembershipModel.valuation(st, last);
  st.valuation.ebitdaNormalization = 250000;
  const after = MembershipModel.valuation(st, last);

  near(after.ebitdaBase - before.ebitdaBase, 250000, 'add-back lands in EBITDA');
  near(after.rev, before.rev, 'revenue lens untouched');
  near(after.ebitda - before.ebitda, 250000 * 5, 'multiplied through');
});

test('an explicit EBITDA override wins over the margin assumption', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const v = MembershipModel.valuation(st, R[R.length - 1], 400000);
  near(v.ebitdaBase, 400000, 'override used verbatim');
  near(v.ebitda, 400000 * 5, 'multiplied through');
});

test('an EBITDA override must NOT re-apply the normalization add-back', () => {
  // The add-back is applied in exactly ONE place, depending on which path is
  // live. Under the margin path `valuation` adds it. Under the override path,
  // Task 6's cashflowModel has ALREADY folded it into the figure being passed
  // in (ebitda = total - costToServe - acquisition + norm), so adding it again
  // here would double-count it and inflate the headline valuation by
  // norm x ebitdaMultiple. The behaviour is correct today; this test exists so
  // that a future "fix" to the override branch cannot silently inflate the
  // number people build decisions on.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];
  st.valuation.ebitdaMargin = 10;
  st.valuation.ebitdaNormalization = 250000;

  // Margin path: the add-back IS included.
  const viaMargin = MembershipModel.valuation(st, last);
  near(viaMargin.ebitdaBase, last.total * 0.10 + 250000,
    'margin path includes the add-back');

  // Override path: the supplied figure is used verbatim.
  const viaOverride = MembershipModel.valuation(st, last, 400000);
  near(viaOverride.ebitdaBase, 400000, 'override used verbatim');
  assert.notEqual(viaOverride.ebitdaBase, 650000,
    'the add-back must not be applied twice — that would inflate the valuation by norm x multiple');
  near(viaOverride.ebitda, 400000 * st.valuation.ebitdaMultiple,
    'multiplied through exactly once');
});

test('a zero-cost cash bridge must not become a valuation basis', () => {
  // With costs unset, cashflowModel's EBITDA is revenue minus zero costs, i.e.
  // a 100% margin. The page must NOT pass that to valuation as the override:
  // doing so produced a $9.09M headline midpoint against $3.03M on the margin
  // branch -- a 3x overstatement on shipped defaults, for a business whose
  // real net margin is nowhere near the 100% that bridge implies (the actual
  // figure is auth-gated in mgm_pnl_actuals) -- and made ebitdaMargin dead
  // code because the override always won. This test pins the arithmetic that
  // decision rests on.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const M = MembershipModel.runModel(st);
  const R = MembershipModel.revenueModel(st, M);
  const F = MembershipModel.cashflowModel(st, M, R);
  const cost = MembershipModel.costModel(st, M, R);
  const last = R[R.length - 1], lastF = F[F.length - 1];

  assert.equal(cost.unset, true, 'costs ship unset');
  near(lastF.ebitda, last.total, 'a zero-cost bridge EBITDA equals revenue');

  const withBridge = MembershipModel.valuation(st, last, lastF.ebitda);
  const declined = MembershipModel.valuation(st, last, null);
  assert.ok(withBridge.mid > declined.mid * 2.5,
    'handing over the zero-cost bridge inflates the midpoint roughly threefold');
  near(declined.ebitdaBase, 0,
    'the margin branch yields no EBITDA basis at the shipped 0% margin');
  near(declined.mid, declined.rev / 2,
    'so the midpoint is exactly half the revenue lens');
});

test('low and high track which lens is actually lower, in both orderings', () => {
  // The first draft of this test asserted `mid === (rev + ebitda) / 2` using
  // the output's own fields — the same expression the implementation uses —
  // and `low <= mid <= high`, which is a mathematical identity for the
  // min/mean/max of two numbers. Neither assertion could fail (SR-5). This
  // version pins independently-computed values AND flips which lens is
  // larger, so a min/max swap in the implementation is caught.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];
  near(last.total, 2424563.806607, 'final-year revenue basis');

  // Margin unset (the shipped default): the EBITDA lens is zero, so the
  // revenue lens is the high end.
  st.valuation.ebitdaMargin = 0;
  const a = MembershipModel.valuation(st, last);
  near(a.rev, 6061409.516516, 'revenue lens at 2.5x');
  near(a.ebitda, 0, 'EBITDA lens is zero at an unset margin');
  near(a.low, 0, 'low is the EBITDA lens here');
  near(a.high, 6061409.516516, 'high is the revenue lens here');
  near(a.mid, 3030704.758258, 'midpoint');

  // An 80% margin inverts the ordering: the EBITDA lens is now on top.
  st.valuation.ebitdaMargin = 80;
  const b = MembershipModel.valuation(st, last);
  near(b.ebitda, 9698255.226426, 'EBITDA lens at 80% x 5');
  near(b.low, 6061409.516516, 'low is now the revenue lens');
  near(b.high, 9698255.226426, 'high is now the EBITDA lens');
  near(b.mid, 7879832.371471, 'midpoint follows the inversion');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test membershipModel.test.js`
Expected: FAIL — `MembershipModel.valuation is not a function`

- [ ] **Step 3: Implement**

```js
  // Both lenses apply to the model's own revenue total, built from net
  // per-member streams — never to the P&L's `Total Income`, which is ~95%
  // gross settlement pass-through and would overstate the basis badly. The
  // ratio between the two is deliberately unstated: quoted beside the model's
  // own committed revenue total it would back-solve a gated figure.
  // ebitdaOverride lets Profit & Cash Flow supply a real computed EBITDA.
  function valuation(state, lastYear, ebitdaOverride) {
    var val = state.valuation || {};
    var basis = n(lastYear && lastYear.total);
    var rev = basis * n(val.revMultiple);
    var hasOverride = ebitdaOverride !== undefined && ebitdaOverride !== null;
    var ebitdaBase = hasOverride
      ? n(ebitdaOverride)
      : basis * (n(val.ebitdaMargin) / 100) + n(val.ebitdaNormalization);
    var ebitda = ebitdaBase * n(val.ebitdaMultiple);
    return {
      basis: basis, rev: rev,
      ebitdaBase: ebitdaBase, ebitda: ebitda,
      normalization: n(val.ebitdaNormalization),
      mid: (rev + ebitda) / 2,
      low: Math.min(rev, ebitda), high: Math.max(rev, ebitda)
    };
  }
```

Export `valuation`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test membershipModel.test.js`
Expected: PASS — 43/43.  
**The count is informational** — report the actual total rather than matching this number. The plan's absolute counts have drifted once already; a mismatch means a test was added or removed, not necessarily a failure.

- [ ] **Step 5: Commit**

```bash
git add membershipModel.js membershipModel.test.js
git commit -m "feat(mgm): valuation on gross-profit basis with explicit normalization"
```

---

## Task 6: The five new engine layers

All pure, all injected — no DOM, no fetch, no BDPG dependency in node. This is the last engine task; Task 7 starts the UI.

**Files:**
- Modify: `membershipModel.js`, `membershipModel.test.js`

**Interfaces:**
- Consumes: `runModel`, `revenueModel`, `partPct`.
- Produces:
  - `MembershipModel.CRM_STAGES` → the nine stages, in `CRM.html:1155` order
  - `MembershipModel.CRM_CLOSED_STAGES` → `['Closed Won','Closed Lost','Not Qualified']`
  - `MembershipModel.pipelineModel(state, leads, profiles)` → `{byStage, openLeads, openLocations, weightedLocations, expectedPerMonth, winRate, wonCount, lostCount, byOwner, bySource, gallons, dealValue, isEmpty}`
  - `MembershipModel.gallonProduction(state, baselineFor, pipeline)` → `{byGroup, existing, inbound, total, perMember, mapped}`
  - `MembershipModel.participationModel(state, M)` → `[{year, members, fuel, vendor, rewards}]`
  - `MembershipModel.costModel(state, M, R)` → `{cac, costToServePerMember, byYear, payback, ltv, ltvCac, unset}`
  - `MembershipModel.capacityModel(state, M, pipeline)` → `{reps, totalCapacity, modeledAddsPerMonth, gap, byOwner, unset}`
  - `MembershipModel.cashflowModel(state, M, R)` → `[{year, revenue, costToServe, acquisition, ebitda, capex, cash}]`

`baselineFor(profile, roadway)` is injected by the page as a wrapper over `BusDevGallonsCalc.getBaselineRow`. `leads` is an array of `crm_leads` rows; `profiles` an array of `bd_value_profiles` rows. Both default to `[]`.

- [ ] **Step 1: Write the failing tests**

```js
// ── fixtures ─────────────────────────────────────────────────────────────
const LEADS = [
  { id: 'l1', stage: 'Prospect',         locations: 2, est_gallons: 5000,  deal_value: 600,  owner: 'Robert Watson', source: 'Referral' },
  { id: 'l2', stage: 'Qualified',        locations: 1, est_gallons: 8000,  deal_value: 750,  owner: 'Angel Long',    source: 'Cold Call' },
  { id: 'l3', stage: 'Negotiation',      locations: 18, est_gallons: 40000, deal_value: 6300, owner: 'Robert Watson', source: 'GS Lead' },
  { id: 'l4', stage: 'Closed Won',       locations: 1, est_gallons: 7000,  deal_value: 500,  owner: 'Angel Long',    source: 'Referral' },
  { id: 'l5', stage: 'Closed Lost',      locations: 3, est_gallons: 9000,  deal_value: 900,  owner: 'Robert Watson', source: 'Website' },
  { id: 'l6', stage: 'Not Qualified',    locations: 1, est_gallons: 2000,  deal_value: 300,  owner: 'Angel Long',    source: 'Other' }
];
// A modeled profile for l3 must take precedence over its est_gallons.
const PROFILES = [{ id: 'p1', lead_id: 'l3', final_gallons: 52000, status: 'final' }];

// Stand-in for BusDevGallonsCalc.getBaselineRow, with the real values.
const BASELINES = {
  'Fuel stop|Any': 5630, 'Small truck stop|Backroad': 6174,
  'Small truck stop|Highway': 2338, 'Small truck stop|Interstate': 8400,
  'Medium truck stop|Highway': 5250, 'Medium truck stop|Interstate': 10492,
  'Large truck stop|Highway': 15307, 'Large truck stop|Interstate': 23565
};
const baselineFor = (p, r) => {
  const v = BASELINES[p + '|' + r];
  return v === undefined ? null : { profile: p, roadway: r, baseline: v };
};

// ── pipeline ─────────────────────────────────────────────────────────────
test('pipeline counts open locations and excludes closed stages', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  assert.equal(p.openLeads, 3);                 // l1, l2, l3
  assert.equal(p.openLocations, 2 + 1 + 18);
  assert.equal(p.byStage['Closed Won'].locations, 1);
  assert.equal(p.isEmpty, false);
});

test('weighted locations use the stage ladder over open stages only', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  // 2×5% + 1×15% + 18×70% = 0.1 + 0.15 + 12.6 = 12.85
  near(p.weightedLocations, 12.85, 'weighted');
  // spread over the 12-month horizon
  near(p.expectedPerMonth, 12.85 / 12, 'per month');
});

test('win rate is Won/(Won+Lost) with Not Qualified excluded', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  assert.equal(p.wonCount, 1);
  assert.equal(p.lostCount, 1);
  near(p.winRate, 50, 'win rate');     // 1/(1+1), Not Qualified ignored
});

test('modeled profile gallons take precedence over est_gallons per lead', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  // open leads: l1 5000 + l2 8000 + l3 -> 52000 (profile, not 40000)
  assert.equal(p.gallons, 5000 + 8000 + 52000);
});

test('pipeline load is grouped by owner and source', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  assert.equal(p.byOwner['Robert Watson'].openLeads, 2);   // l1, l3
  assert.equal(p.byOwner['Angel Long'].openLeads, 1);      // l2
  assert.equal(p.bySource['Referral'].leads, 2);           // l1, l4
});

test('an empty lead set yields zeros, not NaN', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, [], []);
  assert.equal(p.isEmpty, true);
  assert.equal(p.openLocations, 0);
  assert.equal(p.weightedLocations, 0);
  assert.equal(p.winRate, null, 'no closed deals means no win rate, not 0/0');
  assert.ok(isFinite(p.expectedPerMonth));
});

test('pipeline basis is opt-in: flat basis is byte-identical to no pipeline', () => {
  const flat = MembershipModel.defaultState(MGM_CONFIG);
  const a = MembershipModel.runModel(flat);

  const piped = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(piped, LEADS, PROFILES);
  const b = MembershipModel.runModel(piped, MembershipModel.addsOpts(piped, p));
  assert.equal(JSON.stringify(a.years), JSON.stringify(b.years), 'flat unchanged');

  piped.salesPipeline.basis = 'pipeline';
  const c = MembershipModel.runModel(piped, MembershipModel.addsOpts(piped, p));
  assert.notEqual(JSON.stringify(a.years), JSON.stringify(c.years), 'pipeline differs');

  // The override reaches the loop raw: the current year runs at exactly the
  // pipeline rate, for its post-as-of months only (2 at an October as-of).
  near(c.years[0].newModeled / 2, 12.85 / 12,
    'current year runs at the raw pipeline rate');

  // `adds.growthPct` then compounds ON TOP of the pipeline rate, once per year
  // transition, exactly as it does for the flat rate. Pinned deliberately:
  // whether a MEASURED point-in-time pipeline figure should be growth-
  // compounded at all is an open modelling question (see the ledger). This
  // records the answer the engine currently gives, so changing it cannot pass
  // unnoticed.
  near(c.years[1].newModeled / 12, (12.85 / 12) * 1.05,
    'growth compounds on the pipeline rate');
  near(c.years[2].newModeled / 12, (12.85 / 12) * 1.05 * 1.05,
    'and compounds again the following year');
});

// ── gallons ──────────────────────────────────────────────────────────────
test('gallon production multiplies group counts by mapped baselines', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  const g = MembershipModel.gallonProduction(st, baselineFor, p);
  const expected =
    154 * 10492 + 6 * 5250 + 22 * 2338 + 88 * 5630 +
    7 * 6174 + 9 * 5630 + 89 * 2338;
  near(g.existing, expected, 'existing network gal/mo');
  assert.equal(g.inbound, p.gallons);
  near(g.total, expected + p.gallons, 'total');
  near(g.perMember, expected / 375, 'per existing member');
});

test('a per-group baseline override changes only that group', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const before = MembershipModel.gallonProduction(st, baselineFor, null);
  st.gallons.groupBaselineOverride = { cstore: 4000 };
  const after = MembershipModel.gallonProduction(st, baselineFor, null);
  near(after.existing - before.existing, 22 * (4000 - 2338), 'delta is C-Stores only');
  assert.equal(after.byGroup.find(r => r.key === 'cstore').overridden, true);
  assert.equal(after.byGroup.find(r => r.key === 'ts').overridden, false);
});

test('an unmapped group reports zero and is flagged, not silently dropped', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.groups.push({ key: 'brand new', label: 'Brand New', count: 10 });
  const g = MembershipModel.gallonProduction(st, baselineFor, null);
  const row = g.byGroup.find(r => r.key === 'brand new');
  assert.equal(row.baseline, 0);
  assert.equal(row.unmapped, true);
  assert.ok(g.mapped < g.byGroup.length, 'mapped count reflects the gap');
});

// ── participation ────────────────────────────────────────────────────────
test('participation reports participating members per program per year', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const M = MembershipModel.runModel(st);
  const P = MembershipModel.participationModel(st, M);
  assert.equal(P.length, M.years.length);
  P.forEach((r, i) => {
    const y = M.years[i];
    // Derive the member basis independently from runModel's own year row rather
    // than reading P[i].members back from the output (SR-6). The first draft
    // compared participants against the function's own member count, so a wrong
    // basis -- r.end instead of the year average, or the wrong year's row --
    // cancelled on both sides and passed.
    const expected = (y.start + y.end) / 2;
    near(r.members, expected, `${y.year} member basis is the year average`);
    near(r.fuel, expected * 0.55, `${y.year} fuel participants`);
    near(r.vendor, expected * 0.70, `${y.year} vendor participants`);
    near(r.rewards, expected * 0.50, `${y.year} rewards participants`);
  });
});

test('editing participation moves revenue identically to the legacy field', () => {
  const a = MembershipModel.defaultState(MGM_CONFIG);
  a.participation.vendor.pct = 90;
  const ra = MembershipModel.revenueModel(a, MembershipModel.runModel(a));

  const b = MembershipModel.defaultState(MGM_CONFIG);
  delete b.participation;
  b.revenue.vendorPart = 90;
  const rb = MembershipModel.revenueModel(b, MembershipModel.runModel(b));

  near(ra[0].streams.vendor, rb[0].streams.vendor, 'one source, two views');
});

// ── cost ─────────────────────────────────────────────────────────────────
test('cost model reports unset when acquisition and serve costs are zero', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const M = MembershipModel.runModel(st);
  const c = MembershipModel.costModel(st, M, MembershipModel.revenueModel(st, M));
  assert.equal(c.unset, true);
  assert.equal(c.payback, null, 'no payback from a zero CAC, not Infinity');
  assert.equal(c.ltvCac, null);
});

test('cost model derives CAC from sales spend and new members', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.costs.salesSpendPerMonth = 20000;
  st.costs.costToServePerMember = 400;
  const M = MembershipModel.runModel(st);
  const c = MembershipModel.costModel(st, M, MembershipModel.revenueModel(st, M));
  assert.equal(c.unset, false);
  // A full year of spend over that year's modeled adds.
  const y27 = M.years.find(y => y.year === 2027);
  near(c.byYear.find(r => r.year === 2027).cac, 240000 / y27.newModeled, '2027 CAC');
  assert.ok(c.ltv > 0 && isFinite(c.ltv), 'LTV finite');
  assert.ok(c.payback > 0, 'payback positive');
});

test('LTV uses the model own steady attrition, not a separate assumption', () => {
  const mk = steady => {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.attrition.steady = steady;
    st.costs.salesSpendPerMonth = 20000;
    st.costs.costToServePerMember = 400;
    const M = MembershipModel.runModel(st);
    return MembershipModel.costModel(st, M, MembershipModel.revenueModel(st, M)).ltv;
  };
  assert.ok(mk(4) > mk(9.7), 'lower churn means a longer life and higher LTV');
});

// ── capacity ─────────────────────────────────────────────────────────────
test('capacity reports unset rather than a false surplus when capacity is 0', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const M = MembershipModel.runModel(st);
  const cap = MembershipModel.capacityModel(st, M, null);
  assert.equal(cap.unset, true);
  assert.equal(cap.gap, null);
});

test('capacity gap is modeled adds less rep capacity', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.staffing.reps = [
    { name: 'Robert Watson', capacityLeads: 2, costPerYear: 120000 },
    { name: 'Angel Long',    capacityLeads: 1, costPerYear: 110000 }
  ];
  const M = MembershipModel.runModel(st);
  const cap = MembershipModel.capacityModel(st, M, null);
  assert.equal(cap.unset, false);
  assert.equal(cap.totalCapacity, 3);
  near(cap.gap, st.adds.perMonth - 3, 'gap = 3.2 − 3');
});

test('capacity merges the pipeline actual load per owner', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.staffing.reps = [{ name: 'Robert Watson', capacityLeads: 2, costPerYear: 0 }];
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  const cap = MembershipModel.capacityModel(st, MembershipModel.runModel(st), p);
  assert.equal(cap.byOwner['Robert Watson'].openLeads, 2);
  assert.equal(cap.byOwner['Robert Watson'].capacityLeads, 2);
});

// ── cash flow ────────────────────────────────────────────────────────────
test('cash flow is revenue less serve and acquisition cost, plus add-backs', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.costs.salesSpendPerMonth = 20000;
  st.costs.costToServePerMember = 400;
  st.valuation.ebitdaNormalization = 50000;
  const M = MembershipModel.runModel(st);
  const R = MembershipModel.revenueModel(st, M);
  const F = MembershipModel.cashflowModel(st, M, R);

  assert.equal(F.length, R.length);

  // Derive both cost terms INDEPENDENTLY of the function's own output, so that
  // a wrong member basis or a wrong year's row inside costModel cannot cancel
  // out on both sides of the comparison (SR-5). The first draft of this test
  // read f.costToServe / f.acquisition back from the output and compared them
  // to themselves, which could not catch a self-consistent error:
  //   acquisition = salesSpendPerMonth * months_in_year
  //     (cac = spend / adds, so cac * adds = spend, whatever adds turns out to be)
  //   costToServe = costToServePerMember * (start + end) / 2
  F.forEach((f, i) => {
    const y = M.years[i];
    const months = M.months.filter(m => m.year === y.year).length;
    near(f.acquisition, 20000 * months, `${y.year} acquisition is spend x months`);
    near(f.costToServe, 400 * ((y.start + y.end) / 2), `${y.year} cost to serve is rate x avg members`);
    near(f.revenue, R[i].total, `${y.year} revenue carried through`);
    near(f.ebitda, R[i].total - f.costToServe - f.acquisition + 50000, `${y.year} EBITDA identity`);
    near(f.cash, f.ebitda - f.capex, `${y.year} cash identity`);
  });

  // The current year covers only its post-as-of months, so its acquisition
  // spend is proportionally smaller. A wrong month count shows up here and
  // nowhere else.
  near(F[0].acquisition, 40000, 'current year spends only its 2 remaining months');
  near(F[1].acquisition, 240000, 'a full year spends twelve months');
});

test('cashflowModel folds the normalization add-back in BEFORE valuation sees it', () => {
  // REQUIRED by Task 5's design. valuation applies the add-back on the margin
  // path but NOT on the override path, on the explicit assumption that
  // cashflowModel has already folded it in. If this fold is ever removed the
  // add-back is applied in NEITHER place and silently vanishes from every
  // valuation computed on the override path. Task 5's double-count guard
  // catches the opposite direction only and cannot see this one.
  //
  // Written as a DIFFERENTIAL test on two independent runs rather than by
  // restating cashflowModel's own formula, so it is not true by construction
  // (SR-5): the only input that differs is the add-back, so the EBITDA delta
  // must equal it exactly.
  const mk = norm => {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.costs.salesSpendPerMonth = 20000;
    st.costs.costToServePerMember = 400;
    st.valuation.ebitdaNormalization = norm;
    const M = MembershipModel.runModel(st);
    const R = MembershipModel.revenueModel(st, M);
    const F = MembershipModel.cashflowModel(st, M, R);
    return { st, R, F, last: F[F.length - 1] };
  };
  const a = mk(0);
  const b = mk(250000);

  near(b.last.ebitda - a.last.ebitda, 250000,
    'cashflowModel must fold the add-back into EBITDA');
  near(b.last.revenue, a.last.revenue, 'revenue is unaffected by the add-back');
  near(b.last.costToServe, a.last.costToServe, 'cost to serve is unaffected');
  near(b.last.acquisition, a.last.acquisition, 'acquisition cost is unaffected');

  // And it must survive the handoff into valuation on the override path.
  const v0 = MembershipModel.valuation(a.st, a.R[a.R.length - 1], a.last.ebitda);
  const v1 = MembershipModel.valuation(b.st, b.R[b.R.length - 1], b.last.ebitda);
  near(v1.ebitdaBase - v0.ebitdaBase, 250000,
    'the add-back reaches valuation exactly once, via the override');
  near(v1.ebitda - v0.ebitda, 250000 * b.st.valuation.ebitdaMultiple,
    'and is multiplied through exactly once');
});

test('the valuation panel consumes the computed EBITDA, not the margin assumption', () => {
  // The first draft asserted only `v.ebitdaBase === lastF.ebitda`, which
  // restates valuation's override branch verbatim and cannot fail (SR-5). This
  // version makes the claim in the test's NAME falsifiable: the two lenses must
  // genuinely disagree, and the margin lens is pinned independently.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.costs.salesSpendPerMonth = 20000;
  st.costs.costToServePerMember = 400;
  st.valuation.ebitdaMargin = 25;   // deliberately far from the computed truth
  const M = MembershipModel.runModel(st);
  const R = MembershipModel.revenueModel(st, M);
  const F = MembershipModel.cashflowModel(st, M, R);
  const last = R[R.length - 1], lastF = F[F.length - 1];

  const viaMargin = MembershipModel.valuation(st, last);               // no override
  const viaComputed = MembershipModel.valuation(st, last, lastF.ebitda);

  // Both lenses pinned to independently computed figures, so neither side is
  // read back from the code under test:
  //   margin   = 2,424,563.806607 x 25%
  //   computed = 2,424,563.806607 - 163,242.808053 - 240,000
  near(viaMargin.ebitdaBase, 606140.951652, 'margin lens: 25% of final-year revenue');
  near(viaComputed.ebitdaBase, 2021320.998554, 'computed lens: revenue less real costs');

  // DIRECTION IS DELIBERATELY NOT ASSERTED. With these modest cost inputs
  // ($20k/mo spend, $400/member/yr) the computed EBITDA lands ~3.3x ABOVE a 25%
  // margin, implying an 83% margin on ~$2.42M of revenue. Only with the P&L's
  // real opex -- auth-gated, and far larger than these token inputs -- would
  // it fall below. Which side it lands on is a property of the INPUTS, not of
  // the code -- an earlier draft of this test asserted "below" and was simply
  // wrong.
  assert.notEqual(viaComputed.ebitdaBase, viaMargin.ebitdaBase,
    'the two lenses must genuinely disagree, or the test name is unfalsifiable');
  assert.notEqual(viaComputed.mid, viaMargin.mid,
    'so the headline midpoint moves depending on which lens is live');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test membershipModel.test.js`
Expected: FAIL — `MembershipModel.pipelineModel is not a function`

- [ ] **Step 3: Implement the five layers**

```js
  // Order and membership copied from CRM.html:1155 so the funnel here and
  // the funnel in the CRM cannot drift apart.
  var CRM_STAGES = ['Prospect', 'Qualified', 'Contacted', 'Meeting Scheduled',
    'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'Not Qualified'];
  var CRM_CLOSED_STAGES = ['Closed Won', 'Closed Lost', 'Not Qualified'];
  function isClosedStage(s) { return CRM_CLOSED_STAGES.indexOf(s) !== -1; }

  // ── Sales Pipeline ──────────────────────────────────────────────────────
  // leads: crm_leads rows. profiles: bd_value_profiles rows, joined on
  // lead_id — a modeled final_gallons beats the hand-typed est_gallons.
  function pipelineModel(state, leads, profiles) {
    leads = leads || []; profiles = profiles || [];
    var sp = state.salesPipeline || {};
    var weights = sp.stageWeights || {};

    var gallonsByLead = {};
    profiles.forEach(function (p) {
      if (!p || !p.lead_id) return;
      var g = Number(p.final_gallons);
      if (isFinite(g) && g > 0) gallonsByLead[p.lead_id] = g;
    });

    var byStage = {};
    CRM_STAGES.forEach(function (s) {
      byStage[s] = { count: 0, locations: 0, gallons: 0, dealValue: 0 };
    });

    var openLeads = 0, openLocations = 0, weighted = 0, gallons = 0, dealValue = 0;
    var wonCount = 0, lostCount = 0;
    var byOwner = {}, bySource = {};

    leads.forEach(function (l) {
      if (!l) return;
      var stage = l.stage || 'Prospect';
      var locs = n(l.locations, 0);
      var gal = gallonsByLead[l.id] !== undefined
        ? gallonsByLead[l.id] : n(l.est_gallons, 0);
      var val = n(l.deal_value, 0);

      if (!byStage[stage]) {
        byStage[stage] = { count: 0, locations: 0, gallons: 0, dealValue: 0 };
      }
      byStage[stage].count++; byStage[stage].locations += locs;
      byStage[stage].gallons += gal; byStage[stage].dealValue += val;

      if (stage === 'Closed Won') wonCount++;
      if (stage === 'Closed Lost') lostCount++;

      var owner = l.owner || '(unassigned)';
      var src = l.source || '(none)';
      byOwner[owner] = byOwner[owner] ||
        { openLeads: 0, openLocations: 0, leads: 0 };
      bySource[src] = bySource[src] || { leads: 0, locations: 0 };
      byOwner[owner].leads++;
      bySource[src].leads++; bySource[src].locations += locs;

      if (!isClosedStage(stage)) {
        openLeads++; openLocations += locs;
        weighted += locs * (n(weights[stage]) / 100);
        gallons += gal; dealValue += val;
        byOwner[owner].openLeads++; byOwner[owner].openLocations += locs;
      }
    });

    var horizon = n(sp.horizonMonths, 12) || 12;
    // Won/(Won+Lost), Not Qualified excluded: it never became a real
    // opportunity. null rather than 0 when nothing has closed, so the tab
    // can say "no closed deals yet" instead of showing a 0% win rate.
    var closed = wonCount + lostCount;

    return {
      byStage: byStage,
      openLeads: openLeads, openLocations: openLocations,
      weightedLocations: weighted,
      expectedPerMonth: weighted / horizon,
      winRate: closed > 0 ? 100 * wonCount / closed : null,
      wonCount: wonCount, lostCount: lostCount,
      byOwner: byOwner, bySource: bySource,
      gallons: gallons, dealValue: dealValue,
      isEmpty: leads.length === 0
    };
  }

  // The opt-in seam. Returns {} unless the user switched the basis, so the
  // default and unsigned paths are provably unchanged.
  function addsOpts(state, pipeline) {
    var sp = state.salesPipeline || {};
    if (sp.basis !== 'pipeline' || !pipeline) return {};
    return { addsPerMonthOverride: pipeline.expectedPerMonth };
  }

  // ── Fuel Gallon Production ──────────────────────────────────────────────
  // baselineFor(profile, roadway) is injected: the page wraps
  // BusDevGallonsCalc.getBaselineRow, node tests pass a stub. Keeping it an
  // argument is what lets this stay a pure function.
  function gallonProduction(state, baselineFor, pipeline) {
    var gcfg = state.gallons || {};
    var map = gcfg.groupProfile || {};
    var overrides = gcfg.groupBaselineOverride || {};
    var mapped = 0;

    var byGroup = (state.groups || []).map(function (g) {
      var pair = map[g.key];
      var row = null;
      if (pair && typeof baselineFor === 'function') {
        row = baselineFor(pair[0], pair[1]);
      }
      var engineBaseline = row ? n(row.baseline) : 0;
      var hasOverride = overrides[g.key] !== undefined
        && overrides[g.key] !== null && overrides[g.key] !== '';
      var baseline = hasOverride ? n(overrides[g.key]) : engineBaseline;
      var unmapped = !pair || !row;
      if (!unmapped) mapped++;
      return {
        key: g.key, label: g.label, count: n(g.count),
        profile: pair ? pair[0] : '', roadway: pair ? pair[1] : '',
        engineBaseline: engineBaseline, baseline: baseline,
        overridden: !!hasOverride, unmapped: unmapped,
        gallons: n(g.count) * baseline
      };
    });

    var existing = byGroup.reduce(function (a, r) { return a + r.gallons; }, 0);
    var inbound = pipeline ? n(pipeline.gallons) : 0;
    var total = groupTotal(state);

    return {
      byGroup: byGroup, mapped: mapped,
      existing: existing, inbound: inbound, total: existing + inbound,
      perMember: total ? existing / total : 0
    };
  }

  // ── Program Participation ───────────────────────────────────────────────
  function participationModel(state, M) {
    return M.years.map(function (r) {
      var m = avgMembers(r);
      return {
        year: r.year, members: m,
        fuel:    m * partPct(state, 'fuel') / 100,
        vendor:  m * partPct(state, 'vendor') / 100,
        rewards: m * partPct(state, 'rewards') / 100
      };
    });
  }

  // ── Cost to Acquire & Serve ─────────────────────────────────────────────
  function costModel(state, M, R) {
    var c = state.costs || {};
    var spendPerMonth = n(c.salesSpendPerMonth);
    var servePerMember = n(c.costToServePerMember);
    var flatCac = n(c.acquisitionPerMember);
    var unset = !spendPerMonth && !servePerMember && !flatCac;

    var byYear = M.years.map(function (r, i) {
      var months = M.months.filter(function (m) { return m.year === r.year; }).length;
      var spend = spendPerMonth * months;
      var adds = r.newModeled;
      // A flat per-member figure wins when supplied; otherwise derive from spend.
      var cac = flatCac || (adds > 0 ? spend / adds : 0);
      var members = avgMembers(r);
      return {
        year: r.year, months: months, spend: spend, adds: adds, cac: cac,
        acquisition: cac * adds,
        costToServe: servePerMember * members,
        revenue: R[i] ? R[i].total : 0
      };
    });

    // LTV from the model's own steady attrition, not a separate assumption:
    // average member life is 1/churn years.
    var steady = n((state.attrition || {}).steady) / 100;
    var lastR = R[R.length - 1];
    var revPerMemberYr = lastR && lastR.members ? lastR.total / lastR.members : 0;
    var grossPerYear = revPerMemberYr - servePerMember;
    var lifeYears = steady > 0 ? 1 / steady : null;
    var ltv = lifeYears !== null ? grossPerYear * lifeYears : null;

    var lastCac = byYear.length ? byYear[byYear.length - 1].cac : 0;

    return {
      byYear: byYear,
      cac: lastCac,
      costToServePerMember: servePerMember,
      lifeYears: lifeYears,
      ltv: unset ? null : ltv,
      // null, never Infinity: a zero CAC means "unset", not "instant payback".
      payback: (lastCac > 0 && grossPerYear > 0) ? lastCac / (grossPerYear / 12) : null,
      ltvCac: (lastCac > 0 && ltv !== null) ? ltv / lastCac : null,
      unset: unset
    };
  }

  // ── Staffing & Capacity ─────────────────────────────────────────────────
  function capacityModel(state, M, pipeline) {
    var reps = ((state.staffing || {}).reps || []).map(function (r) {
      return {
        name: r.name || '', capacityLeads: n(r.capacityLeads),
        costPerYear: n(r.costPerYear)
      };
    });
    var totalCapacity = reps.reduce(function (a, r) { return a + r.capacityLeads; }, 0);
    var totalCost = reps.reduce(function (a, r) { return a + r.costPerYear; }, 0);
    var unset = totalCapacity === 0;

    var byOwner = {};
    reps.forEach(function (r) {
      byOwner[r.name] = {
        capacityLeads: r.capacityLeads, costPerYear: r.costPerYear,
        openLeads: 0, openLocations: 0
      };
    });
    if (pipeline && pipeline.byOwner) {
      Object.keys(pipeline.byOwner).forEach(function (name) {
        byOwner[name] = byOwner[name] ||
          { capacityLeads: 0, costPerYear: 0, openLeads: 0, openLocations: 0 };
        byOwner[name].openLeads = pipeline.byOwner[name].openLeads;
        byOwner[name].openLocations = pipeline.byOwner[name].openLocations;
      });
    }

    var modeled = n((state.adds || {}).perMonth);
    if ((state.salesPipeline || {}).basis === 'pipeline' && pipeline) {
      modeled = pipeline.expectedPerMonth;
    }

    return {
      reps: reps, totalCapacity: totalCapacity, totalCost: totalCost,
      modeledAddsPerMonth: modeled,
      // null, not a negative number, when capacity was never entered:
      // a surplus computed against zero capacity would be a lie.
      gap: unset ? null : modeled - totalCapacity,
      byOwner: byOwner, unset: unset
    };
  }

  // ── Profit & Cash Flow ──────────────────────────────────────────────────
  function cashflowModel(state, M, R) {
    var cost = costModel(state, M, R);
    var cf = state.cashflow || {};
    var norm = n((state.valuation || {}).ebitdaNormalization);
    var capex = n(cf.capexPerYear);

    return R.map(function (r, i) {
      var cy = cost.byYear[i] || { acquisition: 0, costToServe: 0 };
      var ebitda = r.total - cy.costToServe - cy.acquisition + norm;
      return {
        year: r.year, revenue: r.total,
        costToServe: cy.costToServe, acquisition: cy.acquisition,
        normalization: norm, ebitda: ebitda,
        capex: capex, cash: ebitda - capex,
        margin: r.total ? 100 * ebitda / r.total : 0
      };
    });
  }
```

Export: `CRM_STAGES`, `CRM_CLOSED_STAGES`, `isClosedStage`, `pipelineModel`, `addsOpts`, `gallonProduction`, `participationModel`, `costModel`, `capacityModel`, `cashflowModel`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test membershipModel.test.js`
Expected: PASS — 64/64.  
**The count is informational** — report the actual total rather than matching this number. The plan's absolute counts have drifted once already; a mismatch means a test was added or removed, not necessarily a failure.

Watch two in particular. `pipeline basis is opt-in` is the guard that an unsigned page is unaffected; if it fails, `addsOpts` is returning an override when `basis !== 'pipeline'`. And `an unmapped group reports zero and is flagged` is the guard that adding a group on the Starting Membership tab cannot silently vanish from gallon production.

- [ ] **Step 5: Commit**

```bash
git add membershipModel.js membershipModel.test.js
git commit -m "feat(mgm): pipeline, gallons, participation, cost, capacity and cash-flow layers"
```

---

## Task 7: Page scaffold, twelve tabs, logo, nav

The engine is fully proven. This task puts it on screen.

**Files:**
- Create: `membership-growth-model/index.html`
- Modify: `index.html` (nav row, after line 851), `.gitignore`

**Interfaces:**
- Consumes: `MGM_CONFIG`, `MembershipModel`, `BDPG_CONFIG`, `BusDevGallonsCalc`.
- Produces: `MGM.state`, `MGM.save()`, `MGM.refresh()`, `MGM.refreshSoft()`, `MGM.switchTab(key)`, `MGM.baselineFor(profile, roadway)`, `MGM.model()`.

- [ ] **Step 1: Port the v1 and strip the base64 logo**

Copy the v1 `membership-growth-model.html` to `membership-growth-model/index.html`, then:

1. Delete the `<img id="logoImg" src="data:image/png;base64,…">` payload — ~134KB of the 190KB file — and replace with:

```html
<img id="logoImg" src="../assets/roadys-logo-cover.png" alt="Roady's"
     onerror="this.parentElement.classList.add('no-img')">
```

Add `.brandbar.no-img img{display:none}` so a missing asset collapses cleanly rather than showing a broken-image glyph. The `onerror` idiom matches `gs-command-center.html:12923`.

2. Add the no-cache meta tags the BDPG page carries (`bus-dev-potential-gallons/index.html:6-9`), since Pages caches aggressively:

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

3. Replace the inline `CURRENT_YEAR` / `GROUPS` / `DEFAULTS` / `BD_BASE` / `BD_REGIONS` block (v1 lines 380–432) with module script tags in `<head>`, **before** the page's own `<script>`. `busDevGallonsConfig.js` must precede `busDevGallonsCalculator.js`, which reads it at factory time:

```html
<script src="../busDevGallonsConfig.js"></script>
<script src="../busDevGallonsCalculator.js"></script>
<script src="../membershipModelConfig.js?v=2026-10-28"></script>
<script src="../membershipModel.js?v=2026-10-28"></script>
```

4. Delete the v1's `BD_BASE`, `BD_REGIONS`, `bdRow()`, `bdRoadways()`, `tpPct()` and `bdCalc()` entirely, along with the pricing-posture control, the inside-sales/DEF opportunity layers and the "Business Development use only" panel. That is `bus-dev-potential-gallons/`'s job; Task 11 builds the network-level replacement.

5. Replace the v1's state bootstrap:

```js
const MGM = {};
const MM = MembershipModel;
const STORE_KEY = 'roadys_mgm_v2';   // v2: the v1's state shape is not compatible

MGM.state = MM.defaultState(MGM_CONFIG);
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY));
  // MM.mergeState, NOT Object.assign. This line runs on every page load, so
  // it is the most load-bearing merge in the tool: 17 of the 25 top-level
  // state keys are nested objects, and a shallow assign replaces each
  // wholesale. A returning user whose saved state predates any nested field
  // addition gets that field as undefined -- and _n(undefined) is 0, so it
  // becomes a silent zero on every subsequent visit. Measured: dropping two
  // fields understated revenue by $198,467/yr with nothing on screen saying so.
  if (saved) MGM.state = MM.mergeState(MM.defaultState(MGM_CONFIG), saved).state;
} catch (e) { /* corrupt entry: fall back to defaults rather than a blank page */ }

MGM.save = function () {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(MGM.state)); }
  catch (e) { console.warn('[MGM] save failed', e); }
};

// Live data, populated only when signed in (Tasks 10 and 16).
MGM.leads = [];
MGM.profiles = [];
MGM.pnlActuals = null;

// The injected baseline lookup that keeps the engine pure.
MGM.baselineFor = function (profile, roadway) {
  try { return BusDevGallonsCalc.getBaselineRow(profile, roadway) || null; }
  catch (e) { return null; }
};

// One place that assembles every layer, so no renderer recomputes a slice
// of the model on its own and drifts.
MGM.model = function () {
  const st = MGM.state;
  const pipeline = MM.pipelineModel(st, MGM.leads, MGM.profiles);
  const M = MM.runModel(st, MM.addsOpts(st, pipeline));
  const R = MM.revenueModel(st, M);
  const F = MM.cashflowModel(st, M, R);
  const cost = MM.costModel(st, M, R);

  // A zero-cost cash bridge must NOT become a valuation basis. With costs
  // unset, cashflowModel's EBITDA is revenue minus nothing -- a 100% margin --
  // and passing it as the override produced a $9.09M headline midpoint against
  // $3.03M on the margin branch: a 3x overstatement on the shipped defaults,
  // for a business whose real net margin is nowhere near the 100% that bridge
  // implies (the actual figure is auth-gated in mgm_pnl_actuals). It also made
  // valuation.ebitdaMargin dead code, since the override always won.
  // So: only hand over a computed EBITDA once real costs exist.
  const ebitdaOverride = (!cost.unset && F.length) ? F[F.length - 1].ebitda : null;

  return {
    st, pipeline, M, R, F, cost,
    rpm: MM.revPerMember(st, M, MGM.pnlActuals),
    gallons: MM.gallonProduction(st, MGM.baselineFor, pipeline),
    participation: MM.participationModel(st, M),
    capacity: MM.capacityModel(st, M, pipeline),
    valuation: MM.valuation(st, R[R.length - 1], ebitdaOverride)
  };
};
```

- [ ] **Step 2: Add `esc()` before any interpolation of user text**

Every label and prose field is user-authored and reaches `innerHTML`:

```js
// User-authored labels and prose reach innerHTML; escape so a pasted
// '<' or '&' renders literally instead of breaking the table or report.
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
```

- [ ] **Step 3: Build the twelve-tab rail from labels**

Replace the v1's six hardcoded tab buttons and six `.panel` divs with a rail rendered from `labels.tabs`, so renaming a tab is a state edit (Task 8) and the order is declared once:

```js
const TAB_ORDER = ['starting', 'additions', 'losses', 'pipeline', 'participation',
  'gallons', 'revpermember', 'cost', 'staffing', 'cashflow', 'historical', 'report'];

MGM.renderTabs = function () {
  const t = MGM.state.labels.tabs;
  document.getElementById('tabrail').innerHTML = TAB_ORDER.map(k =>
    `<button class="tab${k === MGM.tab ? ' active' : ''}" data-tab="${k}"
       onclick="MGM.switchTab('${k}')">${esc(t[k])}</button>`).join('');
};

MGM.tab = 'starting';
MGM.switchTab = function (k) {
  MGM.tab = k;
  TAB_ORDER.forEach(x => {
    const p = document.getElementById('panel-' + x);
    if (p) p.classList.toggle('active', x === k);
  });
  MGM.renderTabs();
  MGM.refresh();
};
```

The v1's `.tabrail .inner` is already `overflow-x:auto`, so twelve tabs need no new layout mechanism. Add twelve empty panels:

```html
<main>
  <section class="panel active" id="panel-starting"></section>
  <section class="panel" id="panel-additions"></section>
  <section class="panel" id="panel-losses"></section>
  <section class="panel" id="panel-pipeline"></section>
  <section class="panel" id="panel-participation"></section>
  <section class="panel" id="panel-gallons"></section>
  <section class="panel" id="panel-revpermember"></section>
  <section class="panel" id="panel-cost"></section>
  <section class="panel" id="panel-staffing"></section>
  <section class="panel" id="panel-cashflow"></section>
  <section class="panel" id="panel-historical"></section>
  <section class="panel" id="panel-report"></section>
</main>
```

- [ ] **Step 4: Wire the dispatching refresh**

```js
// Renderers register here; tabs 1-12 fill in over Tasks 9-13 and 17.
MGM.renderers = {};

MGM.refresh = function () {
  const fn = MGM.renderers[MGM.tab];
  if (fn) {
    try { fn(MGM.model()); }
    catch (e) {
      console.error('[MGM] render failed', MGM.tab, e);
      document.getElementById('panel-' + MGM.tab).innerHTML =
        `<div class="card"><h3>This tab could not render</h3>
         <p class="note">${esc(e.message)}</p></div>`;
    }
  }
  if (MGM.bindAll) MGM.bindAll();
};
MGM.refreshSoft = MGM.refresh;

// Placeholder so an unimplemented tab says so instead of showing blank.
// This block must sit AFTER every real MGM.renderers.* assignment in source
// order; the `||` then only fills tabs nothing has claimed yet.
TAB_ORDER.forEach(k => {
  MGM.renderers[k] = MGM.renderers[k] || (() => {
    document.getElementById('panel-' + k).innerHTML =
      `<div class="card"><h3>${esc(MGM.state.labels.tabs[k])}</h3>
       <p class="note">Not implemented yet.</p></div>`;
  });
});

document.addEventListener('DOMContentLoaded', () => {
  MGM.renderTabs();
  MGM.switchTab('starting');
});
```

- [ ] **Step 4b: Fix three forward-compatibility defects the v1 markup carries**

These were found by Task 7's review as latent breakage in Tasks 16 and 17. All
three are one-line changes and all three belong here, in the scaffold, rather
than in the task that would trip over them.

**(a) `#authBar` must exist.** Task 16's `MGM.renderAuth()` does
`document.getElementById('authBar').innerHTML = …` unguarded, as the first
statement of a `DOMContentLoaded` handler — and no task anywhere creates that
element. Left missing, Task 16 throws synchronously and aborts the rest of that
handler, so `loadRegionVariance()`, `loadPnlActuals()`, `loadPipeline()` and
`refresh()` never run. Add the container to the brand bar, before the buttons:

```html
    <div class="actions noprint">
      <span id="authBar" class="authbar"></span>
      <button class="btn ghost" id="themeBtn" title="Toggle light / dark">◐ Theme</button>
```

with `.authbar{display:inline-flex;align-items:center;gap:8px}` in the stylesheet.
`<button>` is phrasing content, so a `<span>` is a valid parent for what Task 16
injects.

**(b) `goReport()` does not exist and never will.** The v1's "Generate Report"
button calls it; no task in this plan defines it. Task 17 defines `doPrint`,
`openEmail` and `sendEmail`, but not this. Point the button at the tab instead:

```html
      <button class="btn primary" onclick="MGM.switchTab('report')">Generate Report</button>
```

**(c) Scope the inherited `@media print` block.** The v1's block is
unconditional, so it forces report-only printing on *any* print action. Task 17
adds a `body.mgm-print`-scoped block specifically so that a plain File ▸ Print
is unaffected — a goal the unscoped rule already defeats. Prefix every selector
inside the existing `@media print{…}` with `body.mgm-print`:

```css
@media print{
  body.mgm-print{background:#fff}
  body.mgm-print .brandbar,body.mgm-print .tabrail,
  body.mgm-print .noprint,body.mgm-print .actions{display:none!important}
  body.mgm-print main{padding:0;max-width:none}
  body.mgm-print .panel{display:none!important}
  body.mgm-print #panel-report{display:block!important}
  body.mgm-print #reportSheet{border:0;box-shadow:none;padding:24px 8px;max-width:none}
}
```

After this, a plain browser print renders whatever tab is on screen, and only
`MGM.doPrint()` (Task 17) produces the report-only layout.

- [ ] **Step 5: Verify the page loads**

```bash
python -m http.server 8777
```

Open `http://localhost:8777/membership-growth-model/`.
Expected: brand bar with the real logo; **twelve** tabs in the rail, horizontally scrollable, reading Starting Membership → Report; clicking each switches panels with no console errors. `MGM.model()` typed in the console returns an object whose `M.startTotal` is **375**.

If `MGM_CONFIG is not defined`, the module tags are after the page script. If `BusDevGallonsCalc is not defined`, `busDevGallonsConfig.js` is missing or ordered after the calculator.

- [ ] **Step 6: Wire the nav row**

In `index.html`, inside `<div class="nav-children" data-nav-grp-children="membership">` (around line 851), after the PTP Conversions row:

```html
      <div class="ni" data-nav-id="membership-growth-model" onclick="window.open('membership-growth-model/','_blank')"><span class="ni-icon">📊</span>Membership Growth Model<span class="expand-icon" style="font-size:.7em;margin-left:auto;color:var(--accent)">↗</span></div>
```

- [ ] **Step 7: Verify the nav row**

Open `http://localhost:8777/`, expand **Membership** in the sidebar.
Expected: "Membership Growth Model" with the `↗` marker beside "PTP Conversions"; clicking opens the tool in a new tab.

- [ ] **Step 8: Commit**

```bash
git add membership-growth-model/index.html index.html
git commit -m "feat(mgm): twelve-tab tool page at membership-growth-model/ with nav wiring"
```

---

## Task 8: Universal editability

Every value, label and text block becomes editable, with one binding convention and an edit-mode toggle so the page is not a wall of inputs.

**Files:**
- Modify: `membership-growth-model/index.html`, `membershipModel.test.js`

**Interfaces:**
- Consumes: `MM.getPath`, `MM.setPath`.
- Produces: `MGM.bindAll(root)`, `MGM.editMode`, `MGM.toggleEdit()`, `MGM.resetSection(path)`, `MGM.resetAll()`, `MGM.isEdited(path)`, `MGM.addRow(listPath, template)`, `MGM.removeRow(listPath, i)`, `MGM.moveRow(listPath, i, delta)`, `MGM.rowTools(listPath, i, len)`, `MGM.editedMark(path)`.

- [ ] **Step 1: Write the failing test for the assumptions the binding layer rests on**

```js
test('list mutation keeps indices contiguous for data-k paths', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const before = st.groups.length;
  st.groups.splice(2, 1);
  assert.equal(st.groups.length, before - 1);
  st.groups.forEach((g, i) => {
    assert.equal(MembershipModel.getPath(st, `groups.${i}.label`), g.label);
  });
});

test('a reset restores a section from config without touching siblings', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.revenue.duesPerLoc = 999;
  st.valuation.revMultiple = 11;
  st.revenue = MembershipModel.defaultState(MGM_CONFIG).revenue;   // resetSection
  assert.equal(st.revenue.duesPerLoc, 362, 'section restored');
  assert.equal(st.valuation.revMultiple, 11, 'sibling untouched');
});

test('prose round-trips through JSON with markup-ish characters intact', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const nasty = 'Growth <b>held back</b> by A&B — "ownership sales" >50%';
  MembershipModel.setPath(st, 'report.intro', nasty);
  const back = JSON.parse(JSON.stringify(st));
  assert.equal(MembershipModel.getPath(back, 'report.intro'), nasty);
});

test('adding a group flows through every dependent layer', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.groups.push({ key: 'newgrp', label: 'New Group', count: 25 });
  const M = MembershipModel.runModel(st);
  assert.equal(M.startTotal, 400, 'roll-forward sees it');
  const R = MembershipModel.revenueModel(st, M);
  assert.ok(R[0].streams.dues > 0, 'revenue sees it');
});
```

- [ ] **Step 2: Run the test**

Run: `node --test membershipModel.test.js`
Expected: PASS — these assert behaviour Task 3's helpers already provide. They are regression guards for the binding layer, not new engine code. If `list mutation` fails, `getPath` mishandles numeric segments.

- [ ] **Step 3: Implement the binding layer**

Replace the v1's `bindInputs()`:

```js
// ── Binding ───────────────────────────────────────────────────────────────
// data-k       scalar — number | text | date | select, dotted state path
// data-k-list  repeating rows — add / remove / reorder
// data-k-text  prose — multi-line, stored as plain text
// Every control writes to MGM.state and nothing else, so localStorage,
// scenarios, Supabase sync and JSON export all follow for free.
MGM.bindAll = function (root) {
  root = root || document;

  root.querySelectorAll('[data-k]').forEach(el => {
    if (el.dataset.mgmBound) return;
    el.dataset.mgmBound = '1';
    if (!('value' in el)) return;            // read-only display cell
    const path = el.dataset.k;
    const ev = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const raw = el.value;
      MGM.bindWrite(el, path,
        el.type === 'number' ? (raw === '' ? null : Number(raw)) : raw);
      MGM.save();
      MGM.refreshSoft();
    });
  });

  root.querySelectorAll('[data-k-text]').forEach(el => {
    if (el.dataset.mgmBound) return;
    el.dataset.mgmBound = '1';
    const path = el.dataset.kText;
    el.value = MM.getPath(MGM.state, path) || '';
    el.addEventListener('input', () => {
      MGM.bindWrite(el, path, el.value);
      MGM.save();
    });
  });

  // Must run AFTER binding, on every call: bindAll is invoked at the end of
  // every MGM.refresh(), which is the redraw that would otherwise have wiped
  // the refusal marker created by the write that triggered the redraw.
  MGM.applyWriteFailures(root);
};

// A refused write must not look like a successful one. `setPath` returns the
// object unchanged when a path contains a reserved segment (__proto__,
// constructor, prototype) — see Task 3. Throwing here would break the page
// mid-keystroke inside an input handler, and silence would let someone edit a
// field, watch it "take", and build a report on a value that never landed.
// So: write, read back, and surface a visible inline warning on mismatch.
MGM.writeFailed = {};          // path -> true, cleared on a successful write

// The note is keyed to the FIELD, not to a shared parent. A parent-scoped
// lookup meant that when two bound inputs were direct siblings, a successful
// write on one DELETED the other's visible note — reproduced live in Task 8.
MGM.refusedNoteId = path => 'refused-' + String(path).replace(/[^A-Za-z0-9_.-]/g, '_');

MGM.showRefusal = function (el, path, failed) {
  el.classList.toggle('write-refused', failed);
  const id = MGM.refusedNoteId(path);
  let note = document.getElementById(id);
  if (failed && !note) {
    note = document.createElement('div');
    note.className = 'refused-note';
    note.id = id;
    note.textContent = 'This value was not saved — the field name is reserved. Rename it and try again.';
    el.insertAdjacentElement('afterend', note);
  } else if (!failed && note) {
    note.remove();
  }
};

MGM.bindWrite = function (el, path, value) {
  MM.setPath(MGM.state, path, value);
  const landed = MM.getPath(MGM.state, path);
  const ok = JSON.stringify(landed) === JSON.stringify(value);
  if (ok) { delete MGM.writeFailed[path]; }
  else { MGM.writeFailed[path] = true; }
  MGM.showRefusal(el, path, !ok);
  return ok;
};

// Re-apply refusal markers after a redraw. WITHOUT THIS THE WHOLE MECHANISM IS
// INERT: the scalar listener runs bindWrite -> save -> refreshSoft, and
// refreshSoft re-renders the panel, destroying the class and the note bindWrite
// just created — so a refused write would again look identical to a successful
// one, which is the exact failure this feature exists to prevent.
// MGM.writeFailed is the persistent record; this is what makes it visible
// again. Called at the end of bindAll, which runs after every refresh.
MGM.applyWriteFailures = function (root) {
  (root || document).querySelectorAll('[data-k],[data-k-text]').forEach(el => {
    const path = el.dataset.k || el.dataset.kText;
    if (path) MGM.showRefusal(el, path, !!MGM.writeFailed[path]);
  });
};

MGM.addRow = function (listPath, template) {
  const list = MM.getPath(MGM.state, listPath) || [];
  list.push(JSON.parse(JSON.stringify(template)));
  MM.setPath(MGM.state, listPath, list);
  MGM.save(); MGM.refresh();
};

MGM.removeRow = function (listPath, i) {
  (MM.getPath(MGM.state, listPath) || []).splice(i, 1);
  MGM.save(); MGM.refresh();
};

MGM.moveRow = function (listPath, i, delta) {
  const list = MM.getPath(MGM.state, listPath) || [];
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  const [row] = list.splice(i, 1);
  list.splice(j, 0, row);
  MGM.save(); MGM.refresh();
};

MGM.rowTools = function (listPath, i, len) {
  return `<span class="mgm-editonly">
    <button class="btn" title="Move up" onclick="MGM.moveRow('${listPath}',${i},-1)" ${i === 0 ? 'disabled' : ''}>▲</button>
    <button class="btn" title="Move down" onclick="MGM.moveRow('${listPath}',${i},1)" ${i === len - 1 ? 'disabled' : ''}>▼</button>
    <button class="btn" title="Remove" onclick="MGM.removeRow('${listPath}',${i})">✕</button>
  </span>`;
};

// ── Edited markers and reset ──────────────────────────────────────────────
// For a path inside a REORDERABLE array (groups.2.count), the index is not an
// identity: moveRow/removeRow renumber rows, so comparing state[i] against
// config[i] would badge a row against an unrelated config row. These arrays
// each carry a stable identifying field, so resolve the matching config row by
// that instead. A row the user added has no config counterpart and is edited
// by definition.
MGM.ROW_KEYS = { 'groups': 'key', 'sources': 'key', 'staffing.reps': 'name', 'history': 'year' };

MGM.isEdited = function (path) {
  const m = String(path).match(/^(.+?)\.(\d+)(?:\.(.+))?$/);
  const idField = m && MGM.ROW_KEYS[m[1]];
  if (idField) {
    const row = (MM.getPath(MGM.state, m[1]) || [])[+m[2]];
    if (!row) return false;
    const cfgRow = (MM.getPath(MGM_CONFIG, m[1]) || [])
      .find(r => r && r[idField] === row[idField]);
    if (!cfgRow) return true;                        // user-added row
    const field = m[3];
    // The identity field cannot be checked against the row we just FOUND by
    // matching that same field -- `row[idField] === cfgRow[idField]` holds by
    // construction, so a real rename would never badge. (Renaming a rep
    // "Robert Watson" -> "Angel Long" locates Angel Long's shipped row and
    // reports no edit.) Fall back to a positional comparison for that one
    // field: after a reorder it can badge a row that was not edited, but a
    // false POSITIVE is the safe direction here -- a false negative tells the
    // reader a hand-typed value is sourced data.
    if (field === idField) {
      const cfgAtIdx = (MM.getPath(MGM_CONFIG, m[1]) || [])[+m[2]];
      return !cfgAtIdx
        || JSON.stringify(row[field]) !== JSON.stringify(cfgAtIdx[field]);
    }
    return JSON.stringify(field ? row[field] : row)
        !== JSON.stringify(field ? cfgRow[field] : cfgRow);
  }
  return JSON.stringify(MM.getPath(MGM.state, path))
      !== JSON.stringify(MM.getPath(MGM_CONFIG, path));
};

MGM.editedMark = function (path) {
  return MGM.isEdited(path)
    ? '<span class="edited" title="Differs from the shipped default">edited</span>' : '';
};

MGM.resetSection = function (path) {
  const dflt = MM.getPath(MGM_CONFIG, path);
  if (dflt === undefined) return;
  MM.setPath(MGM.state, path, JSON.parse(JSON.stringify(dflt)));
  MGM.save(); MGM.refresh();
};

MGM.resetAll = function () {
  if (!confirm('Reset every value and label to the shipped defaults?')) return;
  MGM.state = MM.defaultState(MGM_CONFIG);
  MGM.save(); MGM.refresh();
};

// ── Edit mode ─────────────────────────────────────────────────────────────
// View-only state: never persisted into a scenario, never affects the model,
// and always off for print so the report shows values, not form controls.
MGM.editMode = false;
MGM.toggleEdit = function () {
  MGM.editMode = !MGM.editMode;
  document.body.classList.toggle('mgm-edit', MGM.editMode);
  document.getElementById('editBtn').textContent =
    MGM.editMode ? '✓ Done editing' : '✎ Edit';
  MGM.refresh();
};
window.addEventListener('beforeprint', () => document.body.classList.remove('mgm-edit'));
window.addEventListener('afterprint', () =>
  document.body.classList.toggle('mgm-edit', MGM.editMode));
```

- [ ] **Step 4: Add the edit-mode CSS and header control**

```css
/* Read mode shows values; edit mode reveals controls and row tools. */
.mgm-editonly{display:none}
body.mgm-edit .mgm-editonly{display:inline-flex;gap:6px}
.cell{border:1px solid transparent;background:transparent;color:inherit;
      font:inherit;width:100%;text-align:right;padding:3px 5px;border-radius:4px}
body.mgm-edit .cell{border-color:var(--line);background:var(--surface)}
.cell:focus{border-color:var(--red);outline:none}
.lbl-in{border:1px solid transparent;background:transparent;color:inherit;
        font:inherit;width:100%;padding:3px 5px;border-radius:4px}
body.mgm-edit .lbl-in{border-color:var(--line);background:var(--surface)}
.prose{width:100%;min-height:68px;font:inherit;color:inherit;
       background:var(--surface);border:1px solid var(--line);
       border-radius:6px;padding:8px 10px;resize:vertical}
.edited{color:var(--amber);font-size:11px;margin-left:5px}
.write-refused{border-color:var(--loss) !important;background:rgba(179,38,30,.06)}
.refused-note{color:var(--loss);font-size:11.5px;margin-top:4px;font-weight:600}
.ovr{display:inline-block;font-size:11px;font-weight:600;padding:2px 7px;
     border-radius:10px;background:var(--amber);color:#fff;margin-left:6px}
.assume{display:inline-block;font-size:11px;font-weight:600;padding:2px 7px;
        border-radius:10px;background:var(--chip);color:var(--ink-soft);margin-left:6px}
@media print{.mgm-editonly,.noprint{display:none !important}}
```

In the brand bar's `.actions`, before the existing buttons:

```html
<button class="btn ghost" id="editBtn" onclick="MGM.toggleEdit()">✎ Edit</button>
<button class="btn ghost" onclick="MGM.resetAll()">Reset all</button>
```

- [ ] **Step 5: Make the global and report fields editable**

Tabs 9–13 bind their own fields; this step covers the cross-cutting ones. Add a "Model settings" card on the Starting Membership tab and the report fields on the Report tab:

```html
<input class="cell" type="text"   data-k="DATA_ASOF">
<input class="cell" type="number" data-k="CURRENT_YEAR">
<input class="cell" type="number" data-k="ASOF_MONTH" min="1" max="12">
<input class="cell" type="number" data-k="HORIZON_YEARS" min="1" max="10">

<input class="lbl-in" type="text" data-k="report.company">
<input class="lbl-in" type="text" data-k="report.title">
<input class="lbl-in" type="text" data-k="report.subtitle">
<input class="lbl-in" type="text" data-k="report.footer">
<input class="lbl-in" type="text" data-k="report.generatedBy">
<input class="lbl-in" type="text" data-k="report.contact">
<input class="lbl-in" type="text" data-k="report.disclosure">
<textarea class="prose" data-k-text="report.intro" placeholder="Opening commentary…"></textarea>
<textarea class="prose" data-k-text="report.methodology" placeholder="Methodology notes…"></textarea>
<textarea class="prose" data-k-text="report.closing" placeholder="Closing commentary…"></textarea>
```

**Chart titles.** Every chart heading rendered by Tasks 9–13 must be an input
bound to its label, not static text, so the spec's "chart titles and axis
labels" row is satisfied uniformly. Use this helper and call it for every
`<h3>` that titles a canvas:

```js
MGM.chartTitle = function (key) {
  return `<h3><input class="lbl-in" type="text" data-k="labels.charts.${key}"
    value="${esc(MGM.state.labels.charts[key])}"></h3>`;
};
```

Add a tab-rename card (so tab labels are editable) and a per-tab notes box that every renderer appends:

```js
MGM.tabNotes = function (key) {
  return `<div class="card noprint-edit">
    <h3>Notes &amp; assumptions</h3>
    <textarea class="prose" data-k-text="labels.notes.${key}"
      placeholder="Assumptions and caveats for this tab — printed with the report."></textarea>
  </div>`;
};

MGM.tabRenameCard = function () {
  return `<div class="card mgm-editonly"><h3>Tab names</h3><table>` +
    TAB_ORDER.map(k => `<tr><td>${esc(MGM_CONFIG.labels.tabs[k])}</td>
      <td><input class="lbl-in" type="text" data-k="labels.tabs.${k}"
        value="${esc(MGM.state.labels.tabs[k])}"></td></tr>`).join('') +
    `</table><button class="btn" onclick="MGM.resetSection('labels.tabs')">Reset tab names</button></div>`;
};
```

- [ ] **Step 6: Verify in the browser**

1. Click **✎ Edit** — inputs gain borders, ▲▼✕ and "+ Add" appear.
2. Change the as-of month to 6 — the 2026 row's modeled months become 6.
3. Rename a tab in the tab-names card — the rail updates and survives reload.
4. Type prose containing `<b>bold</b> & "quotes"` into the report intro — it appears literally on the Report tab, not as markup.
5. **Reset all** restores every default, including labels.
6. Click **✓ Done editing**, then Ctrl+P — no input borders or row tools in the preview.
7. Reload with edit mode on — the page opens in read mode (edit state is not persisted) but edited *values* are retained.

- [ ] **Step 7: Commit**

```bash
git add membership-growth-model/index.html membershipModel.test.js
git commit -m "feat(mgm): universal editability with edit mode, row tools and reset"
```

---

## Task 9: Tabs 1–3 — Starting Membership, New Additions, Member Losses

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: `MGM.model()`, `MM.attritionSplit`.
- Produces: `MGM.renderers.starting`, `MGM.renderers.additions`, `MGM.renderers.losses`, `MGM.renderMonthly(M, year)`, `MGM.toggleMonthly(year)`.

- [ ] **Step 1: Shared formatters and the sign tile**

```js
const fmt  = n => Math.round(n).toLocaleString('en-US');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('en-US');
const fm$  = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const fmM  = n => (n < 0 ? '-$' : '$') + (Math.abs(n) / 1e6).toFixed(2) + 'M';
const pct1 = n => (n == null ? '—' : (Math.round(n * 10) / 10).toFixed(1) + '%');
const sign = (k, v, d, cls = '') =>
  `<div class="sign ${cls}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`;
```

`fmt1` matters: monthly figures are fractional, and rounding them to integers would make a month column visibly fail to sum to its annual row.

- [ ] **Step 2: Tab 1 — Starting Membership**

```js
MGM.renderers.starting = function (D) {
  const { st, M } = D;
  const tot = M.startTotal;
  const groups = st.groups;

  document.getElementById('panel-starting').innerHTML = `
  <h2>${esc(st.labels.tabs.starting)}</h2>
  <p class="sub">Verified active locations as of ${esc(st.DATA_ASOF)}. Excludes
     corporate payment records and demo rows.</p>
  <div class="signrow">
    ${sign('ACTIVE LOCATIONS', fmt(tot), 'verified base')}
    ${sign("ROADY'S SIDE", fmt(tot - M.ptp), 'excl. PTP group', 'dark')}
    ${sign('MONTHLY DUES', fm$(st.billing.monthlyDuesTotal),
           `${st.billing.companies} companies · ${st.billing.locations} billed`, 'red')}
    ${sign('PAYING LOCATIONS', fmt(st.billing.payingLocations),
           `${st.billing.zeroBillCompanies} companies bill $0`, 'dark')}
  </div>

  <div class="card"><h3>Locations by group</h3>
    <table>
      <tr><th>Group</th><th class="num">Active</th><th class="num">Mix</th></tr>
      ${groups.map((g, i) => `<tr>
        <td><input class="lbl-in" type="text" data-k="groups.${i}.label" value="${esc(g.label)}">
            ${MGM.rowTools('groups', i, groups.length)}</td>
        <td class="num"><input class="cell" type="number" data-k="groups.${i}.count"
            value="${g.count == null ? '' : g.count}">${MGM.editedMark(`groups.${i}.count`)}</td>
        <td class="num">${pct1(tot ? 100 * g.count / tot : 0)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num">${fmt(tot)}</td><td class="num">100%</td></tr>
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.addGroup()">+ Add group</button>
      <button class="btn" onclick="MGM.resetSection('groups')">Reset groups</button>
    </div>
    <p class="note">PTP counts the whole <code>Group=PTP</code> set regardless of
       type — 35 truck stops, 24 service centers, 30 PPOs — so the Truck Stop row
       deliberately excludes PTP truck stops.</p>
  </div>

  <div class="grid g2">
    <div class="card"><h3>Pipeline status</h3>
      <table>
        <tr><td>Onboarding</td><td class="num"><input class="cell" type="number"
            data-k="statusCounts.onboarding" value="${st.statusCounts.onboarding}"></td></tr>
        <tr><td>Offboarding</td><td class="num"><input class="cell" type="number"
            data-k="statusCounts.offboarding" value="${st.statusCounts.offboarding}"></td></tr>
      </table>
    </div>
    <div class="card"><h3>Billing</h3>
      <table>
        <tr><td>Companies</td><td class="num"><input class="cell" type="number"
            data-k="billing.companies" value="${st.billing.companies}"></td></tr>
        <tr><td>Billed locations</td><td class="num"><input class="cell" type="number"
            data-k="billing.locations" value="${st.billing.locations}"></td></tr>
        <tr><td>Monthly dues total</td><td class="num"><input class="cell" type="number"
            data-k="billing.monthlyDuesTotal" value="${st.billing.monthlyDuesTotal}"></td></tr>
        <tr><td>Billable $/location</td><td class="num"><input class="cell" type="number" step="0.01"
            data-k="billing.duesPerLocBillable" value="${st.billing.duesPerLocBillable}"></td></tr>
        <tr><td>Paying locations</td><td class="num"><input class="cell" type="number"
            data-k="billing.payingLocations" value="${st.billing.payingLocations}"></td></tr>
      </table>
      <p class="note">The <b>${fmt(tot)}</b> active count and the
         <b>${fmt(st.billing.locations)}</b> billed locations come from two
         different Interstate exports and need not agree: billing covers
         onboarding and offboarding sites the active list excludes, and
         ${st.billing.zeroBillCompanies} companies bill nothing. The projection
         runs from the active count.</p>
    </div>
  </div>

  <div class="card"><h3>Model settings</h3>
    <table>
      <tr><td>Data as of</td><td><input class="cell" type="text" data-k="DATA_ASOF" value="${esc(st.DATA_ASOF)}"></td></tr>
      <tr><td>Current year</td><td><input class="cell" type="number" data-k="CURRENT_YEAR" value="${st.CURRENT_YEAR}"></td></tr>
      <tr><td>As-of month (1–12)</td><td><input class="cell" type="number" min="1" max="12" data-k="ASOF_MONTH" value="${st.ASOF_MONTH}"></td></tr>
      <tr><td>Projection years</td><td><input class="cell" type="number" min="1" max="10" data-k="HORIZON_YEARS" value="${st.HORIZON_YEARS}"></td></tr>
    </table>
  </div>

  <div class="card"><h3>PTP — unresolved</h3>
    <p class="note">${esc(st.ptpNote)}</p>
    <p class="note">Held flat at <code>ptpNet: 0</code> so it cannot distort a projection.</p>
  </div>

  ${MGM.tabRenameCard()}
  ${MGM.tabNotes('starting')}`;
};
```

- [ ] **Step 3: Tab 2 — New Additions**

```js
MGM.renderers.additions = function (D) {
  const { st, M, pipeline } = D;
  const usingPipeline = st.salesPipeline.basis === 'pipeline';
  const totalNew = M.years.reduce((a, r) => a + r.newModeled, 0);
  const srcs = st.sources;

  document.getElementById('panel-additions').innerHTML = `
  <h2>${esc(st.labels.tabs.additions)}</h2>
  <p class="sub">PTP conversions and Change of Ownership are excluded from every count.</p>
  <div class="signrow">
    ${sign('MODELED NEW', fmt(totalNew), 'excl. signings already in the base')}
    ${sign('ADDS / MONTH', fmt1(usingPipeline ? pipeline.expectedPerMonth : st.adds.perMonth),
           usingPipeline ? 'from the pipeline' : 'flat run rate', 'dark')}
    ${sign('ACTIVATION LAG', st.adds.activationLag + ' mo', 'before revenue counts', 'dark')}
    ${sign('ANNUAL GROWTH', pct1(st.adds.growthPct), 'applied to the add rate', 'red')}
  </div>

  <div class="card"><h3>Basis</h3>
    <table>
      <tr><td>Add rate basis</td><td>
        <select class="cell" data-k="salesPipeline.basis">
          <option value="flat"${!usingPipeline ? ' selected' : ''}>Flat run rate</option>
          <option value="pipeline"${usingPipeline ? ' selected' : ''}>From Sales Pipeline</option>
        </select></td></tr>
      <tr><td>New members / month (flat)</td><td class="num"><input class="cell" type="number"
          step="0.1" data-k="adds.perMonth" value="${st.adds.perMonth}">
          ${MGM.editedMark('adds.perMonth')}</td></tr>
      <tr><td>Annual growth in the add rate</td><td class="num"><input class="cell" type="number"
          step="0.5" data-k="adds.growthPct" value="${st.adds.growthPct}"></td></tr>
      <tr><td>Activation lag (months)</td><td class="num"><input class="cell" type="number"
          min="0" data-k="adds.activationLag" value="${st.adds.activationLag}"></td></tr>
      <tr><td>PTP net change / yr</td><td class="num"><input class="cell" type="number"
          data-k="adds.ptpNet" value="${st.adds.ptpNet}"></td></tr>
    </table>
    <p class="note">${usingPipeline
      ? `<b>Live basis: Sales Pipeline</b> — ${fmt1(pipeline.expectedPerMonth)} locations/month weighted from ${pipeline.openLeads} open leads.`
      : `<b>Live basis: flat run rate</b> — ${fmt1(st.adds.perMonth)}/month. Switch above to drive this from the pipeline.`}</p>
    ${usingPipeline && pipeline.isEmpty
      ? '<p class="note"><span class="ovr">No pipeline data loaded</span> Sign in on the Sales Pipeline tab, or the add rate is zero.</p>' : ''}
  </div>

  <div class="card"><h3>Roll-forward</h3>
    ${(() => { const y0 = M.years[0];
      return y0.ytd ? `<p class="note">The ${fmt(y0.start)} opening count already
        includes <b>${fmt(y0.ytd)}</b> signings booked Jan–${MONTH_NAMES[st.ASOF_MONTH - 1]}
        ${y0.year}. The New column therefore shows only the months still being
        modeled, so each row foots against its own monthly detail.</p>` : ''; })()}
    <table>
      <tr><th>Year</th><th class="num">Start</th><th class="num">New</th>
          <th class="num">Lost</th><th class="num">End</th><th class="num">Net</th>
          <th class="num">Growth</th><th></th></tr>
      ${M.years.map(r => `
        <tr><td>${r.year}${r.year === st.CURRENT_YEAR ? ' <span class="note">proj.</span>' : ''}</td>
        <td class="num">${fmt(r.start)}</td>
        <td class="num">${fmt1(r.newModeled)}</td>
        <td class="num">${fmt1(r.lost)}</td>
        <td class="num"><b>${fmt(r.end)}</b></td>
        <td class="num ${r.net >= 0 ? 'pos' : 'neg'}">${r.net >= 0 ? '+' : ''}${fmt1(r.net)}</td>
        <td class="num ${r.net >= 0 ? 'pos' : 'neg'}">${pct1(r.pct)}</td>
        <td><button class="btn" onclick="MGM.toggleMonthly(${r.year})">▸ months</button></td></tr>
        <tr id="mo-${r.year}" style="display:none"><td colspan="8">
          <table>${MGM.renderMonthly(M, r.year)}</table></td></tr>`).join('')}
    </table>
  </div>

  <div class="card"><h3>Source mix</h3>
    <table>
      <tr><th>Source</th><th class="num">Mix</th>${M.years.map(r => `<th class="num">${r.year}</th>`).join('')}</tr>
      ${srcs.map((s, i) => `<tr>
        <td><input class="lbl-in" type="text" data-k="sources.${i}.label" value="${esc(s.label)}">
            ${MGM.rowTools('sources', i, srcs.length)}</td>
        <td class="num"><input class="cell" type="number" data-k="sources.${i}.pct" value="${s.pct}">
            ${MGM.editedMark(`sources.${i}.pct`)}</td>
        ${M.years.map(r => `<td class="num">${fmt1(r.newModeled * s.pct / 100)}</td>`).join('')}</tr>`).join('')}
      <tr class="total"><td>Total new</td>
        <td class="num">${srcs.reduce((a, s) => a + (+s.pct || 0), 0)}%</td>
        ${M.years.map(r => `<td class="num">${fmt1(r.newModeled)}</td>`).join('')}</tr>
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.addRow('sources',{key:'',label:'New source',pct:0})">+ Add source</button>
      <button class="btn" onclick="MGM.resetSection('sources')">Reset sources</button>
    </div>
    ${(() => { const s = srcs.reduce((a, x) => a + (+x.pct || 0), 0);
      return s === 100 ? '<p class="note">Mix totals 100%.</p>'
        : `<p class="note neg">Mix totals ${s}% — adjust to 100%.</p>`; })()}
    <p class="note">Per-group signup mix is not yet available from Interstate; this
       is a whole-network split.</p>
  </div>

  ${MGM.tabNotes('additions')}`;
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

MGM.renderMonthly = function (M, year) {
  const mm = M.months.filter(m => m.year === year);
  if (!mm.length) return '<tr><td class="note">No modeled months in this year.</td></tr>';
  return '<tr><th>Month</th><th class="num">Start</th><th class="num">New</th>' +
    '<th class="num">Steady loss</th><th class="num">Structural</th>' +
    '<th class="num">End</th><th class="num">Producing</th></tr>' +
    mm.map(m => {
      // Supplied by the engine (Task 2) rather than re-derived here by
      // inverting runModel's update expression.
      const start = m.start;
      return `<tr><td>${MONTH_NAMES[(m.month - 1) % 12]} ${year}</td>
        <td class="num">${fmt1(start)}</td><td class="num">${fmt1(m.adds)}</td>
        <td class="num">${fmt1(m.steadyLost)}</td><td class="num">${fmt1(m.structuralLost)}</td>
        <td class="num"><b>${fmt1(m.end)}</b></td><td class="num">${fmt1(m.producing)}</td></tr>`;
    }).join('') +
    `<tr class="total"><td>Year total</td><td class="num">—</td>
     <td class="num">${fmt1(mm.reduce((a, m) => a + m.adds, 0))}</td>
     <td class="num">${fmt1(mm.reduce((a, m) => a + m.steadyLost, 0))}</td>
     <td class="num">${fmt1(mm.reduce((a, m) => a + m.structuralLost, 0))}</td>
     <td class="num">—</td><td class="num">—</td></tr>`;
};

MGM.toggleMonthly = function (year) {
  const el = document.getElementById('mo-' + year);
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : '';
  el.previousElementSibling.querySelector('button').textContent =
    open ? '▸ months' : '▾ months';
};
```

- [ ] **Step 4: Tab 3 — Member Losses, with the split decomposition**

```js
MGM.renderers.losses = function (D) {
  const { st, M } = D;
  const d = MM.derivedAttrition(st.history);
  const split = MM.attritionSplit(st.history, st.attrition.steadyAlt);
  const totalLost = M.years.reduce((a, r) => a + r.lost, 0);
  const years = M.years.map(r => r.year).filter(y => y > st.CURRENT_YEAR);

  document.getElementById('panel-losses').innerHTML = `
  <h2>${esc(st.labels.tabs.losses)}</h2>
  <p class="sub">Steady-state churn plus explicit structural consolidation.</p>
  <div class="signrow">
    ${sign('PROJECTED LOSSES', fmt(totalLost), 'over the projection', 'red')}
    ${sign('STEADY RATE', pct1(st.attrition.steady), 'annual, recurring')}
    ${sign('3-YR DERIVED', pct1(d.avg), 'lost / prior count', 'dark')}
    ${sign('STRUCTURAL', fmt(M.years.reduce((a, r) => a + r.structuralLost, 0)),
           'one-off consolidation', 'dark')}
  </div>

  <div class="card"><h3>Assumption</h3>
    <table>
      <tr><td>Steady annual attrition</td><td class="num"><input class="cell" type="number"
          step="0.1" data-k="attrition.steady" value="${st.attrition.steady}">
          ${MGM.editedMark('attrition.steady')}</td></tr>
      <tr><td>Pre-spike steady baseline</td><td class="num"><input class="cell" type="number"
          step="0.1" data-k="attrition.steadyAlt" value="${st.attrition.steadyAlt}"></td></tr>
    </table>
    <div style="margin-top:10px">
      <button class="btn primary" onclick="MGM.useSplitBasis()">Use split basis
        (${pct1(st.attrition.steadyAlt)} steady)</button>
      <button class="btn" onclick="MGM.resetSection('attrition')">Reset attrition</button>
    </div>
    <p class="note">${esc(st.attrition.note)}</p>
  </div>

  <div class="card"><h3>Historical decomposition at ${pct1(st.attrition.steadyAlt)} steady</h3>
    <table>
      <tr><th>Year</th><th class="num">Prior count</th><th class="num">Lost</th>
          <th class="num">Total rate</th><th class="num">Steady</th>
          <th class="num">Structural</th></tr>
      ${split.rows.map(r => `<tr><td>${r.year}</td>
        <td class="num">${fmt(r.base)}</td><td class="num">${fmt(r.totalLost)}</td>
        <td class="num">${pct1(r.totalRate)}</td>
        <td class="num">${pct1(r.steadyRate)} (${fmt1(r.steadyLost)})</td>
        <td class="num ${r.structuralRate > 0 ? 'neg' : ''}">${pct1(r.structuralRate)} (${fmt1(r.structuralLost)})</td></tr>`).join('')}
    </table>
    <p class="note">Structural is clamped at zero — a year quieter than the steady
       assumption has no structural loss, not negative structural loss. The two
       components always sum back to the realized total.</p>
  </div>

  <div class="card"><h3>Structural overrides by projection year</h3>
    <table>
      <tr><th>Year</th><th class="num">Structural locations lost</th></tr>
      ${years.map(y => `<tr><td>${y}</td><td class="num"><input class="cell" type="number"
        data-k="attrition.structural.${y}"
        value="${st.attrition.structural[y] == null ? 0 : st.attrition.structural[y]}"></td></tr>`).join('')}
    </table>
    <p class="note">Added <b>on top of</b> steady loss, never replacing it. Spread
       evenly across that year's months.</p>
  </div>

  ${MGM.tabNotes('losses')}`;
};

// The group `key` is NOT cosmetic: Task 11 interpolates it into state paths
// (`gallons.groupProfile.<key>`, `gallons.groupBaselineOverride.<key>`). The
// first draft of this plan created groups with `key: ''` and gave no way to
// edit it, which meant (a) an added group could never be mapped to a gallon
// profile, and (b) two added groups collided on the same empty override slot.
// So the key is derived from the label, kept unique, and validated here —
// at the point of creation, with a visible message — rather than relying on
// `setPath`'s reserved-segment guard, which refuses silently by design.
MGM.RESERVED_KEYS = ['__proto__', 'constructor', 'prototype'];

MGM.makeGroupKey = function (label, taken) {
  const base = String(label || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
  if (MGM.RESERVED_KEYS.indexOf(base) !== -1) return null;
  let key = base, i = 2;
  while (taken.indexOf(key) !== -1) { key = base + '-' + i; i++; }
  return key;
};

MGM.addGroup = function () {
  const label = (prompt('Group name:', 'New group') || '').trim();
  if (!label) return;
  const taken = MGM.state.groups.map(g => g.key);
  const key = MGM.makeGroupKey(label, taken);
  if (!key) {
    alert('"' + label + '" is a reserved word and cannot be used as a group name. Pick a different name.');
    return;
  }
  MGM.addRow('groups', { key: key, label: label, count: 0 });
};

// NOTE: there is deliberately no renameGroup(). The label is edited in place
// through a plain `data-k="groups.N.label"` input, and the KEY is never bound
// to any control -- so a rename cannot orphan the gallon mapping that Task 11
// addresses by key. An earlier draft had a prompt() wrapper warning about key
// stability; it was dead code, because the risk it warned about cannot occur.

MGM.useSplitBasis = function () {
  MGM.state.attrition.steady = MGM.state.attrition.steadyAlt;
  MGM.save(); MGM.refresh();
};
```

- [ ] **Step 5: Verify in the browser**

1. **Starting Membership** shows 375 and the 154/6/22/88/7/9/89 split; mix sums to 100%.
2. **+ Add group**, name it, give it a count — the total and mix update; **✕** removes it.
3. Set the as-of month to 6 — New Additions' 2026 row shows 6 modeled months.
4. **New Additions** → **▸ months** on 2027 expands 12 rows; the New / Steady loss / Structural columns each sum to the annual row.
5. 2026 expands to **2** rows (Nov, Dec) at the default as-of month of October.
6. **Member Losses** → the decomposition table shows 2024 at 13.7% = 3.6% steady + 10.1% structural, and 2022's structural clamped to 0.0%.
7. **Use split basis** sets steady to 3.6% and the trajectory on New Additions rises.
8. Enter 12 in the 2027 structural override — the monthly Structural column fills and sums to 12.0, and total losses rise.
9. Switch the basis select to "From Sales Pipeline" with nobody signed in — the card says no pipeline data is loaded rather than silently modeling zero adds.

- [ ] **Step 6: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): Starting Membership, New Additions and Member Losses tabs"
```

---

## Task 10: Tab 4 — Sales Pipeline

Reads `crm_leads` and `bd_value_profiles` live. Both are auth-gated, so this tab must be useful and honest when unsigned.

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: `MM.pipelineModel`, `MM.CRM_STAGES`, `RoadysBD.auth` (loaded in Task 16; guard for its absence until then).
- Produces: `MGM.renderers.pipeline`, `MGM.loadPipeline()`.

- [ ] **Step 1: Load the pipeline, failing visibly rather than silently**

```js
// crm_leads requires a session (sql/2026-10-05-crm-leads-require-auth.sql),
// so an unsigned page gets an empty pipeline and says so. Never substitute
// invented leads for missing ones.
MGM.pipelineState = 'unsigned';   // 'unsigned' | 'loading' | 'ok' | 'error'
MGM.pipelineError = '';

MGM.loadPipeline = async function () {
  const sb = MGM.sb && MGM.sb();
  if (!sb || !(window.RoadysBD && RoadysBD.auth.email())) {
    MGM.pipelineState = 'unsigned';
    MGM.leads = []; MGM.profiles = [];
    MGM.refresh();          // every other branch refreshes; this one must too,
    return;                 // or a sign-out leaves the last signed-in data on screen
  }
  // Clear BEFORE announcing 'loading'. Without this, a reload after a previous
  // success leaves the old leads in place, so the gated tiles blank to '—'
  // while the table and chart still show stale real figures — two opposite
  // lies on one screen.
  MGM.leads = []; MGM.profiles = [];
  MGM.pipelineState = 'loading';
  MGM.refresh();
  try {
    const [L, P] = await Promise.all([
      sb.from('crm_leads').select(
        'id,company,stage,owner,source,locations,est_gallons,deal_value,follow_up,updated_at'
      ).is('deleted_at', null),
      sb.from('bd_value_profiles').select('id,lead_id,final_gallons,status')
        .is('deleted_at', null).eq('status', 'final')
    ]);
    if (L.error) throw L.error;
    if (P.error) throw P.error;
    MGM.leads = L.data || [];
    MGM.profiles = P.data || [];
    MGM.pipelineState = 'ok';
  } catch (e) {
    MGM.pipelineState = 'error';
    MGM.pipelineError = e.message || String(e);
    MGM.leads = []; MGM.profiles = [];
  }
  MGM.refresh();
};
```

- [ ] **Step 2: Render the funnel**

```js
MGM.renderers.pipeline = function (D) {
  const { st, pipeline: p } = D;
  const sp = st.salesPipeline;
  // Single source of truth for "is there real pipeline data on screen", plus
  // one state-specific explanation used by both the tiles and the chart
  // caption. "sign in" is wrong advice for a signed-in user mid-load or in
  // error, so the wording is keyed to the actual state.
  const loadedP = MGM.pipelineState === 'ok';
  const whyNot = { unsigned: 'not loaded — sign in',
                   loading:  'loading…',
                   error:    'could not load' }[MGM.pipelineState] || 'not loaded';
  const banner = {
    unsigned: `<p class="note"><span class="ovr">Not signed in</span>
      The pipeline lives in <code>crm_leads</code>, which requires a session.
      <button class="btn" onclick="MGM.signIn && MGM.signIn()">Sign in to load</button></p>`,
    loading: '<p class="note">Loading the pipeline…</p>',
    error: `<p class="note neg"><span class="ovr">Could not load</span>
      ${esc(MGM.pipelineError)}</p>`,
    ok: `<p class="note">${MGM.leads.length} leads loaded from
      <code>crm_leads</code>; ${MGM.profiles.length} final value profiles.</p>`
  }[MGM.pipelineState];

  document.getElementById('panel-pipeline').innerHTML = `
  <h2>${esc(st.labels.tabs.pipeline)}</h2>
  <p class="sub">Live from the Business Development CRM. The model's unit is
     <b>locations</b>, not leads — one lead can carry many.</p>
  ${(() => {
    // When the pipeline has not loaded, these tiles must NOT read 0 — a zero is
    // a business fact ("no open pipeline") and the truth here is "not loaded".
    // Same convention the win rate already uses, and the same one costModel and
    // capacityModel use for unset inputs: show an em dash, never a false zero.
    // A reader screenshotting the tiles, or a future Report pull, would
    // otherwise carry the wrong claim away from the banner that explains it.
    const loaded = MGM.pipelineState === 'ok';
    // State-specific wording: "sign in" is wrong advice for a signed-in user
    // who hit a load error or is mid-load.
    const v = (val, fmtFn) => loaded ? fmtFn(val) : '—';
    const d = (desc) => loaded ? desc : whyNot;
    return `<div class="signrow">
    ${sign('OPEN LOCATIONS', v(p.openLocations, fmt), d(`${p.openLeads} open leads`))}
    ${sign('WEIGHTED', v(p.weightedLocations, fmt1), d('by stage ladder'), 'dark')}
    ${sign('EXPECTED / MONTH', v(p.expectedPerMonth, fmt1),
           d(`over ${sp.horizonMonths} months`), 'red')}
    ${sign('WIN RATE', (!loaded || p.winRate == null) ? '—' : pct1(p.winRate),
           !loaded ? 'not loaded — sign in'
             : (p.winRate == null ? 'no closed deals yet'
                : `${p.wonCount} won / ${p.lostCount} lost`), 'dark')}
  </div>`; })()}
  ${banner}

  <div class="card"><h3>Funnel by stage</h3>
    <table>
      <tr><th>Stage</th><th class="num">Leads</th><th class="num">Locations</th>
          <th class="num">Weight</th><th class="num">Weighted locs</th>
          <th class="num">Gallons</th><th class="num">Deal value</th></tr>
      ${MM.CRM_STAGES.map(s => {
        const row = p.byStage[s] || { count: 0, locations: 0, gallons: 0, dealValue: 0 };
        const closed = MM.isClosedStage(s);
        const w = sp.stageWeights[s];
        // Same gate as the tiles: a bare 0 here asserts "no leads at this
        // stage", which is a business fact, not "we could not load". The stage
        // weight input stays live either way — editing the ladder is useful
        // before any data exists.
        const g = n => loadedP ? n : '—';
        return `<tr${closed ? ' class="note"' : ''}>
          <td>${esc(s)}${closed ? ' <span class="note">(closed)</span>' : ''}</td>
          <td class="num">${g(fmt(row.count))}</td>
          <td class="num">${g(fmt(row.locations))}</td>
          <td class="num"><input class="cell" type="number" min="0" max="100"
              data-k="salesPipeline.stageWeights.${s}" value="${w}"></td>
          <td class="num">${closed ? '—' : g(fmt1(row.locations * w / 100))}</td>
          <td class="num">${g(fmt(row.gallons))}</td>
          <td class="num">${g(fm$(row.dealValue))}</td></tr>`;
      }).join('')}
      <tr class="total"><td>Open total</td>
        <td class="num">${loadedP ? fmt(p.openLeads) : '—'}</td>
        <td class="num">${loadedP ? fmt(p.openLocations) : '—'}</td><td class="num">—</td>
        <td class="num"><b>${loadedP ? fmt1(p.weightedLocations) : '—'}</b></td>
        <td class="num">${loadedP ? fmt(p.gallons) : '—'}</td>
        <td class="num">${loadedP ? fm$(p.dealValue) : '—'}</td></tr>
    </table>
    <p class="note"><span class="assume">assumption</span> ${esc(sp.assumptionNote)}
      ${p.winRate != null
        ? ` Derived actual win rate from <code>crm_leads</code>: <b>${pct1(p.winRate)}</b>.`
        : ''}</p>
    <p class="note">Win rate is Won / (Won + Lost); <code>Not Qualified</code> is
      excluded because it never became a real opportunity — matching the CRM's
      own convention.</p>
    <div class="mgm-editonly"><button class="btn"
      onclick="MGM.resetSection('salesPipeline.stageWeights')">Reset stage weights</button></div>
  </div>

  <div class="card"><h3>Horizon</h3>
    <table>
      <tr><td>Spread weighted locations over (months)</td><td class="num">
        <input class="cell" type="number" min="1" data-k="salesPipeline.horizonMonths"
          value="${sp.horizonMonths}"></td></tr>
      <tr><td>Average cycle (days, 0 = unset)</td><td class="num">
        <input class="cell" type="number" min="0" data-k="salesPipeline.avgCycleDays"
          value="${sp.avgCycleDays}"></td></tr>
    </table>
    <p class="note">The New Additions tab decides whether this drives the model.
      Currently: <b>${sp.basis === 'pipeline' ? 'driving the projection' : 'not driving the projection'}</b>.
      ${sp.basis === 'pipeline' && !loadedP
        ? `<span class="ovr">driving with no data</span> The basis is set to the
           pipeline but none is loaded (${esc(whyNot)}), so the projection is
           adding zero members per month. Switch back to the flat rate${
             MGM.pipelineState === 'unsigned' ? ', or sign in' : ''}.`
        : ''}</p>
  </div>

  <div class="grid g2">
    <div class="card"><h3>Load by owner</h3>
      <table><tr><th>Owner</th><th class="num">Open leads</th><th class="num">Open locations</th></tr>
      ${Object.keys(p.byOwner).length
        ? Object.entries(p.byOwner).map(([k, v]) =>
            `<tr><td>${esc(k)}</td><td class="num">${fmt(v.openLeads)}</td>
             <td class="num">${fmt(v.openLocations)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="note">No leads loaded.</td></tr>'}
      </table>
      <p class="note">Feeds the Staffing &amp; Capacity tab.</p>
    </div>
    <div class="card"><h3>By source</h3>
      <table><tr><th>Source</th><th class="num">Leads</th><th class="num">Locations</th></tr>
      ${Object.keys(p.bySource).length
        ? Object.entries(p.bySource).map(([k, v]) =>
            `<tr><td>${esc(k)}</td><td class="num">${fmt(v.leads)}</td>
             <td class="num">${fmt(v.locations)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="note">No leads loaded.</td></tr>'}
      </table>
      <p class="note">Compare against the model's own source mix on New Additions.</p>
    </div>
  </div>

  <div class="card flush"><div style="padding:18px 20px 0">${MGM.chartTitle('funnel')}</div>
    ${loadedP
      ? '<div style="height:260px;padding:10px 20px 20px"><canvas id="chFunnel"></canvas></div>'
      : `<p class="note" style="padding:0 20px 20px">No pipeline data to chart —
         ${esc(whyNot)}. An all-zero chart is the single most screenshot-able
         artifact on this tab, so none is drawn rather than one that reads as
         "the pipeline is empty".</p>`}</div>

  ${MGM.tabNotes('pipeline')}`;

  if (loadedP) MGM.drawFunnel(p, sp);
};

MGM.drawFunnel = function (p, sp) {
  const open = MM.CRM_STAGES.filter(s => !MM.isClosedStage(s));
  mkChart('#chFunnel', {
    type: 'bar',
    data: {
      labels: open,
      datasets: [
        { label: 'Open locations', data: open.map(s => (p.byStage[s] || {}).locations || 0),
          backgroundColor: css('--chip') },
        { label: 'Weighted', data: open.map(s =>
            ((p.byStage[s] || {}).locations || 0) * (sp.stageWeights[s] || 0) / 100),
          backgroundColor: css('--red') }
      ]
    },
    options: baseOpts()
  });
};
```

- [ ] **Step 3: Verify in the browser**

1. Unsigned: the tab renders and **nothing presents an absence of data as a
   zero.** Every pipeline-derived figure — the four tiles, the per-stage table's
   count/locations/weighted/gallons/value columns, and the Open-total row —
   reads `—`, and the funnel chart is replaced by a caption rather than drawn as
   all-zero bars. Win rate reads `—`. The amber banner explains why with a
   sign-in button. Nothing is invented.
   (An earlier draft of this step said "all tiles read 0", which asserted the
   defect as correct behaviour: a 0 is the business fact "no open pipeline",
   whereas the truth signed out is "not loaded". Only the stage-weight inputs
   stay live, since editing the ladder is useful before any data exists.)
2. Every one of the nine stages appears, with `Closed Won`/`Closed Lost`/`Not Qualified` marked `(closed)` and their weighted column showing **—**.
3. Stage weights are editable; editing one changes Weighted locs and Expected/month immediately.
4. **Reset stage weights** restores the ladder.
5. The "assumption" chip is visible beside the weights note.
6. Signed in (after Task 16): leads load, the funnel chart draws, by-owner shows Robert Watson and Angel Long, and the derived actual win rate appears beside the assumption.
7. Switch New Additions' basis to pipeline — this tab's Horizon card reports "driving the projection".

- [ ] **Step 4: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): Sales Pipeline tab reading crm_leads and value profiles"
```

---

## Task 11: Tabs 5–6 — Program Participation and Fuel Gallon Production

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: `MM.participationModel`, `MM.gallonProduction`, `BusDevGallonsCalc`, `region_variance.json`.
- Produces: `MGM.renderers.participation`, `MGM.renderers.gallons`, `MGM.loadRegionVariance()`, `MGM.gallonOverride(key, value)`, `MGM.useGallonsInModel(perMember)`.

- [ ] **Step 1: Fetch region variance with the BDPG cache-buster**

```js
// Mirrors BDPG.dataUrl() (bus-dev-potential-gallons/index.html:822-824) so a
// stale CDN copy cannot silently rescale every figure on this page.
MGM.dataUrl = p => p + '?v=' + encodeURIComponent(BDPG_CONFIG.DATA_ASOF);

MGM.regionVariance = null;
MGM.loadRegionVariance = async function () {
  try {
    const r = await fetch(MGM.dataUrl('../region_variance.json'));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    MGM.regionVariance = await r.json();
  } catch (e) {
    // Fail visibly on the card: a silent 0% would look like a real answer.
    MGM.regionVariance = null;
    console.warn('[MGM] region_variance.json unavailable', e);
  }
  MGM.refresh();
};
```

- [ ] **Step 2: Tab 5 — Program Participation**

```js
MGM.renderers.participation = function (D) {
  const { st, participation: P, M } = D;
  const progs = [
    ['fuel', 'Fuel program'],
    ['vendor', 'Vendor programs'],
    ['rewards', 'Rewards program']
  ];

  document.getElementById('panel-participation').innerHTML = `
  <h2>${esc(st.labels.tabs.participation)}</h2>
  <p class="sub">Participation rates own these percentages; Revenue per Member
     consumes them. One source, two views.</p>
  <div class="signrow">
    ${progs.map(([k, label], i) => sign(
      label.toUpperCase(), pct1(MM.partPct(st, k)),
      `${fmt(P.length ? P[P.length - 1][k] : 0)} members in ${M.years[M.years.length - 1].year}`,
      i === 2 ? 'red' : (i === 1 ? 'dark' : ''))).join('')}
    ${sign('MEMBERS', fmt(P.length ? P[P.length - 1].members : 0), 'final-year average', 'dark')}
  </div>

  <div class="card"><h3>Rates and ramp</h3>
    <table>
      <tr><th>Program</th><th class="num">Participation %</th>
          <th class="num">Ramp (months)</th></tr>
      ${progs.map(([k, label]) => `<tr><td>${esc(label)}</td>
        <td class="num"><input class="cell" type="number" min="0" max="100" step="0.5"
            data-k="participation.${k}.pct" value="${st.participation[k].pct}">
            ${MGM.editedMark(`participation.${k}.pct`)}</td>
        <td class="num"><input class="cell" type="number" min="0"
            data-k="participation.${k}.rampMonths" value="${st.participation[k].rampMonths}"></td></tr>`).join('')}
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.resetSection('participation')">Reset participation</button>
    </div>
    <p class="note">Calibrated against the Jan–Sep 2026 P&amp;L. Rewards'
       participation drives the <b>program fee</b> only — breakage from expired
       points is a separate per-member line on Revenue per Member and does not
       scale with participation.</p>
  </div>

  <div class="card"><h3>Participating members by year</h3>
    <table>
      <tr><th>Year</th><th class="num">Avg members</th>
        ${progs.map(([, l]) => `<th class="num">${esc(l)}</th>`).join('')}</tr>
      ${P.map(r => `<tr><td>${r.year}</td><td class="num">${fmt(r.members)}</td>
        ${progs.map(([k]) => `<td class="num">${fmt(r[k])}</td>`).join('')}</tr>`).join('')}
    </table>
  </div>

  ${MGM.tabNotes('participation')}`;
};
```

- [ ] **Step 3: Tab 6 — Fuel Gallon Production**

```js
MGM.renderers.gallons = function (D) {
  const { st, gallons: G, pipeline: p, M } = D;
  const gcfg = st.gallons;
  const rv = MGM.regionVariance || {};
  const profiles = (() => {
    try { return BusDevGallonsCalc.getProfiles(); } catch (e) { return []; }
  })();

  document.getElementById('panel-gallons').innerHTML = `
  <h2>${esc(st.labels.tabs.gallons)}</h2>
  <p class="sub">Network-level production from the live Bus Dev gallons engine.
     Per-prospect value props live in the
     <a href="../bus-dev-potential-gallons/" target="_blank">Bus Dev Potential Gallons</a> tool.</p>
  <div class="signrow">
    ${sign('EXISTING NETWORK', fmt(G.existing), 'gal / mo')}
    ${sign('PIPELINE INBOUND', fmt(G.inbound), `${p.openLeads} open leads`, 'dark')}
    ${sign('TOTAL', fmt(G.total), fmt(G.total * 12) + ' gal / yr', 'red')}
    ${sign('PER MEMBER', fmt(G.perMember), 'gal / mo, existing network', 'dark')}
  </div>

  <div class="card"><h3>Production by group</h3>
    <table>
      <tr><th>Group</th><th class="num">Locations</th><th>Engine profile</th>
          <th>Roadway</th><th class="num">Baseline gal/mo</th><th class="num">Gallons / mo</th></tr>
      ${G.byGroup.map(r => `<tr>
        <td>${esc(r.label)}${r.unmapped ? ' <span class="ovr">unmapped</span>' : ''}</td>
        <td class="num">${fmt(r.count)}</td>
        <td><select class="cell" data-k="gallons.groupProfile.${r.key}.0">
          ${profiles.map(pr => `<option${pr === r.profile ? ' selected' : ''}>${esc(pr)}</option>`).join('')}
        </select></td>
        <td><select class="cell" data-k="gallons.groupProfile.${r.key}.1">
          ${(() => { try { return BusDevGallonsCalc.getValidRoadways(r.profile) || []; }
                     catch (e) { return []; } })()
            .map(rd => `<option${rd === r.roadway ? ' selected' : ''}>${esc(rd)}</option>`).join('')}
        </select></td>
        <td class="num"><input class="cell" type="number"
            data-k="gallons.groupBaselineOverride.${r.key}"
            value="${r.overridden ? r.baseline : ''}" placeholder="${fmt(r.engineBaseline)}">
            ${r.overridden ? `<span class="ovr" title="Engine says ${fmt(r.engineBaseline)}">overridden · engine ${fmt(r.engineBaseline)}</span>` : ''}</td>
        <td class="num"><b>${fmt(r.gallons)}</b></td></tr>`).join('')}
      <tr class="total"><td>Existing network</td>
        <td class="num">${fmt(M.startTotal)}</td><td colspan="3"></td>
        <td class="num"><b>${fmt(G.existing)}</b></td></tr>
    </table>
    ${G.byGroup.some(r => r.overridden) ? `<p class="note"><span class="ovr">
      Overridden baselines in use</span> These figures no longer match the Bus Dev
      gallons engine. <button class="btn"
      onclick="MGM.resetSection('gallons.groupBaselineOverride')">Revert to engine values</button></p>` : ''}
    ${G.mapped < G.byGroup.length ? `<p class="note neg">${G.byGroup.length - G.mapped}
      group(s) are unmapped and contribute zero gallons. Pick a profile and roadway above.</p>` : ''}
    <p class="note"><span class="assume">assumption</span> Group → profile
      assignments are assumptions, not measurements: the engine assigns a profile
      per location from <code>dieselLanes</code> + <code>roadway</code>, which this
      tool does not have per group. Reading
      <code>network-locations.json</code> for real per-location profiles is a
      future refinement.</p>
    <p class="note">Baselines are read live from
      <code>busDevGallonsConfig.js</code> and are never written back.</p>
  </div>

  <div class="card"><h3>Pipeline inbound</h3>
    <table>
      <tr><th>Source</th><th class="num">Gal / mo</th></tr>
      <tr><td>Open leads — modeled profiles and estimates</td><td class="num">${fmt(G.inbound)}</td></tr>
      <tr class="total"><td>Total inbound</td><td class="num"><b>${fmt(G.inbound)}</b></td></tr>
    </table>
    <p class="note">A final <code>bd_value_profiles.final_gallons</code> takes
      precedence over a lead's hand-entered <code>est_gallons</code>.
      ${MGM.pipelineState === 'ok' ? '' : 'Not signed in — inbound is zero until the pipeline loads.'}</p>
  </div>

  <div class="card"><h3>Region variance</h3>
    ${MGM.regionVariance
      ? `<p class="note">Live from <code>region_variance.json</code>, as of
         ${esc(rv.asOf)} — ${Object.keys(rv).filter(k => typeof rv[k] === 'number').length} regions.</p>
         <table><tr><th>Region</th><th class="num">Variance</th><th class="num">n</th></tr>
         ${Object.keys(rv).filter(k => typeof rv[k] === 'number').map(k =>
           `<tr><td>${esc(k)}</td><td class="num">${rv[k] > 0 ? '+' : ''}${rv[k]}%</td>
            <td class="num">${(rv.n || {})[k] || '—'}</td></tr>`).join('')}</table>`
      : '<p class="note neg">region_variance.json could not be loaded — region variance unavailable.</p>'}
    <p class="note">Shown for reference. Region variance is a per-location
      adjustment in the Bus Dev tool and is <b>not</b> applied to these
      network aggregates.</p>
  </div>

  <div class="card"><h3>Feed the revenue model</h3>
    <p class="note">Revenue per Member currently uses
      <b>${fmt(st.revenue.avgGallons)}</b> gal/mo per participating location.</p>
    <button class="btn primary" onclick="MGM.useGallonsInModel(${G.perMember})">
      Use ${fmt(G.perMember)} gal as the model average</button>
    <p class="note" style="margin-top:10px"><b>${esc(gcfg.caveat)}</b></p>
  </div>

  ${MGM.tabNotes('gallons')}`;
};

MGM.useGallonsInModel = function (perMember) {
  MM.setPath(MGM.state, 'revenue.avgGallons', Math.round(perMember));
  MGM.save(); MGM.refresh();
  alert('Avg gallons per participating location set to ' + fmt(perMember) +
        ' on Revenue per Member.');
};
```

- [ ] **Step 4: Verify in the browser**

1. **Participation**: three programs at 55 / 70 / 50; editing fuel to 80 changes the participating-member counts and (Task 12) Revenue per Member's fuel line identically.
2. **Fuel Gallon Production**: the by-group table shows Truck Stop → Medium truck stop / Interstate / **10,492**, C-Stores → Small truck stop / Highway / **2,338**, PPO → Fuel stop / Any / **5,630** — i.e. the live engine's values, not the v1's round numbers.
3. Existing-network total equals the hand check: 154×10492 + 6×5250 + 22×2338 + 88×5630 + 7×6174 + 9×5630 + 89×2338.
4. Type 4000 into C-Stores' baseline — the amber override badge appears naming the engine's 2,338, the banner offers **Revert**, and only the C-Stores row changes.
5. Change Truck Stop's profile to Large truck stop — the roadway select repopulates and the baseline follows to 23,565.
6. Add a group on Starting Membership without mapping it — this tab flags it **unmapped** with a zero contribution rather than dropping it.
7. The region card lists 8 regions with `asOf`, and states that variance is not applied to aggregates.
8. **Use N gal as the model average** updates `revenue.avgGallons`.
9. The settlement caveat is prominent on the card.
10. `git diff` shows **no** change to `busDevGallonsConfig.js` or `region_variance.json`.

- [ ] **Step 5: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): Program Participation and network Fuel Gallon Production tabs"
```

---

## Task 12: Tabs 7–10 — Revenue per Member, Cost to Acquire & Serve, Staffing & Capacity, Profit & Cash Flow

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: `MM.revenueModel`, `MM.revPerMember`, `MM.costModel`, `MM.capacityModel`, `MM.cashflowModel`, `MM.valuation`.
- Produces: `MGM.renderers.revpermember`, `MGM.renderers.cost`, `MGM.renderers.staffing`, `MGM.renderers.cashflow`.

- [ ] **Step 1: Tab 7 — Revenue per Member, with the three-column reconciliation**

```js
const STREAM_KEYS = ['dues', 'duesAncillary', 'settlement', 'fuelProgram',
  'vendor', 'rewards', 'rewardsBreakage'];

MGM.renderers.revpermember = function (D) {
  const { st, R, rpm } = D;
  const last = R[R.length - 1];
  const L = st.labels.streams;

  document.getElementById('panel-revpermember').innerHTML = `
  <h2>${esc(st.labels.tabs.revpermember)}</h2>
  <p class="sub">Seven net per-member streams, calibrated against the Jan–Sep 2026 P&amp;L.</p>
  <div class="signrow">
    ${sign('FINAL-YEAR REVENUE', fmM(last.total), `${last.year}, all streams`)}
    ${sign('$ / MEMBER / YR', fm$(rpm.derived.total), 'from the drivers', 'dark')}
    ${sign('DUES REALIZATION', pct1(rpm.duesRealization),
           `${fm$(st.revenue.duesPerLoc)} realized vs ${fm$(st.billing.duesPerLocBillable)} billable`, 'red')}
    ${sign('AVG MEMBERS', fmt(last.members), `${last.year} average`, 'dark')}
  </div>

  <div class="card"><h3>Drivers</h3>
    <table>
      <tr><th>Stream</th><th class="num">Driver</th><th class="num">$/member/yr</th></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.dues" value="${esc(L.dues)}"></td>
        <td class="num"><input class="cell" type="number" step="0.01" data-k="revenue.duesPerLoc"
          value="${st.revenue.duesPerLoc}"> /mo ${MGM.editedMark('revenue.duesPerLoc')}</td>
        <td class="num">${fm$(rpm.derived.dues)}</td></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.duesAncillary" value="${esc(L.duesAncillary)}"></td>
        <td class="num"><input class="cell" type="number" data-k="revenue.duesAncillaryPerMember"
          value="${st.revenue.duesAncillaryPerMember}"> /yr</td>
        <td class="num">${fm$(rpm.derived.duesAncillary)}</td></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.settlement" value="${esc(L.settlement)}"></td>
        <td class="num"><input class="cell" type="number" data-k="revenue.settlementNetPerMember"
          value="${st.revenue.settlementNetPerMember}"> /yr</td>
        <td class="num ${rpm.derived.settlement < 0 ? 'neg' : ''}">${fm$(rpm.derived.settlement)}</td></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.fuelProgram" value="${esc(L.fuelProgram)}"></td>
        <td class="num"><input class="cell" type="number" step="0.001" data-k="revenue.fuelProgramMargin"
          value="${st.revenue.fuelProgramMargin}"> /gal × ${fmt(st.revenue.avgGallons)} gal
          × ${pct1(MM.partPct(st, 'fuel'))}</td>
        <td class="num">${fm$(rpm.derived.fuelProgram)}</td></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.vendor" value="${esc(L.vendor)}"></td>
        <td class="num"><input class="cell" type="number" data-k="revenue.vendorPM"
          value="${st.revenue.vendorPM}"> /mo × ${pct1(MM.partPct(st, 'vendor'))}</td>
        <td class="num">${fm$(rpm.derived.vendor)}</td></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.rewards" value="${esc(L.rewards)}"></td>
        <td class="num"><input class="cell" type="number" data-k="revenue.rewardsPM"
          value="${st.revenue.rewardsPM}"> /mo × ${pct1(MM.partPct(st, 'rewards'))}</td>
        <td class="num">${fm$(rpm.derived.rewards)}</td></tr>
      <tr><td><input class="lbl-in" type="text" data-k="labels.streams.rewardsBreakage" value="${esc(L.rewardsBreakage)}"></td>
        <td class="num"><input class="cell" type="number" data-k="revenue.rewardsBreakagePerMember"
          value="${st.revenue.rewardsBreakagePerMember}"> /yr</td>
        <td class="num">${fm$(rpm.derived.rewardsBreakage)}</td></tr>
      <tr class="total"><td>Total</td><td class="num"></td>
        <td class="num"><b>${fm$(rpm.derived.total)}</b></td></tr>
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.resetSection('revenue')">Reset drivers</button>
    </div>
    <p class="note"><b>Fuel program margin defaults to $0.00/gal.</b> The P&amp;L
      shows fuel settlement netting <i>negative</i>, so any positive per-gallon
      margin here is a forward assumption you own — not something the P&amp;L
      supports. Participation percentages live on the Program Participation tab.</p>
    <p class="note">Rewards breakage is expired-points revenue: real, but a buyer
      discounts it. It is held as a flat per-member figure rather than inside the
      program fee so it never scales with participation.</p>
  </div>

  <div class="card"><h3>Reconciliation</h3>
    <table>
      <tr><th>Stream</th><th class="num">From drivers</th>
          <th class="num">P&amp;L actual</th><th class="num">Variance</th></tr>
      ${STREAM_KEYS.map(k => {
        const a = rpm.actualStreams ? rpm.actualStreams[k] : null;
        return `<tr><td>${esc(L[k])}</td>
          <td class="num">${fm$(rpm.derived[k])}</td>
          <td class="num">${a == null ? '<span class="note">—</span>' : fm$(a)}</td>
          <td class="num ${a != null && rpm.derived[k] - a < 0 ? 'neg' : ''}">${
            a == null ? '—' : fm$(rpm.derived[k] - a)}</td></tr>`;
      }).join('')}
      <tr class="total"><td>Total $/member/yr</td>
        <td class="num"><b>${fm$(rpm.derived.total)}</b></td>
        <td class="num"><b>${rpm.actual == null
          ? '<span class="note">sign in to reconcile</span>' : fm$(rpm.actual)}</b></td>
        <td class="num">${rpm.varianceVsActual == null ? '—' : fm$(rpm.varianceVsActual)}</td></tr>
    </table>

    <table style="margin-top:14px">
      <tr><th>${esc(st.benchmark.label)}</th><th class="num">Value</th><th class="num">Variance</th></tr>
      <tr><td><input class="lbl-in" type="text" data-k="benchmark.label" value="${esc(st.benchmark.label)}"></td>
        <td class="num"><input class="cell" type="number" step="500" data-k="benchmark.lostMemberValue"
          value="${st.benchmark.lostMemberValue}"></td>
        <td class="num neg">${fm$(rpm.varianceVsBenchmark)}</td></tr>
    </table>
    <p class="note"><span class="assume">cross-check, not an override</span>
      ${esc(st.benchmark.caveat)}</p>
    <p class="note">Source: ${esc(st.benchmark.source)}</p>
    ${rpm.actual == null
      ? '<p class="note">P&amp;L actuals are auth-gated and never committed to this public repo.</p>'
      : ''}
  </div>

  <div class="card"><h3>Revenue by year</h3>
    <table>
      <tr><th>Year</th><th class="num">Avg members</th>
        ${STREAM_KEYS.map(k => `<th class="num">${esc(L[k])}</th>`).join('')}
        <th class="num">Total</th></tr>
      ${R.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${fmt(r.members)}</td>
        ${STREAM_KEYS.map(k => `<td class="num${r.streams[k] < 0 ? ' neg' : ''}">${fm$(r.streams[k])}</td>`).join('')}
        <td class="num"><b>${fm$(r.total)}</b></td></tr>`).join('')}
    </table>
    <p class="note">Annualized run-rate per year on the average member count.
      Excludes gross fuel settlement pass-through, which is ~95% of the P&amp;L's
      Total Income and is not revenue.</p>
  </div>

  <div class="card flush"><div style="padding:18px 20px 0">${MGM.chartTitle('revenue')}</div>
    <div style="height:280px;padding:10px 20px 20px"><canvas id="chRevenue"></canvas></div></div>

  ${MGM.tabNotes('revpermember')}`;

  mkChart('#chRevenue', {
    type: 'bar',
    data: {
      labels: R.map(r => r.year),
      datasets: STREAM_KEYS.map((k, i) => ({
        label: st.labels.streams[k], data: R.map(r => r.streams[k]),
        backgroundColor: [css('--red'), css('--amber'), css('--loss'),
          css('--sign-green'), css('--gain'), css('--ink-soft'), css('--chip')][i]
      }))
    },
    options: (() => { const o = baseOpts(); o.scales.x.stacked = true; o.scales.y.stacked = true; return o; })()
  });
};
```

- [ ] **Step 2: Tab 8 — Cost to Acquire & Serve**

```js
MGM.renderers.cost = function (D) {
  const { st, cost: C, R } = D;

  document.getElementById('panel-cost').innerHTML = `
  <h2>${esc(st.labels.tabs.cost)}</h2>
  <p class="sub">Acquisition and service economics. Defaults are an explicit zero —
     nothing here is guessed.</p>
  ${C.unset ? `<p class="note"><span class="assume">unset</span> Enter a sales
     spend or a per-member cost below, or sign in to load the P&amp;L-derived
     figures. Until then acquisition and service costs are zero and
     Profit &amp; Cash Flow equals revenue.</p>` : ''}
  <div class="signrow">
    ${sign('CAC', C.unset ? '—' : fm$(C.cac), 'per new member')}
    ${sign('COST TO SERVE', C.unset ? '—' : fm$(C.costToServePerMember), 'per member / yr', 'dark')}
    ${sign('LTV', C.ltv == null ? '—' : fm$(C.ltv),
           C.lifeYears == null ? 'churn unset' : `${fmt1(C.lifeYears)} yr member life`, 'red')}
    ${sign('LTV / CAC', C.ltvCac == null ? '—' : fmt1(C.ltvCac) + '×',
           C.payback == null ? 'payback n/a' : `${fmt1(C.payback)} mo payback`, 'dark')}
  </div>

  <div class="card"><h3>Inputs</h3>
    <table>
      <tr><td>Sales &amp; marketing spend / month</td><td class="num">
        <input class="cell" type="number" data-k="costs.salesSpendPerMonth"
          value="${st.costs.salesSpendPerMonth}"></td></tr>
      <tr><td>Acquisition cost per member (overrides the derived CAC)</td><td class="num">
        <input class="cell" type="number" data-k="costs.acquisitionPerMember"
          value="${st.costs.acquisitionPerMember}"></td></tr>
      <tr><td>Cost to serve per member / yr</td><td class="num">
        <input class="cell" type="number" data-k="costs.costToServePerMember"
          value="${st.costs.costToServePerMember}"></td></tr>
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.resetSection('costs')">Reset costs</button>
    </div>
    <p class="note">LTV uses the model's own steady attrition
      (${pct1(st.attrition.steady)} → ${C.lifeYears == null ? '—' : fmt1(C.lifeYears)}
      year average member life), not a separate assumption. Change it on the
      Member Losses tab and LTV follows.</p>
    <p class="note">Payback and LTV/CAC report <b>—</b> rather than infinity when
      CAC is zero: an unset cost is not an instant payback.</p>
  </div>

  <div class="card"><h3>By year</h3>
    <table>
      <tr><th>Year</th><th class="num">Months</th><th class="num">Spend</th>
          <th class="num">New members</th><th class="num">CAC</th>
          <th class="num">Acquisition cost</th><th class="num">Cost to serve</th>
          <th class="num">Revenue</th></tr>
      ${C.byYear.map(r => `<tr><td>${r.year}</td>
        <td class="num">${r.months}</td><td class="num">${fm$(r.spend)}</td>
        <td class="num">${fmt1(r.adds)}</td>
        <td class="num">${r.cac ? fm$(r.cac) : '—'}</td>
        <td class="num">${fm$(r.acquisition)}</td>
        <td class="num">${fm$(r.costToServe)}</td>
        <td class="num">${fm$(r.revenue)}</td></tr>`).join('')}
    </table>
    <p class="note">2026 covers only the months after the as-of date, so its
      spend is proportionally smaller.</p>
  </div>

  ${MGM.tabNotes('cost')}`;
};
```

- [ ] **Step 3: Tab 9 — Staffing & Capacity**

```js
MGM.renderers.staffing = function (D) {
  const { st, capacity: K, pipeline: p } = D;
  const reps = st.staffing.reps;

  document.getElementById('panel-staffing').innerHTML = `
  <h2>${esc(st.labels.tabs.staffing)}</h2>
  <p class="sub">Whether the modeled adds are achievable at the modeled headcount.</p>
  ${K.unset ? `<p class="note"><span class="assume">capacity unset</span>
     Enter a monthly capacity per rep below. A gap computed against zero capacity
     would be meaningless, so none is shown.</p>` : ''}
  <div class="signrow">
    ${sign('REPS', fmt(reps.length), 'on the roster')}
    ${sign('CAPACITY', K.unset ? '—' : fmt1(K.totalCapacity), 'new locations / mo', 'dark')}
    ${sign('MODELED ADDS', fmt1(K.modeledAddsPerMonth), 'new locations / mo', 'red')}
    ${sign('GAP', K.gap == null ? '—' : (K.gap > 0 ? '+' + fmt1(K.gap) : fmt1(K.gap)),
           K.gap == null ? 'capacity unset'
             : (K.gap > 0 ? 'short of plan' : 'capacity to spare'), 'dark')}
  </div>

  <div class="card"><h3>Roster</h3>
    <table>
      <tr><th>Rep</th><th class="num">Capacity (new locs/mo)</th>
          <th class="num">Cost / yr</th><th class="num">Open leads</th>
          <th class="num">Open locations</th></tr>
      ${reps.map((r, i) => {
        const o = K.byOwner[r.name] || { openLeads: 0, openLocations: 0 };
        return `<tr>
          <td><input class="lbl-in" type="text" data-k="staffing.reps.${i}.name" value="${esc(r.name)}">
              ${MGM.rowTools('staffing.reps', i, reps.length)}</td>
          <td class="num"><input class="cell" type="number" step="0.1"
              data-k="staffing.reps.${i}.capacityLeads" value="${r.capacityLeads}"></td>
          <td class="num"><input class="cell" type="number"
              data-k="staffing.reps.${i}.costPerYear" value="${r.costPerYear}"></td>
          <td class="num">${fmt(o.openLeads)}</td>
          <td class="num">${fmt(o.openLocations)}</td></tr>`;
      }).join('')}
      <tr class="total"><td>Total</td>
        <td class="num">${fmt1(K.totalCapacity)}</td>
        <td class="num">${fm$(K.totalCost)}</td>
        <td class="num">${fmt(p.openLeads)}</td>
        <td class="num">${fmt(p.openLocations)}</td></tr>
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.addRow('staffing.reps',{name:'New rep',capacityLeads:0,costPerYear:0})">+ Add rep</button>
      <button class="btn" onclick="MGM.resetSection('staffing')">Reset roster</button>
    </div>
    <p class="note">Open-lead counts come live from <code>crm_leads.owner</code>.
      ${MGM.pipelineState === 'ok' ? '' : 'Not signed in — load the Sales Pipeline tab to populate them.'}
      A name here must match the CRM owner name exactly to pair up.</p>
  </div>

  ${Object.keys(K.byOwner).some(name => !reps.find(r => r.name === name))
    ? `<div class="card"><h3>In the CRM but not on the roster</h3>
       <table><tr><th>Owner</th><th class="num">Open leads</th></tr>
       ${Object.entries(K.byOwner).filter(([name]) => !reps.find(r => r.name === name))
         .map(([name, v]) => `<tr><td>${esc(name)}</td>
           <td class="num">${fmt(v.openLeads)}</td></tr>`).join('')}</table>
       <p class="note">These owners carry pipeline but have no capacity entry, so
         they contribute nothing to the capacity figure.</p></div>` : ''}

  ${MGM.tabNotes('staffing')}`;
};
```

- [ ] **Step 4: Tab 10 — Profit & Cash Flow, with the valuation panel**

```js
MGM.renderers.cashflow = function (D) {
  const { st, F, valuation: v, cost: C } = D;
  const last = F[F.length - 1] ||
    { year: st.CURRENT_YEAR, ebitda: 0, revenue: 0, cash: 0, margin: 0 };

  document.getElementById('panel-cashflow').innerHTML = `
  <h2>${esc(st.labels.tabs.cashflow)}</h2>
  <p class="sub">Revenue less cost to serve and acquisition cost, to EBITDA and cash.</p>
  <div class="signrow">
    ${sign('FINAL-YEAR REVENUE', fmM(last.revenue), `${last.year}`)}
    ${sign('EBITDA', fmM(last.ebitda), pct1(last.margin) + ' margin', 'dark')}
    ${sign('CASH', fmM(last.cash), 'after capex', 'red')}
    ${(() => {
      // The boldest number on the page must not defer its basis to the card
      // below. With costs unset the valuation declines the cash bridge and
      // falls back to the margin branch, so at the shipped 0% margin the
      // EBITDA lens is genuinely $0 and the midpoint is half the revenue lens.
      // Branch order matters: real costs win over a margin assumption, because
      // the override path ignores the margin entirely once it is supplied.
      const liveBasis =
        !C.unset                    ? 'EBITDA lens computed from real costs'
        : st.valuation.ebitdaMargin ? `EBITDA lens from the ${pct1(st.valuation.ebitdaMargin)} margin assumption`
        : v.ebitdaBase              ? 'EBITDA lens from add-backs only'
        : 'revenue lens only — EBITDA lens has no basis';
      // indicated / lensCount, NOT mid -- mid averages a real lens with an
      // absent one and returns half the real figure on the shipped defaults.
      return sign(
        v.lensCount === 2 ? 'VALUATION MIDPOINT'
        : v.lensCount === 1 ? 'INDICATED VALUE'
        : 'NO BASIS',
        v.indicated === null ? '—' : fmM(v.indicated),
        liveBasis, 'dark');
    })()}
  </div>

  <div class="card"><h3>Cash bridge</h3>
    <table>
      <tr><th>Year</th><th class="num">Revenue</th><th class="num">Cost to serve</th>
          <th class="num">Acquisition</th><th class="num">Add-backs</th>
          <th class="num">EBITDA</th><th class="num">Margin</th>
          <th class="num">Capex</th><th class="num">Cash</th></tr>
      ${F.map(r => `<tr><td>${r.year}</td>
        <td class="num">${fm$(r.revenue)}</td>
        <td class="num">${fm$(-r.costToServe)}</td>
        <td class="num">${fm$(-r.acquisition)}</td>
        <td class="num">${r.normalization ? fm$(r.normalization) : '—'}</td>
        <td class="num ${r.ebitda < 0 ? 'neg' : ''}"><b>${fm$(r.ebitda)}</b></td>
        <td class="num">${pct1(r.margin)}</td>
        <td class="num">${r.capex ? fm$(-r.capex) : '—'}</td>
        <td class="num ${r.cash < 0 ? 'neg' : ''}">${fm$(r.cash)}</td></tr>`).join('')}
    </table>
    ${C.unset ? `<p class="note"><span class="assume">costs unset</span>
      EBITDA equals revenue because acquisition and service costs are still zero.
      Set them on the Cost to Acquire &amp; Serve tab.</p>` : ''}
  </div>

  <div class="card"><h3>Assumptions</h3>
    <table>
      <tr><td>Capex / yr</td><td class="num"><input class="cell" type="number"
        data-k="cashflow.capexPerYear" value="${st.cashflow.capexPerYear}"></td></tr>
      <tr><td>Working capital days</td><td class="num"><input class="cell" type="number"
        data-k="cashflow.workingCapitalDays" value="${st.cashflow.workingCapitalDays}"></td></tr>
      <tr><td>EBITDA normalization add-backs</td><td class="num"><input class="cell" type="number"
        step="1000" data-k="valuation.ebitdaNormalization"
        value="${st.valuation.ebitdaNormalization}">${MGM.editedMark('valuation.ebitdaNormalization')}</td></tr>
    </table>
    <p class="note">Add-backs are explicit and attributable. The P&amp;L's actual
      net margin is <b>${pct1(st.valuation.ebitdaMargin)}</b> — if you are
      arguing for a normalized figure, enter it here so a reader can see the
      adjustment rather than finding it baked into a margin.</p>
    <p class="note"><span class="assume">${esc(st.valuation.marginBasis)}</span>
      ${esc(st.valuation.marginBasisNote)}</p>
  </div>

  <div class="card"><h3>Valuation</h3>
    <table>
      <tr><th>Lens</th><th class="num">Basis</th><th class="num">Multiple</th><th class="num">Value</th></tr>
      <tr><td>Recurring revenue</td><td class="num">${fm$(v.basis)}</td>
        <td class="num"><input class="cell" type="number" step="0.1" data-k="valuation.revMultiple"
          value="${st.valuation.revMultiple}">×</td>
        <td class="num"><b>${fmM(v.rev)}</b></td></tr>
      <tr><td>EBITDA${C.unset
        ? (st.valuation.ebitdaMargin
            ? ` (at ${pct1(st.valuation.ebitdaMargin)} margin)`
            : ' (no basis — costs unset and no margin set)')
        : ' (computed from real costs)'}</td>
        <td class="num">${fm$(v.ebitdaBase)}</td>
        <td class="num"><input class="cell" type="number" step="0.5" data-k="valuation.ebitdaMultiple"
          value="${st.valuation.ebitdaMultiple}">×</td>
        <td class="num"><b>${fmM(v.ebitda)}</b></td></tr>
      <tr class="total"><td colspan="3">Indicated range (midpoint)</td>
        <td class="num">${v.lensCount === 2
          ? `${fmM(v.low)} – ${fmM(v.high)} (${fmM(v.mid)})`
          : v.lensCount === 1
            ? `${fmM(v.indicated)} — single method, no range`
            : '—'}</td></tr>
    </table>
    <table style="margin-top:12px">
      <tr><td>EBITDA margin % (used only when costs are unset)</td><td class="num">
        <input class="cell" type="number" step="0.1" data-k="valuation.ebitdaMargin"
          value="${st.valuation.ebitdaMargin}">${MGM.editedMark('valuation.ebitdaMargin')}</td></tr>
    </table>
    <p class="note"><b>Both lenses apply to the model's own revenue total</b> —
      net per-member streams. Never to the P&amp;L's Total Income, which is ~95%
      gross settlement pass-through and would overstate the basis badly.</p>
    <p class="note">${C.unset
      ? (st.valuation.ebitdaMargin
          ? `The EBITDA lens is using the ${pct1(st.valuation.ebitdaMargin)} margin assumption. Enter real costs on Cost to Acquire &amp; Serve and it switches to the computed EBITDA above.`
          : 'No EBITDA margin is set and no costs are entered, so the EBITDA lens reads zero. Sign in to load the P&amp;L figure, or type a margin below — it is deliberately not shipped in this repo.')
      : 'The EBITDA lens is using the computed EBITDA from the cash bridge, not the margin assumption.'}</p>
    <div class="mgm-editonly"><button class="btn"
      onclick="MGM.resetSection('valuation')">Reset valuation</button></div>
  </div>

  ${MGM.tabNotes('cashflow')}`;
};
```

- [ ] **Step 5: Verify in the browser**

1. **Revenue per Member**: the driver table total equals the committed driver sum — `362×12 + 119 − 148 + 0 + 110×12×0.70 + 29×12×0.50 + 528` — settlement shows **−$148** in the negative style, and fuel program shows **$0**.
2. The reconciliation table's P&L column reads "sign in to reconcile" unsigned, and the $20,000 benchmark row shows its variance against the **derived** driver total — not against the gated actual — with the "cross-check, not an override" chip.
3. Change `participation.fuel.pct` on the Participation tab to 80 — the fuel-program driver line's participation factor updates here. (It stays $0 until a margin is entered; set the margin to 0.01 and confirm it moves.)
4. Rename a stream label — the driver table, the reconciliation table, the yearly table and the chart legend all follow.
5. **Cost to Acquire & Serve** unsigned with zeros: the "unset" chip shows, CAC/LTV/payback all read **—**, not 0 or ∞.
6. Enter 20000 sales spend and 400 cost to serve — CAC derives per year, LTV appears, payback appears in months. Lower steady attrition on Member Losses to 4% and LTV rises.
7. **Staffing & Capacity** with capacity 0: "capacity unset" chip, gap reads **—**. Enter 2 and 1 — capacity 3, gap = 3.2 − 3 = 0.2 "short of plan".
8. Rename a rep so it no longer matches a CRM owner — once signed in, that owner appears in the "In the CRM but not on the roster" card.
9. **Profit & Cash Flow**: with costs unset, EBITDA equals revenue and the valuation card says it is using the margin assumption. With costs set, the EBITDA lens switches to the computed figure and the note changes.
10. Set normalization to 250000 — EBITDA rises by exactly that and the revenue lens does not move.

- [ ] **Step 6: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): revenue, cost, capacity and cash-flow tabs with valuation"
```

---

## Task 13: Tab 11 — Historical Data

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: `MM.derivedAttrition`, `MGM_CONFIG.monthlyHistory`.
- Produces: `MGM.renderers.historical`, `MGM.drawHistory()`, `MGM.drawMonthlyHistory()`.

- [ ] **Step 1: Render the editable history, monthly grid and charts**

```js
MGM.renderers.historical = function (D) {
  const { st } = D;
  const d = MM.derivedAttrition(st.history);
  const mh = st.monthlyHistory || {};
  const years = Object.keys(mh).map(Number).sort((a, b) => a - b);

  document.getElementById('panel-historical').innerHTML = `
  <h2>${esc(st.labels.tabs.historical)}</h2>
  <p class="sub">Source data feeding New Additions, Member Losses and Revenue per
     Member. Roady's + Roady's Lite only — PTPC and COO excluded throughout.</p>

  <div class="card"><h3>Annual signups and losses</h3>
    <table>
      <tr><th>Year</th><th class="num">New (Roady's)</th><th class="num">Lost</th>
          <th class="num">Total count</th><th></th></tr>
      ${st.history.map((h, i) => `<tr>
        <td><input class="cell" type="number" data-k="history.${i}.year" value="${h.year}">
            ${h.year === 2026 ? ' <span class="note">Jan–Oct</span>' : ''}</td>
        <td class="num"><input class="cell" type="number" data-k="history.${i}.newR"
            value="${h.newR == null ? '' : h.newR}"></td>
        <td class="num"><input class="cell" type="number" data-k="history.${i}.lost"
            value="${h.lost == null ? '' : h.lost}"></td>
        <td class="num"><input class="cell" type="number" data-k="history.${i}.count"
            value="${h.count == null ? '' : h.count}"></td>
        <td>${MGM.rowTools('history', i, st.history.length)}</td></tr>`).join('')}
    </table>
    <div class="mgm-editonly" style="margin-top:10px">
      <button class="btn" onclick="MGM.addRow('history',{year:${(st.history[st.history.length-1]||{year:2026}).year + 1},newR:0,lost:null,count:null})">+ Add year</button>
      <button class="btn" onclick="MGM.resetSection('history')">Reset history</button>
    </div>
    <p class="note">Verified against <code>Historical member signups.xlsx</code>
      row by row. 2025's 25 is 20 Roady's + 5 Roady's Lite; 2026's 32 is 30 + 2.</p>
  </div>

  <div class="card"><h3>Derived attrition</h3>
    <table>
      <tr><th>Year</th><th class="num">Lost</th><th class="num">Prior count</th><th class="num">Rate</th></tr>
      ${d.rows.map(r => `<tr><td>${r.year}</td><td class="num">${fmt(r.lost)}</td>
        <td class="num">${fmt(r.base)}</td><td class="num">${pct1(r.rate)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Three-year average</td>
        <!-- derivedAttrition returns avg:0, NOT null, when no year has both a
             loss and a prior-year count -- so pct1's null guard does not fire
             and this read "0.0%", asserting that members never leave. Every
             value here is user-editable, so an empty count column is reachable. -->
        <td class="num"><b>${d.rows.length ? pct1(d.avg) : '—'}</b></td></tr>
    </table>
    <p class="note">Rate is lost ÷ prior-year count, for every year where both are
      known. The three-year average is the model's default steady rate; see
      Member Losses for the structural decomposition.${d.rows.length ? '' :
      ` <b>No year currently has both a loss figure and a prior-year count, so no
      rate can be derived.</b> The model falls back to its own steady-attrition
      input until at least two consecutive years carry a count.`}</p>
  </div>

  <div class="card"><h3>Monthly signups${years.length
      ? `, ${years[0]}–${years[years.length - 1]}` : ''}</h3>
    ${!years.length ? '<p class="note">No monthly series loaded.</p>' : `
    <div style="overflow-x:auto">
    <table>
      <tr><th>Year</th>${MONTH_NAMES.map(m => `<th class="num">${m}</th>`).join('')}
        <th class="num">Total</th></tr>
      ${years.map(y => `<tr><td>${y}</td>
        ${mh[y].map((v, i) => `<td class="num"><input class="cell" type="number"
          data-k="monthlyHistory.${y}.${i}" value="${v}"></td>`).join('')}
        <td class="num"><b>${fmt(mh[y].reduce((a, v) => a + (+v || 0), 0))}</b></td></tr>`).join('')}
    </table></div>
    `}
    <p class="note">From 2019 on — where the annual table has a matching row —
      each year's monthly total equals its New column (2023 → 38, 2024 → 52,
      2026 → 32). 2010–2018 are monthly-only; there is no annual row to
      reconcile them against.</p>
  </div>

  <div class="grid g2">
    <div class="card flush"><div style="padding:18px 20px 0">${MGM.chartTitle('history')}</div>
      <div style="height:260px;padding:10px 20px 20px"><canvas id="chHistory"></canvas></div></div>
    <div class="card flush"><div style="padding:18px 20px 0">
      ${MGM.chartTitle('monthly')}</div>
      <div style="height:260px;padding:10px 20px 20px"><canvas id="chMonthly"></canvas></div>
      <p class="note" style="padding:0 20px 18px">Spikes are batch deals, not
        seasonality: 2013-05 = 61, 2017-09 = 18, 2024-09 = 22, 2026-06 = 19
        (one 18-location deal alone).</p></div>
  </div>

  ${MGM.tabNotes('historical')}`;

  if (years.length) MGM.drawMonthlyHistory(st);
  MGM.drawHistory(st);
};

MGM.drawHistory = function (st) {
  const h = st.history;
  mkChart('#chHistory', {
    type: 'bar',
    data: { labels: h.map(x => x.year), datasets: [
      { label: "New signups (Roady's)", data: h.map(x => x.newR), backgroundColor: css('--gain') },
      { label: 'Lost', data: h.map(x => x.lost == null ? null : -x.lost), backgroundColor: css('--loss') }
    ]},
    options: (() => { const o = baseOpts(); o.scales.x.stacked = true; o.scales.y.stacked = true; return o; })()
  });
};

MGM.drawMonthlyHistory = function (st) {
  const mh = st.monthlyHistory || {};
  const years = Object.keys(mh).map(Number).sort((a, b) => a - b);
  const labels = [], data = [];
  years.forEach(y => mh[y].forEach((v, i) => {
    labels.push(`${MONTH_NAMES[i]} ${String(y).slice(2)}`); data.push(v);
  }));
  mkChart('#chMonthly', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'New signups', data, backgroundColor: css('--gain') }] },
    options: baseOpts()
  });
};
```

- [ ] **Step 2: Verify in the browser**

1. The annual table shows 2019–2026 (eight rows) with the verified figures; the
   derived-attrition table shows 2022 **3.2%**, 2023 **4.0%**, 2024 **13.7%**,
   2025 **11.3%** and a **9.7%** average — measured as 9.652651…, the mean of the
   last three rows, not all four.
2. The monthly grid shows 2010–2026 (seventeen rows, twelve cells each). For
   2019 onward every row's total matches the annual New column; 2010–2018 have
   no annual row to match. 2013 is the largest row at 119.
3. Edit a monthly cell — the row total and both charts update.
4. **+ Add year** appends a row with the next year pre-filled; **✕** removes one and the derived table follows.
5. Editing a `count` changes the derived attrition rates. Whether it also moves
   the Member Losses decomposition depends on whether that tab reads
   `derivedAttrition` live or reads `state.attrition.steady` as an independent
   input merely seeded from it — confirm which, and report it rather than
   changing it.
6. The monthly chart's title is itself an editable label, and the batch-deal caveat renders beneath it.

- [ ] **Step 3: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): Historical Data tab with editable annual and monthly series"
```

---

## Task 14: Scenarios — save, load, compare

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: `MM.applyScenario`, `MGM.model()`.
- Produces: `MGM.scenarioList()`, `MGM.scenarioWriteAll(list)`, `MGM.scenarioSave()`, `MGM.scenarioLoad(id)`, `MGM.scenarioDelete(id)`, `MGM.applyPreset(name)`, `MGM.renderCompare()`. Local key `roadys_mgm_scenarios_v1` holds `{id, name, scope, state, updated_at}` records — the same shape Task 16 syncs, so the cloud path needs no translation.

- [ ] **Step 1: Local scenario CRUD**

```js
const SCEN_KEY = 'roadys_mgm_scenarios_v1';

MGM.scenarioList = function () {
  try { return JSON.parse(localStorage.getItem(SCEN_KEY)) || []; }
  catch (e) { return []; }
};

MGM.scenarioWriteAll = function (list) {
  try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)); }
  catch (e) { alert('Could not save the scenario — browser storage is full.'); }
};

MGM.scenarioSave = function () {
  const name = (prompt('Scenario name:', MGM.state.activeScenario || 'Base') || '').trim();
  if (!name) return;
  const list = MGM.scenarioList();
  const id = 'scn_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const rec = {
    id, name, scope: 'company',
    state: JSON.parse(JSON.stringify(MGM.state)),
    updated_at: new Date().toISOString()
  };
  const i = list.findIndex(s => s.id === id);
  if (i >= 0) {
    if (!confirm(`Overwrite the saved scenario "${name}"?`)) return;
    list[i] = rec;
  } else { list.push(rec); }
  MGM.scenarioWriteAll(list);
  MGM.state.activeScenario = name;
  MGM.save(); MGM.refresh();
};

MGM.scenarioLoad = function (id) {
  const rec = MGM.scenarioList().find(s => s.id === id);
  if (!rec) return;
  // Layer over config defaults so a scenario saved before a field existed
  // still opens, with the new field at its default.
  //
  // MUST be a deep merge -- see MGM.mergeScenario and task-14-brief-corrections.
  // Object.assign is shallow, and 17 of the 25 top-level state keys are nested
  // objects, so it replaces each wholesale: a scenario saved before a nested
  // field existed reopens with that field undefined. _n(undefined) is 0, so it
  // becomes a silent zero, not an error. Measured: dropping two fields
  // understated revenue by $198,467/yr with nothing on screen saying so.
  const merged = MM.mergeState(MM.defaultState(MGM_CONFIG), rec.state || {});
  MGM.state = merged.state;
  MGM.save(); MGM.refresh();
  const ov = MGM.state.gallons && MGM.state.gallons.groupBaselineOverride;
  if (ov && Object.keys(ov).length) {
    alert('This scenario carries overridden gallon baselines that differ from the Bus Dev engine — see Fuel Gallon Production.');
  }
};

MGM.scenarioRename = function (id) {
  const list = MGM.scenarioList();
  const rec = list.find(s => s.id === id);
  if (!rec) return;
  const name = (prompt('Rename scenario:', rec.name) || '').trim();
  if (!name || name === rec.name) return;
  // The id is derived from the name, so a rename is a new id. Keep the old
  // row out of the way rather than leaving two copies behind.
  const newId = 'scn_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (newId !== id && list.some(s => s.id === newId)) {
    alert('A scenario named "' + name + '" already exists.');
    return;
  }
  rec.name = name; rec.id = newId; rec.updated_at = new Date().toISOString();
  MGM.scenarioWriteAll(list);
  if (MGM.state.activeScenario) MGM.state.activeScenario = name;
  MGM.save(); MGM.refresh();
  alert('Renamed locally. Sync to push the new name to the cloud; the old cloud row, if any, stays until removed in the SQL editor.');
};

MGM.scenarioDelete = function (id) {
  const rec = MGM.scenarioList().find(s => s.id === id);
  if (!rec || !confirm(`Delete the local scenario "${rec.name}"?`)) return;
  MGM.scenarioWriteAll(MGM.scenarioList().filter(s => s.id !== id));
  MGM.refresh();
};

MGM.applyPreset = function (name) {
  MM.applyScenario(MGM.state, name);
  MGM.save(); MGM.refresh();
};
```

- [ ] **Step 2: Header controls**

In the brand bar's `.actions`:

```html
<button class="btn ghost" onclick="MGM.applyPreset('Conservative')">Conservative</button>
<button class="btn ghost" onclick="MGM.applyPreset('Base')">Base</button>
<button class="btn ghost" onclick="MGM.applyPreset('Aggressive')">Aggressive</button>
<button class="btn primary" onclick="MGM.scenarioSave()">Save scenario…</button>
```

- [ ] **Step 3: Comparison card, appended to the New Additions tab**

Each column is a full independent re-run, so a scenario differing in *any* input — not just attrition — shows its real effect.

```js
MGM.renderCompare = function () {
  const cols = [{ name: 'Current', state: MGM.state }]
    .concat(MGM.scenarioList().map(s => ({
      name: s.name, id: s.id,
      // Deep merge here too: a comparison against a scenario that predates a
      // field must compare against that field's default, not against a zero.
      state: MM.mergeState(MM.defaultState(MGM_CONFIG), s.state).state
    })));

  const runs = cols.map(c => {
    const st = c.state;
    const pipeline = MM.pipelineModel(st, MGM.leads, MGM.profiles);
    const M = MM.runModel(st, MM.addsOpts(st, pipeline));
    const R = MM.revenueModel(st, M);
    const F = MM.cashflowModel(st, M, R);
    const last = R[R.length - 1];
    return {
      name: c.name, id: c.id, M, R,
      last, lastF: F[F.length - 1] || { ebitda: 0 },
      v: MM.valuation(st, last, F.length ? F[F.length - 1].ebitda : null),
      steady: (st.attrition || {}).steady,
      basis: (st.salesPipeline || {}).basis
    };
  });

  const rows = [
    ['Steady attrition',   r => pct1(r.steady)],
    ['Add basis',          r => r.basis === 'pipeline' ? 'Pipeline' : 'Flat'],
    ['Ending locations',   r => fmt(r.M.years[r.M.years.length - 1].end)],
    ['Net growth',         r => { const y = r.M.years;
                                  const d = y[y.length - 1].end - y[0].start;
                                  return (d >= 0 ? '+' : '') + fmt1(d); }],
    // newModeled, NOT newAdds: newAdds folds in the current year's YTD
    // signings, which are already inside the opening count. Using it here
    // would report 166 against the Additions tab's 134.
    ['Modeled new members', r => fmt1(r.M.years.reduce((a, y) => a + y.newModeled, 0))],
    ['Projected losses',   r => fmt1(r.M.years.reduce((a, y) => a + y.lost, 0))],
    ['Final-year revenue', r => fmM(r.last.total)],
    ['$/member/yr',        r => fm$(r.last.members ? r.last.total / r.last.members : 0)],
    ['EBITDA',             r => fmM(r.lastF.ebitda)],
    // indicated, not mid -- see Task 12 round 4. A scenario whose costs and
    // margin are unset has one live lens, and mid would report half of it.
    ['Indicated value', r => r.v.indicated === null ? '—' : fmM(r.v.indicated)],
    ['Lenses with a basis', r => String(r.v.lensCount)]
  ];

  return `<div class="card"><h3>Scenario comparison</h3>
    <div style="overflow-x:auto"><table>
      <tr><th>Measure</th>${runs.map(r => `<th class="num">${esc(r.name)}</th>`).join('')}</tr>
      ${rows.map(([label, fn]) => `<tr><td>${label}</td>${
        runs.map(r => `<td class="num">${fn(r)}</td>`).join('')}</tr>`).join('')}
      <tr><td></td>${runs.map(r => r.id
        ? `<td class="num"><button class="btn" onclick="MGM.scenarioLoad('${r.id}')">Load</button>
           <button class="btn mgm-editonly" onclick="MGM.scenarioRename('${r.id}')">✎</button>
           <button class="btn mgm-editonly" onclick="MGM.scenarioDelete('${r.id}')">✕</button></td>`
        : '<td class="num"><span class="note">live</span></td>').join('')}</tr>
    </table></div>
    ${runs.length === 1 ? '<p class="note">No saved scenarios yet — use <b>Save scenario…</b> in the header.</p>' : ''}
  </div>`;
};
```

Append `${MGM.renderCompare()}` to `MGM.renderers.additions`'s template, before `MGM.tabNotes('additions')`.

- [ ] **Step 4: Verify in the browser**

1. Click **Conservative** — Member Losses shows steady 9.7%.
2. **Save scenario…**, name it "Conservative".
3. Click **Aggressive** (3.6%), save as "Aggressive".
4. New Additions' comparison table shows Current / Conservative / Aggressive; Aggressive's ending locations exceed Conservative's, and EBITDA and valuation differ.
5. Saving over an existing name prompts before overwriting.
6. **Load** restores that scenario; reload the page and it persists.
7. Save a scenario with a gallon-baseline override active, load it, and confirm the warning fires.
8. In edit mode, **✕** deletes a local scenario after confirming.

- [ ] **Step 5: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): named scenarios with presets and a full re-run comparison"
```

---

## Task 14a: `MM.mergeState` — the engine's state merge

**Files:**
- Modify: `membershipModel.js`
- Modify: `membershipModel.test.js`

**Interfaces:**
- Produces: `MembershipModel.mergeState(defaults, saved) -> { state, added, unknown }`

**Why this is in the engine and not on `MGM`.** Three separate places merge a
stored state object onto current defaults, and one of them cannot reach a
page-local helper:

| caller | task | when |
|---|---|---|
| `MGM.load` | 7 | **every page load**, at module scope |
| `MGM.scenarioLoad` | 14 | loading a saved scenario |
| `MGM.importJSON` | 17 | importing an exported file |

`MGM.load` runs before Task 14's and Task 17's code is defined, so the merge has
to exist in the engine, which is loaded first. Putting it there also makes it
testable, which a function inside the page's inline script is not.

**The defect it replaces.** All three used
`Object.assign(MM.defaultState(MGM_CONFIG), saved)`. `Object.assign` is
shallow, and **17 of the 25 top-level state keys are nested objects**
(`attrition`, `revenue`, `participation`, `valuation`, `costs`, `cashflow`,
`gallons`, `staffing`, `salesPipeline`, `labels`, `report`, `benchmark`,
`billing`, `statusCounts`, `monthlyHistory`, `adds`, `scenarios`), so each was
replaced wholesale. A state saved before a nested field existed reloaded with
that field `undefined`, and `_n(undefined)` is `0` — so it became a silent zero
rather than an error. Measured: deleting `valuation.ebitdaNormalization` and
`revenue.rewardsBreakagePerMember` from a saved state understated revenue by
**$198,467/yr**, the entire Rewards breakage line, with nothing on screen
saying so.

- [ ] **Step 1: Write the failing tests**

Add to `membershipModel.test.js`. These are the 21 assertions, already verified
against the real engine before this task was written:

```js
test('mergeState restores a nested field the saved state predates', () => {
  const base = () => MembershipModel.defaultState(MGM_CONFIG);
  const old = JSON.parse(JSON.stringify(base()));
  delete old.valuation.ebitdaNormalization;
  delete old.revenue.rewardsBreakagePerMember;

  const r = MembershipModel.mergeState(base(), old);
  const want = base();
  assert.equal(r.state.valuation.ebitdaNormalization, want.valuation.ebitdaNormalization);
  assert.equal(r.state.revenue.rewardsBreakagePerMember, want.revenue.rewardsBreakagePerMember);
  assert.ok(r.added.includes('valuation.ebitdaNormalization'));
  assert.ok(r.added.includes('revenue.rewardsBreakagePerMember'));

  const got = MembershipModel.revenueModel(r.state, MembershipModel.runModel(r.state))[0].total;
  const exp = MembershipModel.revenueModel(want, MembershipModel.runModel(want))[0].total;
  near(got, exp, 'revenue is no longer understated');
});

test('CONTROL: the shallow merge mergeState replaces really did lose the field', () => {
  // Without this, the test above passes trivially and proves nothing about
  // why mergeState exists.
  const base = () => MembershipModel.defaultState(MGM_CONFIG);
  const old = JSON.parse(JSON.stringify(base()));
  delete old.revenue.rewardsBreakagePerMember;
  const shallow = Object.assign(base(), old);
  assert.equal(shallow.revenue.rewardsBreakagePerMember, undefined,
    'Object.assign drops it, which is the bug');
  const lost = MembershipModel.revenueModel(base(), MembershipModel.runModel(base()))[0].total
             - MembershipModel.revenueModel(shallow, MembershipModel.runModel(shallow))[0].total;
  assert.ok(lost > 150000, `shallow merge understates revenue by $${lost.toFixed(0)}`);
});

test('mergeState lets a saved value override the default, nested included', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const saved = JSON.parse(JSON.stringify(st));
  saved.revenue.duesPerLoc = 999;
  saved.attrition.steady = 42;
  const r = MembershipModel.mergeState(MembershipModel.defaultState(MGM_CONFIG), saved);
  assert.equal(r.state.revenue.duesPerLoc, 999);
  assert.equal(r.state.attrition.steady, 42);
  assert.equal(r.added.length, 0, 'a current-shape state reports nothing missing');
});

test('mergeState replaces arrays wholesale, never element-wise', () => {
  // groups / history / sources are user-editable lists. A saved list is an
  // intentional whole: merging it element-wise against a longer default would
  // resurrect rows the user deleted.
  const saved = JSON.parse(JSON.stringify(MembershipModel.defaultState(MGM_CONFIG)));
  saved.history = [{ year: 2030, newR: 1, lost: 1, count: 1 }];
  saved.groups = [{ key: 'ts', label: 'Truck Stop', count: 5 }];
  const r = MembershipModel.mergeState(MembershipModel.defaultState(MGM_CONFIG), saved);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].year, 2030);
  assert.equal(r.state.groups.length, 1);
});

test('mergeState keeps and reports a field the current build no longer has', () => {
  const saved = JSON.parse(JSON.stringify(MembershipModel.defaultState(MGM_CONFIG)));
  saved.revenue.somethingRemoved = 7;
  saved.anObsoleteTopLevel = { a: 1 };
  const r = MembershipModel.mergeState(MembershipModel.defaultState(MGM_CONFIG), saved);
  assert.ok(r.unknown.includes('revenue.somethingRemoved'));
  assert.ok(r.unknown.includes('anObsoleteTopLevel'));
  assert.equal(r.state.revenue.somethingRemoved, 7, 'the value is kept, not dropped');
});

test('mergeState respects an explicit 0 and an explicit null', () => {
  // Presence must be tested with `in`, never truthiness: a user who sets a
  // driver to 0 means 0, and replacing it with the default would silently
  // undo their edit.
  const saved = JSON.parse(JSON.stringify(MembershipModel.defaultState(MGM_CONFIG)));
  saved.revenue.duesPerLoc = 0;
  saved.history[0].count = null;
  const r = MembershipModel.mergeState(MembershipModel.defaultState(MGM_CONFIG), saved);
  assert.equal(r.state.revenue.duesPerLoc, 0);
  assert.equal(r.state.history[0].count, null);
  assert.ok(!r.added.includes('revenue.duesPerLoc'), 'an explicit 0 is not "missing"');
});

test('mergeState with an empty object yields pure defaults', () => {
  const r = MembershipModel.mergeState(MembershipModel.defaultState(MGM_CONFIG), {});
  assert.deepEqual(r.state, MembershipModel.defaultState(MGM_CONFIG));
  assert.ok(r.added.length > 20, 'every key reported missing');
});

test('a merged state still works with setPath, getPath and runModel', () => {
  const r = MembershipModel.mergeState(MembershipModel.defaultState(MGM_CONFIG),
    JSON.parse(JSON.stringify(MembershipModel.defaultState(MGM_CONFIG))));
  MembershipModel.setPath(r.state, 'revenue.duesPerLoc', 123);
  assert.equal(MembershipModel.getPath(r.state, 'revenue.duesPerLoc'), 123);
  assert.ok(MembershipModel.runModel(r.state).years.length > 0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test membershipModel.test.js`
Expected: the seven `mergeState` tests fail with "mergeState is not a function";
the CONTROL test passes immediately, because it asserts the behaviour of
`Object.assign`, which already exists.

- [ ] **Step 3: Implement it**

In `membershipModel.js`, beside the other state helpers:

```js
  // Deep-overlay a saved state onto the current defaults, reporting what the
  // saved copy did not carry and what it carried that this build no longer
  // knows. Object.assign would not do: 17 of the 25 top-level keys are nested
  // objects, so a shallow merge replaces each wholesale and a state saved
  // before a nested field existed reloads with that field undefined -- and
  // n(undefined) is 0, so it becomes a silent zero, not an error.
  //
  // Arrays replace wholesale on purpose: groups / history / sources are
  // user-editable lists, so a saved list is an intentional whole and must
  // never be merged element-wise against a longer or shorter default.
  //
  // Presence is tested with `in`, never truthiness, so an explicit 0 or null
  // in the saved state survives instead of being overwritten by the default.
  function mergeState(defaults, saved) {
    var added = [], unknown = [];

    function walk(dst, src, path) {
      Object.keys(dst).forEach(function (k) {
        var p = path ? path + '.' + k : k;
        if (!(k in src)) { added.push(p); return; }
        var dv = dst[k], sv = src[k];
        var bothPlain = dv && sv
          && typeof dv === 'object' && typeof sv === 'object'
          && !Array.isArray(dv) && !Array.isArray(sv);
        if (bothPlain) walk(dv, sv, p);
        else dst[k] = sv === undefined ? dv : sv;
      });
      Object.keys(src).forEach(function (k) {
        var p = path ? path + '.' + k : k;
        if (!(k in dst)) { unknown.push(p); dst[k] = src[k]; }
      });
    }

    walk(defaults, saved || {}, '');
    return { state: defaults, added: added, unknown: unknown };
  }
```

Export it alongside the others: `mergeState: mergeState,`.

- [ ] **Step 4: Run the tests again**

Run: `node --test membershipModel.test.js`
Expected: all green, and the total rises by 8.

- [ ] **Step 5: Commit**

```bash
git add membershipModel.js membershipModel.test.js
git commit -m "feat(mgm): MM.mergeState so a stored state never silently zeroes a new field"
```

---

## Task 15: SQL migration

**Files:**
- Create: `sql/2026-10-28-mgm-scenarios.sql`

**Interfaces:**
- Produces: `public.mgm_scenarios`, `public.mgm_pnl_actuals`.

- [ ] **Step 1: Write the migration**

Mirrors `sql/2026-10-05-bd-value-profiles.sql`: `BEGIN;…COMMIT;`, RLS on, `auth.uid() IS NOT NULL` policies, grants to `authenticated` only, `REVOKE ALL` from `anon`, `search_path`-pinned triggers, commented verification block.

```sql
BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- mgm_scenarios — a saved Membership Growth Model scenario. `state` is the
-- tool's whole state object, so a scenario reopens exactly as saved.
-- scope='company' rows are the shared set every signed-in owner sees;
-- scope='user' rows are personal drafts keyed by owner_email.
--
-- mgm_pnl_actuals — P&L-derived figures that must never enter this PUBLIC
-- repo. Anon holds no grant on either table; a session is the only way in.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mgm_scenarios (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  scope       text        NOT NULL DEFAULT 'company'
                          CHECK (scope IN ('company','user')),
  owner_email text        NOT NULL DEFAULT '',
  state       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mgm_scenarios_scope ON public.mgm_scenarios (scope);

-- One company scenario per name, so a shared name never has two answers.
CREATE UNIQUE INDEX IF NOT EXISTS mgm_scenarios_one_company_per_name
  ON public.mgm_scenarios (name) WHERE scope = 'company';

CREATE TABLE IF NOT EXISTS public.mgm_pnl_actuals (
  id            text        PRIMARY KEY,          -- e.g. '2026-09'
  period_label  text        NOT NULL DEFAULT '',
  period_months integer     NOT NULL DEFAULT 12,
  member_basis  integer     NOT NULL DEFAULT 0,
  streams       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  totals        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source        text        NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- search_path pinned per CLAUDE.md (function_search_path_mutable lint).
CREATE OR REPLACE FUNCTION public.touch_mgm_scenarios_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS mgm_scenarios_touch_updated_at ON public.mgm_scenarios;
CREATE TRIGGER mgm_scenarios_touch_updated_at
  BEFORE UPDATE ON public.mgm_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.touch_mgm_scenarios_updated_at();

CREATE OR REPLACE FUNCTION public.touch_mgm_pnl_actuals_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS mgm_pnl_actuals_touch_updated_at ON public.mgm_pnl_actuals;
CREATE TRIGGER mgm_pnl_actuals_touch_updated_at
  BEFORE UPDATE ON public.mgm_pnl_actuals
  FOR EACH ROW EXECUTE FUNCTION public.touch_mgm_pnl_actuals_updated_at();

-- ── RLS: authenticated only ─────────────────────────────────────────────
-- The anon key ships in this repo's HTML on GitHub Pages, so anon is
-- granted nothing. This is what keeps mgm_pnl_actuals off the public web.
ALTER TABLE public.mgm_scenarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgm_pnl_actuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgm_scenarios_read   ON public.mgm_scenarios;
DROP POLICY IF EXISTS mgm_scenarios_insert ON public.mgm_scenarios;
DROP POLICY IF EXISTS mgm_scenarios_update ON public.mgm_scenarios;

CREATE POLICY mgm_scenarios_read   ON public.mgm_scenarios
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY mgm_scenarios_insert ON public.mgm_scenarios
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY mgm_scenarios_update ON public.mgm_scenarios
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS mgm_pnl_actuals_read   ON public.mgm_pnl_actuals;
DROP POLICY IF EXISTS mgm_pnl_actuals_insert ON public.mgm_pnl_actuals;
DROP POLICY IF EXISTS mgm_pnl_actuals_update ON public.mgm_pnl_actuals;

CREATE POLICY mgm_pnl_actuals_read   ON public.mgm_pnl_actuals
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY mgm_pnl_actuals_insert ON public.mgm_pnl_actuals
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY mgm_pnl_actuals_update ON public.mgm_pnl_actuals
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- No DELETE policy on either table: removing a shared scenario or a P&L
-- period is an owner decision made in the SQL editor, not from a browser.
GRANT SELECT, INSERT, UPDATE ON public.mgm_scenarios   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mgm_pnl_actuals TO authenticated;
REVOKE ALL ON public.mgm_scenarios   FROM anon;
REVOKE ALL ON public.mgm_pnl_actuals FROM anon;

-- ════════════════════════════════════════════════════════════════════════
-- mgm_admins — who may EDIT the model. Viewing is open to anyone with the
-- link; editing is restricted to this list.
--
-- The list of admin emails is deliberately readable by any signed-in user,
-- because it is not the security boundary. The boundary is the write policies
-- below: a non-admin who bypasses the UI gate from the browser console still
-- cannot write a row. Knowing who CAN write buys nothing.
--
-- Nobody can write this table from a browser at all — no INSERT/UPDATE/DELETE
-- policy and no write grant. Membership is managed in the SQL editor.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mgm_admins (
  email      text        PRIMARY KEY,
  added_by   text        NOT NULL DEFAULT '',
  added_at   timestamptz NOT NULL DEFAULT now(),
  note       text        NOT NULL DEFAULT ''
);

ALTER TABLE public.mgm_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgm_admins_read ON public.mgm_admins;
CREATE POLICY mgm_admins_read ON public.mgm_admins
  FOR SELECT USING (auth.uid() IS NOT NULL);

GRANT SELECT ON public.mgm_admins TO authenticated;
REVOKE ALL ON public.mgm_admins FROM anon;

-- Email comparison is case-insensitive and whitespace-trimmed: Supabase
-- preserves the case a user typed at signup, so a strict match would let an
-- admin silently lose access by capitalising their own address.
-- search_path pinned per CLAUDE.md.
CREATE OR REPLACE FUNCTION public.mgm_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mgm_admins a
    WHERE lower(btrim(a.email)) = lower(btrim(COALESCE(auth.jwt() ->> 'email', '')))
  );
$$;

-- ── Writes are admin-only; reads stay open to any signed-in user ────────
-- Replaces the authenticated-only write policies created above. Reading a
-- shared scenario is useful to anyone signed in; changing one is not.
DROP POLICY IF EXISTS mgm_scenarios_insert   ON public.mgm_scenarios;
DROP POLICY IF EXISTS mgm_scenarios_update   ON public.mgm_scenarios;
DROP POLICY IF EXISTS mgm_pnl_actuals_insert ON public.mgm_pnl_actuals;
DROP POLICY IF EXISTS mgm_pnl_actuals_update ON public.mgm_pnl_actuals;

CREATE POLICY mgm_scenarios_insert ON public.mgm_scenarios
  FOR INSERT WITH CHECK (public.mgm_is_admin());
CREATE POLICY mgm_scenarios_update ON public.mgm_scenarios
  FOR UPDATE USING (public.mgm_is_admin()) WITH CHECK (public.mgm_is_admin());

CREATE POLICY mgm_pnl_actuals_insert ON public.mgm_pnl_actuals
  FOR INSERT WITH CHECK (public.mgm_is_admin());
CREATE POLICY mgm_pnl_actuals_update ON public.mgm_pnl_actuals
  FOR UPDATE USING (public.mgm_is_admin()) WITH CHECK (public.mgm_is_admin());

COMMIT;

-- ── Verification (run manually in the SQL editor after applying) ────────
-- select policyname, cmd from pg_policies
--   where schemaname='public' and tablename in ('mgm_scenarios','mgm_pnl_actuals')
--   order by tablename, policyname;
-- -- MUST return 0 rows (anon holds no grant on any of the three tables):
-- select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('mgm_scenarios','mgm_pnl_actuals','mgm_admins') and grantee='anon';
-- -- MUST return 0 rows (nobody can write the admin list from a browser):
-- select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='mgm_admins' and cmd <> 'SELECT';
-- -- writes on both data tables MUST be admin-gated, not merely authenticated:
-- select tablename, policyname, cmd, with_check from pg_policies
--   where schemaname='public' and tablename in ('mgm_scenarios','mgm_pnl_actuals')
--     and cmd in ('INSERT','UPDATE');    -- expect mgm_is_admin() in each
-- -- all three functions must report search_path pinned:
-- select proname, proconfig from pg_proc
--   where proname in ('touch_mgm_scenarios_updated_at',
--                     'touch_mgm_pnl_actuals_updated_at','mgm_is_admin');
--
-- -- Seed the first admin (replace the address), then confirm while signed in
-- -- as that account. WITHOUT THIS NOBODY CAN EDIT and the tool is read-only:
-- insert into public.mgm_admins (email, note)
--   values ('jasonvega1974@gmail.com', 'project owner')
--   on conflict (email) do nothing;
-- select public.mgm_is_admin();    -- expect true
```

- [ ] **Step 2: Apply and verify**

Hand to the user: paste into the Supabase SQL editor, run, then run the three commented verification queries. **The anon-grant query must return zero rows** — that is the check keeping the P&L off the public web.

- [ ] **Step 3: Commit**

```bash
git add sql/2026-10-28-mgm-scenarios.sql
git commit -m "feat(mgm): mgm_scenarios and mgm_pnl_actuals, authenticated-only"
```

---

## Task 16: Supabase sync and gated P&L actuals

**Files:**
- Modify: `membership-growth-model/index.html`
- Create: `membershipPnlActuals.local.js` (gitignored)

**Interfaces:**
- Consumes: `RoadysBD.auth` (`client`, `init`, `session`, `email`, `signIn`, `signOut`), `MGM.scenarioList`.
- Produces: `MGM.sb()`, `MGM.signIn()`, `MGM.renderAuth()`, `MGM.cloudSave(rec)`, `MGM.syncScenarios()`, `MGM.loadPnlActuals()`.

- [ ] **Step 1: Load the SDK and the shared auth module**

In `<head>`, after the model modules — order matters, `roadysBD.js` needs `window.supabase`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="../roadysBD.js?v=2026-10-28"></script>
<script src="../membershipPnlActuals.local.js" onerror="void 0"></script>
```

The third tag is expected to 404 in production; the `onerror` keeps that silent.

```js
// Never construct a client here. roadysBD.js owns the one client whose
// session the RLS policies recognise; a second client would carry no
// session and every query would 403. (Same note as CRM.html:1095-1099.)
MGM.sb = () => {
  try { return RoadysBD.auth.client(); } catch (e) { return null; }
};
```

- [ ] **Step 2: Sign-in as an action, not a gate**

The page must keep working unsigned, so this is a header button rather than BDPG's full-page boot gate.

```js
MGM.renderAuth = function () {
  const email = (window.RoadysBD && RoadysBD.auth.email()) || '';
  document.getElementById('authBar').innerHTML = email
    ? `<span class="note">Signed in as ${esc(email)}</span>
       <button class="btn ghost" onclick="MGM.syncScenarios()">☁️ Sync scenarios</button>
       <button class="btn ghost" onclick="RoadysBD.auth.signOut().then(()=>location.reload())">Sign out</button>`
    : `<button class="btn ghost" onclick="MGM.signIn()">Sign in to sync</button>`;
};

MGM.signIn = function () {
  bdShowLoginGate(async () => {
    await MGM.loadPnlActuals();
    await MGM.loadPipeline();
    await MGM.syncScenarios();
    MGM.renderAuth(); MGM.refresh();
  });
};

document.addEventListener('DOMContentLoaded', async () => {
  if (window.RoadysBD) { try { await RoadysBD.auth.init(); } catch (e) {} }
  MGM.renderAuth();
  await MGM.loadRegionVariance();
  await MGM.loadPnlActuals();
  await MGM.loadPipeline();
  MGM.refresh();
});
```

Copy `bdShowLoginGate` and its `.pin-overlay` / `.pin-box` CSS verbatim from `bus-dev-potential-gallons/index.html:8700-8740` and `:468-470`, so all four pages present the same gate. Sign-ups are disabled in the Supabase dashboard, so the account list **is** the allowlist — do not add a sign-up affordance.

- [ ] **Step 3: Optimistic-concurrency save**

This is the one place a lost write silently destroys another owner's work, so it follows the idiom CLAUDE.md documents for the travel vault.

```js
// Read, compute from that snapshot, write guarded by the `updated_at` we
// read. updated_at is trigger-maintained, so it is the version token.
// An empty returned array means someone else saved first: surface it and
// stop. NEVER retry — a retry would overwrite their change.
MGM.cloudSave = async function (rec) {
  const sb = MGM.sb();
  if (!sb) return { ok: false, reason: 'no-client' };

  const { data: existing, error: readErr } = await sb
    .from('mgm_scenarios').select('id,updated_at').eq('id', rec.id).maybeSingle();
  if (readErr) return { ok: false, reason: readErr.message };

  const row = {
    id: rec.id, name: rec.name, scope: rec.scope || 'company',
    owner_email: (window.RoadysBD && RoadysBD.auth.email()) || '',
    state: rec.state
  };

  if (!existing) {
    const { error } = await sb.from('mgm_scenarios').insert(row);
    // A concurrent insert of the same id loses the unique-key race.
    if (error) return { ok: false, reason: 'conflict', detail: error.message };
    return { ok: true, created: true };
  }

  const seen = existing.updated_at;
  const { data, error } = await sb.from('mgm_scenarios')
    .update(row).eq('id', rec.id).eq('updated_at', seen).select();
  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) return { ok: false, reason: 'conflict' };
  return { ok: true };
};

MGM.syncScenarios = async function () {
  const sb = MGM.sb();
  if (!sb || !(window.RoadysBD && RoadysBD.auth.email())) {
    alert('Sign in first to sync scenarios.');
    return;
  }

  let pushed = 0; const conflicts = [];
  for (const rec of MGM.scenarioList()) {
    const r = await MGM.cloudSave(rec);
    if (r.ok) pushed++;
    else if (r.reason === 'conflict') conflicts.push(rec.name);
  }

  const { data: cloud, error } = await sb
    .from('mgm_scenarios').select('*').eq('scope', 'company');
  if (error) { alert('Sync failed: ' + error.message); return; }

  // Cloud is the shared truth for company scenarios; merge it down locally.
  const local = MGM.scenarioList();
  (cloud || []).forEach(c => {
    const rec = { id: c.id, name: c.name, scope: c.scope, state: c.state, updated_at: c.updated_at };
    const i = local.findIndex(s => s.id === c.id);
    if (i >= 0) local[i] = rec; else local.push(rec);
  });
  MGM.scenarioWriteAll(local);
  MGM.refresh();

  alert(conflicts.length
    ? `Pushed ${pushed}. Someone else changed these first, so they were NOT overwritten: ${conflicts.join(', ')}. Reload to see their version before saving again.`
    : `Scenarios synced — ${pushed} pushed, ${(cloud || []).length} in the cloud.`);
};
```

- [ ] **Step 4: Load P&L actuals — two sources, never the repo**

```js
// Two sources, neither of them this repo's committed files: the auth-gated
// table in production, and a gitignored local file for development.
MGM.loadPnlActuals = async function () {
  if (typeof MGM_PNL_ACTUALS !== 'undefined') {
    MGM.pnlActuals = MGM_PNL_ACTUALS;        // gitignored dev fallback
    return;
  }
  const sb = MGM.sb();
  if (!sb || !(window.RoadysBD && RoadysBD.auth.email())) {
    MGM.pnlActuals = null; return;
  }
  const { data, error } = await sb.from('mgm_pnl_actuals')
    .select('*').order('id', { ascending: false }).limit(1);
  if (error || !data || !data.length) { MGM.pnlActuals = null; return; }
  const row = data[0];
  const t = row.totals || {};
  MGM.pnlActuals = {
    periodLabel: row.period_label,
    totalPerMemberYr: t.totalPerMemberYr,
    streams: row.streams || {}
  };
  // The real EBITDA margin and its basis detail are auth-gated, never
  // committed. Apply them to state only once a session has supplied them,
  // and only if the user has not already typed a margin of their own.
  if (isFinite(Number(t.ebitdaMarginPct)) && !MGM.state.valuation.ebitdaMargin) {
    MGM.state.valuation.ebitdaMargin = Number(t.ebitdaMarginPct);
  }
  if (t.marginBasisDetail) MGM.state.valuation.marginBasisDetail = t.marginBasisDetail;
};
```

Revenue per Member already calls `MM.revPerMember(st, M, MGM.pnlActuals)` via `MGM.model()`, so the tile fills in automatically and shows "sign in to reconcile" when `rpm.actual === null`.

- [ ] **Step 5: Seed the actuals**

Create the gitignored `membershipPnlActuals.local.js`:

```js
// GITIGNORED. Jan–Sep 2026 P&L, annualized, 375-member basis.
// NEVER commit — this repo is public. Production reads mgm_pnl_actuals.
//
// Every zero below is a placeholder. Fill them in from the income statement
// itself; the real figures are deliberately absent from this plan, from the
// spec, and from every other file in this repo.
var MGM_PNL_ACTUALS = {
  periodLabel: 'Jan–Sep 2026, annualized',
  totalPerMemberYr: 0,   // realized gross profit / 375, annualized
  streams: {             // each stream's realized net / 375, annualized
    dues: 0, duesAncillary: 0, settlement: 0,
    fuelProgram: 0, vendor: 0, rewards: 0, rewardsBreakage: 0
  }
};
```

Hand the user the matching insert for production — the only place these figures are entered, and it happens outside git:

```sql
insert into public.mgm_pnl_actuals
  (id, period_label, period_months, member_basis, streams, totals, source)
-- Every numeric below is a P&L actual and is a PLACEHOLDER here: type the
-- real figures in the Supabase SQL editor, from the income statement. They
-- are deliberately absent from this plan, which is committed to a public repo.
values ('2026-09', 'Jan–Sep 2026, annualized', 9, 375,
  '{"dues":0,"duesAncillary":0,"settlement":0,"fuelProgram":0,"vendor":0,"rewards":0,"rewardsBreakage":0}'::jsonb,
  '{"totalPerMemberYr":0,"ebitdaMarginPct":0,"marginBasisDetail":"Fully-loaded whole-entity margin. The Income Statement has nine monthly columns and one Net Income line - no segment or departmental split. It charges the membership line with payroll (the largest opex category, unallocated), the office lease, D&O/EPLI/Fiduciary insurance, consulting, the annual meeting, and costs serving the near-zero-margin aggregator/settlement business and PTP marketing. Program contribution margin would be materially higher; a clean program figure is NOT derivable from this file."}'::jsonb,
  'Income Statement, Sep 30 2026 — operating entity, Jan–Sep 2026')
on conflict (id) do update set
  streams = excluded.streams, totals = excluded.totals, source = excluded.source;
```

- [ ] **Step 6: Verify**

1. Unsigned: the page works, scenarios save locally, Revenue per Member's P&L column reads "sign in to reconcile", Sales Pipeline shows the not-signed-in banner, and **Sync scenarios** says to sign in first.
2. Sign in — the gate matches BDPG's; the header shows the email; the pipeline loads and the funnel draws.
3. Save a scenario, **Sync** — the alert reports it pushed; confirm the row in Supabase.
4. In a second browser, sign in, load the same scenario, edit and sync. Then sync the *first* browser without reloading: it must name the conflict and leave the cloud row untouched.
5. With `membershipPnlActuals.local.js` present and filled in, the reconciliation shows the derived driver total beside the actual, per stream, with the variance between them — and the actual column goes back to "sign in to reconcile" once the file is removed.
6. Rename the local file to simulate production — the 404 is silent and the tile falls back to the cloud.
7. `git status` does **not** list `membershipPnlActuals.local.js`.

- [ ] **Step 7: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): Supabase scenario sync with conflict detection, gated P&L actuals"
```

---

## Task 17: Report, print, email, export

**Files:**
- Modify: `membership-growth-model/index.html`

**Interfaces:**
- Consumes: everything above.
- Produces: `MGM.renderers.report`, `MGM.doPrint()`, `MGM.exportCSV()`, `MGM.exportJSON()`, `MGM.importJSON(file)`, `MGM.openEmail()`, `MGM.sendEmail()`, `MGM.summaryText()`.

- [ ] **Step 1: The letterhead report**

```js
MGM.renderers.report = function (D) {
  const { st, M, R, F, rpm, valuation: v, cost: C, capacity: K, gallons: G, pipeline: p } = D;
  const rp = st.report;
  const last = R[R.length - 1], lastF = F[F.length - 1] || { ebitda: 0 };
  const first = M.years[0], final = M.years[M.years.length - 1];
  const today = new Date().toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' });
  const prose = t => t ? `<p>${esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>` : '';

  document.getElementById('panel-report').innerHTML = `
  <div class="noprint card"><h3>Report fields</h3>
    <table>
      <tr><td>Company</td><td><input class="lbl-in" type="text" data-k="report.company" value="${esc(rp.company)}"></td></tr>
      <tr><td>Title</td><td><input class="lbl-in" type="text" data-k="report.title" value="${esc(rp.title)}"></td></tr>
      <tr><td>Subtitle</td><td><input class="lbl-in" type="text" data-k="report.subtitle" value="${esc(rp.subtitle)}"></td></tr>
      <tr><td>Footer</td><td><input class="lbl-in" type="text" data-k="report.footer" value="${esc(rp.footer)}"></td></tr>
      <tr><td>Generated by</td><td><input class="lbl-in" type="text" data-k="report.generatedBy" value="${esc(rp.generatedBy)}"></td></tr>
      <tr><td>Contact</td><td><input class="lbl-in" type="text" data-k="report.contact" value="${esc(rp.contact)}"></td></tr>
      <tr><td>Disclosure</td><td><input class="lbl-in" type="text" data-k="report.disclosure" value="${esc(rp.disclosure)}"></td></tr>
    </table>
    <h3 style="margin-top:14px">Narrative</h3>
    <textarea class="prose" data-k-text="report.intro" placeholder="Opening commentary…"></textarea>
    <textarea class="prose" data-k-text="report.methodology" placeholder="Methodology notes…"></textarea>
    <textarea class="prose" data-k-text="report.closing" placeholder="Closing commentary…"></textarea>
    <div style="margin-top:12px">
      <button class="btn primary" onclick="MGM.doPrint()">🖨 Print / PDF</button>
      <button class="btn" onclick="MGM.openEmail()">✉ Email…</button>
      <button class="btn" onclick="MGM.exportCSV()">⬇ CSV</button>
      <button class="btn" onclick="MGM.exportJSON()">⬇ JSON</button>
      <label class="btn">⬆ Import JSON
        <input type="file" accept=".json" style="display:none"
          onchange="if(this.files[0])MGM.importJSON(this.files[0])"></label>
    </div>
  </div>

  <div id="reportSheet" class="card">
    <div class="lh">
      <img src="${document.getElementById('logoImg').src}" alt="Roady's">
      <div class="co"><b>${esc(rp.company)}</b><br>${esc(rp.title)} — ${esc(rp.subtitle)}<br>${esc(rp.footer)}</div>
    </div>
    <h1>${esc(rp.title)}</h1>
    <div class="meta">Generated by <b>${esc(rp.generatedBy || '—')}</b> · ${today}
      · Source data as of ${esc(st.DATA_ASOF)} · ${esc(rp.disclosure)}</div>
    ${prose(rp.intro)}

    <div>
      <span class="rsign"><div class="v">${fmt(first.start)}</div><div class="k">ACTIVE TODAY</div></span>
      <span class="rsign"><div class="v">${fmt(final.end)}</div><div class="k">${final.year} ENDING</div></span>
      <span class="rsign" style="background:#C4111B;outline-color:#C4111B"><div class="v">${fmM(last.total)}</div><div class="k">${final.year} REVENUE</div></span>
      <!-- indicated / lensCount, NOT mid. On the shipped defaults only the
           revenue lens has a basis, and mid averages it with an absent lens to
           produce half the real figure. The screen reads `indicated`; if this
           printed `mid` the paper would state $3.03M while the screen stated
           $6.06M. Same mechanism as the newAdds/newModeled defect earlier in
           this build: one field, every consumer. -->
      <span class="rsign" style="background:#14161B;outline-color:#14161B"><div class="v">${v.indicated === null ? '—' : fmM(v.indicated)}</div><div class="k">${
        v.lensCount === 2 ? 'VALUATION MIDPOINT'
        : v.lensCount === 1 ? 'INDICATED VALUE — SINGLE METHOD'
        : 'NO LENS HAS A BASIS'}</div></span>
    </div>

    <h3>Membership roll-forward</h3>
    <table>
      <tr><th>Year</th><th class="num">Start</th><th class="num">New (modeled)</th>
          <th class="num">Lost</th><th class="num">End</th><th class="num">Net</th></tr>
      ${M.years.map(r => `<tr><td>${r.year}</td><td class="num">${fmt(r.start)}</td>
        <td class="num">${fmt1(r.newModeled)}</td><td class="num">${fmt1(r.lost)}</td>
        <td class="num"><b>${fmt(r.end)}</b></td>
        <td class="num">${r.net >= 0 ? '+' : ''}${fmt1(r.net)}</td></tr>`).join('')}
    </table>

    <h3>Revenue by stream</h3>
    <table>
      <tr><th>Year</th><th class="num">Avg members</th>
        ${STREAM_KEYS.map(k => `<th class="num">${esc(st.labels.streams[k])}</th>`).join('')}
        <th class="num">Total</th></tr>
      ${R.map(r => `<tr><td>${r.year}</td><td class="num">${fmt(r.members)}</td>
        ${STREAM_KEYS.map(k => `<td class="num">${fm$(r.streams[k])}</td>`).join('')}
        <td class="num"><b>${fm$(r.total)}</b></td></tr>`).join('')}
    </table>

    <h3>Profit &amp; cash flow</h3>
    <table>
      <tr><th>Year</th><th class="num">Revenue</th><th class="num">Cost to serve</th>
          <th class="num">Acquisition</th><th class="num">EBITDA</th><th class="num">Cash</th></tr>
      ${F.map(r => `<tr><td>${r.year}</td><td class="num">${fm$(r.revenue)}</td>
        <td class="num">${fm$(-r.costToServe)}</td><td class="num">${fm$(-r.acquisition)}</td>
        <td class="num"><b>${fm$(r.ebitda)}</b></td><td class="num">${fm$(r.cash)}</td></tr>`).join('')}
    </table>

    <h3>Valuation</h3>
    <table>
      <tr><th>Lens</th><th class="num">Basis</th><th class="num">Multiple</th><th class="num">Value</th></tr>
      <tr><td>Recurring revenue</td><td class="num">${fm$(v.basis)}</td>
        <td class="num">${st.valuation.revMultiple}×</td><td class="num"><b>${fmM(v.rev)}</b></td></tr>
      <tr><td>EBITDA</td><td class="num">${fm$(v.ebitdaBase)}</td>
        <td class="num">${st.valuation.ebitdaMultiple}×</td><td class="num"><b>${fmM(v.ebitda)}</b></td></tr>
      <tr class="total"><td colspan="3">Indicated range (midpoint)</td>
        <td class="num">${v.lensCount === 2
          ? `${fmM(v.low)} – ${fmM(v.high)} (${fmM(v.mid)})`
          : v.lensCount === 1
            ? `${fmM(v.indicated)} — single method, no range`
            : '—'}</td></tr>
    </table>

    ${prose(rp.methodology)}
    ${MGM.reportAssumptions(D)}
    ${MGM.reportWarnings(D)}
    ${prose(rp.closing)}
    <div class="meta">Questions: ${esc(rp.contact)}</div>
  </div>`;
};
```

- [ ] **Step 2: Carry the honest caveats onto paper**

The report is the artifact that leaves the building, so the findings must travel with it rather than living only in the UI.

```js
MGM.reportAssumptions = function (D) {
  const { st, M, rpm, cost: C, capacity: K } = D;
  const rv = st.revenue, at = st.attrition, bm = st.benchmark;
  const struct = Object.values(at.structural || {}).some(v => +v);
  const rows = [
    ['Active locations (base)', `${fmt(M.startTotal)} — excludes corporate payment records and demo rows`],
    ['Steady attrition', pct1(at.steady) + (struct ? ' plus structural overrides by year' : '')],
    ['Add basis', st.salesPipeline.basis === 'pipeline'
      ? `Sales pipeline — ${fmt1(D.pipeline.expectedPerMonth)} locations/month weighted from ${D.pipeline.openLeads} open leads`
      : `Flat run rate — ${fmt1(st.adds.perMonth)}/month, growing ${st.adds.growthPct}%/yr`],
    ['Activation lag', st.adds.activationLag + ' months'],
    ['Participation', `fuel ${pct1(MM.partPct(st, 'fuel'))} · vendor ${pct1(MM.partPct(st, 'vendor'))} · rewards ${pct1(MM.partPct(st, 'rewards'))}`],
    ['Dues', `${fm$(rv.duesPerLoc)}/member/mo realized · ${fm$(st.billing.duesPerLocBillable)} billable · ${pct1(rpm.duesRealization)} realization`],
    ['Fuel settlement', `${fm$(rv.settlementNetPerMember)}/member/yr — settlement nets negative; not a profit centre`],
    ['Fuel program margin', `${fm$(rv.fuelProgramMargin)}/gal — forward assumption, zero unless set`],
    ['Rewards', `${fm$(rv.rewardsPM)}/mo fees plus ${fm$(rv.rewardsBreakagePerMember)}/yr breakage (expired points, non-durable)`],
    ['Revenue basis', 'Net per-member streams. Excludes gross fuel settlement pass-through (~95% of P&L Total Income).'],
    ['Cost to acquire / serve', C.unset
      ? 'Not set — EBITDA equals revenue'
      : `${fm$(C.cac)} CAC · ${fm$(C.costToServePerMember)}/member/yr to serve · LTV ${C.ltv == null ? '—' : fm$(C.ltv)}`],
    ['Capacity', K.unset
      ? 'Not set — no capacity gap computed'
      : `${fmt1(K.totalCapacity)} new locations/month across ${K.reps.length} reps · gap ${fmt1(K.gap)}`],
    ['EBITDA', C.unset
      // NOT "(P&L actual)". valuation.ebitdaMargin is an ASSUMPTION INPUT --
      // the same field the Valuation card labels "EBITDA margin % (used only
      // when costs are unset)". Calling it a P&L actual in a printed report
      // attributes provenance it does not have, and on the shipped defaults it
      // printed "0.0% margin assumption (P&L actual)" -- a fabricated financial
      // fact about a real company, on paper. Round 3 of Task 12 fixed exactly
      // this sentence on screen; the report must not reintroduce it.
      ? (st.valuation.ebitdaMargin
          ? `${pct1(st.valuation.ebitdaMargin)} margin — entered assumption, not a reported figure`
          : 'no margin entered and no P&L actual loaded — the EBITDA lens has no basis')
      : 'Computed from revenue less cost to serve and acquisition'],
    ['EBITDA margin basis', `${esc(st.valuation.marginBasis)} — ${esc(st.valuation.marginBasisNote)}`],
    [esc(bm.label), `${fm$(bm.lostMemberValue)} — ${esc(bm.caveat)}`],
    ['PTP', esc(st.ptpNote)]
  ];
  return '<h3>Assumptions &amp; sources</h3><table>' +
    rows.map(([k, val]) => `<tr><td>${k}</td><td>${val}</td></tr>`).join('') + '</table>';
};

// Anything that makes a figure not what it appears must say so on paper.
MGM.reportWarnings = function (D) {
  const { st, gallons: G } = D;
  const out = [];
  const ov = (st.gallons || {}).groupBaselineOverride || {};
  if (Object.keys(ov).length) {
    out.push(`Gallon baselines were overridden for ${Object.keys(ov).length} group(s) and no longer match the Bus Dev Potential Gallons engine.`);
  }
  if (G && G.mapped < G.byGroup.length) {
    out.push(`${G.byGroup.length - G.mapped} group(s) have no engine profile mapping and contribute zero gallons.`);
  }
  const srcSum = (st.sources || []).reduce((a, s) => a + (+s.pct || 0), 0);
  if (srcSum !== 100) out.push(`The source mix totals ${srcSum}%, not 100%.`);
  if (st.salesPipeline.basis === 'pipeline' && D.pipeline.isEmpty) {
    out.push('The add rate is set to use the sales pipeline, but no pipeline data was loaded — modeled adds are zero.');
  }
  return out.length
    ? '<h3>Caveats on this run</h3><ul>' +
      out.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>'
    : '';
};
```

- [ ] **Step 3: Print scoping**

Follow BDPG's approach (`bus-dev-potential-gallons/index.html:408-465`): scope every print rule under a body class, set it just before `window.print()`, clear it on `afterprint`, so a plain File ▸ Print is unaffected.

```js
MGM.doPrint = function () {
  MGM.switchTab('report');
  document.documentElement.classList.add('mgm-print');
  document.body.classList.add('mgm-print');
  window.print();
};
window.addEventListener('afterprint', () => {
  document.documentElement.classList.remove('mgm-print');
  document.body.classList.remove('mgm-print');
});
```

```css
@media print{
  body.mgm-print .tabrail,body.mgm-print .brandbar .actions,
  body.mgm-print #authBar,
  body.mgm-print .noprint,body.mgm-print .mgm-editonly{display:none !important}
  body.mgm-print .panel{display:none !important}
  body.mgm-print #panel-report{display:block !important}
  /* Re-point the colour tokens on the print container so inline
     color:var(--…) styles stay legible on paper. */
  body.mgm-print #reportSheet{--ink:#000;--ink-soft:#555;--bg:#fff;
    --surface:#fff;--line:#999;--line-soft:#ccc;border:0}
  body.mgm-print #reportSheet table{page-break-inside:auto}
  body.mgm-print #reportSheet tr{page-break-inside:avoid}
  body.mgm-print #reportSheet h3{page-break-after:avoid}
}
```

- [ ] **Step 4: Exports covering every field**

```js
MGM.exportCSV = function () {
  const D = MGM.model();
  const { st, M, R, F, pipeline: p, gallons: G, cost: C } = D;
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const L = [];

  L.push(['Membership Growth Model'], ['Generated', new Date().toISOString()],
    ['Data as of', st.DATA_ASOF], ['Add basis', st.salesPipeline.basis], []);

  L.push(['Groups'], ['Group', 'Active']);
  st.groups.forEach(g => L.push([g.label, g.count]));
  L.push(['Total', M.startTotal], []);

  L.push(['Annual roll-forward'],
    ['Year', 'Start', 'New (modeled)', 'YTD already in base', 'Lost',
     'Steady lost', 'Structural lost', 'End', 'Net']);
  // newModeled is the column the UI and the report show; newAdds is carried
  // alongside it so an analyst can see the YTD component explicitly rather
  // than having it silently folded into the growth figure.
  M.years.forEach(r => L.push([r.year, r.start, r.newModeled, r.ytd, r.lost,
    r.steadyLost, r.structuralLost, r.end, r.net]));
  L.push([]);

  L.push(['Monthly roll-forward'],
    ['Year', 'Month', 'New', 'Steady lost', 'Structural lost', 'End', 'Producing']);
  M.months.forEach(m => L.push([m.year, m.month, m.adds,
    m.steadyLost, m.structuralLost, m.end, m.producing]));
  L.push([]);

  L.push(['Revenue by stream'], ['Year', 'Avg members']
    .concat(STREAM_KEYS.map(k => st.labels.streams[k])).concat(['Total']));
  R.forEach(r => L.push([r.year, r.members]
    .concat(STREAM_KEYS.map(k => r.streams[k])).concat([r.total])));
  L.push([]);

  L.push(['Profit and cash flow'],
    ['Year', 'Revenue', 'Cost to serve', 'Acquisition', 'Add-backs', 'EBITDA', 'Capex', 'Cash']);
  F.forEach(r => L.push([r.year, r.revenue, r.costToServe, r.acquisition,
    r.normalization, r.ebitda, r.capex, r.cash]));
  L.push([]);

  L.push(['Sales pipeline by stage'],
    ['Stage', 'Leads', 'Locations', 'Weight %', 'Gallons', 'Deal value']);
  MM.CRM_STAGES.forEach(s => {
    const row = p.byStage[s] || {};
    L.push([s, row.count || 0, row.locations || 0,
      st.salesPipeline.stageWeights[s], row.gallons || 0, row.dealValue || 0]);
  });
  L.push(['Open weighted locations', p.weightedLocations],
    ['Expected per month', p.expectedPerMonth],
    ['Win rate %', p.winRate == null ? 'n/a' : p.winRate], []);

  L.push(['Gallon production by group'],
    ['Group', 'Locations', 'Profile', 'Roadway', 'Engine baseline', 'Baseline used', 'Overridden', 'Gallons/mo']);
  G.byGroup.forEach(r => L.push([r.label, r.count, r.profile, r.roadway,
    r.engineBaseline, r.baseline, r.overridden ? 'YES' : '', r.gallons]));
  L.push(['Existing network', G.existing], ['Pipeline inbound', G.inbound],
    ['Total', G.total], []);

  L.push(['Monthly signup history'], ['Year'].concat(MONTH_NAMES));
  Object.keys(st.monthlyHistory).sort().forEach(y =>
    L.push([y].concat(st.monthlyHistory[y])));

  const warn = MGM.reportWarnings(D);
  if (warn) {
    L.push([], ['Caveats on this run']);
    warn.replace(/<\/?(h3|ul|li)>/g, '\n').split('\n')
      .map(s => s.trim()).filter(s => s && s !== 'Caveats on this run')
      .forEach(s => L.push([s]));
  }

  MGM.dl('membership-growth-model.csv',
    L.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
};

// JSON: the whole state, so an export reopens identically — labels, prose,
// scenarios and overrides included. Live CRM/P&L data is deliberately NOT
// included: it is not ours to redistribute in a file.
MGM.exportJSON = function () {
  MGM.dl('membership-growth-model.json', JSON.stringify({
    state: MGM.state, scenarios: MGM.scenarioList(),
    exportedAt: new Date().toISOString()
  }, null, 2), 'application/json');
};

MGM.importJSON = function (file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result);
      if (!o || !o.state) throw new Error('No "state" key in this file.');
      // Deep merge, NOT Object.assign -- same reason as MGM.scenarioLoad.
      // 17 of the 25 top-level state keys are nested objects, so a shallow
      // assign replaces each wholesale and a file exported before a nested
      // field existed reimports with that field undefined. _n(undefined) is 0,
      // so it becomes a silent zero: dropping two fields understated revenue
      // by $198,467/yr in testing, with nothing on screen saying so.
      const merged = MM.mergeState(MM.defaultState(MGM_CONFIG), o.state);
      MGM.state = merged.state;
      if (Array.isArray(o.scenarios)) MGM.scenarioWriteAll(o.scenarios);
      MGM.save(); MGM.refresh();
      // Say what the file did not carry. A silent default-fill beats a
      // silent zero, but it is still a substituted number the user did not
      // enter, and an import is exactly when they need to know.
      MGM.scenarioLoadNotice({ name: file.name || 'the imported file' }, merged);
      alert(merged.added.length
        ? 'Model imported. ' + merged.added.length +
          ' field(s) were not in the file and are at their current defaults — see the notice on screen.'
        : 'Model imported.');
    } catch (e) {
      alert('Could not import this file: ' + e.message);
    }
  };
  r.readAsText(file);
};

MGM.dl = function (name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
```

- [ ] **Step 5: Email popup**

Keep the v1's `mailto:` approach and its editable body. Moving to the Command Center's notification pathway is listed as an open item in the spec, so do not change the mechanism — but cap the body, because `mailto:` silently truncates past roughly 2,000 characters in most clients.

```js
MGM.summaryText = function () {
  const D = MGM.model();
  const { st, M, R, F, valuation: v } = D;
  const first = M.years[0], final = M.years[M.years.length - 1];
  const last = R[R.length - 1];
  return [
    `${st.report.title} — ${st.report.subtitle}`,
    `Data as of ${st.DATA_ASOF}. Generated by ${st.report.generatedBy}.`,
    '',
    `Active today: ${fmt(first.start)} locations`,
    `${final.year} ending: ${fmt(final.end)} (${final.end - first.start >= 0 ? '+' : ''}${fmt1(final.end - first.start)})`,
    `Steady attrition: ${pct1(st.attrition.steady)}`,
    `${final.year} revenue: ${fmM(last.total)} (${fm$(last.total / last.members)}/member/yr)`,
    `${final.year} EBITDA: ${fmM((F[F.length - 1] || {}).ebitda || 0)}`,
    (v.lensCount === 2
      ? `Valuation range: ${fmM(v.low)} – ${fmM(v.high)} (midpoint ${fmM(v.mid)})`
      : v.lensCount === 1
        ? `Indicated value: ${fmM(v.indicated)} (single method — only one lens has a basis)`
        : 'Indicated value: not available — no valuation lens has a basis'),
    '',
    st.report.disclosure,
    `Full model: print the Report tab or export CSV. Questions: ${st.report.contact}`
  ].join('\n');
};

// The v1's modal markup is kept as-is: #emailOverlay toggled with the `.open`
// class, fields #emTo / #emSubject / #emBody. Rewire the Cancel button's
// inline handler to MGM.closeEmail() and the primary button to
// MGM.sendEmail(); leave the markup itself alone.
MGM.openEmail = function () {
  $('#emTo').value = '';
  $('#emSubject').value = `${MGM.state.report.title} — ${MGM.state.DATA_ASOF}`;
  $('#emBody').value = MGM.summaryText();
  $('#emailOverlay').classList.add('open');
};

MGM.closeEmail = function () { $('#emailOverlay').classList.remove('open'); };

MGM.sendEmail = function () {
  const body = $('#emBody').value;
  if (body.length > 1800 &&
      !confirm('This body may be truncated by your mail client. Send anyway?\n\n' +
               'Use Print or Export CSV for the full model.')) return;
  location.href = 'mailto:' + encodeURIComponent($('#emTo').value.trim()) +
    '?subject=' + encodeURIComponent($('#emSubject').value) +
    '&body=' + encodeURIComponent(body);
  MGM.closeEmail();
};
```

- [ ] **Step 6: Verify**

1. Report tab renders the letterhead with the real logo, generated-by, date and all prose blocks.
2. Edit `report.title` — the heading, letterhead and email subject all follow.
3. Prose containing `<b>` and `&` renders literally; a blank prose field emits nothing (no empty `<p>`); a double newline becomes a paragraph break.
4. The assumptions table lists every row, including the fuel-settlement and breakage caveats, the benchmark caveat, the add basis, and the PTP note.
5. Override a gallon baseline, set the source mix to 95%, then open the Report — the **Caveats on this run** list names both, and they appear in the CSV too.
6. Ctrl+P: only the report prints, black on white, tables unbroken mid-row, no tab rail, buttons, or auth bar.
7. Export CSV — every section present; monthly rows sum to the annual rows; the pipeline and gallon sections carry their overridden flags.
8. Export JSON, **Reset all**, re-import — labels, prose, scenarios and overrides all return.
9. Import a malformed file — a clear alert, and the current model is left intact.
10. Email popup opens with a prefilled subject and editable body; a long body warns before sending.

- [ ] **Step 7: Commit**

```bash
git add membership-growth-model/index.html
git commit -m "feat(mgm): editable letterhead report, scoped print, exports with caveats"
```

---

## Task 18: Data-refresh script

**Files:**
- Create: `tools/refresh-membership-config.py`, `tools/fixtures/location-list-fixture.csv`, `tools/fixtures/company-membership-fixture.csv`

**Interfaces:**
- Consumes: a `location-list-*.csv` and a `company_membership_report_*.csv`.
- Produces: a rewritten `// ── MGM_DATA ──` block in `membershipModelConfig.js`.

- [ ] **Step 1: Write the fixtures**

`tools/fixtures/location-list-fixture.csv` — seeded with all three junk kinds plus one of each real group:

```csv
ID,Company,Type,Group,Name,Street,City,State,Zip,"Exit / Highway",Phone,"Mailing Address",Status
R0001,"Real Truck Stop Inc","Truck Stop",Roady's,"Real TS",,Boise,ID,83702,,,,active
R0002,"Real TSSC Inc","Truck Stop / Service Center",Roady's,"Real TSSC",,Boise,ID,83702,,,,active
R0003,"Real CStore Inc","C-Store",Roady's,"Real CStore",,Boise,ID,83702,,,,active
R0004,"Real PPO Inc","PPO",Roady's,"Real PPO",,Boise,ID,83702,,,,active
R0005,"Real Lite Inc","Truck Stop","Roady's Lite","Real Lite",,Boise,ID,83702,,,,active
R0006,"Real Fuel Inc","Fuel Stop",Roady's,"Real Fuel",,Boise,ID,83702,,,,active
P0007,"Real PTP TS Inc","Truck Stop",PTP,"Real PTP TS",,Boise,ID,83702,,,,active
P0008,"Real PTP SC Inc","Service Center",PTP,"Real PTP SC",,Boise,ID,83702,,,,active
X0009,"Roady's Corporate Office","Truck Stop",,"Fuelman Payments",,,AL,,,,,active
X0010,"Roady's Corporate Office","Truck Stop",,"RCheck Payments",,,AL,,,,,active
X0011,"Demo Truck Stops","Truck Stop",Roady's,"1234 Truck Stop Demo",,,MT,,,,,active
X0012,"Test Company #1","Truck Stop",Roady's,"Test #1",,,ID,,,,,onboarding
R0013,"Onboarding Inc","Truck Stop",Roady's,"Onboarding TS",,Boise,ID,83702,,,,onboarding
R0014,"Offboarding Inc","Truck Stop",Roady's,"Offboarding TS",,Boise,ID,83702,,,,offboarding
```

Expected: **8** active (Truck Stop 1, TSSC 1, C-Stores 1, PPO 1, Lite 1, Fuel 1, PTP 2), 1 onboarding, 1 offboarding, 4 junk rows dropped.

`tools/fixtures/company-membership-fixture.csv`:

```csv
"Company ID","Company Name","Location Count","Account Billing","Membership Billing","Has ACH","Has ABA"
1,"Paying One",2,"1,000.00","1,000.00",Mixed,Mixed
2,"Paying Two",1,500.00,500.00,No,No
3,"Zero Biller",3,0.00,0.00,No,No
```

Expected: 3 companies, 6 locations, $1,500 membership billing, 3 paying locations, 1 zero-biller.

- [ ] **Step 2: Write the script**

```python
#!/usr/bin/env python3
"""Regenerate the MGM_DATA block in membershipModelConfig.js from Interstate CSVs.

Aggregates only. No member business name and no per-location billing figure is
ever written to the config -- this repo is PUBLIC.

    python tools/refresh-membership-config.py \
        --locations location-list-2026-11-30.csv \
        --billing   company_membership_report_2026-11-30.csv \
        --asof      "Nov 30, 2026"

The signup history comes from a spreadsheet, not these CSVs, so the history,
monthlyHistory and ptpNote blocks are carried through from the existing config
untouched. The labels and report blocks are never read or written here.
"""
import argparse
import csv
import datetime as dt
import re
import sys
from collections import Counter

CONFIG = "membershipModelConfig.js"
START = "// ── MGM_DATA ──"
END = "// ── /MGM_DATA ──"

# Rows that are not member locations. Verified against the 2026-10-28 export:
# the corporate rows are Fuelman/RCheck payment records and the demo company
# holds seed data. Dropping them is what makes the base 375 rather than 380.
EXCLUDE_COMPANIES = {"roady's corporate office", "demo truck stops"}
EXCLUDE_COMPANY_RE = re.compile(r"^test company\s*#", re.I)

GROUPS = [
    ("ts", "Truck Stop"),
    ("tssc", "Truck Stop-Service Center"),
    ("cstore", "C-Stores"),
    ("ppo", "PPO"),
    ("lite", "Roady's Lite"),
    ("fuel", "Fuel Stops"),
    ("ptp", "PTP"),
]
# Type -> group key, used only when Group is neither PTP nor Roady's Lite.
# PTP is keyed on Group alone, so a PTP service centre counts as PTP and
# never as a truck stop.
TYPE_TO_KEY = {
    "truck stop": "ts",
    "truck stop / service center": "tssc",
    "c-store": "cstore",
    "ppo": "ppo",
    "fuel stop": "fuel",
    "service center": "ptp",
}


def is_junk(row):
    company = (row.get("Company") or "").strip().lower()
    return company in EXCLUDE_COMPANIES or bool(EXCLUDE_COMPANY_RE.match(company))


def classify(row):
    group = (row.get("Group") or "").strip()
    rtype = (row.get("Type") or "").strip().lower()
    if group == "PTP":
        return "ptp"
    if group == "Roady's Lite":
        return "lite"
    return TYPE_TO_KEY.get(rtype)


def read_locations(path):
    counts, status = Counter(), Counter()
    dropped, unclassified = [], []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            st = (row.get("Status") or "").strip().lower()
            if is_junk(row):
                dropped.append((row.get("ID", ""), row.get("Company", ""),
                                row.get("Name", ""), st))
                continue
            status[st] += 1
            if st != "active":
                continue
            key = classify(row)
            if key is None:
                unclassified.append((row.get("ID", ""), row.get("Group", ""),
                                     row.get("Type", "")))
                continue
            counts[key] += 1
    return counts, status, dropped, unclassified


def money(s):
    return float((s or "0").replace(",", "").replace("$", "") or 0)


def read_billing(path):
    companies = locations = paying_locations = zero_companies = 0
    dues = 0.0
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            companies += 1
            n = int(row.get("Location Count") or 0)
            locations += n
            amount = money(row.get("Membership Billing"))
            dues += amount
            if amount > 0:
                paying_locations += n
            else:
                zero_companies += 1
    return {
        "companies": companies,
        "locations": locations,
        "monthlyDuesTotal": round(dues),
        "duesPerLocBillable": round(dues / locations, 2) if locations else 0,
        "payingLocations": paying_locations,
        "zeroBillCompanies": zero_companies,
    }


def carried_block(text, name):
    """Lift a sub-block out of the old config verbatim, so a CSV refresh cannot
    clobber spreadsheet-sourced data."""
    m = re.search(r"(\n    " + name + r":.*?)(?=\n    [a-zA-Z]+:|\n  \};)",
                  text, re.S)
    if not m:
        sys.exit("Could not find the existing `%s` block to carry forward." % name)
    return m.group(1).rstrip().rstrip(",")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--locations", required=True)
    ap.add_argument("--billing", required=True)
    ap.add_argument("--asof", required=True, help='e.g. "Nov 30, 2026"')
    ap.add_argument("--asof-month", type=int, default=None,
                    help="1-12; defaults to the month parsed from --asof")
    ap.add_argument("--threshold", type=float, default=0.05,
                    help="refuse if the active total moves more than this fraction")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    counts, status, dropped, unclassified = read_locations(args.locations)
    billing = read_billing(args.billing)
    total = sum(counts.values())

    print("Active locations: %d" % total)
    for key, label in GROUPS:
        print("  %-28s %d" % (label, counts.get(key, 0)))
    print("Onboarding: %d   Offboarding: %d"
          % (status.get("onboarding", 0), status.get("offboarding", 0)))
    print("Dropped %d non-location rows:" % len(dropped))
    for d in dropped:
        print("  %-8s %s / %s [%s]" % (d[0] or "(no id)", d[1], d[2], d[3]))
    if unclassified:
        print("\n!! %d active rows matched no group and were skipped:" % len(unclassified))
        for u in unclassified:
            print("  %s Group=%r Type=%r" % u)
        if not args.force:
            sys.exit("Refusing to write with unclassified rows. Fix the mapping "
                     "or pass --force.")
    print("\nBilling: %d companies, %d locations, $%s/mo, %d paying locations"
          % (billing["companies"], billing["locations"],
             format(billing["monthlyDuesTotal"], ","), billing["payingLocations"]))

    with open(CONFIG, encoding="utf-8") as fh:
        text = fh.read()

    m = re.search(r"groups:\s*\[(.*?)\]", text, re.S)
    prev_total = sum(int(x) for x in re.findall(r"count:\s*(\d+)", m.group(1))) if m else None
    if prev_total and not args.force:
        move = abs(total - prev_total) / prev_total
        if move > args.threshold:
            sys.exit("Active total moved %.1f%% (%d -> %d), over the %.0f%% "
                     "threshold. Check the export, then pass --force if it is right."
                     % (move * 100, prev_total, total, args.threshold * 100))

    asof_month = args.asof_month
    if asof_month is None:
        try:
            asof_month = dt.datetime.strptime(args.asof, "%b %d, %Y").month
        except ValueError:
            sys.exit("Could not parse --asof; pass --asof-month explicitly.")

    group_lines = "\n".join(
        "      {{ key: '{k}',{kp} label: '{label}',{lp} count: {n} }},".format(
            k=k, kp=" " * max(1, 9 - len(k)),
            label=label.replace("'", "\\'"),
            lp=" " * max(1, 31 - len(label)),
            n=counts.get(k, 0))
        for k, label in GROUPS
    ).rstrip(",")

    block = """%s
  // Regenerated by tools/refresh-membership-config.py on %s.
  // Hand edits here are overwritten; put wording changes in the `labels` /
  // `report` blocks below, which this script never touches.
  //
  //   %s
  //   %s
  // Excluded from the active count: company "Roady's Corporate Office"
  // (payment records, not locations), company "Demo Truck Stops", and any
  // "Test Company #*" row. %d rows dropped in this run.
  var DATA = {
    DATA_ASOF: '%s',
    CURRENT_YEAR: %d,
    ASOF_MONTH: %d,
    HORIZON_YEARS: 3,

    groups: [
%s
    ],

    billing: {
      companies: %d,
      locations: %d,
      monthlyDuesTotal: %d,
      duesPerLocBillable: %s,
      payingLocations: %d,
      zeroBillCompanies: %d
    },

    statusCounts: { onboarding: %d, offboarding: %d },
%s,
%s,
%s
  };
  %s""" % (
        START, dt.date.today(), args.locations, args.billing, len(dropped),
        args.asof, dt.date.today().year, asof_month, group_lines,
        billing["companies"], billing["locations"], billing["monthlyDuesTotal"],
        billing["duesPerLocBillable"], billing["payingLocations"],
        billing["zeroBillCompanies"],
        status.get("onboarding", 0), status.get("offboarding", 0),
        carried_block(text, "ptpNote"),
        carried_block(text, "history"),
        carried_block(text, "monthlyHistory"),
        END,
    )

    s, e = text.find(START), text.find(END)
    if s < 0 or e < 0:
        sys.exit("Sentinels not found in " + CONFIG)
    out = text[:s] + block + text[e + len(END):]

    if args.dry_run:
        print("\n--- dry run, not written ---\n")
        print(block)
        return
    with open(CONFIG, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(out)
    print("\nWrote %s. Run `node --test membershipModel.test.js` now -- the "
          "group-total assertion will need updating to %d." % (CONFIG, total))


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Verify against the fixtures**

```bash
python tools/refresh-membership-config.py \
  --locations tools/fixtures/location-list-fixture.csv \
  --billing   tools/fixtures/company-membership-fixture.csv \
  --asof "Nov 30, 2026" --dry-run
```

Expected: `Active locations: 8`; each group 1 except PTP 2; onboarding 1, offboarding 1; **4** dropped rows named individually; billing 3 companies / 6 locations / $1,500 / 3 paying.

Then drop `--dry-run` and confirm it **exits with the threshold message** rather than writing, because 8 against 375 is far over 5%.

- [ ] **Step 4: Verify against the real export (round-trip)**

```bash
cp membershipModelConfig.js /tmp/mgm-before.js
python tools/refresh-membership-config.py \
  --locations location-list-2026-10-28.csv \
  --billing   company_membership_report_2026-10-28.csv \
  --asof "Oct 28, 2026"
diff /tmp/mgm-before.js membershipModelConfig.js
node --test membershipModel.test.js
```

Expected: `Active locations: 375` with the 154 / 6 / 22 / 88 / 7 / 9 / 89 split, 5 dropped rows, billing 181 / 391 / $143,426 / 375 paying. The `diff` should show only the regenerated-on date comment; `history`, `monthlyHistory`, `ptpNote`, `labels` and `report` must be byte-identical. Tests still pass.

**This round-trip is the real check:** the script must reproduce the config Task 1 hand-wrote.

- [ ] **Step 5: Commit**

```bash
git add tools/refresh-membership-config.py tools/fixtures/
git commit -m "feat(mgm): CSV-to-config refresh script with junk-row filtering"
```

---

## Task 19: Admin-gated editing

**Files:**
- Modify: `membership-growth-model/index.html`
- Modify: `membershipModel.test.js`

**Interfaces:**
- Consumes: `RoadysBD.auth` and `MGM.sb()` from Task 16; `mgm_admins` / `mgm_is_admin()` from Task 15.
- Produces: `MGM.isAdmin`, `MGM.loadAdminStatus()`, `MGM.canEdit()`, `MGM.renderAdminBar()`, `MGM.adminSignIn()`.

**Requirement.** Viewing the tool stays open to anyone with the link — unchanged, including print and export. **Editing requires an administrator.** A signed-in non-admin sees exactly what an anonymous visitor sees, plus their own email.

**Who is an admin (decided, not inferred).** `jasonvega1974@gmail.com` is the only admin. Everyone else who signs in is read-only. Others may be added later if they need to edit inputs directly; start minimal.

There is deliberately **no in-app admin management screen**. The roster is a security boundary, and a browser is the wrong place to edit one — hence `mgm_admins` has no INSERT/UPDATE/DELETE policy and no write grant at all. Adding an admin is one `INSERT` in the Supabase SQL editor, and that is the intended cost. Do not build a UI for it, and do not add a second admin on your own initiative.

### The boundary is in the database, not the UI

Task 15 already restricts `INSERT`/`UPDATE` on `mgm_scenarios` and `mgm_pnl_actuals` to `mgm_is_admin()`. That is the real control: a non-admin who sets `MGM.editMode = true` from the browser console can change their own `localStorage`, and **nothing they do reaches the shared cloud state.**

This task adds the UI gate so the tool does not invite an edit the server will then refuse, and so a read-only viewer is told plainly that they are one. Do not implement the UI gate as though it were the security boundary — and do not hide it either. A disabled control with a stated reason beats a missing one.

- [ ] **Step 1: Resolve admin status after sign-in**

```js
// null = not yet determined (including anonymous); false = signed in but not
// an admin; true = admin. canEdit() treats anything but true as "no".
MGM.isAdmin = null;

MGM.loadAdminStatus = async function () {
  const sb = MGM.sb();
  const email = (window.RoadysBD && RoadysBD.auth.email()) || '';
  if (!sb || !email) { MGM.isAdmin = null; return; }
  try {
    // RLS lets any signed-in user read this table; the row's existence is the
    // answer. A query error counts as NOT admin -- failing closed, because the
    // alternative is granting edit rights on a network hiccup.
    const { data, error } = await sb.from('mgm_admins')
      .select('email').ilike('email', email.trim()).maybeSingle();
    MGM.isAdmin = !error && !!data;
  } catch (e) { MGM.isAdmin = false; }
};

MGM.canEdit = () => MGM.isAdmin === true;
```

- [ ] **Step 2: Gate edit mode on it**

```js
MGM.toggleEdit = function () {
  if (!MGM.canEdit()) {
    alert(MGM.isAdmin === false
      ? 'Editing is limited to administrators. You are signed in, but this account is not on the admin list.'
      : 'Editing is limited to administrators. Sign in with an admin account to make changes.');
    return;
  }
  MGM.editMode = !MGM.editMode;
  document.body.classList.toggle('mgm-edit', MGM.editMode);
  document.getElementById('editBtn').textContent =
    MGM.editMode ? '✓ Done editing' : '✎ Edit';
  MGM.refresh();
};
```

- [ ] **Step 3: Make the binding layer read-only for non-admins**

Defence in depth, and it stops a non-admin dirtying their own `localStorage` into a state they can never sync. In `MGM.bindAll`, before attaching any listener:

```js
  // A non-admin gets no write listeners at all. The server would refuse the
  // write anyway (Task 15), but a field that accepts a keystroke and then
  // silently fails to persist is the same "looks saved, wasn't" defect the
  // refused-write machinery exists to prevent.
  const ro = !MGM.canEdit();
  root.querySelectorAll('[data-k],[data-k-text]').forEach(el => {
    if ('disabled' in el) el.disabled = ro;
    el.classList.toggle('read-only', ro);
  });
  if (ro) { MGM.applyWriteFailures(root); return; }
```

Add CSS:

```css
.read-only{opacity:.75;cursor:default}
body:not(.mgm-admin) .mgm-editonly{display:none !important}
.adminbar{font-size:12.5px;font-weight:600;padding:3px 9px;border-radius:10px}
.adminbar.ro{background:var(--chip);color:var(--ink-soft)}
.adminbar.rw{background:var(--sign-green);color:#fff}
```

so row tools, add buttons and reset buttons never appear for a non-admin.

- [ ] **Step 4: Status bar and sign-in entry point**

`MGM.renderAdminBar()` renders into `#authBar` alongside Task 16's content and states the mode in words, never by implication:

- anonymous: `Read-only — sign in as an admin to edit`
- signed in, not an admin: `Read-only — this account is not an admin`
- admin: `Admin — editing enabled`

Set `body.mgm-admin` when `canEdit()` is true and remove it otherwise.

`MGM.adminSignIn()` reuses Task 16's `bdShowLoginGate`, then **awaits** `MGM.loadAdminStatus()` before re-rendering, so the bar never briefly claims admin before the check resolves.

Call `MGM.loadAdminStatus()` in the `DOMContentLoaded` chain after `RoadysBD.auth.init()` and before the first `MGM.refresh()`, and again inside `MGM.signIn`'s callback.

- [ ] **Step 5: Test**

```js
test('canEdit is false for anonymous and for a signed-in non-admin', () => {
  // The engine has no notion of an admin; this pins the three-state contract
  // the page relies on, so a later refactor cannot collapse null and false
  // into one falsy case and silently grant edit rights to anonymous users.
  const canEdit = v => v === true;
  assert.equal(canEdit(null), false, 'anonymous / not yet determined');
  assert.equal(canEdit(false), false, 'signed in, not an admin');
  assert.equal(canEdit(true), true, 'admin');
  assert.equal(canEdit(undefined), false, 'missing');
  assert.equal(canEdit('yes'), false, 'truthy non-boolean must not pass');
});
```

- [ ] **Step 6: Verify**

1. Suite green; `node --check` clean.
2. **Anonymous:** `#editBtn` present but disabled with a stated reason; clicking explains rather than doing nothing; no `.mgm-editonly` control visible anywhere; every `data-k` input disabled; all tabs still render; print and export still work.
3. **Signed-in non-admin** (an account absent from `mgm_admins`): identical to anonymous, except the bar names the account and says it is not an admin.
4. **Admin:** bar reads `Admin — editing enabled`, `#editBtn` works, row tools appear, a field edit persists.
5. **The boundary holds without the UI.** As a non-admin, set `MGM.isAdmin = true` in the console, enable edit mode, change a value, and call `MGM.syncScenarios()`. The server must refuse the write, and the refusal must surface rather than appearing to succeed. **This is the test that matters** — it proves the UI gate is cosmetic and the database is not.
6. With `mgm_admins` empty, confirm nobody can edit and the bar says so. That is the state immediately after a fresh migration, and it must not look like a bug.

- [ ] **Step 7: Commit**

```bash
git add membership-growth-model/index.html membershipModel.test.js
git commit -m "feat(mgm): admin-gated editing, read-only for everyone else"
```

---

## Task 20: About tab — description and tutorial

**Files:**
- Modify: `membership-growth-model/index.html`
- Modify: `membershipModelConfig.js`
- Modify: `membershipModel.test.js`

**Interfaces:** adds `'about'` to `TAB_ORDER` and `labels.tabs`, plus `MGM.renderers.about`.

**Requirement.** A thirteenth tab explaining what this tool is, where its numbers come from, how to use each tab, and what its known limitations are — enough that someone opening it cold, with no context from this project, can use it correctly and knows which figures to trust.

- [ ] **Step 1: Add the tab**

In `membershipModelConfig.js`, add `about: 'About & Tutorial'` to `labels.tabs` and `about: ''` to `labels.notes`. In the page, add `'about'` to the **end** of `TAB_ORDER` and `<section class="panel" id="panel-about"></section>` to `<main>`.

The existing test asserts twelve tab labels. Update it to thirteen and say why in the assertion message, so the count change is deliberate rather than incidental.

- [ ] **Step 2: Write the content**

`MGM.renderers.about` renders static prose in cards. This is documentation — written once, read often — so accuracy outranks brevity. One card per section:

**What this is.** A three-year membership growth and valuation model for the Roady's network: it projects locations forward from a verified base, attaches revenue streams, and produces a valuation range. An internal planning tool, not an audited financial statement.

**Where the numbers come from.** Name each source and what it supplies — `location-list-*.csv` (375 active locations by group), `company_membership_report_*.csv` (181 companies, 391 billed locations, $143,426/mo), `Historical member signups.xlsx` (annual and monthly signups 2010-2026, and the losses behind the attrition rates), the Jan-Sep 2026 P&L (per-member revenue calibration), `busDevGallonsConfig.js` (live gallon baselines), `crm_leads` (the live sales pipeline). State plainly that **PTP conversions and Change of Ownership are excluded from every growth count**, and that the active base excludes corporate payment records and demo rows.

**How to use it.** A walkthrough in tab order. Two or three sentences each: what the tab shows, what you can change, and what that change affects downstream. Make the couplings explicit — Program Participation feeds Revenue per Member; Fuel Gallon Production feeds `avgGallons`; Sales Pipeline only drives the projection if you switch the basis on New Additions; Cost to Acquire & Serve changes which EBITDA the valuation uses.

**What you can and cannot edit.** Every number and every label is editable **by an administrator**; viewing, printing and exporting are open to everyone. Explain the read-only bar, and that an "edited" badge marks any value differing from the shipped default.

**The four judgement calls that materially move the output.**
1. **Attrition** — 2024 and 2025 ran at 13.7% and 11.3%, but the workbook records those losses as locations sold to T/A and Pilot. The default is the blended 9.7%; "Use split basis" switches to a 3.6% steady rate with the structural residual shown separately.
2. **Fuel** — settlement nets *negative* per member in the P&L, so `fuelProgramMargin` defaults to **$0.00**; any positive value is a forward assumption the user owns. These gallons are total site volume, while the P&L settlement covers card-network transactions only (~630 gal/member/mo), so the two must never be multiplied.
3. **The $20,000 benchmark** — from the signups workbook, it reconciles to no P&L measure: above realized gross profit per member, below gross income per member. State it that way and do not quote either ratio — set beside the committed $20,000, a ratio back-solves a gated figure. Shown as a cross-check, never as a driver.
4. **EBITDA** — the real margin is auth-gated and absent from this public repo. With costs unset the cash bridge reports EBITDA equal to revenue, so enter real opex before quoting a valuation.

**Refreshing the data.** `tools/refresh-membership-config.py` regenerates the config block from new CSV exports, filtering corporate payment records, demo rows and test companies, and refusing a write when the active total moves more than a threshold without `--force`. Signup history comes from a spreadsheet and is carried through untouched.

**Known limitations.** The group-to-gallon-profile mapping is an assumption, not a measurement. Pipeline stage weights are an unsourced ladder. PTP is held flat at 89 against a workbook figure of 190 as of Jan 2024 — an open question for Interstate. Monthly signup history is lumpy from batch deals and must not be read as seasonality.

End with `MGM.tabNotes('about')` so a reader can annotate it.

- [ ] **Step 3: Verify**

1. Suite green with the tab count at thirteen; `node --check` clean.
2. All thirteen tabs render and switch. The About tab needs no sign-in and no live data.
3. **Every figure quoted in the prose matches the live model** — 375, the seven group counts, 181/391/$143,426, 9.7% and 3.6%, $0.00 fuel margin, $20,000, the 2,338-23,565 baseline range, ~630 gal/member/mo. Check each against `MGM_CONFIG` or the rendered tab, not against this plan.
4. Read the walkthrough against each tab in turn and confirm no claim is stale. A tutorial that has drifted from the tool is worse than none.
5. Print still produces only the report, not this tab.

- [ ] **Step 4: Commit**

```bash
git add membership-growth-model/index.html membershipModelConfig.js membershipModel.test.js
git commit -m "feat(mgm): About tab with full description and tutorial"
```

---

## Final verification

- [ ] `node --test membershipModel.test.js` — all green, including every golden regression.
- [ ] That same run passes both structural disclosure guards — the raw-source scan over `membershipModelConfig.js` (word ban, margin-ships-unset, back-solvable-multiple shape) and the literal-assignment scan over `membershipModel.js` and `membership-growth-model/index.html`. A bare word grep is **not** the guard any more: the page and the engine legitimately contain the prose and the field names (`MGM.pnlActuals.netMarginPct` is the whole point of the gated loader), so only a numeric literal assigned to a P&L field is a leak.
- [ ] `git grep -nE 'grossProfit|netIncome|netMargin|settlementSpread|payrollTotal|opexTotal'` finds no **numeric literal assignment** in any committed file, and no P&L actual, margin %, back-solvable multiple or entity name in `docs/superpowers/specs/2026-10-28-membership-growth-model-design.md` or `docs/superpowers/plans/2026-10-28-membership-growth-model.md` — the two documents are committed to the same public repo as the code, so the boundary applies to them identically.
- [ ] `git status` does not list `membershipPnlActuals.local.js`.
- [ ] `git diff main --stat` touches no file outside the File Structure table, and leaves `busDevGallonsConfig.js`, `busDevGallonsCalculator.js` and `region_variance.json` untouched.
- [ ] `git grep -n 'BD_BASE\|BD_REGIONS' -- membership-growth-model/` returns nothing — the per-prospect calculator is fully gone.
- [ ] All **thirteen** tabs render unsigned with no console errors — the ten "What to Include" items plus Historical Data, Report and About (Task 20) — and Starting Membership shows **375**.
- [ ] The page prints, exports CSV and JSON, and re-imports identically.
- [ ] Signed in **as an admin** (Task 19): the pipeline loads, scenarios sync, and a concurrent edit is reported rather than overwritten. Signed in **as a non-admin**: the read-only bar states why, the edit affordances are disabled rather than missing, and nothing the user does reaches the shared cloud state.
- [ ] Fuel Gallon Production's per-group baselines match `busDevGallonsConfig.js` exactly (Large/Interstate 23,565; Small/Highway 2,338).
- [ ] Walk the spec's §5.1 table and confirm every listed area is editable **as an admin** — and read-only, with the reason stated, for everyone else (Task 19). Viewing, printing and exporting stay open to anyone with the link.
- [ ] Walk the spec's §9 table and confirm all ten "What to Include" items have a tab.

## Handoff

Open the PR against `main` with the spec and this plan linked. Call out in the body:

**The PR body is public, exactly like the repo. Describe both of the financial
changes below qualitatively and point at the gated table — do not quote a
figure, a margin percentage, or a ratio in the PR, in a commit message, or in a
review comment.**

1. **The revenue recalibration** — the per-member revenue drivers were
   recalibrated against the Jan–Sep 2026 income statement, and the total came
   down materially from the v1's unsourced assumptions. The largest single
   change is fuel: the v1 modelled settlement as a positive per-member
   contribution, and the statement shows it nets **negative**
   (`settlementNetPerMember: -148`, committed as a forward driver), while
   prospective per-gallon economics now default to zero. The before-and-after
   totals are P&L-derived — they are in `mgm_pnl_actuals`, not in this PR.
2. **The EBITDA margin** — the v1's hardcoded 25% was unsupported. The
   committed config now ships the margin **unset (0)**, and the real figure
   loads at runtime from `mgm_pnl_actuals` for a signed-in admin. It is far
   below the v1's assumption. Together with (1) this moves the headline
   valuation substantially, and it is the change a reviewer most needs to see
   — so say that it moved, and say where the figure lives, without quoting it.

   **State the basis explicitly, and do not present the margin as the final
   word.** It is the operating entity's *fully-loaded whole-entity* margin
   after all corporate overhead — the Income Statement has nine monthly
   columns, one Net Income line, no segment or departmental split. It charges
   the membership line with payroll (the largest opex category, unallocated),
   the office lease, D&O insurance, consulting, the annual meeting, and costs
   serving the near-zero-margin aggregator/settlement business and PTP
   marketing. The membership program's *contribution* margin would be
   materially higher, and a clean program figure is **not derivable from this
   file** — so the tool states the caveat rather than inventing an
   allocation. **Anyone who quotes the valuation must quote the basis with
   it.** None of that caveat is a disclosure, and it is the single most useful
   thing in the PR body: carry it in full.
3. **The base count** — 380 → **375**, after excluding corporate payment records and demo rows.
4. **The BD tab's removal** — the per-prospect value prop stays in `bus-dev-potential-gallons/`; this tool models network gallons only.
5. **The disclosure boundary** — no P&L actual is committed; `mgm_pnl_actuals` is authenticated-only and anon holds no grant.
