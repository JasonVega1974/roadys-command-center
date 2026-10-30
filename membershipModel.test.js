'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MGM_CONFIG } = require('./membershipModelConfig.js');

test('group counts sum to the 398 verified active base', () => {
  // 397 -> 398 on 2026-10-30: PTP dissolved (it was never a real location
  // type, just a sales-channel tag) and its 88 locations redistributed into
  // the real groups they belong to -- see groups' comment in
  // membershipModelConfig.js. Net +1 from the prior 397 figure because the
  // investigation that sized the redistribution used a slightly newer
  // location-list snapshot for PTP specifically than the 397 total's own
  // source; see the same comment for the full reconciliation.
  assert.equal(MGM_CONFIG.groups.reduce((a, g) => a + g.count, 0), 398);
});

test('group split matches the verified location-list breakdown', () => {
  const byLabel = Object.fromEntries(MGM_CONFIG.groups.map(g => [g.label, g.count]));
  assert.deepEqual(byLabel, {
    'Truck Stop': 187, 'Truck Stop-Service Center': 5, 'C-Stores': 21,
    'PPO': 128, "Roady's Lite": 5, 'Fuel Stops': 29, 'Service Centers': 23
  });
});

test('source mix sums to 100', () => {
  assert.equal(MGM_CONFIG.sources.reduce((a, s) => a + s.pct, 0), 100);
});

test('billing aggregates match company_membership_report_2026-10-29.csv', () => {
  const b = MGM_CONFIG.billing;
  // Three of these four were confirmed against Interstate's own dashboard on
  // the same day, exactly: 173 companies, 411 billed locations, $142,305
  // monthly membership billing.
  assert.equal(b.companies, 173);
  assert.equal(b.locations, 411);
  assert.equal(b.monthlyDuesTotal, 142305);
  assert.equal(b.payingLocations, 395);
});

test('duesPerLocBillable divides by paying locations, not all locations', () => {
  // Shipped once as total/all-locations, which published a 98.7% dues
  // realization against a denominator that included the locations billing $0.
  // The honest figure divides by PAYING locations only. This pins the
  // denominator so the name and the arithmetic cannot drift apart again --
  // the Oct 29 refresh is 142305/395 = 360.27, not 142305/411 = 346.24.
  const b = MGM_CONFIG.billing;
  assert.equal(b.locations, 411);
  assert.equal(b.payingLocations, 395);
  assert.ok(b.payingLocations < b.locations, 'some locations bill nothing');
  assert.equal(b.duesPerLocBillable,
    Math.round((b.monthlyDuesTotal / b.payingLocations) * 100) / 100);
  assert.notEqual(b.duesPerLocBillable,
    Math.round((b.monthlyDuesTotal / b.locations) * 100) / 100);
});

test('the true-stop-only (excl. C-Stores) billing pair ships at zero exclusion for this vintage', () => {
  // "2026-10-30 EXCEPTION #2" in membershipModelConfig.js: these six fields
  // are shipped equal to their unexcluded counterparts (zero companies/
  // locations/dues excluded) because computing the real exclusion needs a
  // location-list CSV matching THIS billing snapshot's own vintage (Oct 29),
  // and only a Sept 21 pair is locally available -- mixing the two would
  // subtract a Sept 21 C-Store slice from an Oct 29 total, which is a real
  // number but not a real answer. This test is a deliberate tripwire: once a
  // real refresh runs with one matching CSV pair, these fields diverge from
  // their unexcluded counterparts and this assertion starts failing on
  // purpose -- update it to the new real figures at that point, not before.
  const b = MGM_CONFIG.billing;
  assert.equal(b.cstoreExcludedCompanies, 0);
  assert.equal(b.cstoreExcludedLocations, 0);
  assert.equal(b.cstoreExcludedDues, 0);
  assert.equal(b.duesPerLocBillableExclCStores, b.duesPerLocBillable);
  assert.equal(b.payingLocationsExclCStores, b.payingLocations);
  assert.equal(b.monthlyDuesTotalExclCStores, b.monthlyDuesTotal);
});

test('a zero prior count yields no rate, not Infinity', () => {
  // prev.count != null passes for 0, and 100 * lost / 0 is Infinity -- which
  // avg then averaged, so the Historical tab's three-year average and the
  // Member Losses 3-YR DERIVED tile both read "Infinity%" while
  // attritionSplit's decomposition read "NaN%". Every count is user-editable,
  // so clearing one is reachable from the UI.
  const h = [
    { year: 2023, newR: 10, lost: 5, count: 0 },     // zero prior count
    { year: 2024, newR: 10, lost: 5, count: 100 },
    { year: 2025, newR: 10, lost: 10, count: 100 }
  ];
  const d = MembershipModel.derivedAttrition(h);

  assert.equal(d.rows.length, 1, 'only 2025 is derivable; 2024 had a zero base');
  assert.equal(d.rows[0].year, 2025);
  assert.ok(Number.isFinite(d.avg), 'the average must be finite');
  assert.equal(d.avg, 10);

  // attritionSplit reads the same rows, so it is fixed by the same guard.
  const sp = MembershipModel.attritionSplit(h, 3.6);
  sp.rows.forEach(r => {
    assert.ok(Number.isFinite(r.totalRate), `${r.year} totalRate finite`);
    assert.ok(Number.isFinite(r.steadyLost), `${r.year} steadyLost finite`);
    assert.ok(Number.isFinite(r.structuralLost), `${r.year} structuralLost finite`);
  });

  // CONTROL: a zero count must not simply be dropped from the input -- the
  // guard is on the DENOMINATOR, so a zero count still serves as a numerator
  // year's own count when it is the later of the pair.
  const h2 = [
    { year: 2024, newR: 10, lost: 5, count: 200 },
    { year: 2025, newR: 10, lost: 20, count: 0 }
  ];
  const d2 = MembershipModel.derivedAttrition(h2);
  assert.equal(d2.rows.length, 1, '2025 is still derivable: its BASE is 200');
  assert.equal(d2.rows[0].rate, 10);
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

test('every group has at least one gallon split row, each a known baseline', () => {
  const known = new Set(MGM_CONFIG.gallons.baselines.map(b => b.profile + '|' + b.roadway));
  MGM_CONFIG.groups.forEach(g => {
    const rows = MGM_CONFIG.gallons.groupSplits[g.key];
    assert.ok(Array.isArray(rows) && rows.length > 0, `${g.key} needs at least one split row`);
    rows.forEach((r, i) => {
      assert.ok(known.has(r.profile + '|' + r.roadway),
        `${g.key}[${i}] (${r.profile} / ${r.roadway}) must match a row in gallons.baselines`);
      assert.ok(typeof r.locations === 'number' && r.locations >= 0,
        `${g.key}[${i}] needs a non-negative locations count`);
    });
  });
});

test('every group split sums to the group\'s own count', () => {
  // Soft on screen (an informational nudge, never a block -- see the
  // Production by group card), but the shipped defaults themselves should
  // never ship out of sync: the investigation that sized each split
  // specifically scaled or summed to its group's count.
  MGM_CONFIG.groups.forEach(g => {
    const rows = MGM_CONFIG.gallons.groupSplits[g.key];
    const sum = rows.reduce((a, r) => a + r.locations, 0);
    assert.equal(sum, g.count, `${g.key}'s split rows should sum to its own count`);
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

  // (c) the margin ships explicitly unset.
  //
  // There used to be a second assertion here: a regex banning the gated
  // percentage as prose. It was removed because it SPELLED THE FIGURE OUT in
  // order to ban it -- the pattern literal sat in this committed public file,
  // under a message naming it as the gated EBITDA margin, so anyone reading
  // the guard recovered exactly what the guard existed to protect. A test
  // cannot blocklist a secret by quoting it.
  //
  // What replaces it: this equality (the config must ship the placeholder, so
  // nobody can "helpfully" fill the real figure in), the word-ban in (b), the
  // structural rule in (d), and the discipline that a test FIXTURE must be an
  // obviously synthetic number too -- a fixture is as recoverable as a default.
  // See the 7.5 fixture in the ebitdaMargin test below, which is arbitrary on
  // purpose.
  assert.equal(MGM_CONFIG.valuation.ebitdaMargin, 0,
    'the committed config must ship the margin unset; the real figure is auth-gated');

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

test('no P&L identifier leaks into the engine or the page', () => {
  // The test above guards membershipModelConfig.js with a word-ban. That ban
  // cannot be pointed at the engine or the page, because both legitimately
  // contain the PROSE forms: the page's UI copy says "net margin" to the user,
  // and both carry comments explaining why the real figures are gated. Banning
  // the prose there would forbid the explanation along with the leak.
  //
  // So this guards the distinction that actually matters, which is not
  // identifier-vs-prose either. The page MUST name these fields to display
  // what it loaded -- `MGM.pnlActuals.netMarginPct` is the whole point of the
  // gated loader, and an earlier draft of this guard banned the mention and
  // failed instantly on legitimate code. A reference reads a value that
  // arrived at runtime; a LITERAL ASSIGNMENT bakes one into the repo. Only
  // the second is a leak, so only the second is banned.
  //
  // membershipModel.test.js is deliberately NOT scanned: it necessarily
  // contains the ban list itself, so scanning it would always fail on its own
  // source. Its compensating control is that it holds no data at all, only
  // fixtures, and a fixture must be an obviously synthetic number -- see the
  // 7.5 in the ebitdaMargin test.
  const fs = require('node:fs'), path = require('node:path');
  const files = {
    'membershipModel.js': require.resolve('./membershipModel.js'),
    'membership-growth-model/index.html':
      path.join(__dirname, 'membership-growth-model', 'index.html')
  };

  // Field names for P&L actuals, camelCase and snake_case. Matched only where
  // a NUMBER is assigned to them.
  const pnlFields = ['grossProfit', 'gross_profit', 'netIncome', 'net_income',
    'netMargin', 'net_margin', 'settlementSpread', 'settlement_spread',
    'payrollTotal', 'payroll_total', 'opexTotal', 'opex_total'];

  Object.entries(files).forEach(([label, abs]) => {
    assert.ok(fs.existsSync(abs), `${label} must exist for this guard to mean anything`);
    const src = fs.readFileSync(abs, 'utf8');

    pnlFields.forEach(field => {
      // Matches a figure written into the repo — `netMargin: 12.3`,
      // `netMargin = 12.3`, `netMarginPct: 12.3`. Does NOT match a reference
      // like `obj.netMarginPct` or a string `'netMarginPct'`, which the page
      // legitimately needs in order to display what the gated loader fetched.
      //
      // The 12.3 above is deliberately arbitrary. An earlier version of this
      // comment illustrated the pattern with the REAL gated figure — the third
      // time on this branch that a guard against committing a value committed
      // that value in order to describe itself. Never use the real number as
      // an example, not in a regex, not in a fixture, not in a comment.
      const assigned = new RegExp(field + '\\w*\\s*[:=]\\s*-?\\d', 'i');
      assert.ok(!assigned.test(src),
        `${label} assigns a numeric literal to "${field}" — a P&L actual must never be committed; it loads at runtime from the auth-gated table`);
    });

    // The legal entity whose statement this is: never named in the engine or
    // the page. Unlike the field names, there is no legitimate use for it in
    // either file.
    //
    // This test file necessarily names it in order to ban it, which is the
    // same self-reference problem that forced the removal of a regex spelling
    // out the gated percentage. It is kept here, and the two cases are NOT
    // equivalent: a percentage is a value that can be combined with committed
    // figures to recover more, whereas an entity name pairs with nothing and
    // reveals only itself. What made the entity name sensitive in the spec was
    // that the spec printed it ALONGSIDE its financials; here it stands alone.
    // Do not remove this as an oversight, and do not add the figures back on
    // the same reasoning.
    assert.ok(!/SKR3L/i.test(src),
      `${label} names the reporting entity — keep it out of committed files`);
  });

  // The page must not ship a nonzero margin baked in either: MGM.pnlActuals
  // is the only route a real figure may take, and it loads at runtime from the
  // auth-gated table. A literal assignment in the page source is a leak.
  const page = fs.readFileSync(files['membership-growth-model/index.html'], 'utf8');
  const bakedMargin = /ebitdaMargin\s*[:=]\s*(?!0\b)\d/;
  assert.ok(!bakedMargin.test(page),
    'the page must not assign a nonzero ebitdaMargin literal — the real figure is auth-gated and arrives at runtime');
});

test('SR-11: no committed file assigns an undeclared number to a P&L field', (t) => {
  // LAYER 1 of the SR-11 gate. Always runs; needs no secret.
  //
  // SR-11: a guard, test, assertion message, comment or example describing a
  // banned value must never contain that value anywhere in it. Three separate
  // occurrences of that shape happened in THIS file:
  //
  //   1. the config leak scan asserted a regex that spelled the gated
  //      percentage out in order to ban it
  //   2. the same figure stood as a test FIXTURE, on the reasoning that a
  //      fixture is not data -- it is as recoverable as a config default
  //   3. the replacement comment for (1) illustrated the banned pattern using
  //      that same real figure, written hours after removing (1) for exactly
  //      that reason
  //
  // So this scan deliberately includes THIS FILE. The earlier cross-file guard
  // exempted it on the grounds that it "holds no data at all, only fixtures",
  // which was false when written -- see SR-10. No file is exempt by category.
  //
  // Rather than ban numbers outright, every legitimate value is DECLARED.
  // Adding to the allow-list is then a deliberate, reviewable act, and the
  // reviewer's only question is: is this number obviously not the real one?
  const fs = require('node:fs'), path = require('node:path');
  const root = __dirname;

  const FILES = ['membershipModelConfig.js', 'membershipModel.js',
    'membershipModel.test.js', path.join('membership-growth-model', 'index.html')];

  // Field names that hold, or could hold, a figure off the income statement.
  // Both spellings for every term. A review found this list carried
  // `settlementSpread` and `settlement_spread` but not the SPACED form, while
  // carrying both for the other three -- and a comment of mine survived only
  // in that gap. That is the reword-around-the-list failure this very test
  // documents as having already happened once.
  const PNL_FIELDS = ['grossProfit', 'gross_profit', 'gross profit',
    'netIncome', 'net_income', 'net income',
    'netMargin', 'net_margin', 'net margin',
    'settlementSpread', 'settlement_spread', 'settlement spread',
    'payrollTotal', 'payroll_total', 'opexTotal', 'opex_total',
    'ebitdaMargin', 'marginPct', 'totalPerMemberYr'];

  // Declared non-secret values. Each one is here because a human looked at it
  // and could see it is not a real figure. Do not add a value you cannot say
  // that about.
  const DECLARED = new Map([
    [0,    'the shipped placeholder: "explicitly unset", asserted by its own test'],
    [25,   'LEGACY_STATE only -- the v1 tool’s own unsupported hardcoded margin, ' +
           'preserved verbatim so the golden regression tests reproduce v1 output'],
    [7.5,  'arbitrary test fixture for "a margin is set"'],
    [10,   'arbitrary test fixture'],
    [80,   'arbitrary test fixture, deliberately implausible'],
    [12.3, 'arbitrary illustration in the cross-file guard’s own comment'],
    [7000, 'arbitrary stand-in for a loaded per-member actual; the variance test ' +
           'pins the SIGN rather than a figure']
  ]);

  const pattern = new RegExp(
    '(' + PNL_FIELDS.join('|') + ')[A-Za-z0-9_]*\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)', 'gi');

  const offences = [];
  FILES.forEach(rel => {
    const abs = path.join(root, rel);
    assert.ok(fs.existsSync(abs), rel + ' must exist for this guard to mean anything');
    const src = fs.readFileSync(abs, 'utf8');
    src.split('\n').forEach((line, i) => {
      let m;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(line)) !== null) {
        const value = Number(m[2]);
        if (!DECLARED.has(value)) {
          offences.push(rel + ':' + (i + 1) + '  ' + m[1] + ' = ' + m[2]);
        }
      }
    });
  });

  // ── Second arm: the VARIABLE shape ──────────────────────────────────────
  //
  // The scan above matches a literal number. The live risk is not a literal:
  // the auth-gated margin is deliberately held outside MGM.state, in
  // session-only MGM.loadedMarginPct, and applied to a throwaway copy inside
  // MGM.runFor. That containment is a NEGATIVE property -- nothing reaches
  // MGM.state -- and negative properties rot. Two concrete edits would reopen
  // it silently, and neither assigns a literal:
  //
  //   MGM.state.valuation.ebitdaMargin = D.effectiveMargin;   // "simplify the captions"
  //   JSON.stringify(MGM.runFor(MGM.state))                   // export the model, not the state
  //
  // The first puts the gated figure in every saved scenario and every export;
  // mgm_scenarios is readable by any signed-in user while mgm_pnl_actuals is
  // admin-only, so that single line defeats the read policy. The second
  // serialises a runFor result, whose effectiveMargin and marginBasisDetail
  // carry the figure by design.
  //
  // So ban the SHAPE, not one spelling of it. Raised by the implementer who
  // built the containment: their comments were the only thing guarding it, and
  // a comment is not a test.
  const SHAPES = [
    { re: /MGM\.state[A-Za-z0-9_.\[\]'"]*\s*=\s*[^;\n]*(?:[Mm]argin|pnlActual)/,
      why: 'assigns something margin-named or P&L-sourced into MGM.state. The ' +
           'gated margin must stay in session-only MGM.loadedMarginPct and be ' +
           'applied to a COPY inside runFor; state is serialised into ' +
           'localStorage, into saved scenarios and into any export.' },
    { re: /JSON\.stringify\(\s*(?:MGM\.)?runFor\(|JSON\.stringify\([^)]*effectiveMargin/,
      why: 'serialises a runFor result. Export MGM.state, never a runFor ' +
           'result -- effectiveMargin and marginBasisDetail carry the gated ' +
           'figure deliberately.' }
  ];

  const shapeOffences = [];
  ['membershipModel.js', path.join('membership-growth-model', 'index.html')]
    .forEach(rel => {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//')) return;   // a comment describing the ban
        SHAPES.forEach(sh => {
          if (sh.re.test(line)) {
            shapeOffences.push(rel + ':' + (i + 1) + '  ' + sh.why);
          }
        });
      });
    });

  assert.deepEqual(shapeOffences, [],
    'a committed file reopens the gated-margin containment:\n  ' +
    shapeOffences.join('\n  '));

  assert.deepEqual(offences, [],
    'undeclared number assigned to a P&L field. Either it is a real figure -- in ' +
    'which case remove it, this repo is PUBLIC -- or it is a synthetic value, in ' +
    'which case add it to DECLARED with a note saying why it is obviously not real:\n  ' +
    offences.join('\n  '));
});

test('SR-11: no gated value from the local actuals appears in any committed file', (t) => {
  // LAYER 2. Runs only where the secret is available.
  //
  // Layer 1 cannot catch a BARE figure -- a percentage inside a regex, a number
  // in prose -- because no structural rule distinguishes it from any other
  // decimal. The only way to scan for it is to know it, and the only way to
  // know it without committing it is to read the gitignored source at runtime.
  // No gated value is ever written into this file, or into a failure message.
  //
  // The local file is read as TEXT and its numeric literals extracted, NOT
  // require()d. It is a browser <script> that assigns a global rather than a
  // CommonJS module, so require() returns {} -- which made an earlier version
  // of this test scan an empty set and report a confident pass. Reading the
  // bytes needs no module semantics and cannot regress that way.
  const fs = require('node:fs'), path = require('node:path');
  const root = __dirname;
  const LOCAL = path.join(root, 'membershipPnlActuals.local.js');

  if (!fs.existsSync(LOCAL)) {
    // SKIP VISIBLY. A check that silently passes when it could not run is the
    // same failure mode as the self-exemption behind SR-10 -- the output must
    // say "not performed", never "passed".
    t.skip('membershipPnlActuals.local.js is absent on this machine, so there is ' +
           'no gated value to scan for. This check did NOT run.');
    return;
  }

  const localSrc = fs.readFileSync(LOCAL, 'utf8');

  // Every numeric literal in the file, deduped. A value needs enough digits to
  // be distinctive: "12" would match a date, a month index and a step
  // attribute, where 1672075 or 1.27 would not.
  const digits = n => String(Math.abs(n)).replace(/[^0-9]/g, '').replace(/^0+/, '');
  const literals = src => new Set(
    (src.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(n => isFinite(n)));

  // The gated file also holds PUBLIC context -- the period year, the member
  // basis, counts that are committed by decision. Those are not secrets and
  // matching them produced a hit in all six files on the first run, including
  // the SQL migration and a Python script. The secret is precisely the set of
  // numbers in the gated file that are NOT already public, so subtract:
  //
  //   - every literal in membershipModelConfig.js, the committed data file
  //   - calendar years, which appear legitimately everywhere
  //
  // This cannot hide a secret that was already leaked INTO the config: that is
  // layer 1's job, plus the config-only word-ban and structural rules above.
  // "Already public" must mean ALREADY COMMITTED, read from git -- not from the
  // working copy. Reading the working copy made this guard self-defeating: a
  // secret pasted into the config became "public" by this very subtraction and
  // was excluded from the scan, so the one leak the layer exists to catch was
  // the one it disqualified. A control proved it: injecting a real gated value
  // into the config did not fail the suite. You cannot make a value public by
  // putting it in your own uncommitted tree.
  // "Already public" means PUBLIC BEFORE THIS CHANGE -- read from
  // origin/main, not from HEAD.
  //
  // Reading HEAD left a hole a review measured: a gated value planted in a NEW
  // config field failed pre-commit (correctly) and then, once committed, went
  // green with zero hits -- the coverage diagnostic even counted it as
  // already-public. Being in the committed config is what defines
  // already-public, so a value laundered itself by the very commit that
  // published it. Layer 1 could not catch it either, because its PNL_FIELDS
  // list matches field NAMES and an unrecognised name is never tested.
  //
  // Against origin/main, a literal introduced by the change under review is
  // scanned. Anything newly published therefore has to be either absent from
  // the gated file or explicitly allowlisted with a reason -- which is the
  // path the billing.companies collision already took.
  //
  // This is the third position for this read. The first was the working copy,
  // which let a secret become public by being pasted in. The second was HEAD,
  // which let it become public by being committed. Both share one shape: the
  // tree under review was treated as the authority on what the tree under
  // review is allowed to contain.
  let publicSrc = null, usedRef = null;
  for (const ref of ['origin/main:membershipModelConfig.js',
                     'main:membershipModelConfig.js',
                     'HEAD:membershipModelConfig.js']) {
    try {
      publicSrc = require('node:child_process')
        .execFileSync('git', ['show', ref],
                      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      usedRef = ref;
      break;
    } catch (e) { /* try the next ref */ }
  }

  // ASSERT, do not merely diagnose. The previous version reported the HEAD
  // fallback through t.diagnostic and left the suite GREEN -- and a review
  // measured that `git clone --single-branch --depth 1`, the default shape for
  // most CI, makes BOTH origin/main and main unreadable. So the hole closed
  // last round was open in exactly the place this check is supposed to be the
  // authority, reading 110/0 with a note nobody fails on.
  //
  // A diagnostic on a passing test is not a control. Falling back to HEAD
  // means a gated value introduced by this very commit counts as
  // already-public, so the fallback fails the suite instead. CI must fetch
  // main; a deliberate run without it sets MGM_ALLOW_HEAD_BASELINE=1 and
  // thereby records that this layer was not in force.
  //
  // The `main` rung is named too: a review poisoned a local `main` and it
  // silently became the public baseline. If that is the ref in use, say which.
  if (usedRef && !usedRef.startsWith('origin/main')) {
    const why = 'the already-public baseline came from `' + usedRef +
      '`, not origin/main. origin/main is the only ref that means "already ' +
      'published": `main` can be stale or locally modified, and HEAD is the ' +
      'commit under review, which would launder a value introduced by it. ' +
      'Fetch main (a --single-branch --depth 1 clone has neither ref), or set ' +
      'MGM_ALLOW_HEAD_BASELINE=1 to run with this layer knowingly weakened.';
    if (process.env.MGM_ALLOW_HEAD_BASELINE === '1') t.diagnostic('WEAKENED: ' + why);
    else assert.fail(why);
  }

  if (publicSrc === null) {
    // Fall back, but SAY the subtraction is weaker -- in this state a value
    // pasted into the working config would be excluded.
    publicSrc = fs.readFileSync(path.join(root, 'membershipModelConfig.js'), 'utf8');
    t.diagnostic('could not read the committed config from git; falling back to the ' +
      'working copy, which means a gated value pasted into the config would be ' +
      'treated as already-public and NOT reported');
  }
  const publicLiterals = literals(publicSrc);

  // Annual totals of the committed monthly history are public too, even though
  // they are not literals anywhere: each is the sum of twelve published
  // numbers, so anyone with the config has them. Without this, a gated figure
  // that happens to equal a published annual total gets reported -- which
  // began happening the moment the refresh rounded a driver out of the config,
  // against a hand-transcribed total in this very file.
  //
  // Derived from the SAME source as publicLiterals (origin/main), not from the
  // working tree, for the reason above: a sum of numbers you just added is not
  // evidence that the sum was already public.
  try {
    const hist = /monthlyHistory:\s*\{([\s\S]*?)\n    \}/.exec(publicSrc);
    if (hist) {
      for (const row of hist[1].match(/\[[^\]]*\]/g) || []) {
        const nums = (row.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (nums.length) publicLiterals.add(nums.reduce((a, b) => a + b, 0));
      }
    }
  } catch (e) { /* no history block: nothing to add */ }
  const isYear = n => Number.isInteger(n) && n >= 1900 && n <= 2100;

  // ── One narrow allowlist, BY FIELD NAME, never by value ──────────────
  //
  // The Oct 29 data refresh set billing.companies to a figure that
  // coincidentally equals one gated value in the local actuals. A bare
  // integer collision, at exactly this scan's distinctiveness floor.
  //
  // WHICH gated line it collides with is deliberately not written here, and
  // this is the second correction to this paragraph. It originally named a
  // specific line; a pre-merge sweep checked that claim by equality rather
  // than by reading it and found it named the WRONG one. Correcting it to the
  // right name made the comment accurate and, in the same stroke, published a
  // gated figure: billing.companies is committed, so "gated line L equals the
  // company count" states L's value exactly. The accurate version was the
  // disclosure, and the inaccurate one had been concealing it by being wrong.
  //
  // So it names none. The allowlist does not need the name: its justification
  // is a property of the PUBLIC field -- a company count the refresh script
  // derives mechanically from the export -- and holds whichever gated line
  // happens to collide.
  //
  // BELOW-FLOOR COVERAGE, stated because it is a real limit and not an
  // oversight: some gated fields fall below the distinctiveness floor, so
  // this layer cannot scan for them AT ALL -- and lowering the floor does not
  // help. Which fields those are is deliberately not written here: naming a
  // field beside "below the floor" bounds its value's magnitude, which is a
  // derivation aid of exactly the kind SR-11 exists to keep out of a guard's
  // own text -- and the count of them is left out for the same reason. To
  // enumerate them, run the equality check against the gitignored actuals
  // locally.
  //
  // MEASURED on the tracked tree, which is why "lowering the floor does not
  // help" is a finding and not a guess: a below-floor value matched by digit
  // stream hits 85 of 160 files, and matched as an exact bare literal still
  // hits 26 text files -- a short integer is a vendor id, a pixel value, a
  // row count and a SQL key everywhere in this repo. There is no threshold at
  // which the check discriminates, so no amount of tuning closes this.
  //
  // What covers those values is structural rather than this scan: none is a
  // per-member driver, so no committed field is derived from one, and layer
  // 1's field-name rules still apply to any field that tried to be.
  //
  // It is not a leak: billing.companies is the count of companies in the
  // billing export, independently derivable from the location export and
  // visible on Interstate's own dashboard. Nobody reading a public company
  // count can infer a P&L line from it.
  //
  // KEYED ON THE FIELD, not the number, because writing the number here is
  // exactly what SR-11 forbids: "a guard, test, or comment describing a
  // banned value must never contain that value anywhere in it." So this reads
  // the value out of the config at run time and subtracts that one literal.
  //
  // The owner approved this specific allowlist and explicitly declined the
  // alternative -- raising the distinctiveness threshold for all bare
  // three-digit integers -- which would have been a general weakening.
  //
  // RESIDUAL, and the honest status of it: by construction a gated figure
  // placed in billing.companies would be subtracted from the scan and so
  // missed by this layer. That is the whole cost -- one field, holding a count
  // the refresh script derives mechanically from the export rather than
  // anything hand-entered, with layer 1's structural rules still applying.
  //
  // MEASURED, and wider than first documented. Three of my own attempts to
  // isolate this failed -- every substitute gated literal I picked already
  // collided with another number in a committed file, and the "literal #N" in
  // the failure message is positional within the scanned set, so it renumbers
  // whenever this allowlist changes. I recorded it as reasoned-not-measured.
  //
  // A reviewer then built the control, with two changes that make it work:
  // plant a value taken FROM the computed scannable set, and measure per-file
  // hit lines rather than pass/fail, which makes the renumbering irrelevant.
  // Five arms, and the result is one correction to what is written above:
  //
  //   the exemption is ONE VALUE ACROSS ALL SIX SCANNED FILES, not one field.
  //
  // A gated figure equal to billing.companies is unreported wherever it sits
  // -- including in the SQL migration -- which is wider than "a figure pasted
  // into billing.companies". The exemption subtracts a NUMBER from the scan;
  // it cannot know which field that number came from.
  //
  // Mitigation, also measured: the arm that plants it in billing.companies
  // still fails the suite, through the CSV-aggregates test that pins that
  // field. So the honest statement is "SR-11 misses that one value; another
  // test catches it in the field this allowlist exists for."
  //
  // The three failed attempts remain the argument for this allowlist over the
  // alternative: three- and four-digit integers collide often enough that
  // raising the distinctiveness threshold generally would have blunted the
  // scan far more than exempting one value does.
  // BY PATH, not by regex. The first version matched
  // `new RegExp(field + ':\\s*([0-9]+...)')` against the whole config text,
  // and a review showed that `zeroBillCompanies` was held off only by its
  // capital C: a `paying_companies:` line above it, a lowercase spelling, or
  // even a COMMENT containing `companies: NNN` would capture the exemption and
  // silently point it at a different number. The config is already required by
  // this file, so read the field.
  const ALLOWLISTED_PUBLIC_PATHS = [['billing', 'companies']];
  const coincidental = new Set();
  for (const p of ALLOWLISTED_PUBLIC_PATHS) {
    const v = p.reduce((o, k) => (o == null ? o : o[k]), MGM_CONFIG);
    assert.equal(typeof v, 'number',
      'allowlisted path ' + p.join('.') + ' is not a number in the config -- ' +
      'remove it from ALLOWLISTED_PUBLIC_PATHS rather than leaving a dead ' +
      'exemption that silently widens this scan');
    coincidental.add(v);
  }

  const all = [...literals(localSrc)];
  const base = n => n !== 0 && digits(n).length >= 3 && !publicLiterals.has(n) && !isYear(n);
  const scannable = all.filter(n => base(n) && !coincidental.has(n));
  const excluded = all.length - scannable.length;

  // SAY SO WHEN THE EXEMPTION IS DOING NOTHING. A review measured it inert at
  // the commit that introduced it -- once the refreshed config is COMMITTED,
  // the value is already-public by the subtraction above, so the exemption
  // changes nothing and carries only risk.
  //
  // It is not dead across the workflow, though: it is load-bearing in the
  // window between regenerating the config and committing it, because
  // publicLiterals is read from HEAD on purpose (a value cannot be made public
  // by sitting in your own working tree). So rather than delete it or keep it
  // silently, report which state it is in -- an exemption that has stopped
  // mattering is then visible to the next reader instead of rotting.
  if (scannable.length === all.filter(base).length) {
    t.diagnostic('the SR-11 allowlist (' +
      ALLOWLISTED_PUBLIC_PATHS.map(p => p.join('.')).join(', ') +
      ') is currently INERT: the committed config already makes those values ' +
      'public, so removing the allowlist would not change this scan. It still ' +
      'covers the window between a data refresh and its commit.');
  }

  if (!scannable.length) {
    // Also a visible skip, and the more dangerous case: the file EXISTS, so an
    // existence check passes, yet it yields nothing to look for. An assertion
    // over an empty set is green by construction. Say so rather than bank it.
    t.skip('membershipPnlActuals.local.js exists but yields no sufficiently ' +
           'distinctive numeric literal, so there is nothing to scan for. ' +
           'This check did NOT meaningfully run.');
    return;
  }

  const FILES = ['membershipModelConfig.js', 'membershipModel.js',
    'membershipModel.test.js', path.join('membership-growth-model', 'index.html'),
    path.join('sql', '2026-10-28-mgm-scenarios.sql'),
    path.join('tools', 'refresh-membership-config.py')];

  const hits = [];
  FILES.forEach(rel => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const src = fs.readFileSync(abs, 'utf8');
    scannable.forEach((n, idx) => {
      const plain = String(n).replace('.', '\\.');
      const grouped = (Math.abs(n) >= 1000 && Number.isInteger(n))
        ? String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        : null;
      const alts = grouped ? plain + '|' + grouped : plain;
      if (new RegExp('(^|[^0-9.,])(' + alts + ')([^0-9.]|$)').test(src)) {
        // The value is NOT named in the message -- naming it here would commit
        // it, which is the whole point of SR-11.
        hits.push(rel + ' contains a gated value (local-file literal #' + idx + ')');
      }
    });
  });

  assert.deepEqual(hits, [],
    'a figure from the auth-gated actuals appears in a committed file. This repo ' +
    'is PUBLIC. Remove it -- and if it sits inside a guard, a comment or an ' +
    'example, remember SR-11: a guard needs the shape, never the instance:\n  ' +
    hits.join('\n  '));

  // State the coverage, so a thin scan is visible rather than looking thorough.
  t.diagnostic('scanned ' + scannable.length + ' gated literal(s) across ' +
    FILES.length + ' committed file(s); ' + excluded + ' of ' + all.length +
    ' local literals excluded as already-public, a calendar year, or too few digits');
});

test('labels cover all fourteen tabs', () => {
  // Twelve until Task 20 added `about`, the About & Tutorial tab; thirteen
  // until 2026-10-30 added `pnl`, the admin-only P&L Actuals tab. The count is
  // asserted rather than derived so that adding a tab is a deliberate act: a
  // tab present in TAB_ORDER but missing from labels.tabs renders a button
  // labelled "undefined", and a label with no tab is dead config nobody sees.
  assert.equal(Object.keys(MGM_CONFIG.labels.tabs).length, 14,
    'fourteen tabs: the original twelve, plus `about` (Task 20), plus `pnl` ' +
    '(2026-10-30). If this fails after a tab was added or removed, update ' +
    'BOTH labels.tabs and the page TAB_ORDER array, then this number.');
  // Every tab also needs a notes slot: MGM.tabNotes binds a textarea to
  // labels.notes.<tab>, and a missing key makes mergeState report the first
  // typed note as a field "this build no longer uses" on every later scenario
  // load. `report` is the one tab with no notes card of its own -- the report
  // PRINTS the others' notes rather than carrying one.
  const tabs = Object.keys(MGM_CONFIG.labels.tabs).filter(k => k !== 'report');
  const missing = tabs.filter(k => !(k in MGM_CONFIG.labels.notes));
  assert.deepEqual(missing, [],
    'these tabs have a label but no labels.notes slot: ' + missing.join(', '));
});

test('labels.tiles/columns/rows cover every renameable id with no gaps', () => {
  // Counts asserted the same deliberate way as the thirteen-tabs test above:
  // a tile/column/row id present in the page's HIDDEN_SECTION_IDS allowlist
  // but missing a labels entry here would render "undefined" the moment an
  // admin opens the rename panel, and these counts are the only signal that
  // would catch it -- the page's own allowlist is not reachable from this
  // Node test. If this fails after adding or removing a renameable tile,
  // column or row, update BOTH the page render site and this number.
  assert.equal(Object.keys(MGM_CONFIG.labels.tiles).length, 33,
    'thirty-three renameable tile titles.');
  assert.equal(Object.keys(MGM_CONFIG.labels.columns).length, 79,
    'seventy-nine renameable column headers (of 106 total -- the rest are ' +
    'stream-keyed through labels.streams already, month-named, or program-' +
    'named, each sharing a source this build does not yet give its own ' +
    'label map).');
  assert.equal(Object.keys(MGM_CONFIG.labels.rows).length, 26,
    'twenty-six renameable row labels (of 79 total -- the rest come from ' +
    'a shared array also used elsewhere (CRM_STAGES, a stream, a program), ' +
    'are static About-tab text, or (one row) carry embedded markup a plain ' +
    'label cannot represent).');
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
  // Repinned 2026-10-30: the PTP dissolution corrected the active total from
  // 397 to 398 (a data fix, not a formula change -- see groups' comment in
  // membershipModelConfig.js), which moves every pin in this test by the
  // same ~0.25% every member-scaled stream moves by. Repinned the same way
  // the Oct 29 rounding repin documented below already was: full double
  // precision from a run against the (unchanged) formulas, not hand-derived
  // arithmetic -- the member count itself is the only input that moved.
  near(r.members, 398.6913610763889, 'members');
  near(r.streams.dues, 1723638.4398598871, 'dues');

  // DERIVED FROM THE DRIVER, not pasted from the engine. These four moved in
  // the Oct 29 rounding and I repinned them with the values the run printed --
  // full double precision, which a review spotted as the tell: the unchanged
  // pins in this test scatter in the tenth decimal because they were computed
  // by hand, and these implied the engine's internal member value to fifteen
  // places. Against this test's own opening rule, "NOT by calling
  // revenueModel".
  //
  // Each of these streams IS members x a committed driver, so writing that
  // product is both the hand derivation and the documentation of the formula.
  // `dues` and `vendor` above keep their hand-computed absolutes because their
  // formulas are not a single driver per member.
  const D = MGM_CONFIG.revenue;
  near(r.streams.duesAncillary, r.members * D.duesAncillaryPerMember, 'duesAncillary');
  near(r.streams.settlement, r.members * D.settlementNetPerMember, 'settlement');
  near(r.streams.fuelProgram, 0, 'fuelProgram — zero by design');
  near(r.streams.vendor, 368390.81763458333, 'vendor');
  near(r.streams.rewards, 66980.14866083334, 'rewards');
  near(r.streams.rewardsBreakage,
       r.members * D.rewardsBreakagePerMember, 'rewardsBreakage');
  // The sum of the seven, so a stream silently dropping out of the total is
  // caught -- which asserting the printed figure could not do.
  near(r.total, r.streams.dues + r.streams.duesAncillary + r.streams.settlement
              + r.streams.fuelProgram + r.streams.vendor + r.streams.rewards
              + r.streams.rewardsBreakage, 'total is the sum of its streams');
  // Ties back to the per-member figure the reconciliation tile reports.
  // NOT A CHECK ON THE REFRESH. A review pointed out this ratio cannot fail
  // for any member count: every stream is members x a driver, so total/members
  // is the driver sum regardless of the base. It is a check on the DRIVERS
  // summing to the documented figure, which is worth keeping and is what the
  // comment below spells out -- but it was wrongly cited as evidence that the
  // Oct 29 repins were verified. The figures that actually moved with the base
  // are the per-stream absolutes above.
  near(r.total / r.members, 5890.24, '$/member/yr (driver sum, base-independent)');
});

test('fuelProgramMargin defaults to zero, so no prospective fuel revenue', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  assert.equal(st.revenue.fuelProgramMargin, 0);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  assert.equal(R[0].streams.fuelProgram, 0);
  assert.ok(R[0].streams.settlement < 0, 'settlement nets negative');
});

test('revPerMember derives the driver sum from the committed drivers', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st), null);
  // The driver sum: dues x 12, plus ancillary, plus settlement (negative),
  // plus the two participation-weighted streams, plus breakage.
  //
  // The terms are NOT written out here any more. They were, and three of them
  // were exactly equal to auth-gated P&L lines -- so this comment published
  // three gated figures in a file whose own SR-11 rule forbids exactly that:
  // a guard, test or comment describing a banned value must never contain it.
  // Rounding those drivers in the config un-masked this, because a literal
  // stops being "already public" the moment it leaves the committed config.
  // The sum is asserted below; the terms are read from the config by the
  // engine, where they belong.
  //
  // This is the DRIVER SUM, computed from the seven committed drivers. It is
  // deliberately close to, but not equal to, the measured per-member figure:
  // the drivers are rounded to whole dollars, and the model leaves one real
  // P&L line out as a driver on purpose. The measured figure, the per-driver
  // unrounded values and the size of the gap are all auth-gated and live in
  // mgm_pnl_actuals — quoting any of them here would commit a P&L actual to a
  // public repo, and quoting the GAP would let the figure be back-solved from
  // the committed drivers.
  //
  // Keeping the rounded drivers is an explicit owner decision; the gap is
  // surfaced on the reconciliation tile for a signed-in admin, not hidden.
  near(rpm.derived.total, 5890.24, 'derived $/member/yr');
  assert.equal(rpm.actual, null, 'unsigned: no actual');
  assert.equal(rpm.benchmark, 20000);
  near(rpm.varianceVsBenchmark, 5890.24 - 20000, 'benchmark variance');
});

test('a loaded P&L with no per-member total gives no actual, not a zero', () => {
  // Number(null) is 0 and isFinite(0) is true, so the previous guard turned a
  // loaded period that omits this line into `actual: 0` -- and the Revenue per
  // Member tab then printed "P&L actual $0" with a full-size variance against
  // a figure nobody supplied. A period legitimately omits the line, so this is
  // a reachable state. The report layer guarded it on paper; this fixes the
  // screen and the engine, which is where it belonged.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const M = MembershipModel.runModel(st);

  [null, undefined, ''].forEach(v => {
    const r = MembershipModel.revPerMember(st, M, { totalPerMemberYr: v });
    assert.equal(r.actual, null, JSON.stringify(v) + ' must not coerce to 0');
    assert.equal(r.varianceVsActual, null,
      'no actual means no variance, never a variance against zero');
  });

  // Controls: a real number still works, and a real ZERO is still honoured --
  // the guard must reject absence, not reject the number zero.
  const real = MembershipModel.revPerMember(st, M, { totalPerMemberYr: 7000 });
  assert.equal(real.actual, 7000);
  const zero = MembershipModel.revPerMember(st, M, { totalPerMemberYr: 0 });
  assert.equal(zero.actual, 0, 'an explicitly reported 0 is a figure, not an absence');
  assert.ok(zero.varianceVsActual > 0, 'and it yields a real variance');
});

test('revPerMember reports the variance against a loaded actual', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  // 7000 is an ARBITRARY stand-in, not the measured figure. The real one is
  // auth-gated, and a fixture is as recoverable as a config default -- so the
  // test pins the subtraction and its SIGN, which is what can regress, using
  // a value that discloses nothing. An actual above the driver sum must give a
  // negative variance; the direction is the part a reader relies on.
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st),
    { totalPerMemberYr: 7000 });
  near(rpm.varianceVsActual, rpm.derived.total - 7000, 'variance is derived minus actual');
  assert.ok(rpm.varianceVsActual < 0,
    'an actual above the driver sum reads as a shortfall, not a surplus');
});

test('dues realization is reported from the billable vs realized rates', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const rpm = MembershipModel.revPerMember(st, MembershipModel.runModel(st), null);
  // 360.27 is 142305 / 395 PAYING locations, from the Oct 29 export. The
  // denominators are spelled out rather than read back off the config, so this
  // stays an independent check of the published figure rather than a
  // restatement of the implementation. Dividing by all 411 locations instead
  // would read 346.24 and overstate realization, which is the error this test
  // was written to pin.
  // MEASURED AGAINST THE ACTUAL BILLING TOTAL, not against duesPerLocBillable.
  //
  // The old form was duesPerLoc / duesPerLocBillable, and the recalibration set
  // the first to the second -- so it read 100.00% by construction and would
  // have read 100.00% with both fields at 999. A review caught that the metric
  // became a tautology at the moment it was meant to confirm the
  // recalibration, which is this work's recurring habit one more time.
  //
  // Modelled annual dues over actual annual billing. Written out rather than
  // read back off the implementation, so this is a check and not a
  // restatement:
  // 398.691361 (not 397.691361): repinned 2026-10-30 for the same PTP-
  // dissolution count correction (397 -> 398 active) as the revenueModel
  // golden test above -- a data fix, not a formula change.
  near(rpm.duesRealization,
       100 * (398.691361 * 360.27 * 12) / (142305 * 12), 'realization %');

  // THE FLIP IS RESOLVED. This band previously sat above 100%, deliberately,
  // as a tripwire. The Oct 29 refresh took the billable rate from 382.47 to
  // 360.27 while assumed duesPerLoc stayed at 362, pushing realization
  // 94.6% -> 100.5%: the model claiming more per location than was billed.
  // The band was pinned ABOVE 100 so the rewards-calibration work could not
  // land without confronting it.
  //
  // It confronted it: duesPerLoc is now 360.27, the measured rate, so
  // realization is 100.0% by construction rather than by coincidence. The band
  // is tight around 100 for that reason -- if either figure drifts from the
  // other again, this fails rather than drifting quietly past 100 a second
  // time.
  // ~100.94%, and the OVERSHOOT IS THE POINT. duesPerLoc is dues over PAYING
  // LOCATIONS (395) applied to MEMBERS (398.7) -- two different populations --
  // so the model bills slightly more than the P&L did. About $16.0k/yr. That
  // is a real, small mismatch worth seeing rather than a figure to tune away,
  // and the band is tight enough to catch it drifting.
  //
  // Band repinned 2026-10-30 (100.6-100.8 -> 100.85-101.05) for the same PTP-
  // dissolution member-count correction as the pin above: one more active
  // location raises modeled dues against the same fixed actual billing
  // total, so the overshoot grew from ~$11.7k to ~$16.0k/yr. The band's
  // WIDTH and PURPOSE are unchanged -- still tight enough to catch the
  // metric drifting back to self-referential (exactly 100.00) or drifting
  // further without anyone noticing.
  assert.ok(rpm.duesRealization > 100.85 && rpm.duesRealization < 101.05,
    `realization is modelled dues over ACTUAL billing, ~100.94%; a reading of `
    + `exactly 100.00 means the metric has gone self-referential again; `
    + `got ${rpm.duesRealization}`);
});

test('dues realization reads monthlyDuesTotalExclCStores, not monthlyDuesTotal', () => {
  // The shipped config has these two fields equal (zero exclusion, pending
  // the next real CSV refresh -- membershipModelConfig.js's "2026-10-30
  // EXCEPTION #2"), so a test against the default state alone cannot tell
  // which field the formula actually reads. This test makes them diverge.
  const base = MembershipModel.defaultState(MGM_CONFIG);
  const M = MembershipModel.runModel(base);

  // Positive control: a decoy monthlyDuesTotal must be IGNORED when
  // monthlyDuesTotalExclCStores is held fixed across both states.
  const stA = JSON.parse(JSON.stringify(base));
  stA.billing.monthlyDuesTotal = 999999;
  stA.billing.monthlyDuesTotalExclCStores = 142305;
  const rpmA = MembershipModel.revPerMember(stA, M, null);

  const stB = JSON.parse(JSON.stringify(base));
  stB.billing.monthlyDuesTotal = 142305;
  stB.billing.monthlyDuesTotalExclCStores = 142305;
  const rpmB = MembershipModel.revPerMember(stB, M, null);

  near(rpmA.duesRealization, rpmB.duesRealization,
    'two states with the same monthlyDuesTotalExclCStores but different ' +
    'monthlyDuesTotal (999999 vs 142305) must realize IDENTICALLY -- proves ' +
    'the denominator is the excl-C-Stores field, not the full one');

  // Negative control: changing ONLY monthlyDuesTotalExclCStores must move
  // the result -- without this, the positive control above could pass for
  // the wrong reason (e.g. the field were read nowhere at all).
  const stC = JSON.parse(JSON.stringify(base));
  stC.billing.monthlyDuesTotal = 142305;
  stC.billing.monthlyDuesTotalExclCStores = 71152.5; // half of stB's
  const rpmC = MembershipModel.revPerMember(stC, M, null);
  near(rpmC.duesRealization, 2 * rpmB.duesRealization,
    'halving monthlyDuesTotalExclCStores must double realization -- the ' +
    'field actually drives the denominator, this is not a stale read');
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

  // Set it the way a signed-in session or a hand entry would. 7.5 is an
  // ARBITRARY value chosen to be obviously not the real figure: the actual
  // P&L margin is auth-gated and must never appear in this public repo, not
  // even as a test fixture, because a fixture is as recoverable as a config
  // default. Any number that exercises the branch is equally valid here.
  st.valuation.ebitdaMargin = 7.5;
  const v = MembershipModel.valuation(st, last);
  near(v.ebitdaBase, last.total * 0.075, 'ebitda base');
  near(v.ebitda, last.total * 0.075 * 5, 'ebitda lens');
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

test('valuation declines to a revenue-only lens when given no EBITDA basis', () => {
  // With costs unset, cashflowModel's EBITDA is revenue minus zero costs, i.e.
  // a 100% margin. The page must NOT pass that to valuation as the override:
  // doing so produced a $9.09M headline midpoint against $3.03M on the margin
  // branch -- a 3x overstatement on shipped defaults, against a real net margin
  // that is a small fraction of 100% -- and made ebitdaMargin dead code because
  // the override always won. This test pins the arithmetic that decision rests
  // on.
  //
  // SCOPE: this covers the ENGINE only. MGM.model() lives in an inline script
  // with no test seam, so nothing here fails if a future edit re-passes the
  // zero-cost cash bridge from the page -- verified by reverting MGM.model()
  // and watching this file still report all green. The page-level behaviour is
  // currently protected by the comment at the MGM.model() call site and by
  // review, not by a test.
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
  // min/mean/max of two numbers. Neither assertion could fail. This version
  // pins independently-computed values AND flips which lens is larger, so a
  // min/max swap in the implementation is caught.
  // All values in this test repinned 2026-10-30 for the PTP-dissolution
  // member-count correction (397 -> 398 active, see groups' comment in
  // membershipModelConfig.js) the same way the revenueModel golden test
  // above was -- a data fix cascading through the 3-year projection into
  // final-year revenue and both valuation lenses, not a formula change.
  // Recomputed directly from the (unchanged) engine, full double precision.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];
  near(last.total, 2507118.418176269, 'final-year revenue basis');

  // Margin unset (the shipped default): the EBITDA lens is zero, so the
  // revenue lens is the high end.
  st.valuation.ebitdaMargin = 0;
  const a = MembershipModel.valuation(st, last);
  near(a.rev, 6267796.045440673, 'revenue lens at 2.5x');
  near(a.ebitda, 0, 'EBITDA lens is zero at an unset margin');
  near(a.low, 0, 'low is the EBITDA lens here');
  near(a.high, 6267796.045440673, 'high is the revenue lens here');
  near(a.mid, 3133898.0227203364, 'midpoint');

  // An 80% margin inverts the ordering: the EBITDA lens is now on top.
  st.valuation.ebitdaMargin = 80;
  const b = MembershipModel.valuation(st, last);
  near(b.ebitda, 10028473.672705077, 'EBITDA lens at 80% x 5');
  near(b.low, 6267796.045440673, 'low is now the revenue lens');
  near(b.high, 10028473.672705077, 'high is now the EBITDA lens');
  near(b.mid, 8148134.859072875, 'midpoint follows the inversion');
});

test('indicated is the single lens when only one has a basis, never half of it', () => {
  // On shipped defaults only the revenue lens has a basis: the margin is
  // auth-gated to 0 and no costs are entered, so the EBITDA lens is $0. `mid`
  // then reads 3030704.76 -- exactly half the only method that exists -- and
  // that figure was the page's headline. `indicated` is the field consumers
  // must read instead. `mid` is deliberately still asserted here: it keeps its
  // meaning as the two-method midpoint, and a future edit must not quietly
  // redefine it into `indicated`.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];

  // Repinned 2026-10-30, same PTP-dissolution member-count correction as the
  // test above.
  const defaults = MembershipModel.valuation(st, last);
  assert.equal(defaults.lensCount, 1, 'only the revenue lens has a basis');
  near(defaults.indicated, 6267796.045440673, 'indicated is the whole revenue lens');
  near(defaults.mid, 3133898.0227203364, 'mid still reports the two-method midpoint');
  assert.notEqual(defaults.indicated, defaults.mid,
    'the headline figure must not be half of the only live lens');

  // The mirror case: a revenue lens with no basis and a live EBITDA lens.
  // Zeroing the multiple rather than the revenue keeps the model's own revenue
  // total intact, so the EBITDA margin still has something to apply to.
  const ebitdaOnly = MembershipModel.defaultState(MGM_CONFIG);
  ebitdaOnly.valuation.revMultiple = 0;
  ebitdaOnly.valuation.ebitdaMargin = 7.5;
  const eo = MembershipModel.valuation(ebitdaOnly, last);
  assert.equal(eo.rev, 0, 'revenue lens has no basis at a zero multiple');
  assert.equal(eo.lensCount, 1, 'only the EBITDA lens has a basis');
  near(eo.indicated, last.total * 0.075 * 5, 'indicated is the whole EBITDA lens');
});

test('indicated equals the midpoint when both lenses have a basis', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];

  // Via a margin assumption. 7.5 is arbitrary and obviously not the gated
  // figure; any value that makes the lens live is equally valid here.
  st.valuation.ebitdaMargin = 7.5;
  const viaMargin = MembershipModel.valuation(st, last);
  assert.equal(viaMargin.lensCount, 2);
  near(viaMargin.indicated, (viaMargin.rev + viaMargin.ebitda) / 2, 'midpoint');
  near(viaMargin.indicated, viaMargin.mid, 'indicated and mid agree at two lenses');

  // Via a real computed EBITDA handed in as the override, which is the path
  // Profit & Cash Flow uses once actual costs are entered.
  const viaCosts = MembershipModel.defaultState(MGM_CONFIG);
  viaCosts.costs.costToServePerMember = 1200;
  viaCosts.costs.salesSpendPerMonth = 40000;
  const M2 = MembershipModel.runModel(viaCosts);
  const R2 = MembershipModel.revenueModel(viaCosts, M2);
  const F2 = MembershipModel.cashflowModel(viaCosts, M2, R2);
  const lastF = F2[F2.length - 1];
  assert.equal(MembershipModel.costModel(viaCosts, M2, R2).unset, false,
    'real costs are entered');
  const vc = MembershipModel.valuation(viaCosts, R2[R2.length - 1], lastF.ebitda);
  assert.equal(vc.lensCount, 2, 'a computed EBITDA is a basis');
  near(vc.indicated, (vc.rev + vc.ebitda) / 2, 'midpoint of two real lenses');
});

test('a NEGATIVE lens is a basis; only an exact zero is absent', () => {
  // The decision this pins: zero means "nothing was supplied" because every
  // unsupplied input in this model defaults to an explicit 0, but a negative
  // EBITDA can only come from real entered costs exceeding revenue. That is a
  // measured result and the most decision-relevant thing the model can say,
  // so it counts as a method and drags the midpoint down. Treating it as
  // absent would hide a loss and promote the revenue lens to a lone headline.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];

  const neg = MembershipModel.valuation(st, last, -500000);
  assert.equal(neg.lensCount, 2, 'a negative EBITDA lens is present, not absent');
  near(neg.ebitda, -500000 * 5, 'negative lens multiplied through');
  near(neg.indicated, (neg.rev + neg.ebitda) / 2,
    'the midpoint carries the loss rather than ignoring it');
  assert.ok(neg.indicated < neg.rev / 2 + 1,
    'a negative lens must pull the indicated value BELOW half the revenue lens');
  near(neg.low, -2500000, 'low is the negative lens');
});

test('indicated is null, not zero, when no lens has a basis', () => {
  // A null forces every consumer to render an em dash rather than printing
  // "$0.00M", which would read as a company valued at nothing instead of a
  // model with no method supplied.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const last = R[R.length - 1];
  st.valuation.revMultiple = 0;        // revenue lens has no basis
  assert.equal(st.valuation.ebitdaMargin, 0, 'margin ships unset');

  const none = MembershipModel.valuation(st, last);
  assert.equal(none.rev, 0);
  assert.equal(none.ebitda, 0);
  assert.equal(none.lensCount, 0);
  assert.equal(none.indicated, null, 'null, never 0 — absent is not a valuation');
  assert.equal(none.mid, 0, 'mid is unchanged and still arithmetically 0 here');
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
// 2026-10-30: a group's locations can now split across multiple profile/
// roadway rows (gallons.groupSplits), and baselines live in state
// (gallons.baselines) rather than being injected -- gallonProduction(state,
// pipeline), no baselineFor argument any more. The stand-in BASELINES map
// and baselineFor(p, r) stub this file used to define here were removed
// along with it -- MGM_CONFIG.gallons.baselines is real data now, not
// something a test needs to fake.
test('gallon production multiplies split locations by mapped baselines, summed per group', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const p = MembershipModel.pipelineModel(st, LEADS, PROFILES);
  const g = MembershipModel.gallonProduction(st, p);
  // Independently recomputed from MGM_CONFIG's own baselines/groupSplits
  // tables, not pasted from the engine's output -- stays correct if either
  // table changes, rather than needing a fresh hand-paste each time, which
  // is exactly the maintenance burden that made the prior single-profile
  // version's hand-pasted product go stale at the Oct 29 refresh.
  const baseMap = {};
  MGM_CONFIG.gallons.baselines.forEach(b => { baseMap[b.profile + '|' + b.roadway] = b.baseline; });
  let expected = 0;
  MGM_CONFIG.groups.forEach(grp => {
    (MGM_CONFIG.gallons.groupSplits[grp.key] || []).forEach(row => {
      expected += row.locations * (baseMap[row.profile + '|' + row.roadway] || 0);
    });
  });
  near(g.existing, expected, 'existing network gal/mo');
  assert.equal(g.inbound, p.gallons);
  near(g.total, expected + p.gallons, 'total');
  near(g.perMember, expected / 398, 'per existing member');
});

test('a per-row baseline override changes only that row', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const before = MembershipModel.gallonProduction(st, null);
  // cstore ships as a single row (no real per-location data for this type --
  // see groupSplits.cstore's comment), so overriding row 0 overrides the
  // whole group, the same observable effect the old per-group override had.
  const cstoreRow = st.gallons.groupSplits.cstore[0];
  const oldBaseline = MGM_CONFIG.gallons.baselines
    .find(b => b.profile === cstoreRow.profile && b.roadway === cstoreRow.roadway).baseline;
  cstoreRow.baselineOverride = 4000;
  const after = MembershipModel.gallonProduction(st, null);
  near(after.existing - before.existing, cstoreRow.locations * (4000 - oldBaseline),
    'delta is C-Stores only');
  assert.equal(after.byGroup.find(r => r.key === 'cstore').rows[0].overridden, true);
  assert.ok(after.byGroup.find(r => r.key === 'ts').rows.every(r => !r.overridden),
    'ts rows unaffected');
});

test('a group with no split rows at all reports zero and is flagged, not silently dropped', () => {
  // Exactly what MGM.addGroup produces: a new groups row with no
  // corresponding gallons.groupSplits entry until an admin adds one via
  // "+ Add profile/roadway split" on Fuel Gallon Production.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.groups.push({ key: 'brandnew', label: 'Brand New', count: 10 });
  const g = MembershipModel.gallonProduction(st, null);
  const row = g.byGroup.find(r => r.key === 'brandnew');
  assert.equal(row.gallons, 0);
  assert.equal(row.unmapped, true);
  assert.deepEqual(row.rows, []);
  assert.ok(g.mapped < g.byGroup.length, 'mapped count reflects the gap');
});

test('a split row with an unrecognised profile/roadway is flagged without zeroing its siblings', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.groups.push({ key: 'brandnew', label: 'Brand New', count: 10 });
  st.gallons.groupSplits.brandnew = [
    { profile: 'Not a real profile', roadway: 'Nowhere', locations: 4, baselineOverride: null },
    { profile: 'Fuel stop', roadway: 'Any', locations: 6, baselineOverride: null }
  ];
  const g = MembershipModel.gallonProduction(st, null);
  const row = g.byGroup.find(r => r.key === 'brandnew');
  assert.equal(row.rows[0].unmapped, true);
  assert.equal(row.rows[1].unmapped, false);
  // At least one row resolved, so the GROUP is not the "contributes zero
  // gallons" failure case -- it genuinely produces some.
  assert.equal(row.unmapped, false);
  near(row.gallons, 6 * 5630, 'only the mapped row contributes');
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
    // 1.00, not 0.50: revenue.rewardsPM is a BLENDED rate over all active
    // members now, so the participation share is already inside it and this
    // field is a deliberate no-op. Pinned at 1.00 so reintroducing a second
    // discount here fails rather than silently halving the stream.
    near(r.rewards, expected * 1.00, `${y.year} rewards participants`);
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

  // Both lenses pinned to figures derived from the SAME basis, so neither side
  // is read back from the code under test. A review found this comment still
  // naming the PRE-REFRESH basis while the assertions below had moved, and its
  // arithmetic had not matched them since an earlier repin in the same
  // session. That is the fifth instance of one habit in this work: a claim of
  // independent verification left standing over figures that no longer
  // support it. Restate all three whenever the data refreshes.
  //
  // Repinned again 2026-10-30 for the PTP-dissolution member-count
  // correction (397 -> 398 active, membershipModelConfig.js's groups
  // comment) -- a data fix, not a formula change; basis moved, the cost
  // terms (the test's own fixed inputs) did not.
  //
  //   basis    = 2,507,118.418176   (final-year revenue, pinned above)
  //   margin   = basis x 25% = 626,779.604544
  //   computed = basis - 170,255.773495 cost-to-serve
  //                    - 240,000.000000 sales spend
  //            = 2,096,862.644681
  //
  // Both cost terms are the test's OWN inputs ($400/member/yr over the
  // modelled base, and $20,000/mo x 12), not figures read out of the engine.
  near(viaMargin.ebitdaBase, 626779.604544, 'margin lens: 25% of final-year revenue');
  near(viaComputed.ebitdaBase, 2096862.644681, 'computed lens: revenue less real costs');

  // DIRECTION IS DELIBERATELY NOT ASSERTED. With these modest cost inputs
  // ($20k/mo spend, $400/member/yr) the computed EBITDA lands ~3.3x ABOVE a 25%
  // margin, implying an 83% margin on ~$2.42M of revenue. Only with the P&L's
  // real operating costs -- auth-gated, never committed to this public repo, and
  // far larger than these placeholder inputs -- would it fall below. Which side
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
  assert.equal(st.revenue.duesPerLoc, 360.27, 'section restored');
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
  assert.equal(M.startTotal, 423, 'roll-forward sees it');  // 398 (2026-10-30 PTP-dissolution base) + 25
  const R = MembershipModel.revenueModel(st, M);
  assert.ok(R[0].streams.dues > 0, 'revenue sees it');
});

// ── Task 14a: MM.mergeState — the engine's state merge ─────────────────────
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

// ── Task 14a: MM.valuationHeadline — the figure and its words, once ────────
test('valuationHeadline names a single-method figure correctly', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const v = MembershipModel.valuation(st, R[R.length - 1], null);
  const h = MembershipModel.valuationHeadline(v);

  assert.equal(v.lensCount, 1, 'defaults have only the revenue lens');
  assert.equal(h.value, v.rev, 'the headline IS the live lens, not half of it');
  assert.equal(h.isMidpoint, false);
  assert.equal(h.label, 'INDICATED VALUE');
  assert.match(h.caption, /revenue multiple, single method/);
  // The whole point: it must never be called a midpoint when it is not one.
  assert.notEqual(h.label, 'VALUATION MIDPOINT');
});

test('valuationHeadline reports a real midpoint when two lenses exist', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.valuation.ebitdaMargin = 7.5;        // arbitrary; never the gated figure
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const v = MembershipModel.valuation(st, R[R.length - 1], null);
  const h = MembershipModel.valuationHeadline(v);
  assert.equal(v.lensCount, 2);
  assert.equal(h.isMidpoint, true);
  assert.equal(h.label, 'VALUATION MIDPOINT');
  assert.equal(h.value, v.mid, 'with two lenses the headline is the midpoint');
});

test('valuationHeadline has no value when no lens has a basis', () => {
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.valuation.revMultiple = 0;
  st.valuation.ebitdaMargin = 0;
  st.valuation.ebitdaNormalization = 0;
  const R = MembershipModel.revenueModel(st, MembershipModel.runModel(st));
  const v = MembershipModel.valuation(st, R[R.length - 1], null);
  const h = MembershipModel.valuationHeadline(v);
  assert.equal(h.hasValue, false);
  assert.equal(h.value, null, 'null, never 0 — absence is not a $0 valuation');
  assert.match(h.caption, /no lens has a basis/);
});

// ── stripResidue: the removed text-override layer's leftovers ──────────────
// A placeholder stands in for the sensitive value everywhere below, per SR-11:
// a test describing a banned value must not contain it.
const RESIDUE_MARK = 'PLACEHOLDER-NOT-A-REAL-VALUE';

test('stripResidue removes a top-level copy map and counts it', () => {
  const r = MembershipModel.stripResidue({ copy: { 'a|1': RESIDUE_MARK }, keep: 1 });
  assert.equal('copy' in r.obj, false);
  assert.equal(r.obj.keep, 1);
  assert.equal(r.removed, 1);
});

test('stripResidue reaches copy nested at any depth', () => {
  const r = MembershipModel.stripResidue({ a: { b: { c: { copy: { 'x|9': RESIDUE_MARK } } } } });
  assert.equal('copy' in r.obj.a.b.c, false);
  assert.equal(r.removed, 1);
});

test('stripResidue walks arrays, which is how the scenario store is shaped', () => {
  const store = [
    { id: 's1', name: 'One', copy: { 'r|0': RESIDUE_MARK },
      state: { copy: { 'b|2': RESIDUE_MARK }, revenue: { duesPerLoc: 7 } } },
    { id: 's2', name: 'Two', state: { nested: { copy: { 'c|3': RESIDUE_MARK } } } }
  ];
  const r = MembershipModel.stripResidue(store);
  assert.equal(JSON.stringify(r.obj).includes(RESIDUE_MARK), false);
  assert.equal(r.removed, 3, 'record-level, state-level and deep-nested all counted');
  // Everything that is not the residue survives.
  assert.equal(r.obj.length, 2);
  assert.deepEqual(r.obj.map(x => x.name), ['One', 'Two']);
  assert.equal(r.obj[0].state.revenue.duesPerLoc, 7);
  assert.ok(r.obj[1].state.nested, 'the container of a stripped copy is kept');
});

test('stripResidue keeps unknown keys -- over-stripping would lose user data', () => {
  // mergeState deliberately retains keys this build does not know, and that
  // retention is what let the residue survive. The fix must target one key
  // name, not "anything unfamiliar".
  const r = MembershipModel.stripResidue({ zzzUnknownFutureField: 'KEEP-ME', copy: {} });
  assert.equal(r.obj.zzzUnknownFutureField, 'KEEP-ME');
  assert.equal('copy' in r.obj, false);
});

test('stripResidue reports zero on already-clean input, so no needless rewrite', () => {
  const r = MembershipModel.stripResidue({ revenue: { duesPerLoc: 7 }, list: [{ a: 1 }] });
  assert.equal(r.removed, 0);
});

test('stripResidue removes an empty copy map too', () => {
  // `copy: {}` carries no value but is still a field of a feature that no
  // longer exists; leaving it would keep reporting an unknown field forever.
  assert.equal(MembershipModel.stripResidue({ copy: {} }).removed, 1);
});

test('stripResidue tolerates null, primitives and cycles', () => {
  assert.equal(MembershipModel.stripResidue(null).removed, 0);
  assert.equal(MembershipModel.stripResidue(42).removed, 0);
  const o = { copy: { k: RESIDUE_MARK } };
  o.self = o;                       // a saved object graph should never cycle,
  const r = MembershipModel.stripResidue(o);     // but crashing on one would be worse than
  assert.equal(r.removed, 1);       // the problem it guards.
});

// ── The two findings the first version of these tests could not see ────────
// A review observed that the seven tests above covered the rule but neither
// medium finding: nothing asserted that stripResidue survives a deep graph,
// and nothing asserted the publish boundary. Both are engine-testable; the
// absence was the test design's fault, not the problem's.

test('stripResidue survives a graph deeper than any recursive walk', () => {
  // THE FIRST VERSION OF THIS FUNCTION WAS RECURSIVE AND THIS THREW.
  // A review measured RangeError between 2 000 and 5 000 levels in Chrome,
  // while JSON.parse builds 20 000 levels from a ~120 KB file -- so a saved
  // scenario could carry a graph the strip could not walk. Because the whole
  // scenario list is stripped in ONE call, a single pathological record
  // disabled stripping for every record, and the page then published the lot.
  let root = {}, cur = root;
  for (let i = 0; i < 20000; i++) { cur.next = {}; cur = cur.next; }
  cur.copy = { 'deep|1': RESIDUE_MARK };
  const r = MembershipModel.stripResidue(root);
  assert.equal(r.removed, 1);
  assert.equal(r.failed, 0);
  // Verified by walking ITERATIVELY. The first version of this assertion used
  // JSON.stringify, which is itself recursive, so the test blew the stack
  // while the function under test had already succeeded -- the verification
  // failing in the same way the subject used to.
  let cur2 = r.obj, depth = 0, found = false;
  while (cur2 && typeof cur2 === 'object') {
    if (cur2.copy !== undefined) found = true;
    cur2 = cur2.next; depth++;
  }
  assert.equal(found, false, 'no copy key survives at any depth');
  assert.equal(depth, 20001, 'and the whole chain is intact');
});

test('stripResidue reports a failed delete instead of throwing', () => {
  // `delete` throws in strict mode on a non-configurable property. Reporting
  // success while the key survived would be the wrong-object-reported-as-fixed
  // shape this whole fix exists to close, so the count is separate.
  const frozen = Object.freeze({ copy: { k: RESIDUE_MARK } });
  const r = MembershipModel.stripResidue(frozen);
  assert.equal(r.removed, 0);
  assert.equal(r.failed, 1, 'the caller can fail closed on this');
  assert.ok('copy' in r.obj, 'and it is honest that the key is still there');
});

test('stripResidue never throws, whatever it is handed', () => {
  // The contract the page depends on. Every route that publishes runs
  // downstream of this call, and the page's response to a throw was to hand
  // the unstripped data onward.
  const hostile = [
    null, undefined, 42, 'string', true, [], {},
    { copy: null }, { copy: 'not-an-object' }, { copy: [1, 2] },
    Object.freeze({ copy: {} }),
    Object.create(null),
    { a: Object.freeze({ copy: { k: RESIDUE_MARK } }) }
  ];
  const cyclic = { copy: { k: RESIDUE_MARK } }; cyclic.self = cyclic;
  hostile.push(cyclic);
  // Label by INDEX. The first version built the message with JSON.stringify,
  // which throws on the cyclic case -- so the test failed inside its own
  // failure message while every subject case passed.
  hostile.forEach((h, i) => {
    assert.doesNotThrow(() => MembershipModel.stripResidue(h), 'threw on case ' + i);
  });
});

test('residueVerdict refuses a payload carrying the key', () => {
  // The publish boundary's own check. It tests a KEY NAME, which is why it
  // works where three earlier guards failed: those matched gated VALUES
  // against rendered text, and the page rounds and reformats figures, so a
  // value stored at two decimals and displayed at one defeated all three. A
  // key name is never rounded, reformatted or localised.
  // Tests the function cloudSave ACTUALLY RUNS. An earlier round shipped two
  // exported definitions of this one rule and these tests pointed at the one
  // production did not use -- so the live rule had no coverage at all while the
  // suite read as green. The duplicate is deleted.
  const clean = p => MembershipModel.residueVerdict(p) === 'clean';
  assert.equal(clean({ id: 's1', state: { revenue: { duesPerLoc: 7 } } }), true);
  assert.equal(clean({ id: 's1', state: { copy: { 'a|1': RESIDUE_MARK } } }), false);
  assert.equal(clean({ id: 's1', state: { a: { b: { copy: {} } } } }), false,
    'at any depth');
  assert.equal(clean({ id: 's1', state: { list: [{ copy: {} }] } }), false,
    'inside an array');
  assert.equal(clean('{"state":{"copy":{}}}'), false, 'accepts pre-serialised JSON');
  assert.equal(clean('{"state":{}}'), true);
});

test('residueVerdict fails CLOSED on anything it cannot serialise', () => {
  // A payload that cannot be serialised cannot be checked, and an unverifiable
  // payload must not be published. Returning true here would make one
  // unserialisable field a disclosure.
  const cyc = { id: 's1' }; cyc.self = cyc;
  const clean = p => MembershipModel.residueVerdict(p) === 'clean';
  assert.equal(clean(cyc), false, 'unserialisable');
  // JSON.stringify(undefined) returns undefined rather than throwing, so the
  // catch does not fire. The first version of the guard then called .indexOf
  // on it and THREW -- a guard beaten by its own structure, for the sixth time
  // in this fix. Found by this test.
  assert.equal(clean(undefined), false, 'unverifiable');
  // Not every odd input is unverifiable: a payload that serialises cleanly
  // carries no residue, whatever else is wrong with it. Fail-closed is about
  // what cannot be CHECKED, not about what looks unusual.
  assert.equal(clean(null), true);
});

test('residueVerdict does not reject a value that merely mentions copy', () => {
  // It matches the quoted KEY, not the word, so a scenario legitimately named
  // "Copy of Base" -- or a note containing the word -- still publishes.
  const F = p => MembershipModel.residueVerdict(p) === 'clean';
  assert.equal(F({ id: 's1', name: 'Copy of Base', state: {} }), true);
  assert.equal(F({ id: 's1', state: { notes: 'copy this to the board' } }), true);
  // A quoted occurrence inside a string VALUE is escaped by JSON.stringify, so
  // it cannot be mistaken for a key.
  assert.equal(F({ id: 's1', state: { notes: 'the "copy" button' } }), true);
  // And a value equal to the bare word publishes fine. The first version
  // matched `"copy"` rather than `"copy":` and refused this -- a legitimate
  // scenario note blocked from syncing, found by this test.
  assert.equal(F({ id: 's1', state: { notes: 'copy' } }), true);
});

test('residueVerdict tells a dirty payload from an uncheckable one', () => {
  // Both refuse at the publish boundary, but the remedy differs: a reload
  // strips, so it fixes 'residue'; it cannot change how deeply a record is
  // nested, so it cannot fix 'unverifiable'. Collapsing the two told a reader
  // to reload and retry for a record that was never dirty -- found by a probe,
  // not by reasoning.
  const V = MembershipModel.residueVerdict;
  assert.equal(V({ id: 's1', state: { revenue: { duesPerLoc: 7 } } }), 'clean');
  assert.equal(V({ id: 's1', state: { copy: { 'a|1': RESIDUE_MARK } } }), 'residue');
  const cyc = { id: 's1' }; cyc.self = cyc;
  assert.equal(V(cyc), 'unverifiable');
  assert.equal(V(undefined), 'unverifiable');
  // Anything JSON.stringify refuses is 'unverifiable', NOT 'clean': guessing
  // 'clean' would be the publish boundary trusting what it could not check.
  // BigInt makes stringify throw deterministically in every engine.
  //
  // Not asserted here: the depth at which stringify gives up. That is what
  // motivated this split -- a clean but very deep record was refused in Chrome
  // -- but the limit is engine-specific (Node serialises 20 000 levels where
  // Chrome throws), so pinning a depth would pin a property of the test
  // runner, not of this rule.
  assert.equal(V({ id: 's1', big: 1n }), 'unverifiable');
  // And the structural cases, which are engine-independent:
  const nested = { id: 's1', state: { a: { b: { copy: {} } } } };
  assert.equal(V(nested), 'residue');
  assert.equal(V({ id: 's1', state: { l: [{ copy: {} }] } }), 'residue');
});

// ── The engine revision must stay coupled to what the page expects ─────────
// Reads the page via __dirname, matching this file's existing convention (see
// the SR-11 scans above). The first version used './membership-growth-model/
// index.html', which ENOENTs when the suite is run from the parent directory:
// a review measured 106 pass / 3 fail that way. Loud rather than vacuous, but
// still three tests that pass or fail based on the caller's cwd.
function readPage() {
  const fs = require('node:fs'), path = require('node:path');
  return fs.readFileSync(path.join(__dirname, 'membership-growth-model', 'index.html'), 'utf8');
}

// Requires EXACTLY ONE match in the page, and returns it.
//
// First-match semantics were shadowable: a review block-commented a copy of a
// declaration above a real one, and the test read the commented value -- 109/0
// against a genuine engine skew. `^\s*` anchoring stops `//` comments but not
// the interior lines of a `/* */` block, and this file uses those idiomatically.
//
// Chasing that with a better comment-stripper is the losing move; it was tried
// twice. The invariant that actually matters is that exactly one declaration
// exists, so any second copy -- commented, indented, or live -- fails loudly
// instead of silently winning.
function matchOnce(src, re, what) {
  const all = String(src).match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  assert.ok(all, 'the page must declare ' + what);
  assert.equal(all.length, 1,
    'expected exactly one ' + what + ' in the page, found ' + all.length +
    ' -- a second copy (including one inside a /* */ comment) would shadow this check: ' +
    JSON.stringify(all));
  return String(src).match(re);
}


// A review set ENGINE_REV to 5 and the whole suite still passed: nothing
// referenced it. That is the same gap as the cache-busting query string --
// a number a human must remember to keep in step, with no check. The page
// reads its copy from HTML, so the coupling is asserted across the two files.

// ── The page's own boot probe, EXECUTED against the shipped engine ─────────
//
// This replaces a hand-written mirror of the probe plus a guard on that
// mirror. Both are deleted, and the reason is the more useful artifact of this
// work than either was.
//
// A reviewer traced one habit of mine across five rounds, each a weaker claim
// standing in for a stronger one:
//
//   the strip            -- "works on one input"        for "never throws"
//   the probe of it      -- "exists"                    for "calling it works"
//   the probe's asserts  -- "result has the right fields" for "the merge merged"
//   the mirror test      -- "claims to be the same assertions" for being them
//   the drift guard      -- "one side matches a literal"  for "both sides agree"
//
// Their generalisation: THE PATTERN MIGRATES OUTWARD. Each round it moved one
// layer out -- the strip, then the probe of the strip, then the probe's
// assertions, then the guard on those assertions. Every fix I wrote added a
// layer, and the habit simply moved into the new one.
//
// So this does not add a sixth layer. It removes two, by making the drift
// impossible rather than detected: there is now ONE definition of the probe --
// the page's -- and this test EXECUTES it. Nothing can be mirrored wrongly
// because nothing is mirrored, and no guard on the mirror is needed because
// there is no mirror.
//
// The probe has to live in the page and not the engine, which is why it cannot
// simply be shared as an export: its whole purpose is for CURRENT page code to
// check a possibly STALE engine. An engine carrying its own self-check would
// bring a stale self-check with it and pass itself.
//
// Extraction is by brace counting and fails LOUDLY -- if the page's shape
// changes so the probe cannot be found, this test errors rather than quietly
// testing nothing.
function pageBootProbe() {
  const page = readPage();

  const needs = matchOnce(page, /^\s*const NEEDS = \[[^\]]*\];/m, 'const NEEDS')[0];

  const start = page.indexOf('function problem(e) {');
  assert.ok(start >= 0, "could not find the page's boot probe (function problem)");
  let depth = 0, end = -1;
  for (let i = page.indexOf('{', start); i < page.length; i++) {
    if (page[i] === '{') depth++;
    else if (page[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > start, "could not find the end of the page's boot probe");
  const src = page.slice(start, end);

  // Sanity on the extraction itself, so a silently truncated capture cannot
  // masquerade as a passing probe.
  assert.ok(src.includes('stripResidue') && src.includes('residueVerdict')
            && src.includes('defaultState') && src.includes('mergeState'),
    'the extracted probe does not reference all four engine functions -- ' +
    'extraction is probably truncated: ' + JSON.stringify(src.slice(0, 120)));

  return new Function('MGM_CONFIG', needs + '\n' + src + '\nreturn problem;')(MGM_CONFIG);
}

test("the page's own boot probe accepts the shipped engine", () => {
  // If this fails, every page load shows the error card and refuses to work.
  // It is the whole acceptance test for the engine, run from the page's
  // perspective rather than a description of it.
  assert.equal(pageBootProbe()(MembershipModel), null);
});

// The engine shapes that have actually reached a page during this work, as
// DATA -- because two tests need them: the control below, and the mutation run
// that checks each line of the probe is necessary.
function brokenEngines() {
  const ok = MembershipModel;
  const stub = over => Object.assign({}, ok, over);
  const base = (d, sv) => MembershipModel.mergeState(d, sv);
  // Strips correctly, reports the right count, then nulls exactly one key.
  const nullOnly = where => o => {
    MembershipModel.stripResidue(o);
    if (where === 'top' && o) o.copy = null;
    if (where === 'deep' && o && o.a && o.a.b && o.a.b.c && o.a.b.c.d) o.a.b.c.d.copy = null;
    if (where === 'array' && o && Array.isArray(o.list) && o.list[0]) o.list[0].copy = null;
    return { obj: o, removed: 3, failed: 0 };
  };
  // Strips correctly and puts ONE key back, count intact.
  const putBack = where => o => {
    const r = MembershipModel.stripResidue(o);
    if (where === 'deep' && o && o.a && o.a.b && o.a.b.c && o.a.b.c.d) o.a.b.c.d.copy = {};
    if (where === 'array' && o && Array.isArray(o.list) && o.list[0]) o.list[0].copy = {};
    if (where === 'top' && o) o.copy = {};
    return r;
  };
  return [
    ['absent',            null,                                              'did not load'],
    ['empty object',      {},                                                'loaded but is incomplete or out of date'],
    ['member not a fn',   stub({ mergeState: 'not a function' }),            'loaded but is incomplete or out of date'],
    ['counts, deletes nothing', stub({ stripResidue: o => ({ obj: o, removed: 3, failed: 0 }) }), 'is not working correctly'],
    ['depth-blind',       stub({ stripResidue: o => { if (o && o.copy !== undefined) delete o.copy; return { obj: o, removed: 3, failed: 0 }; } }), 'is not working correctly'],
    ['verdict always clean',   stub({ residueVerdict: () => 'clean' }),      'is not working correctly'],
    ['verdict always residue', stub({ residueVerdict: () => 'residue' }),    'is not working correctly'],
    ['defaultState throws', stub({ defaultState: () => { throw new Error('x'); } }), 'is not working correctly'],
    ['defaultState empty',  stub({ defaultState: () => ({}) }),              'is not working correctly'],
    ['defaultState has no revenue', stub({ defaultState: c => { const d = MembershipModel.defaultState(c); delete d.revenue; return d; } }), 'is not working correctly'],
    ['merge skips its walk', stub({ mergeState: d => ({ state: d, added: [], unknown: [] }) }), 'is not working correctly'],
    ['merge wrong value',  stub({ mergeState: (d, sv) => { const o = base(d, sv); o.state.revenue.duesPerLoc = 999; return o; } }), 'is not working correctly'],
    ['merge drops kept key', stub({ mergeState: (d, sv) => { const o = base(d, sv); delete o.state.zzzProbeKey; return o; } }), 'is not working correctly'],
    ['merge tampers kept key', stub({ mergeState: (d, sv) => { const o = base(d, sv); o.state.zzzProbeKey = 'tampered'; return o; } }), 'is not working correctly'],
    ['merge hides unknowns', stub({ mergeState: (d, sv) => { const o = base(d, sv); o.unknown = []; return o; } }), 'is not working correctly'],
    ['miscounts',          stub({ stripResidue: o => { MembershipModel.stripResidue(o); return { obj: o, removed: 1, failed: 0 }; } }), 'is not working correctly'],
    ['nulls top',          stub({ stripResidue: nullOnly('top') }),          'is not working correctly'],
    ['nulls deep',         stub({ stripResidue: nullOnly('deep') }),         'is not working correctly'],
    ['nulls in array',     stub({ stripResidue: nullOnly('array') }),        'is not working correctly'],
    ['leaves top',         stub({ stripResidue: putBack('top') }),           'is not working correctly'],
    ['leaves deep',        stub({ stripResidue: putBack('deep') }),          'is not working correctly'],
    ['leaves in array',    stub({ stripResidue: putBack('array') }),         'is not working correctly']
  ];
}

test("the page's own boot probe rejects every engine shape that has reached a page", () => {
  const probe = pageBootProbe();
  for (const [name, engine, expected] of brokenEngines()) {
    assert.equal(probe(engine), expected, 'the probe accepted: ' + name);
  }
});

test('every condition in the page probe is necessary -- nothing survives its removal', () => {
  // THE SEVENTH INSTANCE OF ONE HABIT, and the reviewer's own fix for it.
  //
  // The controls above assert `probe(stub) === 'is not working correctly'`.
  // Every failing arm of the probe returns that same string, so those
  // assertions cannot tell WHICH line rejected a stub: necessity held only by
  // construction, and nothing checked the construction. Measured -- adding a
  // catch-all to the probe and then deleting the top, depth or array
  // assertion left the suite green at 109/0 in all three cases.
  //
  // The sequence, as the reviewer traced it:
  //   the strip            "works on one input"       for "never throws"
  //   the probe of it      "exists"                   for "calling it works"
  //   the probe's asserts  "right fields"             for "the merge merged"
  //   the mirror test      "claims to be the same"    for being the same
  //   the drift guard      "one side matches a literal" for "both sides agree"
  //   the controls         "deleting each one fails"  for "each is necessary"
  //   their predicate      "X rejects Y"              for "X is why Y is rejected"
  //
  // Their fix is a change of claim, not another layer: from "X rejects Y" to
  // NOTHING SURVIVES THE REMOVAL OF X -- a property a machine can enumerate
  // and a sentence cannot overstate. "Resists weakening" was never the right
  // claim either; the weakening space is unbounded, so nine hand-written
  // stubs establish "resists these nine" and no more. This is bounded: one
  // mutation operator (delete a condition), applied to every condition, with
  // the surviving set pinned exactly.
  //
  // It is only possible because round 14 made the probe extractable as a
  // string, which is the one thing that round got right.
  const page = readPage();
  const start = page.indexOf('function problem(e) {');
  let depth = 0, end = -1;
  for (let i = page.indexOf('{', start); i < page.length; i++) {
    if (page[i] === '{') depth++;
    else if (page[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const src = page.slice(start, end);
  const needs = matchOnce(page, /^\s*const NEEDS = \[[^\]]*\];/m, 'const NEEDS')[0];
  const build = body => new Function('MGM_CONFIG', needs + '\n' + body + '\nreturn problem;')(MGM_CONFIG);

  // ONE OPERATOR, applied uniformly: replace each condition with `false`, so
  // the arm is disabled without breaking the parse.
  //
  // The first version deleted the condition's LINE, which cannot work for a
  // condition spanning lines -- so three of the thirteen were skipped,
  // unmutated and silently uncovered, and the run reported no survivors while
  // having tested less than it claimed. Skipping is the quiet-coverage-gap
  // shape this PR keeps finding, so the operator changed rather than the skip
  // being merely recorded. Paren counting finds each condition's extent,
  // single-line or not.
  const conditions = [];
  for (let i = 0; i < src.length; i++) {
    if (src.slice(i, i + 3) !== 'if ' && src.slice(i, i + 3) !== 'if(') continue;
    if (i > 0 && /[A-Za-z0-9_$.]/.test(src[i - 1])) continue;
    const open = src.indexOf('(', i);
    if (open < 0) continue;
    let d = 0, close = -1;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '(') d++;
      else if (src[j] === ')') { d--; if (d === 0) { close = j; break; } }
    }
    if (close > open) { conditions.push([open, close]); i = close; }
  }
  assert.ok(conditions.length >= 10,
    'expected to find the probe conditions, found ' + conditions.length +
    ' -- extraction is probably wrong, which would make this test vacuous');

  const shapes = brokenEngines();
  const survivors = [];
  for (const [open, close] of conditions) {
    const text = src.slice(open + 1, close).replace(/\s+/g, ' ').trim();
    let probe;
    try { probe = build(src.slice(0, open + 1) + 'false' + src.slice(close)); }
    catch (e) { survivors.push('UNPARSEABLE: ' + text); continue; }
    // Necessary means: with this condition disabled, at least one
    // known-broken engine is now ACCEPTED, or rejected for the wrong reason.
    const stillCaught = shapes.every(([, engine, expected]) => {
      let got; try { got = probe(engine); } catch (e2) { got = 'threw'; }
      return got === expected;
    });
    if (stillCaught) survivors.push(text);
  }

  // Pinned EXACTLY, not as a subset: a new survivor fails, and so does an
  // entry that stops surviving, so the list cannot go stale in either
  // direction. Each entry needs a reason a reader can act on.
  // Pinned EXACTLY, not as a subset: a new survivor fails, and so does an
  // entry that stops surviving, so the list cannot go stale in either
  // direction. Each entry carries a reason a reader can act on.
  //
  // OPERATOR SET, stated so the claim is bounded rather than implied: one
  // operator -- replace a whole condition with `false` -- applied to all
  // thirteen conditions in the probe. That is condition-level, not
  // clause-level. A reviewer ran a finer set (28 mutants including individual
  // clauses) and found one sub-clause fully shadowed: `typeof d !== 'object'`
  // is unreachable behind the `!d.revenue` and
  // `typeof d.revenue.duesPerLoc !== 'number'` clauses beside it. It is kept
  // as a defensive total check, not because it is load-bearing, and it is
  // recorded here so the difference between the two operator sets is on the
  // page rather than mistaken for coverage.
  const BENIGN_SURVIVORS = [
    // Shape guard on mergeState's return. The three assertions after it read
    // m.state.revenue.duesPerLoc, m.state.zzzProbeKey and m.unknown, so a
    // malformed return throws into the surrounding try and is caught anyway.
    // Kept because it makes the arm total at its own line instead of relying
    // on the next line's shape, which is the kind of implicit dependency this
    // PR has been removing.
    '!m || !m.state || !Array.isArray(m.unknown) || !Array.isArray(m.added)'
  ];
  assert.deepEqual(survivors.sort(), BENIGN_SURVIVORS.slice().sort(),
    'the set of probe conditions whose removal changes nothing has moved.\n' +
    'A NEW entry is a dead or shadowed check -- delete it or strengthen a stub.\n' +
    'A MISSING entry means a condition became necessary -- drop it from the list.\n' +
    'Observed: ' + JSON.stringify(survivors, null, 1));
});

// RESTORED after being deleted by accident in round 14.
//
// That round removed four tests while describing two. Three were genuinely
// subsumed by executing the page's probe; this one was not subsumed by
// anything, because it asserts a property of the PAGE -- that no code reads
// the engine before the guard runs -- and executing `problem()` says nothing
// about where it is called from. With it gone, all four bypass shapes passed
// at 108/0, including the two from round 8 that round 9 was written to fix.
//
// The mistake was mechanical and worth naming: I replaced a RANGE of the file
// by its two endpoints without enumerating what sat between them. A reviewer
// drew the rule out of it -- subtraction needs a subsumption check per deleted
// item: WHICH SURVIVING TEST FAILS IF THIS PROPERTY BREAKS? Three of the four
// had an answer. This one had none, and went out in the same commit.

test('nothing in the page reads the engine before the guard has passed', () => {
  // Asserted structurally, not by position. The guard runs INSIDE the
  // initialiser of `const MM`, so MM does not exist until it has passed: any
  // `MM.anything` above it is a temporal-dead-zone ReferenceError, not a
  // silently dead page.
  //
  // This replaces a test that pinned the order of four literal needles. A
  // review inserted one unrelated engine call above the guard -- a plausible
  // edit -- and that test passed 110/110 while the page rendered 15 buttons
  // and 12 live handlers over an empty model. Pinning one named call is not
  // the property; having no window at all is.
  const page = readPage();
  const m = matchOnce(page, /^const MM = \(function \(\) \{/m, 'the MM binding IIFE');
  const iBind = page.indexOf(m[0]);
  const iThrow = page.indexOf("throw new Error('[MGM] membershipModel.js ' + broken)");
  const iClose = page.indexOf('}());', iBind);
  assert.ok(iThrow > iBind && iThrow < iClose,
    'the guard must throw from INSIDE the MM initialiser, so no code can reach ' +
    'MM before it has passed');
  // And nothing may touch the engine before that point, under EITHER name.
  // A control inserted `MM.mergeState(...)` above the binding and an earlier
  // version of this assertion missed it, because it only looked for
  // `MembershipModel.`. `MM.` above the binding is a temporal-dead-zone
  // ReferenceError -- loud, and it leaves nothing clickable, so not the F1-r5
  // shape -- but it still halts the script and gives a blank page, which is
  // the F1-r4 shape. Both names, then.
  // Scoped to THE SCRIPT BODY and judged per line, because `before` otherwise
  // spans all the HTML and CSS above it.
  const iScript = page.lastIndexOf('<script>', iBind);
  const region = page.slice(iScript + '<script>'.length, iBind);

  // A line is code unless it is a comment. Tracking `/* */` state across lines
  // is the whole of the parsing here -- a review found the previous one-line
  // test both over- and under-firing: a block-comment interior line not
  // starting with `*` counted as code, and a code line starting with `*`
  // counted as a comment.
  //
  // This is not the comment-STRIPPING that was the losing move twice in this
  // work; nothing is rewritten and no match is run against altered text. It
  // only decides, per line, whether the line is a statement.
  // A line is EXEMPT only if it is unambiguously a whole-line comment: it
  // starts with `//`, or we are inside a `/* */` block and the line does not
  // close it. Every other line that mentions a watched name is reported.
  //
  // Deliberately conservative, because the previous version decided ambiguity
  // and decided it wrongly in the dangerous direction: it discarded the entire
  // line when leaving a block comment, so a review got
  // `*/ MembershipModel.defaultState(cfg); /*` past it at 109/0, with the page
  // showing 15 buttons and 12 live handlers over a broken engine.
  //
  // Writing a correct comment tokenizer is not the answer either -- string
  // literals containing `/*` would defeat it, and the under-fire would be back
  // in a subtler form. So: when a line mixes a block-comment delimiter with a
  // watched name, this FAILS rather than guess. A false failure is loud and
  // one line to resolve; a false pass is the dead-buttons page.
  const codeLines = [];
  let inBlock = false;
  for (const line of region.split('\n')) {
    const t = line.trim();
    if (inBlock) {
      if (!t.includes('*/')) continue;        // wholly inside the comment
      inBlock = false;
      codeLines.push(line);                   // closes it: may carry code too
      continue;
    }
    if (!t) continue;
    if (t.startsWith('//')) continue;
    // A line that opens a block and closes it ONCE at the very end carries no
    // code: nothing can follow the close. `/* a */ x /* b */` is excluded by
    // the position test, because its first `*/` is not the last two
    // characters. This is a cost reduction only -- a review noted that round
    // 10 began reporting single-line block comments, which are unambiguous.
    //
    // Except that `${...}` is EVALUATED, so a line inside a template literal
    // is not a comment however it is punctuated. A reviewer got
    // `/* ${MembershipModel.defaultState(MGM_CONFIG)} */` past all three
    // conditions above -- in one line, without `inBlock`, which is a different
    // branch from the gap recorded below and wider than that note described.
    if (t.startsWith('/*') && t.endsWith('*/') && t.indexOf('*/') === t.length - 2
        && !t.includes('${')) {
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      codeLines.push(line);                   // may carry code after the close
      continue;
    }
    codeLines.push(line);
  }

  // KNOWN GAP, left deliberately on a reviewer's recommendation: a template
  // literal whose continuation line begins with `/*` exempts an interpolation
  // BELOW it, via the inBlock branch. Strictly narrower than the shape it
  // replaced, no such construct exists in this region, and chasing it means
  // writing the tokenizer that comment-stripping already proved to be the
  // losing move twice in this work.
  //
  // The first version of this note said "an interpolation below it" and was
  // then read as covering the whole family. It did not: a reviewer reached the
  // same end through a different branch -- one line, no inBlock -- and that
  // one IS fixed above, by excluding `${`. A recorded boundary is only useful
  // if it states its extent, so: this note covers the multi-line inBlock
  // branch and nothing else.

  // THE IDENTIFIER, not a call shape. Earlier versions matched
  // `MembershipModel.` and `MM.` in statement position, and a review got past
  // both with `MembershipModel['defaultState'](…)` and with
  // `const E = MembershipModel; E.defaultState(…)` -- 109/0 each, both
  // reproducing the dead-buttons page. Enumerating call spellings is
  // unwinnable; forbidding the NAME is not.
  const touching = codeLines.filter(l => /\bMembershipModel\b/.test(l));
  assert.deepEqual(touching, [],
    'no code may reference MembershipModel before the binding that guards it ' +
    '-- not by call, by bracket access, or by aliasing it to another name.\n' +
    'This matches the NAME, so a line that merely mentions it in a string or a ' +
    'trailing comment also fails. That is deliberate: enumerating call ' +
    'spellings was bypassed twice. If the line is genuinely harmless, move it ' +
    'below the MM binding -- nothing needs to run before the engine guard.');

  const usingMM = codeLines.filter(l => /\bMM\b/.test(l));
  assert.deepEqual(usingMM, [],
    'nothing may use MM before the binding that guards it -- that is a ' +
    'temporal-dead-zone ReferenceError, which halts the script and gives a ' +
    'blank page with no error card');
});

test('the engine cache-bust is not a date, and the page requests it', () => {
  // Rounds 2 and 3 of this fix shipped on the same calendar day, so a date
  // key could not have separated them even if it had been bumped -- and it
  // was not, leaving Sync dead and silent for anyone holding the old engine.
  // Unique too, closing the review's note that this one was still unanchored:
  // a second <script> tag with a different ?v= would make the check meaningless.
  const page = readPage();
  const m = matchOnce(page, /membershipModel\.js\?v=([^"']+)/,
                      'cache-busted membershipModel.js script tag');
  assert.ok(!/^\d{4}-\d{2}-\d{2}$/.test(m[1]),
    'a bare date cannot separate two revisions shipped the same day: ' + m[1]);
});

// ── A scenario saved BEFORE the blended rate, loaded THROUGH mergeState ────
// This is the path that let two successive designs ship green. Every control I
// wrote started from the shipped config and varied the participation share;
// the golden uses LEGACY_STATE directly and never through a merge. Neither
// exercises the one thing every real user hits: opening a scenario saved
// before the change.

test('a pre-blended scenario loads at the shipped rate, not double or half', () => {
  const preCommit = { revenue: { rewardsPM: 29, duesPerLoc: 362 },
                      participation: { rewards: { pct: 50, rampMonths: 6 } } };
  const ref = MembershipModel.defaultState(MGM_CONFIG);
  const merged = MembershipModel.mergeState(
    MembershipModel.defaultState(MGM_CONFIG), JSON.parse(JSON.stringify(preCommit)));

  const stream = st => {
    const m = MembershipModel.runModel(st);
    return MembershipModel.revenueModel(st, m)[0].streams.rewards;
  };
  const r = stream(merged.state) / stream(ref);

  // The two failures this pins, named so a regression says which it is:
  //   2.00 -- a marker restored from defaults without the rate it qualifies
  //   0.50 -- a rate moved without the share it was paired with
  assert.ok(Math.abs(r - 2) > 0.01, 'rewards DOUBLED on a pre-blended scenario');
  assert.ok(Math.abs(r - 0.5) > 0.01, 'rewards HALVED on a pre-blended scenario');
  assert.ok(Math.abs(r - 1) < 0.001,
    'a pre-blended scenario must open at the shipped calibration; ratio ' + r);

  // And the mechanism, not just the outcome: the saved rate must survive as
  // something nothing reads, and the new field must be REPORTED as filled
  // rather than appearing silently.
  assert.equal(MembershipModel.rewardsRate(merged.state).blended, true);
  assert.equal(MembershipModel.rewardsRate(merged.state).share, 1);
  assert.ok(merged.added.some(a => /rewardsBlendedPM/.test(a)),
    'the added field must be reported to the reader');
  assert.ok(merged.unknown.some(u => /rewardsPM/.test(u)),
    'the superseded rate must be retained and reported');
  // AND THAT IT IS NOT READ -- asserted, not claimed. The previous version put
  // "not read" in the message above while only checking membership in
  // `unknown`, so the half that mattered was unverified and, as a review
  // measured, false. Changing the superseded rate must move nothing while the
  // blended key is present.
  const bumped = JSON.parse(JSON.stringify(merged.state));
  bumped.revenue.rewardsPM = 999;
  const streamOf = st => {
    const m = MembershipModel.runModel(st);
    return MembershipModel.revenueModel(st, m)[0].streams.rewards;
  };
  assert.equal(streamOf(bumped), streamOf(merged.state),
    'the superseded rate is still being read');
});

test('the legacy path still applies a share, and only it does', () => {
  // LEGACY_STATE is the one shape that SHOULD take a participation share: its
  // rate is not blended. Pinned so a future simplification cannot collapse
  // both branches into the blended one and silently change v1 output.
  const L = MembershipModel.LEGACY_STATE;
  assert.equal(MembershipModel.rewardsRate(L).blended, false);
  assert.ok(MembershipModel.rewardsRate(L).share < 1,
    'the legacy shape must still be discounted by participation');
  assert.equal(MembershipModel.rewardsRate(L).rate, L.revenue.rewardsPM);
});

test('effectiveSharePct returns the effective share, not the stored one', () => {
  // NAMED FOR WHAT IT CHECKS. It was called "every display surface ...", and a
  // review measured that reverting a single page call site back to partPct
  // left the suite at 113/0 -- so it verifies the helper, not the surfaces.
  // The surfaces are verified by hand on the live page; this pins the helper
  // they all read.
  // Four surfaces printed partPct raw beside a figure computed without it --
  // a row reading one multiplier next to another multiplier's result, and the
  // same contradiction in the printed report.
  const st = MembershipModel.defaultState(MGM_CONFIG);
  st.participation.rewards.pct = 50;          // stored value, deliberately stale
  assert.equal(MembershipModel.partPct(st, 'rewards'), 50, 'the stored value is 50');
  assert.equal(MembershipModel.effectiveSharePct(st, 'rewards'), 100,
    'but the EFFECTIVE share is 100, and that is what a surface must print');
  // Non-blended programmes are unaffected.
  assert.equal(MembershipModel.effectiveSharePct(st, 'vendor'),
               MembershipModel.partPct(st, 'vendor'));
});

test('an unusable blended rate is an ERROR STATE, never a silent legacy read', () => {
  // The third direction on one quantity. rewardsRate used to take the legacy
  // branch whenever the blended field failed to COERCE, so a cleared input,
  // a corrupt string, {} or NaN all fell through to a superseded rate the
  // shipped config no longer contains -- zeroing the stream with nothing
  // rendered, or reaching 207% of reference when an old rate was still in
  // state. mergeState cannot catch it: '' is PRESENT, so it survives a merge
  // and is not reported in `added`.
  //
  // Shape is decided by KEY PRESENCE now; usability is a separate question
  // whose failure is flagged.
  const ref = MembershipModel.defaultState(MGM_CONFIG);
  const streamOf = st => {
    const m = MembershipModel.runModel(st);
    return MembershipModel.revenueModel(st, m)[0].streams.rewards;
  };
  const refStream = streamOf(ref);

  const UNUSABLE = ['', null, 'abc', {}, [], true, NaN, Infinity, -14];
  for (const v of UNUSABLE) {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.revenue.rewardsPM = 29;             // the superseded rate, still present
    st.participation.rewards.pct = 50;     // and its stale share
    st.revenue.rewardsBlendedPM = v;
    const rr = MembershipModel.rewardsRate(st);
    const label = JSON.stringify(v) === undefined ? String(v) : JSON.stringify(v);

    assert.equal(rr.blended, true, label + ' must stay on the blended branch');
    assert.equal(rr.unset, true, label + ' must be flagged unset');
    assert.equal(rr.rate, null, label + ' must not yield a rate');
    // Contributes nothing -- but as a FLAGGED absence, which is what lets a
    // surface print an em dash rather than a figure of zero.
    assert.equal(streamOf(st), 0, label + ' must contribute nothing');
    assert.ok(Math.abs(streamOf(st) / refStream - 2) > 0.5, label + ' must not double');
  }

  // A boolean and an array are rejected by TYPE, not by coercion: `true`
  // coerced to the rate 1 and `[]` to 0, which the old guard accepted as
  // figures.
  const t1 = MembershipModel.defaultState(MGM_CONFIG);
  t1.revenue.rewardsBlendedPM = true;
  assert.equal(MembershipModel.rewardsRate(t1).rate, null, 'true is not a rate of 1');

  // Key ABSENT is the only route to the legacy branch.
  const legacyShaped = MembershipModel.defaultState(MGM_CONFIG);
  legacyShaped.revenue.rewardsPM = 29;
  // Set to 50 deliberately: the shipped config carries 100, so asserting
  // "share < 1" without setting this was asserting a property of a value I had
  // not controlled -- the assertion passed or failed on the config's default
  // rather than on the branch under test.
  legacyShaped.participation.rewards.pct = 50;
  delete legacyShaped.revenue.rewardsBlendedPM;
  const lr = MembershipModel.rewardsRate(legacyShaped);
  assert.equal(lr.blended, false, 'an absent key is the legacy shape');
  assert.equal(lr.rate, 29);
  assert.equal(lr.share, 0.5, 'and only that shape is participation-discounted');

  // A usable zero is still a DELIBERATE zero, not an absence.
  const z = MembershipModel.defaultState(MGM_CONFIG);
  z.revenue.rewardsBlendedPM = 0;
  assert.equal(MembershipModel.rewardsRate(z).unset, false, '0 is a real figure');
  assert.equal(MembershipModel.rewardsRate(z).rate, 0);
});

test('usableRate validates the PRODUCT, not just the input', () => {
  // A review's 464-case fuzz found 1e308 passing every check here and then
  // `members x rate x 12` overflowing to Infinity, which propagated into the
  // revenue streams. Validating an input is not the same as validating what
  // the model does with it.
  const streamOf = v => {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.revenue.rewardsBlendedPM = v;
    const m = MembershipModel.runModel(st);
    return MembershipModel.revenueModel(st, m)[0].streams.rewards;
  };
  for (const v of [1e308, 1e300, Number.MAX_VALUE, 1e9 + 1]) {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.revenue.rewardsBlendedPM = v;
    assert.equal(MembershipModel.rewardsRate(st).rate, null, v + ' must be rejected');
    assert.equal(MembershipModel.rewardsRate(st).unset, true, v + ' must be flagged');
    assert.ok(isFinite(streamOf(v)), v + ' must not produce a non-finite stream');
  }
  // The ceiling is generous on purpose: a plausible figure must survive it.
  const ok = MembershipModel.defaultState(MGM_CONFIG);
  ok.revenue.rewardsBlendedPM = 1e9;
  assert.equal(MembershipModel.rewardsRate(ok).rate, 1e9, 'the ceiling itself is usable');
  assert.ok(isFinite(streamOf(1e9)));
});

test('whitespace is an absence, not a deliberate zero', () => {
  // Number(' ') is 0, so whitespace arrived as a usable rate of ZERO and
  // printed the deliberate-$0 reading rather than "not supplied" -- the
  // absence-rendered-as-a-business-fact defect this model has corrected
  // repeatedly. Reachable through an import or hand-edited state; the bound
  // input writes null.
  const WS = [' ',                       // space
              String.fromCharCode(9),    // tab
              String.fromCharCode(10),   // newline
              String.fromCharCode(160),  // non-breaking space
              ' ' + String.fromCharCode(9) + ' '];
  for (const v of WS) {
    const st = MembershipModel.defaultState(MGM_CONFIG);
    st.revenue.rewardsBlendedPM = v;
    const rr = MembershipModel.rewardsRate(st);
    assert.equal(rr.rate, null, JSON.stringify(v) + ' must not be a rate of 0');
    assert.equal(rr.unset, true, JSON.stringify(v) + ' must read as absent');
  }
  // A numeric string with padding is still a figure -- trimming must not
  // reject it, which is the whole reason strings are accepted (imports).
  const padded = MembershipModel.defaultState(MGM_CONFIG);
  padded.revenue.rewardsBlendedPM = ' 14 ';
  assert.equal(MembershipModel.rewardsRate(padded).rate, 14);
  assert.equal(MembershipModel.rewardsRate(padded).unset, false);

  // And a real zero stays a real zero.
  const z = MembershipModel.defaultState(MGM_CONFIG);
  z.revenue.rewardsBlendedPM = '0';
  assert.equal(MembershipModel.rewardsRate(z).rate, 0);
  assert.equal(MembershipModel.rewardsRate(z).unset, false, '"0" is a deliberate zero');
});

/* pnlRecalibrationProposal (P&L Import Half B, 2026-10-30).
 *
 * Every figure below is an ARBITRARY test fixture, not a real P&L value --
 * same SR-11 discipline as the rest of this file: a fixture here is as
 * recoverable as a config default, so none of these numbers may ever
 * resemble, or be derivable from, a real gated figure. */

test('pnlRecalibrationProposal derives total / months / active members, per driver', () => {
  const p = MembershipModel.pnlRecalibrationProposal(
    { rewards: 1800, rewardsBreakage: 60000, settlement: -18000 }, {}, 100, 12);
  // Monthly driver: NOT annualized. 1800/12/100 = 1.5.
  near(p.rewardsBlendedPM.exact, 1.5, 'rewards: 1800/12/100');
  // Annual drivers: the monthly run-rate, re-annualized (x12).
  // 60000/12/100 = 50 per month -> x12 = 600/yr.
  near(p.rewardsBreakagePerMember.exact, 600, 'breakage: 60000/12/100 x12');
  // -18000/12/100 = -15 per month -> x12 = -180/yr (net negative).
  near(p.settlementNetPerMember.exact, -180, 'settlement: -18000/12/100 x12');
});

test('pnlRecalibrationProposal: the /yr drivers are the monthly run-rate re-annualized (x12); the /mo driver is not', () => {
  // Checked against the relationship itself, for TWO different period
  // lengths, rather than a single months=12 case -- months=12 is exactly
  // where a MISSING x12 would still coincidentally look plausible if this
  // test instead hardcoded one magic expected number per driver. Caught
  // live during manual verification, not by this file originally: the
  // implementation first divided every driver by `months` with no
  // re-annualization step for the two /yr drivers, which is invisible at
  // months=12 in a naive total/months/basis-only check and wrong at any
  // other period length.
  [12, 9].forEach(months => {
    const p = MembershipModel.pnlRecalibrationProposal(
      { rewards: 1800, rewardsBreakage: 60000, settlement: -18000 }, {}, 100, months);
    const perMonthRewards = 1800 / months / 100;
    const perMonthBreakage = 60000 / months / 100;
    const perMonthSettlement = -18000 / months / 100;
    near(p.rewardsBlendedPM.exact, perMonthRewards,
      `months=${months}: $/member/mo driver must equal the monthly run-rate, not x12 of it`);
    near(p.rewardsBreakagePerMember.exact, perMonthBreakage * 12,
      `months=${months}: $/member/yr driver must be the monthly run-rate x12`);
    near(p.settlementNetPerMember.exact, perMonthSettlement * 12,
      `months=${months}: $/member/yr driver must be the monthly run-rate x12`);
  });
});

test('pnlRecalibrationProposal rounds each driver to its own equivalent-protection step', () => {
  const p = MembershipModel.pnlRecalibrationProposal(
    { rewards: 1810, rewardsBreakage: 60300, settlement: -18130 }, {}, 100, 12);
  // 1810/12/100 = 1.508333... -> nearest $2 is 2.
  assert.equal(p.rewardsBlendedPM.proposed, 2);
  // 60300/12/100 = 50.25/mo -> x12 = 603/yr -> nearest $25 is 600.
  assert.equal(p.rewardsBreakagePerMember.proposed, 600);
  // -18130/12/100 = -15.1083.../mo -> x12 = -181.3/yr -> nearest $25 is -175
  // (rounds toward the nearer multiple on the negative side too, not toward
  // zero: -181.3 is 6.3 from -175 and 18.7 from -200).
  assert.equal(p.settlementNetPerMember.proposed, -175);
});

test('pnlRecalibrationProposal flags a proposal that lands too close to its own exact figure', () => {
  // Exact lands EXACTLY on a $25 multiple -- rounding moves it by zero,
  // which is the "provides no real protection" case this flag exists for.
  // 60000/12/100 = 50/mo -> x12 = 600/yr, already an exact multiple of 25.
  const onBoundary = MembershipModel.pnlRecalibrationProposal(
    { rewardsBreakage: 60000 }, {}, 100, 12);
  assert.equal(onBoundary.rewardsBreakagePerMember.exact, 600);
  assert.equal(onBoundary.rewardsBreakagePerMember.proposed, 600);
  assert.equal(onBoundary.rewardsBreakagePerMember.flagged, true,
    'exact already a round $25 multiple -- rounding provided zero distance');

  // Exact sits mid-step ($12.50 away from each neighbour) -- the maximum
  // possible protection for a $25 step, nowhere near the flag threshold.
  // Needs perMonth*12 ≡ 12.5 (mod 25); perMonth = 51.041666... -> total =
  // 51.041666 * 100 * 12 = 61250.
  const midStep = MembershipModel.pnlRecalibrationProposal(
    { rewardsBreakage: 61250 }, {}, 100, 12);
  near(midStep.rewardsBreakagePerMember.exact, 612.5, 'exact mid-step (annualized)');
  assert.equal(midStep.rewardsBreakagePerMember.flagged, false,
    'rounding moved it by the maximum possible $12.50 -- not a collision risk');
});

test('pnlRecalibrationProposal: no loaded P&L period means no proposal, not a zero', () => {
  const p = MembershipModel.pnlRecalibrationProposal(null, {}, 100, 12);
  ['rewardsBlendedPM', 'rewardsBreakagePerMember', 'settlementNetPerMember'].forEach(k => {
    assert.equal(p[k].exact, null, k + '.exact must be null, not 0, with nothing loaded');
    assert.equal(p[k].proposed, null, k + '.proposed must be null, not 0');
    assert.equal(p[k].flagged, false);
  });
});

test('pnlRecalibrationProposal: a stream explicitly reported as the real zero still proposes zero, not null', () => {
  // The P&L genuinely reporting $0 for a stream is a figure, not an absence
  // -- same "whitespace is an absence, a real zero is not" discipline as
  // rewardsRate above. 0/12/100 = 0 exactly; 0 rounded to any step is 0.
  const p = MembershipModel.pnlRecalibrationProposal({ rewardsBreakage: 0 }, {}, 100, 12);
  assert.equal(p.rewardsBreakagePerMember.exact, 0);
  assert.equal(p.rewardsBreakagePerMember.proposed, 0);
});

test('pnlRecalibrationProposal: zero active members cannot produce a proposal (no division by zero)', () => {
  const p = MembershipModel.pnlRecalibrationProposal({ rewards: 1800 }, {}, 0, 12);
  assert.equal(p.rewardsBlendedPM.exact, null, 'zero members: no basis to derive a per-member rate from');
  assert.equal(p.rewardsBlendedPM.proposed, null);
});

test('pnlRecalibrationProposal: duesPerLoc tracks billing.duesPerLocBillableExclCStores directly, with no rounding step and no collision flag', () => {
  // duesPerLoc is NOT P&L-sourced -- see the function's own comment -- so it
  // is never flagged, regardless of how closely it lands on a round number.
  const p = MembershipModel.pnlRecalibrationProposal(
    null, { duesPerLocBillableExclCStores: 400.004 }, 100, 12);
  assert.equal(p.duesPerLoc.proposed, 400, 'rounds to the cent, same precision the field already has');
  assert.equal(p.duesPerLoc.exact, 400);
  assert.equal(p.duesPerLoc.flagged, false);

  const missing = MembershipModel.pnlRecalibrationProposal(null, {}, 100, 12);
  assert.equal(missing.duesPerLoc.proposed, null, 'no billing figure -- no proposal, not a zero');
});

test('pnlRecalibrationProposal: every path matches the field it would write on apply', () => {
  const p = MembershipModel.pnlRecalibrationProposal(
    { rewards: 1800, rewardsBreakage: 60000, settlement: -18000 },
    { duesPerLocBillableExclCStores: 400 }, 100, 12);
  assert.equal(p.duesPerLoc.path, 'revenue.duesPerLoc');
  assert.equal(p.rewardsBlendedPM.path, 'revenue.rewardsBlendedPM');
  assert.equal(p.rewardsBreakagePerMember.path, 'revenue.rewardsBreakagePerMember');
  assert.equal(p.settlementNetPerMember.path, 'revenue.settlementNetPerMember');
});

/* sanitizeHiddenSections (card hide/show feature).
 *
 * hiddenSections lives in MGM.uiPrefs, never in MGM.state, so it never
 * reaches mergeState, resetAll, importJSON, scenarioLoad or pullScenarios --
 * there is no merge path for this function to defend against by design. It
 * is tested as rigorously as rewardsRate's two value-space bugs above
 * anyway, because it is the ONE place untrusted network data (a row read
 * back from mgm_ui_prefs) turns into a value this page stores and feeds to
 * document.getElementById(id) / el.style.display -- and a sanitiser with an
 * untested edge is a bug with better PR. */

test('sanitizeHiddenSections: known ids pass through, unknown ids are dropped', () => {
  const allow = ['a', 'b', 'c'];
  assert.deepEqual(
    MembershipModel.sanitizeHiddenSections({ a: true, zzz: true }, allow),
    { a: true });
  assert.deepEqual(
    MembershipModel.sanitizeHiddenSections({ a: true, b: true, c: true }, allow),
    { a: true, b: true, c: true });
});

test('sanitizeHiddenSections: a falsey value is absent, never stored as false', () => {
  const allow = ['a', 'b', 'c', 'd', 'e'];
  const out = MembershipModel.sanitizeHiddenSections(
    { a: false, b: 0, c: '', d: null, e: undefined }, allow);
  assert.deepEqual(out, {}, 'no key should survive with a falsey value');
  assert.equal('a' in out, false,
    'a falsey key must be absent, not present with value false. Same absence-vs-' +
    'deliberate-value distinction as rewardsRate.unset: restoring a card deletes ' +
    'the key, it never sets it to false.');
});

test('sanitizeHiddenSections: every output value is the literal true', () => {
  const allow = ['a', 'b', 'c', 'd'];
  const out = MembershipModel.sanitizeHiddenSections(
    { a: 1, b: 'yes', c: [1, 2], d: { nested: true } }, allow);
  for (const k of Object.keys(out)) {
    assert.equal(out[k], true,
      k + ' must coerce to the literal boolean true. A stored object or string ' +
      'here is the copy-residue shape one level down.');
  }
});

test('sanitizeHiddenSections: non-object top-level input fails closed to {}', () => {
  const allow = ['a', 'b'];
  const bad = [null, undefined, 'a string', 42, true, false,
               ['a', 'b'], [], NaN, function () {}];
  for (const v of bad) {
    assert.deepEqual(MembershipModel.sanitizeHiddenSections(v, allow), {},
      'input of type ' + typeof v + ' must fail closed, never throw');
  }
});

test('sanitizeHiddenSections: an empty or absent allowlist drops everything', () => {
  assert.deepEqual(MembershipModel.sanitizeHiddenSections({ a: true }, []), {});
  assert.deepEqual(MembershipModel.sanitizeHiddenSections({ a: true }, null), {});
  assert.deepEqual(MembershipModel.sanitizeHiddenSections({ a: true }, undefined), {});
});

test('sanitizeHiddenSections: idempotent, sanitizing twice equals sanitizing once', () => {
  const allow = ['a', 'b', 'c'];
  const inputs = [{ a: true }, { a: true, b: false, zzz: true }, {}, { a: 1, b: 0, c: 'x' }];
  for (const inp of inputs) {
    const once = MembershipModel.sanitizeHiddenSections(inp, allow);
    const twice = MembershipModel.sanitizeHiddenSections(once, allow);
    assert.deepEqual(twice, once,
      'a second pass must not change an already-clean map -- the client re-sanitizes ' +
      'its own optimistic merge before every write, so this has to hold');
  }
});

test('sanitizeHiddenSections: Object property names are ordinary ids, never read through the prototype chain', () => {
  // Built with JSON.parse, the realistic shape for a row read back from
  // Supabase, not an object literal -- {__proto__: true} as a LITERAL sets
  // the prototype instead of an own key and would test something else.
  const raw = JSON.parse('{"__proto__":true,"constructor":true,"toString":true,"hasOwnProperty":true}');
  // None of these four names are on the allowlist. The failure this guards
  // against is not "wrong map", it is "throws", or "constructor/toString/
  // hasOwnProperty read as present because they exist on every bare object" --
  // which a bare `k in allow` lookup would have done.
  assert.deepEqual(MembershipModel.sanitizeHiddenSections(raw, ['real-card-a']), {});
  const raw2 = JSON.parse('{"__proto__":true,"real-card-a":true}');
  assert.deepEqual(MembershipModel.sanitizeHiddenSections(raw2, ['real-card-a']),
    { 'real-card-a': true });
});

test('sanitizeHiddenSections: fuzz -- output keys subset the allowlist, output values are always true, never throws', () => {
  const ALLOW = ['card-a', 'card-b', 'card-c', 'card-d', 'card-e'];
  const KEY_POOL = ALLOW.concat([
    'unknown-1', 'unknown-2', '__proto__', 'constructor', 'toString', 'hasOwnProperty',
    '', '0', 'card-a.extra']);
  const VALUE_POOL = [
    true, false, 1, 0, -1, '', 'x', null, undefined, NaN, Infinity, -Infinity,
    [], [1], {}, { a: 1 }, 'true', 'false', '1', '0'];
  const pick = (arr, seed) => arr[seed % arr.length];

  let cases = 0;
  for (let seed = 0; seed < 500; seed++) {
    const obj = {};
    const nKeys = seed % 6;
    for (let i = 0; i < nKeys; i++) {
      obj[pick(KEY_POOL, seed * 7 + i * 13)] = pick(VALUE_POOL, seed * 11 + i * 17);
    }
    cases++;
    let out;
    try {
      out = MembershipModel.sanitizeHiddenSections(obj, ALLOW);
    } catch (e) {
      assert.fail('must never throw; threw ' + e.message + ' on ' + JSON.stringify(obj));
    }
    assert.equal(typeof out, 'object');
    for (const k of Object.keys(out)) {
      assert.ok(ALLOW.includes(k), 'output key "' + k + '" is not on the allowlist');
      assert.equal(out[k], true, 'output value for "' + k + '" must be literal true');
    }
  }
  assert.equal(cases, 500);
});

// ── Negative controls: each must FAIL if the fix it names is undone ──

test('CONTROL: an unrecognised key must never survive sanitizeHiddenSections', () => {
  const out = MembershipModel.sanitizeHiddenSections({ 'not-on-list': true }, ['something-else']);
  assert.deepEqual(out, {},
    'if this fails, the allowlist filter has been removed or bypassed -- e.g. ' +
    'reverted from hasOwnProperty back to a bare `k in allow` lookup');
});

test('CONTROL: the stored value must be the coerced boolean, not the raw input', () => {
  const out = MembershipModel.sanitizeHiddenSections({ a: 'yes-but-a-string' }, ['a']);
  assert.notEqual(out.a, 'yes-but-a-string',
    'if this fails, the !! -style coercion has been removed and a free-text value ' +
    'can be stored under an allowlisted key');
  assert.equal(out.a, true);
});
