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

test('the EBITDA margin is gated out of the public config but keeps its caveat', () => {
  // The real margin is a P&L actual and is auth-gated (mgm_pnl_actuals,
  // signed-in only) — it must never be committed to this public repo. The
  // methodological caveat (fully-loaded entity, not program unit economics)
  // still has to ship in config so it reaches the UI and the printed report,
  // not just a PR description.
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

test('no P&L actual, margin %, or back-solvable multiple appears in the raw source file', () => {
  // This repo is PUBLIC (GitHub Pages). JSON.stringify(MGM_CONFIG) cannot see
  // comments, and a plain word-ban only stops the exact word — a contributor
  // can reword around it (that happened here: a banned-word test let the
  // disclosure survive as a sentence rewritten to dodge the list, and also
  // let `benchmark.caveat` say "3.4× realized gross profit per member" right
  // next to the committed `lostMemberValue: 20000`, which back-solves the
  // gated EBITDA-margin-adjacent figure as 20000 / 3.4 = $5,882). So this test
  // checks (a) the raw file bytes, not the serialized object, so comments are
  // in scope; (b) a word-ban, for the known terms; (c) the gated % itself,
  // including as prose; and (d) a STRUCTURAL rule against any "<number> x
  // <financial term>" pattern, in either order, anywhere in the file or in
  // any benchmark.* string — because the next leak will use a different
  // multiple and a different committed denominator, and only a shape-based
  // rule catches that without being updated every time.
  const fs = require('node:fs');
  const SRC = fs.readFileSync(require.resolve('./membershipModelConfig.js'), 'utf8');

  // (b) case-insensitive word bans
  const bannedTerms = ['payroll', 'opex', 'grossProfit', 'gross profit',
    'netIncome', 'net income', 'netMargin', 'net margin', 'settlementSpread', 'SKR3L'];
  bannedTerms.forEach(term => {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    assert.ok(!re.test(SRC), `"${term}" must not appear anywhere in the committed source file`);
  });

  // (c) the gated margin percentage, as a value and as prose
  assert.equal(MGM_CONFIG.valuation.ebitdaMargin, 0);
  assert.ok(!/\b0?\.9\s*%/.test(SRC),
    'the gated 0.9% EBITDA margin must not appear in the committed source file, even as prose');

  // (d) no back-solvable multiple: a number next to × / x / * is how
  // "3.4× realized gross profit per member" recovered a gated figure from a
  // committed lostMemberValue. Ban the token on any benchmark.* string...
  // The lookahead (not \b) is deliberate: a back-solvable multiple multiplies
  // a NAMED quantity ("3.4× realized earnings"), so a letter follows the
  // token. \b fails after × (U+00D7, not a word character) when a space
  // follows it, which is how every natural "3.4× realized..." is written —
  // using \b here let the whole rule silently degrade to ASCII x/X/* only.
  // benchmark.source's own legitimate "133 lost 2019–25 × $20,000 = $2.66M"
  // has × followed by $, not a letter, so the lookahead correctly spares it.
  const multiplierToken = /\d+(\.\d+)?\s*[×xX*]\s*(?=[A-Za-z])/;
  Object.entries(MGM_CONFIG.benchmark)
    .filter(([, v]) => typeof v === 'string')
    .forEach(([key, v]) => assert.ok(!multiplierToken.test(v),
      `benchmark.${key} must not contain a multiplier token ("${v}") — it can be combined with a committed denominator to back-solve a gated figure`));

  // ...and ban it near any financial term anywhere in the file, both orders.
  // TODO: the term list below omits earnings / EBITDA / contribution / revenue.
  // Deferred: the back-solve denominator lives in benchmark.*, which the
  // per-field ban above covers regardless of wording.
  const multiplierThenTerm = /\d+(\.\d+)?\s*[×xX*]\s*(?=[A-Za-z])[^\n]{0,40}(gross|profit|income|margin)/i;
  const termThenMultiplier = /(gross|profit|income|margin)[^\n]{0,40}\d+(\.\d+)?\s*[×xX*]\s*(?=[A-Za-z])/i;
  assert.ok(!multiplierThenTerm.test(SRC),
    'a multiplier token must not sit within 40 chars of gross/profit/income/margin (multiplier-first order) — that shape back-solves a gated figure from a committed denominator');
  assert.ok(!termThenMultiplier.test(SRC),
    'a multiplier token must not sit within 40 chars of gross/profit/income/margin (term-first order) — that shape back-solves a gated figure from a committed denominator');
});

test('labels cover all twelve tabs', () => {
  assert.equal(Object.keys(MGM_CONFIG.labels.tabs).length, 12);
});

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

test('a bad numeric field degrades to 0 rather than poisoning the model', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.groups[0].count = '';          // user cleared the input
  st.adds.perMonth = 'abc';         // nonsense typed in
  const M = MembershipModel.runModel(st);
  assert.ok(isFinite(M.startTotal), 'startTotal finite');
  M.years.forEach(y => assert.ok(isFinite(y.end), `${y.year} end finite`));
});

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
