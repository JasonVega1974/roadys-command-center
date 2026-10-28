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
  // would pass even if a formula were wrong.
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
  // NOT 5946 — that is the measured P&L gross-profit-per-member figure, and
  // the committed drivers fall $5 short of it by design:
  //   dues        +1  (362 rounded up from 361.95)
  //   vendor      -4  (110 rounded down from 110.48)
  //   rewards fee +1  (29 rounded up from 28.83)
  //   Rewards Points line  -3  (a real P&L line the model deliberately
  //                             does not carry as a driver)
  // Keeping the rounded drivers is an explicit decision; the gap is surfaced
  // on the reconciliation tile rather than hidden by un-rounding.
  near(rpm.derived.total, 5941, 'derived $/member/yr');
  assert.equal(rpm.actual, null, 'unsigned: no actual');
  assert.equal(rpm.benchmark, 20000);
  near(rpm.varianceVsBenchmark, 5941 - 20000, 'benchmark variance');
});

test('revPerMember reports the real -$5 variance against the P&L actual', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st),
    { totalPerMemberYr: 5946 });
  // The whole point of this function is to expose the gap, so assert the
  // real one rather than contriving an equal value that only tests subtraction.
  near(rpm.varianceVsActual, -5, 'drivers are $5/member/yr below the P&L actual');
});

test('dues realization is reported from the billable vs realized rates', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st), null);
  near(rpm.duesRealization, 100 * 362 / 366.82, 'realization %');
});

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
  // This assertion comes FIRST deliberately. It is the one that fires on the
  // double-count regression, and its message explains why the number is wrong
  // rather than only that it differs. 650000 is spelled out rather than
  // computed so the figure a double-count produces is visible in the source.
  assert.notEqual(viaOverride.ebitdaBase, 650000,
    'the add-back must not be applied twice — that would inflate the valuation by norm x multiple');
  near(viaOverride.ebitdaBase, 400000, 'override used verbatim');
  near(viaOverride.ebitda, 400000 * st.valuation.ebitdaMultiple,
    'multiplied through exactly once');
});

test('low and high track which lens is actually lower, in both orderings', () => {
  // The first draft of this test asserted `mid === (rev + ebitda) / 2` using
  // the output's own fields — the same expression the implementation uses —
  // and `low <= mid <= high`, which is a mathematical identity for the
  // min/mean/max of two numbers. Neither assertion could fail. This version
  // pins independently-computed values AND flips which lens is larger, so a
  // min/max swap in the implementation is caught.
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
  // compounded at all is an open modelling question. This records the answer
  // the engine currently gives, so changing it cannot pass unnoticed.
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
    // than reading P[i].members back from the output. The first draft compared
    // participants against the function's own member count, so a wrong basis --
    // r.end instead of the year average, or the wrong year's row -- cancelled
    // on both sides and passed.
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
  // out on both sides of the comparison. The first draft of this test read
  // f.costToServe / f.acquisition back from the output and compared them to
  // themselves, which could not catch a self-consistent error:
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
  // restates valuation's override branch verbatim and cannot fail. This version
  // makes the claim in the test's NAME falsifiable: the two lenses must
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
  // real opex (~$2.21M annualised, giving 0.9%) would it fall below. Which side
  // it lands on is a property of the INPUTS, not of the code -- an earlier
  // draft of this test asserted "below" and was simply wrong.
  assert.notEqual(viaComputed.ebitdaBase, viaMargin.ebitdaBase,
    'the two lenses must genuinely disagree, or the test name is unfalsifiable');
  assert.notEqual(viaComputed.mid, viaMargin.mid,
    'so the headline midpoint moves depending on which lens is live');
});

// ── Task 8: assumptions the binding layer rests on ─────────────────────────
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
