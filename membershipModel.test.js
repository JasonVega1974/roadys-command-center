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
