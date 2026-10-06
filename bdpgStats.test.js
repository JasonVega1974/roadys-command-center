'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BDPG_STATS } = require('./bdpgStats.js');
const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');

const TABLE = BDPG_CONFIG.BASELINE_TABLE;

// ── quantile / median ───────────────────────────────────────────────────────

test('median of an odd-length sample is the middle value', () => {
  assert.equal(BDPG_STATS.median([5, 1, 3]), 3);
});

test('median of an even-length sample is the mean of the two middle values', () => {
  assert.equal(BDPG_STATS.median([1, 2, 3, 4]), 2.5);
});

test('median of a single value is that value', () => {
  assert.equal(BDPG_STATS.median([7]), 7);
});

test('median of an empty sample is null, never 0', () => {
  // A 0 here would render as a measured baseline of zero gallons.
  assert.equal(BDPG_STATS.median([]), null);
  assert.equal(BDPG_STATS.median(null), null);
});

test('quantile uses R-7 linear interpolation', () => {
  // [1,2,3,4]: h = 3 * 0.25 = 0.75 -> 1 + 0.75*(2-1) = 1.75
  assert.equal(BDPG_STATS.quantile([1, 2, 3, 4], 0.25), 1.75);
  // h = 3 * 0.75 = 2.25 -> 3 + 0.25*(4-3) = 3.25
  assert.equal(BDPG_STATS.quantile([1, 2, 3, 4], 0.75), 3.25);
});

test('quantile hits exact order statistics when h lands on an index', () => {
  assert.equal(BDPG_STATS.quantile([10, 20, 30, 40, 50], 0.25), 20);
  assert.equal(BDPG_STATS.quantile([10, 20, 30, 40, 50], 0.75), 40);
});

test('quantile p=0 and p=1 are min and max', () => {
  assert.equal(BDPG_STATS.quantile([4, 9, 1], 0), 1);
  assert.equal(BDPG_STATS.quantile([4, 9, 1], 1), 9);
});

test('non-finite values are dropped, not coerced to zero', () => {
  // A missing gallon figure must not pull the median toward zero.
  assert.equal(BDPG_STATS.median([10, null, 20, undefined, 'x', NaN, 30]), 20);
  assert.deepEqual(BDPG_STATS.sortedNumeric([3, 'a', 1, null, 2]), [1, 2, 3]);
});

test('numeric strings are accepted', () => {
  assert.equal(BDPG_STATS.median(['10', '30', '20']), 20);
});

test('sortedNumeric sorts numerically, not lexicographically', () => {
  assert.deepEqual(BDPG_STATS.sortedNumeric([9, 10, 100, 2]), [2, 9, 10, 100]);
});

// ── size from lanes ─────────────────────────────────────────────────────────

// reportingMonths: 12 by default -- a fixture has to CLEAR the months half
// of the qualifying rule, or every test written about the gallons half
// would quietly be testing the months half instead. Tests about months set
// it explicitly.
const loc = (o) => Object.assign(
  { id: 'R1', type: 'Truck Stop', roadway: 'Highway', dieselLanes: 5,
    avgGalMo: 8000, reportingMonths: 12 }, o);

test('size tiers: Small 1-3, Medium 4-6, Large 7+', () => {
  const S = (n) => BDPG_STATS.sizeForLanes(n, 'Highway');
  assert.equal(S(1), 'Small'); assert.equal(S(3), 'Small');
  assert.equal(S(4), 'Medium'); assert.equal(S(6), 'Medium');
  assert.equal(S(7), 'Large'); assert.equal(S(40), 'Large');
});

test('Backroad is Small up to 4 lanes and has nothing above it', () => {
  const B = (n) => BDPG_STATS.sizeForLanes(n, 'Backroad');
  [1, 2, 3, 4].forEach((n) => assert.equal(B(n), 'Small', String(n)));
  assert.equal(B(5), 'over');
  assert.equal(B(12), 'over');
  assert.equal(BDPG_STATS.BACKROAD_MAX_LANES, 4);
});

test('a 4-lane Backroad is Small while a 4-lane Highway is Medium', () => {
  // The exception in one assertion: the same lane count, two sizes.
  assert.equal(BDPG_STATS.sizeForLanes(4, 'Backroad'), 'Small');
  assert.equal(BDPG_STATS.sizeForLanes(4, 'Highway'), 'Medium');
  assert.equal(BDPG_STATS.sizeForLanes(4, 'Interstate'), 'Medium');
});

test('an unusable lane count has no size', () => {
  [null, undefined, '', 0, -2, 'x', {}].forEach((v) => {
    assert.equal(BDPG_STATS.sizeForLanes(v, 'Highway'), null, JSON.stringify(v));
  });
});

// ── profile matching ────────────────────────────────────────────────────────

test('lanes and roadway are independent: a 4-lane Interstate is Medium/Interstate', () => {
  // Under the old rigid pairing this was a "lane-conflict". It is a profile.
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ roadway: 'Interstate', dieselLanes: 4 }), TABLE);
  assert.equal(m.status, 'ok');
  assert.equal(m.row.profile, 'Medium truck stop');
  assert.equal(m.row.roadway, 'Interstate');
});

test('every size maps on every non-Backroad roadway', () => {
  [['Highway', 2, 'Small'], ['Highway', 5, 'Medium'], ['Highway', 9, 'Large'],
    ['Interstate', 2, 'Small'], ['Interstate', 5, 'Medium'], ['Interstate', 9, 'Large']]
    .forEach((c) => {
      const m = BDPG_STATS.matchBaselineProfile(loc({ roadway: c[0], dieselLanes: c[1] }), TABLE);
      assert.equal(m.status, 'ok', c.join('/'));
      assert.equal(m.row.profile, c[2] + ' truck stop', c.join('/'));
    });
});

test('a Backroad with 5+ lanes is flagged for review, not forced into Small', () => {
  const m = BDPG_STATS.matchBaselineProfile(loc({ roadway: 'Backroad', dieselLanes: 6 }), TABLE);
  assert.equal(m.status, 'backroad-over');
  assert.equal(m.lanes, 6);
  assert.equal(m.row, null);
});

test('a truck stop needs a roadway and a lane count', () => {
  assert.equal(BDPG_STATS.matchBaselineProfile(loc({ roadway: '' }), TABLE).status, 'need-roadway');
  assert.equal(BDPG_STATS.matchBaselineProfile(loc({ dieselLanes: null }), TABLE).status, 'need-lanes');
});

test('a fuel stop maps on Type alone, whatever its lanes or roadway', () => {
  [[null, ''], [20, 'Interstate'], [1, 'Backroad']].forEach((c) => {
    const m = BDPG_STATS.matchBaselineProfile(
      loc({ type: 'Fuel Stop', dieselLanes: c[0], roadway: c[1] }), TABLE);
    assert.equal(m.status, 'ok', JSON.stringify(c));
    assert.equal(m.row.profile, 'Fuel stop');
  });
});

test('Truck Stop / Service Center maps as a truck stop; PPO and Service Center do not', () => {
  assert.equal(BDPG_STATS.matchBaselineProfile(
    loc({ type: 'Truck Stop / Service Center' }), TABLE).status, 'ok');
  ['PPO', 'Service Center', 'C-Store'].forEach((t) => {
    assert.equal(BDPG_STATS.matchBaselineProfile(loc({ type: t }), TABLE).status,
      'not-applicable', t);
  });
});

test('the ignored `size` field on a location cannot change its profile', () => {
  // Size is derived, so a stale or wrong value in the file is inert.
  const a = BDPG_STATS.matchBaselineProfile(loc({ dieselLanes: 5, size: 'Large' }), TABLE);
  assert.equal(a.row.profile, 'Medium truck stop');
});

// ── profile baselines ───────────────────────────────────────────────────────

const many = (n, o) => Array.from({ length: n }, (_, i) => loc(Object.assign({ id: 'R' + i }, o)));

test('a profile baseline is the median of its reporting locations', () => {
  const locs = [loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: 8000 }),
    loc({ id: 'c', avgGalMo: 30000 })];
  const b = BDPG_STATS.profileBaselines(locs, TABLE);
  const k = BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway');
  assert.equal(b[k].n, 3);
  assert.equal(b[k].median, 8000);
  assert.equal(b[k].baseline, 8000);
  assert.equal(b[k].source, 'network');
});

test('median not mean: one very large site must not drag the baseline', () => {
  const locs = [loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: 5000 }),
    loc({ id: 'c', avgGalMo: 6000 }), loc({ id: 'd', avgGalMo: 200000 })];
  const k = BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway');
  const b = BDPG_STATS.profileBaselines(locs, TABLE)[k];
  const mean = (4000 + 5000 + 6000 + 200000) / 4;
  assert.equal(b.baseline, 5500);
  assert.ok(b.baseline < mean / 9, 'the mean would be ' + Math.round(mean));
});

test('fewer than three reporting locations falls back to the static table', () => {
  const locs = [loc({ id: 'a', avgGalMo: 40000 }), loc({ id: 'b', avgGalMo: 50000 })];
  const k = BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway');
  const b = BDPG_STATS.profileBaselines(locs, TABLE)[k];
  // Read from the table rather than restated: this test is about the
  // fallback MECHANISM, and hardcoding the figure made it fail every time a
  // median was recomputed, which says nothing about whether the fallback works.
  const fromTable = TABLE.find(
    (r) => r.profile === 'Medium truck stop' && r.roadway === 'Highway').baseline;
  assert.equal(b.n, 2);
  assert.equal(b.source, 'static');
  assert.equal(b.baseline, fromTable);
  assert.equal(b.median, 45000, 'the observed median is still reported');
});

test('total counts every location in the profile, reporting or not', () => {
  const locs = [loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: null }),
    loc({ id: 'c', avgGalMo: 3 })];
  const k = BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway');
  const b = BDPG_STATS.profileBaselines(locs, TABLE)[k];
  assert.equal(b.total, 3, 'the Step 1 card count includes non-reporting sites');
  assert.equal(b.n, 1, 'only one clears the floor');
});

test('profileBaselines returns an entry for every BASELINE_TABLE row', () => {
  const b = BDPG_STATS.profileBaselines([], TABLE);
  assert.equal(Object.keys(b).length, TABLE.length);
  TABLE.forEach((r) => {
    const x = b[BDPG_STATS.baselineKeyFor(r.profile, r.roadway)];
    assert.equal(x.baseline, r.baseline);
    assert.equal(x.source, 'static');
  });
});

// ── like-for-like region delta ──────────────────────────────────────────────

const RR = (st) => ({ OH: 'Midwest', TX: 'Texas' }[st] || null);

test('region delta compares each location against its own profile median', () => {
  // Two profiles, one region. A location at twice its own profile's median
  // and one at half: the region delta is the median of the ratios, not of
  // the gallons, so the two profiles' different scales cancel.
  const locs = [
    loc({ id: 'm1', state: 'OH', roadway: 'Highway', dieselLanes: 5, avgGalMo: 5000 }),
    loc({ id: 'm2', state: 'OH', roadway: 'Highway', dieselLanes: 5, avgGalMo: 10000 }),
    loc({ id: 'm3', state: 'OH', roadway: 'Highway', dieselLanes: 5, avgGalMo: 20000 }),
    loc({ id: 'l1', state: 'OH', roadway: 'Interstate', dieselLanes: 9, avgGalMo: 50000 }),
    loc({ id: 'l2', state: 'OH', roadway: 'Interstate', dieselLanes: 9, avgGalMo: 100000 }),
    loc({ id: 'l3', state: 'OH', roadway: 'Interstate', dieselLanes: 9, avgGalMo: 200000 })
  ];
  const d = BDPG_STATS.regionDeltas(locs, TABLE, RR);
  // Each profile's median is its own middle value, so the ratios are
  // 0.5, 1, 2 twice over -> median ratio 1 -> delta 0.
  assert.equal(d.Midwest.n, 6);
  assert.equal(d.Midwest.pct, 0);
});

test('a region of uniformly strong sites reads positive', () => {
  const locs = [
    loc({ id: 'a', state: 'OH', avgGalMo: 10000 }), loc({ id: 'b', state: 'OH', avgGalMo: 10000 }),
    loc({ id: 'c', state: 'OH', avgGalMo: 10000 }),
    loc({ id: 'd', state: 'TX', avgGalMo: 20000 }), loc({ id: 'e', state: 'TX', avgGalMo: 20000 }),
    loc({ id: 'f', state: 'TX', avgGalMo: 20000 })
  ];
  const d = BDPG_STATS.regionDeltas(locs, TABLE, RR);
  // Profile median across all six is 15,000.
  assert.equal(Math.round(d.Midwest.delta * 1000) / 1000, -0.333);
  assert.equal(Math.round(d.Texas.delta * 1000) / 1000, 0.333);
});

test('non-reporting locations are excluded from the region delta', () => {
  const locs = [
    loc({ id: 'a', state: 'OH', avgGalMo: 9000 }), loc({ id: 'b', state: 'OH', avgGalMo: 9000 }),
    loc({ id: 'c', state: 'OH', avgGalMo: 9000 }), loc({ id: 'z', state: 'OH', avgGalMo: 1 })
  ];
  assert.equal(BDPG_STATS.regionDeltas(locs, TABLE, RR).Midwest.n, 3);
});

test('the thin-region threshold is 8', () => {
  assert.equal(BDPG_STATS.REGION_THIN_N, 8);
});

// ── per-region displayed median ─────────────────────────────────────────────

test('a region average is the median of its reporting locations, with its n', () => {
  const locs = [
    loc({ id: 'a', state: 'OH', avgGalMo: 4000 }),
    loc({ id: 'b', state: 'OH', avgGalMo: 6000 }),
    loc({ id: 'c', state: 'OH', avgGalMo: 11000 }),
    loc({ id: 'd', state: 'TX', avgGalMo: 9000 })
  ];
  const a = BDPG_STATS.regionAverages(locs, RR);
  assert.equal(a.Midwest.median, 6000);
  assert.equal(a.Midwest.n, 3);
  assert.equal(a.Texas.median, 9000);
  assert.equal(a.Texas.n, 1);
});

test('one very large site cannot set a region figure', () => {
  // The whole reason this is a median. On the real file Southeast's mean is
  // 15,740 against a median of 5,985 -- the mean describes a region almost
  // none of its locations resemble.
  const locs = [
    loc({ id: 'a', state: 'OH', avgGalMo: 5000 }),
    loc({ id: 'b', state: 'OH', avgGalMo: 6000 }),
    loc({ id: 'c', state: 'OH', avgGalMo: 7000 }),
    loc({ id: 'd', state: 'OH', avgGalMo: 400000 })
  ];
  const a = BDPG_STATS.regionAverages(locs, RR);
  const mean = (5000 + 6000 + 7000 + 400000) / 4;
  assert.equal(a.Midwest.median, 6500);
  assert.ok(a.Midwest.median < mean / 15, 'the mean would be ' + Math.round(mean));
});

test('non-reporting and unplaceable locations are left out of the region figure', () => {
  const locs = [
    loc({ id: 'a', state: 'OH', avgGalMo: 8000 }),
    loc({ id: 'b', state: 'OH', avgGalMo: 8000 }),
    loc({ id: 'z', state: 'OH', avgGalMo: 10 }),      // under the floor
    loc({ id: 'y', state: 'OH', avgGalMo: null }),    // no figure
    loc({ id: 'x', state: 'ZZ', avgGalMo: 8000 })     // no region
  ];
  const a = BDPG_STATS.regionAverages(locs, RR);
  assert.equal(a.Midwest.n, 2);
  assert.equal(Object.keys(a).length, 1);
});

test('the region figure counts every type, unlike the like-for-like delta', () => {
  // regionAverages() asks "what does a location here pump?" -- a fuel stop
  // counts. regionDeltas() asks "does this region beat its own profile mix?"
  // and needs a profile to compare against. Same file, different questions.
  const locs = [
    loc({ id: 'a', state: 'OH', type: 'Fuel Stop', dieselLanes: null, roadway: '', avgGalMo: 3000 }),
    loc({ id: 'b', state: 'OH', avgGalMo: 9000 }),
    loc({ id: 'c', state: 'OH', avgGalMo: 9000 })
  ];
  assert.equal(BDPG_STATS.regionAverages(locs, RR).Midwest.n, 3);
});

test('an empty or regionless file yields no region figures at all', () => {
  assert.deepEqual(BDPG_STATS.regionAverages([], RR), {});
  assert.deepEqual(BDPG_STATS.regionAverages(null, RR), {});
});

test('the committed file gives every region a usable median and a real count', () => {
  // The fallback path in effectiveNetworkAverage() exists for a region the
  // file cannot speak for. Today none is in that state -- if this fails, a
  // region has gone thin and the results page is quietly showing a mean from
  // the retired report beside medians everywhere else.
  const locs = require('./network-locations.json').locations;
  const { BusDevGallonsCalc: Calc } = require('./busDevGallonsCalculator.js');
  const a = BDPG_STATS.regionAverages(locs, Calc.resolveRegion);
  const expect = { Northwest: [9173, 19], West: [10612, 6], Southwest: [7871, 12],
    Texas: [9423, 9], 'Upper Midwest': [6226, 26], Midwest: [16102, 31],
    Northeast: [15307, 7], Southeast: [7658, 42] };
  Object.keys(expect).forEach((reg) => {
    assert.equal(a[reg].median, expect[reg][0], reg + ' median');
    assert.equal(a[reg].n, expect[reg][1], reg + ' n');
    assert.ok(a[reg].n >= BDPG_STATS.DYNAMIC_BASELINE_MIN_N, reg + ' must not need the fallback');
  });
  assert.equal(Object.values(a).reduce((s, x) => s + x.n, 0), 152);
});

// ── completeness under the new statuses ─────────────────────────────────────

test('completeness separates backroad-over from incomplete-but-fixable', () => {
  const locs = [
    loc({ id: '1', avgGalMo: 9000 }),
    loc({ id: '2', type: 'PPO' }),
    loc({ id: '3', roadway: '' }),
    loc({ id: '4', dieselLanes: null }),
    loc({ id: '5', roadway: 'Backroad', dieselLanes: 7 })
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.total, 5);
  assert.equal(c.complete, 1);
  assert.equal(c.notApplicable, 1);
  assert.equal(c.needRoadway, 1);
  assert.equal(c.needLanes, 1);
  assert.equal(c.backroadOver, 1);
  assert.equal(c.complete + c.notApplicable + c.incomplete, c.total);
});

// ── plausibility floor ──────────────────────────────────────────────────────

test('the qualifying floors are 1,000 gal/mo and 6 months', () => {
  assert.equal(BDPG_STATS.MIN_REPORTING_GAL_MO, 1000);
  assert.equal(BDPG_STATS.MIN_REPORTING_MONTHS, 6);
});

test('gallonStatus separates missing from non-reporting from usable', () => {
  assert.equal(BDPG_STATS.gallonStatus(null), 'missing');
  assert.equal(BDPG_STATS.gallonStatus(undefined), 'missing');
  assert.equal(BDPG_STATS.gallonStatus(''), 'missing');
  // A reported zero is a claim about the location; a missing figure is not.
  assert.equal(BDPG_STATS.gallonStatus(0), 'non-reporting');
  assert.equal(BDPG_STATS.gallonStatus(999), 'non-reporting');
  assert.equal(BDPG_STATS.gallonStatus(1000), 'usable');
  assert.equal(BDPG_STATS.gallonStatus(1001), 'usable');
});

test('the floor is tunable per call', () => {
  assert.equal(BDPG_STATS.gallonStatus(300, { minReportingGalMo: 100 }), 'usable');
  assert.equal(BDPG_STATS.gallonStatus(300, { minReportingGalMo: 1000 }), 'non-reporting');
  assert.equal(BDPG_STATS.gallonStatus(0, { minReportingGalMo: 0 }), 'usable');
});

test('non-reporting locations are excluded from the median and counted apart', () => {
  const locs = [
    loc({ id: 'A', avgGalMo: 5000 }),
    loc({ id: 'B', avgGalMo: 7000 }),
    loc({ id: 'Z1', avgGalMo: 0 }),
    loc({ id: 'Z2', avgGalMo: 9 }),
    loc({ id: 'M', avgGalMo: null })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Medium truck stop' && x.roadway === 'Highway');
  assert.equal(r.n, 2);
  assert.equal(r.median, 6000);          // not dragged toward zero
  assert.equal(r.nNonReporting, 2);
  assert.deepEqual(r.nonReportingIds, ['Z1', 'Z2']);
  assert.equal(r.nMissingGallons, 1);
  assert.equal(r.nMapped, 5);
  // Every mapped row lands in exactly one of the three buckets.
  assert.equal(r.n + r.nNonReporting + r.nMissingGallons, r.nMapped);
});

test('the real Fuel Stop sample no longer produces a 152 gal/mo baseline', () => {
  // The measured figures from the 249-location file. Without the floor the
  // median is 152 against a live baseline of 2,500, and n=24 clears the
  // sample-size gate -- so Apply would have cut that baseline by 94%.
  const measured = [0, 0, 0, 0, 2, 9, 12, 14, 27, 48, 112, 135, 169, 233,
    362, 570, 625, 2067, 2694, 3318, 5630, 5667, 16014, 17455];
  const locs = measured.map((g, i) => loc({ id: 'F' + i, type: 'Fuel Stop', avgGalMo: g }));

  const unfloored = BDPG_STATS.summarizeByProfile(locs, TABLE, { minReportingGalMo: 0 })
    .find((x) => x.profile === 'Fuel stop');
  assert.equal(unfloored.n, 24);
  assert.equal(unfloored.median, 152);   // the trap, reproduced

  const floored = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Fuel stop');
  // At the 1,000 floor: 2067, 2694, 3318, 5630, 5667, 16014, 17455.
  // The 570 and 625 that survived the old 500 floor no longer do.
  assert.equal(floored.n, 7);
  // 17 excluded now, not 15 -- the two that sat between 500 and 1,000.
  assert.equal(floored.nNonReporting, 17);
  assert.equal(floored.n + floored.nNonReporting, 24);
  assert.equal(floored.median, 5630);
  // Drawn only from locations that actually sell fuel, and now ABOVE the
  // 2,500 live baseline rather than 94% below it.
  assert.ok(floored.median > 2500);
  assert.ok(floored.median > unfloored.median * 10);
});

test('a profile can fall below n>=5 once the floor is applied', () => {
  // The two gates are independent and both have to hold: four usable rows
  // plus six non-reporting ones must not present as a sample of ten.
  const locs = [];
  for (let i = 0; i < 4; i++) locs.push(loc({ id: 'U' + i, roadway: 'Interstate', dieselLanes: 9, avgGalMo: 20000 }));
  for (let i = 0; i < 6; i++) locs.push(loc({ id: 'N' + i, roadway: 'Interstate', dieselLanes: 9, avgGalMo: 3 }));
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Large truck stop' && x.roadway === 'Interstate');
  assert.equal(r.nMapped, 10);
  assert.equal(r.n, 4);
  assert.ok(r.n < 5, 'must not clear the n>=5 gate on the strength of non-reporting rows');
});

test('completeness counts non-reporting across the whole file', () => {
  const locs = [
    loc({ id: '1', avgGalMo: 5000 }),
    loc({ id: '2', avgGalMo: 10 }),
    loc({ id: '3', dieselLanes: null, avgGalMo: 0 }),   // unmappable AND non-reporting
    loc({ id: '4', type: 'PPO', avgGalMo: 1 })          // N/A AND non-reporting
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.nonReporting, 3);
  assert.equal(c.complete, 2);
  assert.equal(c.withGallons, 1, 'withGallons must mean "the medians will use it"');
});

// ── network-context normalization ───────────────────────────────────────────

const NC = () => ({
  asOf: '2026-09-24',
  activeTotal: 10,
  byRegion: {
    Midwest: {
      total: 6,
      byType: { 'Truck Stop': 3, PPO: 2, 'C-Store': 1 },
      byGroup: { "Roady's": 5, PTP: 1 },
      byTypeGroup: {
        'Truck Stop': { "Roady's": 2, PTP: 1 },
        PPO: { "Roady's": 2 },
        'C-Store': { "Roady's": 1 }
      }
    },
    Texas: {
      total: 4,
      byType: { 'Fuel Stop': 4 },
      byGroup: { "Roady's": 4 },
      byTypeGroup: { 'Fuel Stop': { "Roady's": 4 } }
    }
  }
});

test('normalizing drops the excluded types and recomputes every total', () => {
  const n = BDPG_STATS.normalizeNetworkContext(NC());
  assert.deepEqual(Object.keys(n.byRegion.Midwest.byType), ['Truck Stop']);
  assert.equal(n.byRegion.Midwest.total, 3, 'region total follows the drop');
  assert.equal(n.byRegion.Texas.total, 4, 'an untouched region is unchanged');
  assert.equal(n.activeTotal, 7, 'the headline total is resummed, not carried');
  assert.equal(n.asOf, '2026-09-24');
});

test('byGroup is rebuilt, not carried over with the dropped rows still in it', () => {
  // The excluded rows are spread across groups, so the file's own byGroup
  // cannot survive the drop.
  const n = BDPG_STATS.normalizeNetworkContext(NC());
  assert.deepEqual(n.byRegion.Midwest.byGroup, { "Roady's": 2, PTP: 1 });
  assert.deepEqual(n.byRegion.Midwest.byTypeGroup, { 'Truck Stop': { "Roady's": 2, PTP: 1 } });
});

test('normalizing is idempotent and never mutates its input', () => {
  const src = NC();
  const once = BDPG_STATS.normalizeNetworkContext(src);
  const twice = BDPG_STATS.normalizeNetworkContext(once);
  assert.deepEqual(twice, once);
  assert.equal(src.activeTotal, 10, "the caller's object is untouched");
  assert.equal(src.byRegion.Midwest.byType.PPO, 2);
});

test('a missing or malformed context passes straight through', () => {
  [null, undefined, {}, { activeTotal: 5 }, 'x'].forEach((v) => {
    assert.equal(BDPG_STATS.normalizeNetworkContext(v), v, JSON.stringify(v));
  });
});

test('excluded-type matching ignores case and stray whitespace', () => {
  ['PPO', 'ppo', ' C-Store ', 'c-store', 'Service Center', ' service center '].forEach((t) => {
    assert.equal(BDPG_STATS.isExcludedNetworkType(t), true, t);
  });
  ['Truck Stop', 'Fuel Stop', '', null, 'PPO Plus'].forEach((t) => {
    assert.equal(BDPG_STATS.isExcludedNetworkType(t), false, String(t));
  });
});

test('"Truck Stop / Service Center" survives the Service Center exclusion', () => {
  // The one case a sloppier match would break: these five are truck stops
  // with bays, they map to the truckstop profile class, and they are in
  // network-locations.json. Excluding them would take them out of every
  // count with no other symptom.
  assert.equal(BDPG_STATS.isExcludedNetworkType('Truck Stop / Service Center'), false);
  assert.equal(BDPG_STATS.typeClass('Truck Stop / Service Center'), 'truckstop');

  const nc = BDPG_STATS.normalizeNetworkContext({
    byRegion: {
      Midwest: {
        total: 4,
        byType: { 'Truck Stop / Service Center': 3, 'Service Center': 1 },
        byTypeGroup: {
          'Truck Stop / Service Center': { "Roady's": 3 },
          'Service Center': { PTP: 1 }
        }
      }
    }
  });
  assert.deepEqual(Object.keys(nc.byRegion.Midwest.byType), ['Truck Stop / Service Center']);
  assert.equal(nc.activeTotal, 3);
});

test('the excluded types are the three with no retail diesel profile', () => {
  assert.deepEqual(BDPG_STATS.EXCLUDED_NETWORK_TYPES, ['PPO', 'C-Store', 'Service Center']);
});


// ── p10 / p90 ───────────────────────────────────────────────────────────────

test('p10 and p90 are the 10th and 90th percentiles, R-7 like every quantile', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  assert.equal(BDPG_STATS.p10(v), BDPG_STATS.quantile(v, 0.10));
  assert.equal(BDPG_STATS.p90(v), BDPG_STATS.quantile(v, 0.90));
  assert.equal(BDPG_STATS.p10(v), 2);
  assert.equal(BDPG_STATS.p90(v), 10);
});

test('p10 and p90 interpolate rather than snapping to an order statistic', () => {
  // [10,20,30,40]: h = 3 * 0.1 = 0.3 -> 10 + 0.3*(20-10) = 13
  assert.equal(BDPG_STATS.p10([10, 20, 30, 40]), 13);
  // h = 3 * 0.9 = 2.7 -> 30 + 0.7*(40-30) = 37
  assert.equal(BDPG_STATS.p90([10, 20, 30, 40]), 37);
});

test('p10 and p90 are null on an empty sample and equal on a single value', () => {
  assert.equal(BDPG_STATS.p10([]), null);
  assert.equal(BDPG_STATS.p90([]), null);
  assert.equal(BDPG_STATS.p10([42]), 42);
  assert.equal(BDPG_STATS.p90([42]), 42);
});

test('an extreme outlier moves p90 far less than it moves the max', () => {
  // The reason the range bar uses percentiles: one 500k site should widen
  // the picture, not define it.
  const base = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
  const withOutlier = base.concat([500000]);
  assert.ok(BDPG_STATS.p90(withOutlier) < 60000,
    'p90 moved to ' + BDPG_STATS.p90(withOutlier));
  assert.equal(Math.max.apply(null, withOutlier), 500000);
});

test('p10 never falls below the reporting floor on real reporting data', () => {
  const vals = require('./network-locations.json').locations
    .filter((r) => BDPG_STATS.gallonStatus(r.avgGalMo) === 'usable')
    .map((r) => r.avgGalMo);
  assert.ok(BDPG_STATS.p10(vals) >= BDPG_STATS.MIN_REPORTING_GAL_MO,
    'p10 is ' + BDPG_STATS.p10(vals));
});

// ── profile ranges ──────────────────────────────────────────────────────────

test('a profile range is low / mid / high with low <= mid <= high', () => {
  const locs = [2000, 4000, 6000, 8000, 10000].map((g, i) =>
    loc({ id: 'r' + i, avgGalMo: g }));
  const r = BDPG_STATS.profileRanges(locs, TABLE)[
    BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway')];
  assert.equal(r.n, 5);
  assert.equal(r.mid, 6000);
  assert.ok(r.low <= r.mid && r.mid <= r.high, JSON.stringify(r));
});

test('a profile range mid is the same number profileBaselines calls the median', () => {
  // The card prints one figure and draws the other; they must not diverge.
  const locs = require('./network-locations.json').locations;
  const ranges = BDPG_STATS.profileRanges(locs, TABLE);
  const bases = BDPG_STATS.profileBaselines(locs, TABLE);
  Object.keys(ranges).forEach((k) => {
    if (ranges[k].mid === null) return;
    assert.equal(ranges[k].mid, bases[k].median, k);
  });
});

test('a profile below the dynamic-baseline threshold reports n but no range', () => {
  const locs = [loc({ id: 'a', avgGalMo: 5000 }), loc({ id: 'b', avgGalMo: 9000 })];
  const r = BDPG_STATS.profileRanges(locs, TABLE)[
    BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway')];
  assert.equal(r.n, 2);
  assert.equal(r.low, null);
  assert.equal(r.mid, null);
  assert.equal(r.high, null);
});

test('profileRanges returns an entry for every table row, even with no data', () => {
  const r = BDPG_STATS.profileRanges([], TABLE);
  assert.equal(Object.keys(r).length, TABLE.length);
  TABLE.forEach((row) => {
    const x = r[BDPG_STATS.baselineKeyFor(row.profile, row.roadway)];
    assert.equal(x.n, 0);
    assert.equal(x.mid, null);
  });
});

test('non-reporting locations are outside the range as well as the median', () => {
  const locs = [loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: 6000 }),
    loc({ id: 'c', avgGalMo: 8000 }), loc({ id: 'z', avgGalMo: 12 })];
  const r = BDPG_STATS.profileRanges(locs, TABLE)[
    BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway')];
  assert.equal(r.n, 3);
  assert.ok(r.low >= BDPG_STATS.MIN_REPORTING_GAL_MO, 'low is ' + r.low);
});

test('every committed profile still has a range to draw under the new rule', () => {
  // Small/Backroad was the one profile below the threshold at n=2. The
  // manual sizing pass moved two Backroad sites into it, so it reaches n=4
  // and the distribution panel draws all eight. The placeholder branch in
  // profileRangeBarHtml() is therefore unexercised by the committed file --
  // kept because a future file can drop a profile back under the gate, and
  // covered by its own fixture test above.
  const r = BDPG_STATS.profileRanges(
    require('./network-locations.json').locations, TABLE);
  const thin = Object.keys(r).filter((k) => r[k].mid === null);
  assert.deepEqual(thin, []);
  Object.keys(r).forEach((k) => {
    assert.ok(r[k].n >= BDPG_STATS.DYNAMIC_BASELINE_MIN_N, k + ' n=' + r[k].n);
    assert.ok(r[k].low <= r[k].mid && r[k].mid <= r[k].high, k);
  });
});

// ── network summary ─────────────────────────────────────────────────────────

test('the network summary counts truck stops only, on both sides of the division', () => {
  const locs = [
    loc({ id: 'a', type: 'Truck Stop', gallons12mo: 120000, avgGalMo: 10000 }),
    loc({ id: 'b', type: 'Truck Stop / Service Center', gallons12mo: 240000, avgGalMo: 20000 }),
    loc({ id: 'f', type: 'Fuel Stop', gallons12mo: 999999, avgGalMo: 83333 })
  ];
  const s = BDPG_STATS.networkSummary(locs);
  assert.equal(s.n, 2, 'the fuel stop is not a truck stop');
  assert.equal(s.gallons12mo, 360000, 'nor do its gallons count');
  assert.equal(s.meanGalMo, 15000);
  assert.equal(s.medianGalMo, 15000);
});

test('the network summary mean comes from the 12-month sum, not from avgGalMo', () => {
  const s = BDPG_STATS.networkSummary([
    loc({ id: 'a', gallons12mo: 120000, avgGalMo: 10000 }),
    loc({ id: 'b', gallons12mo: 120000, avgGalMo: 10000 }),
    // gallons12mo disagrees with avgGalMo: the sum is what the card shows.
    loc({ id: 'c', gallons12mo: 600000, avgGalMo: 10000 })
  ]);
  assert.equal(s.meanGalMo, Math.round(840000 / 12 / 3));
  assert.equal(s.medianGalMo, 10000);
});

test('the network summary excludes non-reporting locations from both figures', () => {
  const s = BDPG_STATS.networkSummary([
    loc({ id: 'a', gallons12mo: 120000, avgGalMo: 10000 }),
    loc({ id: 'b', gallons12mo: 120000, avgGalMo: 10000 }),
    loc({ id: 'z', gallons12mo: 1200, avgGalMo: 100 })
  ]);
  assert.equal(s.n, 2);
  assert.equal(s.gallons12mo, 240000);
});

test('an empty network summary is nulls, never zeros', () => {
  // A 0 here would render as a network that pumps nothing.
  const s = BDPG_STATS.networkSummary([]);
  assert.equal(s.n, 0);
  assert.equal(s.meanGalMo, null);
  assert.equal(s.medianGalMo, null);
});

test('the committed file summary is the figure the card shows', () => {
  const s = BDPG_STATS.networkSummary(require('./network-locations.json').locations);
  assert.equal(s.n, 145);
  assert.equal(s.gallons12mo, 31894422);
  assert.equal(s.meanGalMo, 18330);
  assert.equal(s.medianGalMo, 9423);
  // The reason the card prints both: they are not close, and a mean shown
  // alone would contradict every other gallons figure in the tool.
  //
  // The gap NARROWED under the qualifying rule -- 2.17x before, 1.95x now
  // -- which is the months floor doing its job: part-year sites with a
  // flattering monthly average were stretching the mean away from the
  // typical site. Still far enough apart to be worth printing both.
  const ratio = s.meanGalMo / s.medianGalMo;
  assert.ok(ratio > 1.5, 'mean/median ratio is the whole point, got ' + ratio.toFixed(2));
  assert.ok(ratio < 2.2, 'if this ever matches the old 2.17x the rule stopped filtering');
});

// ── group exclusion ─────────────────────────────────────────────────────────

test('group exclusion drops the group and rebuilds the totals', () => {
  const nc = BDPG_STATS.normalizeNetworkContext({
    byRegion: {
      Midwest: {
        total: 10,
        byType: { 'Truck Stop': 10 },
        byTypeGroup: { 'Truck Stop': { "Roady's": 7, "Roady's Lite": 3 } }
      }
    }
  });
  assert.equal(nc.byRegion.Midwest.total, 7);
  assert.equal(nc.byRegion.Midwest.byType['Truck Stop'], 7);
  assert.deepEqual(nc.byRegion.Midwest.byGroup, { "Roady's": 7 });
  assert.equal(nc.activeTotal, 7);
  assert.equal(nc.groupsApplied, true);
});

test('a type emptied entirely by group exclusion disappears from byType', () => {
  const nc = BDPG_STATS.normalizeNetworkContext({
    byRegion: { Midwest: {
      total: 3,
      byType: { 'Truck Stop': 3 },
      byTypeGroup: { 'Truck Stop': { "Roady's Lite": 3 } }
    } }
  });
  assert.deepEqual(nc.byRegion.Midwest.byType, {});
  assert.equal(nc.byRegion.Midwest.total, 0);
});

test('without byTypeGroup the type list still applies and groupsApplied says so', () => {
  // byType alone cannot say which Truck Stop rows are Roady's Lite, so the
  // group list is unenforceable -- reported rather than silently skipped.
  const nc = BDPG_STATS.normalizeNetworkContext({
    byRegion: { Midwest: { total: 9, byType: { 'Truck Stop': 6, PPO: 3 } } }
  });
  assert.equal(nc.groupsApplied, false);
  assert.equal(nc.byRegion.Midwest.total, 6, 'the type list still ran');
  assert.deepEqual(nc.byRegion.Midwest.byType, { 'Truck Stop': 6 });
});

test('excluded-group matching ignores case and whitespace, and spares the truck stop type', () => {
  ["Roady's Lite", "roady's lite", "  Roady's Lite  "].forEach((g) => {
    assert.equal(BDPG_STATS.isExcludedNetworkGroup(g), true, g);
  });
  ["Roady's", 'PTP', 'Unknown', '', null, "Roady's Lite Plus"].forEach((g) => {
    assert.equal(BDPG_STATS.isExcludedNetworkGroup(g), false, String(g));
  });
  // Groups and types are separate axes and must not leak into each other.
  assert.equal(BDPG_STATS.isExcludedNetworkType("Roady's Lite"), false);
  assert.equal(BDPG_STATS.isExcludedNetworkGroup('PPO'), false);
});

test('group and type exclusion compose, and normalizing stays idempotent', () => {
  const src = { asOf: '2026-09-30', activeTotal: 99, byRegion: { Midwest: {
    total: 12,
    byType: { 'Truck Stop': 8, PPO: 4 },
    byTypeGroup: {
      'Truck Stop': { "Roady's": 5, "Roady's Lite": 3 },
      PPO: { "Roady's": 2, "Roady's Lite": 2 }
    }
  } } };
  const once = BDPG_STATS.normalizeNetworkContext(src);
  assert.equal(once.activeTotal, 5, 'PPO out by type, Lite out by group');
  assert.deepEqual(BDPG_STATS.normalizeNetworkContext(once), once);
  assert.equal(src.activeTotal, 99, 'the input is never mutated');
});

// ── item 1: the data version keeps the cache key and the migration honest ───

test('DATA_ASOF matches the committed data files it versions', () => {
  // Two jobs ride on this constant: the ?v= cache key and the localStorage
  // migration cutoff. If it drifts from the files, the cache pins to a stale
  // key AND stale per-browser overrides are waved through as current -- the
  // exact pair of failures it was added to end.
  assert.equal(BDPG_CONFIG.DATA_ASOF, require('./network-locations.json').asOf);
  assert.equal(BDPG_CONFIG.DATA_ASOF, require('./region_variance.json').asOf);
});

test('an undated store is stale, whatever it contains', () => {
  // Every pre-migration browser holds one of these: a bare map of edits with
  // no asOf. It was written against lane counts and roadways that have since
  // been corrected in the file, so none of it can be trusted to still mean
  // anything.
  const bare = { R001: { roadway: 'Backroad' }, R002: { dieselLanes: 2 } };
  const st = BDPG_STATS.datedStoreState(bare, '2026-09-30', 'edits');
  assert.equal(st.stale, true);
  assert.equal(st.dated, false);
  assert.equal(st.asOf, null);
  assert.deepEqual(st.body, bare, 'the body still comes back so it can be counted in the notice');
});

test('a store stamped with the current asOf is kept', () => {
  const st = BDPG_STATS.datedStoreState(
    { asOf: '2026-09-30', edits: { R001: { roadway: 'Highway' } } }, '2026-09-30', 'edits');
  assert.equal(st.stale, false);
  assert.equal(st.dated, true);
  assert.equal(st.asOf, '2026-09-30');
  assert.deepEqual(st.body, { R001: { roadway: 'Highway' } });
});

test('a store stamped with any other asOf is stale', () => {
  ['2026-09-24', '2026-10-01', '', 'nonsense'].forEach((v) => {
    const st = BDPG_STATS.datedStoreState({ asOf: v, edits: { A: 1 } }, '2026-09-30', 'edits');
    assert.equal(st.stale, true, JSON.stringify(v));
  });
});

test('the dated-store check reads whichever body key it is given', () => {
  // Edits store under `edits`, hidden rows under `ids`. One rule, two stores.
  const hidden = { asOf: '2026-09-30', ids: ['R001', 'R002'] };
  assert.deepEqual(
    BDPG_STATS.datedStoreState(hidden, '2026-09-30', 'ids').body, ['R001', 'R002']);
  // Asked for the wrong key, the blob does not look dated at all -- so it is
  // treated as stale rather than silently read as empty.
  assert.equal(BDPG_STATS.datedStoreState(hidden, '2026-09-30', 'edits').stale, true);
});

test('nothing stored means nothing to clear', () => {
  [null, undefined, 'x', 7].forEach((v) => {
    const st = BDPG_STATS.datedStoreState(v, '2026-09-30', 'edits');
    assert.equal(st.stale, false, JSON.stringify(v));
    assert.equal(st.body, null);
  });
});

// ── item 4: the profile-anchored slider ────────────────────────────────────

const RANGES = () => BDPG_STATS.profileRanges(
  require('./network-locations.json').locations, BDPG_CONFIG.BASELINE_TABLE);

test('the slider ends are the percentages that land on p10 and p90', () => {
  const pr = BDPG_STATS.pricingRangeForProfile(
    { n: 9, low: 673, mid: 3216, high: 28006 }, BDPG_CONFIG.PRICING_RANGE);
  assert.equal(pr.source, 'profile');
  // (673 / 3216) - 1 = -0.7907...   (28006 / 3216) - 1 = 7.7083...
  assert.equal(Math.round(pr.lowPct * 100), -79);
  assert.equal(Math.round(pr.highPct * 100), 771);
  // Ends snap OUTWARD, so the real percentiles stay inside reach.
  assert.ok(pr.min <= pr.lowPct, pr.min + ' must not exclude ' + pr.lowPct);
  assert.ok(pr.max >= pr.highPct, pr.max + ' must not exclude ' + pr.highPct);
});

test('a profile with too few locations falls back to the flat range', () => {
  const fb = BDPG_CONFIG.PRICING_RANGE;
  [{ n: 2, low: null, mid: null, high: null }, { n: 0, low: null, mid: null, high: null }]
    .forEach((rg) => {
      const pr = BDPG_STATS.pricingRangeForProfile(rg, fb);
      assert.equal(pr.source, 'fallback');
      assert.equal(pr.min, fb.min);
      assert.equal(pr.max, fb.max);
      assert.equal(pr.lowPct, null, 'nothing to attribute the ends to');
    });
});

test('a degenerate or unusable spread falls back rather than dividing by zero', () => {
  const fb = BDPG_CONFIG.PRICING_RANGE;
  // p10 === p90: every reporting location reads the same, so there is no
  // spread to anchor to and (high/mid - 1) === (low/mid - 1).
  assert.equal(BDPG_STATS.pricingRangeForProfile(
    { n: 5, low: 5000, mid: 5000, high: 5000 }, fb).source, 'fallback');
  // A zero or negative median would make the ratios meaningless.
  assert.equal(BDPG_STATS.pricingRangeForProfile(
    { n: 5, low: 0, mid: 0, high: 0 }, fb).source, 'fallback');
  assert.equal(BDPG_STATS.pricingRangeForProfile(null, fb).source, 'fallback');
});

test('the anchors are the same figures the range bars draw', () => {
  // The slider caption names p10/average/p90 and the Step 1 bar draws them.
  // If these ever came from different calls the page would contradict itself.
  const ranges = RANGES();
  Object.keys(ranges).forEach((k) => {
    const rg = ranges[k];
    if (rg.mid === null) return;
    const pr = BDPG_STATS.pricingRangeForProfile(rg, BDPG_CONFIG.PRICING_RANGE);
    assert.equal(pr.low, rg.low, k);
    assert.equal(pr.mid, rg.mid, k);
    assert.equal(pr.high, rg.high, k);
    assert.equal(pr.n, rg.n, k);
  });
});

test('the slider ends really do reproduce p10 and p90 gallons', () => {
  // The end-to-end claim: baseline x (1 + endPct) lands on the percentile the
  // end was derived from. This is what makes the percentages attributable.
  const ranges = RANGES();
  Object.keys(ranges).forEach((k) => {
    const rg = ranges[k];
    if (rg.mid === null) return;
    const pr = BDPG_STATS.pricingRangeForProfile(rg, BDPG_CONFIG.PRICING_RANGE);
    assert.equal(Math.round(rg.mid * (1 + pr.lowPct)), rg.low, k + ' low end');
    assert.equal(Math.round(rg.mid * (1 + pr.highPct)), rg.high, k + ' high end');
  });
});

// ── item 6: adding a location ──────────────────────────────────────────────

const TYPES = ['Truck Stop', 'Truck Stop / Service Center', 'Fuel Stop'];
const RR2 = (st) => ({ UT: 'West', OH: 'Midwest' }[st] || null);
const FORM = (o) => Object.assign({
  id: 'R09001', city: 'Testville', state: 'UT', group: "Roady's",
  type: 'Truck Stop', dieselLanes: '9', roadway: 'Interstate', gallons12mo: '600000',
  reportingMonths: '12'
}, o);
const VOPTS = { existingIds: ['R00001'], allowedTypes: TYPES, roadways: BDPG_STATS.ROADWAYS, resolveRegion: RR2 };

test('a well-formed new location validates', () => {
  assert.equal(BDPG_STATS.validateNewLocation(FORM(), VOPTS), '');
});

test('a LID is required and must be unique', () => {
  assert.match(BDPG_STATS.validateNewLocation(FORM({ id: '' }), VOPTS), /required/);
  assert.match(BDPG_STATS.validateNewLocation(FORM({ id: '   ' }), VOPTS), /required/);
  assert.match(BDPG_STATS.validateNewLocation(FORM({ id: 'R00001' }), VOPTS), /already exists/);
});

test('a LID may not carry characters that would break an onclick attribute', () => {
  // Ids are interpolated into onclick handlers all over this tab.
  ["R'01", 'R"01', 'R 01', 'R<01', 'R\\01'].forEach((id) => {
    assert.match(BDPG_STATS.validateNewLocation(FORM({ id: id }), VOPTS),
      /letters, digits, hyphens/, id);
  });
});

test('the state must map to a region, because the region delta depends on it', () => {
  assert.match(BDPG_STATS.validateNewLocation(FORM({ state: '' }), VOPTS), /state code is required/);
  assert.match(BDPG_STATS.validateNewLocation(FORM({ state: 'DC' }), VOPTS), /not a state/);
  assert.equal(BDPG_STATS.validateNewLocation(FORM({ state: 'ut' }), VOPTS), '', 'case insensitive');
});

test('lanes, roadway and gallons are optional but must be sane when given', () => {
  assert.equal(BDPG_STATS.validateNewLocation(
    FORM({ dieselLanes: '', roadway: '', gallons12mo: '' }), VOPTS), '',
    'a non-reporting, unsized site is a legitimate row');
  assert.match(BDPG_STATS.validateNewLocation(FORM({ dieselLanes: '120' }), VOPTS), /0 to 99/);
  assert.match(BDPG_STATS.validateNewLocation(FORM({ dieselLanes: '-2' }), VOPTS), /0 to 99/);
  assert.match(BDPG_STATS.validateNewLocation(FORM({ roadway: 'Motorway' }), VOPTS), /Roadway must be/);
  assert.match(BDPG_STATS.validateNewLocation(FORM({ gallons12mo: '-5' }), VOPTS), /non-negative/);
});

test('an added location derives its size and its monthly average', () => {
  const row = BDPG_STATS.normalizeAddedLocation(FORM(), { allowedTypes: TYPES });
  assert.equal(row.size, 'Large', '9 lanes on an Interstate');
  assert.equal(row.avgGalMo, 50000, '600,000 / 12');
  assert.equal(row.dieselLanes, 9);
  assert.equal(row.state, 'UT');
  assert.equal(row.addedLocally, true);
});

test('a stored avgGalMo is ignored in favour of the derived one', () => {
  // One figure, one source. A row whose avgGalMo disagreed with its own
  // annual total would land in a different profile average than its gallons imply.
  const row = BDPG_STATS.normalizeAddedLocation(
    FORM({ gallons12mo: '120000', avgGalMo: 99999 }), { allowedTypes: TYPES });
  assert.equal(row.avgGalMo, 10000);
});

test('an added location carries only allowlisted fields', () => {
  // The same protection the file loader has: a hand-edited store must not be
  // able to introduce a member name that the table would then render.
  const row = BDPG_STATS.normalizeAddedLocation(
    FORM({ name: "Bob's Truck Stop", phone: '555-0100', address: '1 Main St' }),
    { allowedTypes: TYPES });
  assert.equal(row.name, undefined);
  assert.equal(row.phone, undefined);
  assert.equal(row.address, undefined);
  assert.deepEqual(Object.keys(row).sort(), ['addedLocally', 'avgGalMo', 'city',
    'dieselLanes', 'distanceToInterstate', 'gallons12mo', 'group', 'id',
    'reportingMonths', 'roadway', 'size', 'state', 'type'].sort());
});

test('an unmappable Backroad lane count gets no size rather than a wrong one', () => {
  const row = BDPG_STATS.normalizeAddedLocation(
    FORM({ roadway: 'Backroad', dieselLanes: '7' }), { allowedTypes: TYPES });
  assert.equal(row.size, null, '7 lanes on a Backroad has no profile');
});

test('a blank gallons figure makes a non-reporting row, not a zero one', () => {
  const row = BDPG_STATS.normalizeAddedLocation(
    FORM({ gallons12mo: '' }), { allowedTypes: TYPES });
  assert.equal(row.gallons12mo, null);
  assert.equal(row.avgGalMo, null);
  assert.equal(BDPG_STATS.gallonStatus(row.avgGalMo), 'missing',
    'missing, not a measured zero');
});

test('an unrecognised type falls back to the first allowed one, never through', () => {
  const row = BDPG_STATS.normalizeAddedLocation(
    FORM({ type: 'Casino' }), { allowedTypes: TYPES });
  assert.equal(row.type, 'Truck Stop');
});

test('a row with no id cannot be added', () => {
  [{ id: '' }, { id: '   ' }, {}, null, 'x'].forEach((v) => {
    assert.equal(BDPG_STATS.normalizeAddedLocation(v, { allowedTypes: TYPES }), null,
      JSON.stringify(v));
  });
});

test('an added location changes the averages it joins', () => {
  // The whole point of the feature, and the whole reason it has to be marked
  // local: it moves the numbers.
  const locs = require('./network-locations.json').locations;
  const K = BDPG_STATS.baselineKeyFor('Large truck stop', 'Interstate');
  const before = BDPG_STATS.profileBaselines(locs, BDPG_CONFIG.BASELINE_TABLE)[K];
  const added = BDPG_STATS.normalizeAddedLocation(
    FORM({ id: 'R09999', gallons12mo: '600000' }), { allowedTypes: TYPES });
  const after = BDPG_STATS.profileBaselines(
    locs.concat([added]), BDPG_CONFIG.BASELINE_TABLE)[K];
  assert.equal(after.n, before.n + 1);
  assert.notEqual(after.median, before.median);
});

// ── the split-scale track ───────────────────────────────────────────────────

const PR = (profile, roadway) => BDPG_STATS.pricingRangeForProfile(
  BDPG_STATS.profileRanges(require('./network-locations.json').locations,
    BDPG_CONFIG.BASELINE_TABLE)[BDPG_STATS.baselineKeyFor(profile, roadway)],
  BDPG_CONFIG.PRICING_RANGE);

const ALL_PR = () => {
  const ranges = BDPG_STATS.profileRanges(
    require('./network-locations.json').locations, BDPG_CONFIG.BASELINE_TABLE);
  return BDPG_CONFIG.BASELINE_TABLE.map((r) => ({
    key: r.profile + '/' + r.roadway,
    pr: BDPG_STATS.pricingRangeForProfile(
      ranges[BDPG_STATS.baselineKeyFor(r.profile, r.roadway)], BDPG_CONFIG.PRICING_RANGE)
  }));
};

test('0% maps to the visual midpoint of the track on every profile', () => {
  // The whole reason the split scale exists. On a plain linear track 0% --
  // the profile AVERAGE -- rendered at 7.2% of the travel on Small/Highway
  // and under 15% on four others, so the handle read as "almost no
  // discounts" while the number meant "typical for this kind of site".
  ALL_PR().forEach(({ key, pr }) => {
    assert.equal(BDPG_STATS.pricingTrackFraction(0, pr), 50, key);
    assert.equal(BDPG_STATS.pricingPositionForPct(0, pr), 0, key);
  });
});

test('the fallback range centres 0 too, by the same rule', () => {
  // A profile below the measurement threshold gets the flat +/-50%, which is
  // already symmetric -- but it must go through the same mapping, or the one
  // case nobody checks is the one that drifts.
  const fb = BDPG_STATS.pricingRangeForProfile(
    { n: 2, low: null, mid: null, high: null }, BDPG_CONFIG.PRICING_RANGE);
  assert.equal(fb.source, 'fallback');
  assert.equal(BDPG_STATS.pricingTrackFraction(0, fb), 50);
});

test('the track ends land exactly on the real p10 and p90 percentages', () => {
  // The asymmetry is preserved, not flattened: only the pixel mapping
  // changed. Forcing both halves onto a shared round step would have dragged
  // these ends up to 24 points off the percentile they are named for.
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    assert.equal(BDPG_STATS.pricingPctForPosition(-N, pr), pr.min, key + ' low end');
    assert.equal(BDPG_STATS.pricingPctForPosition(N, pr), pr.max, key + ' high end');
  });
});

test('each half of the track gets exactly half the positions', () => {
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    assert.equal(BDPG_STATS.pricingTrackFraction(pr.min, pr), 0, key);
    assert.equal(BDPG_STATS.pricingTrackFraction(pr.max, pr), 100, key);
  });
  assert.equal(N, 50);
});

test('every reachable position is a whole percentage', () => {
  // "+457.3%" would imply precision the percentiles cannot support at n=9.
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    for (let p = -N; p <= N; p++) {
      const pts = BDPG_STATS.pricingPctForPosition(p, pr) * 100;
      assert.equal(Math.abs(pts - Math.round(pts)) < 1e-9, true,
        key + ' position ' + p + ' gives ' + pts + '%');
    }
  });
});

test('the mapping is monotonic, so dragging right never lowers the figure', () => {
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    let prev = -Infinity;
    for (let p = -N; p <= N; p++) {
      const v = BDPG_STATS.pricingPctForPosition(p, pr);
      assert.ok(v >= prev, key + ': position ' + p + ' went backwards (' + v + ' after ' + prev + ')');
      prev = v;
    }
  });
});

test('position and percentage round-trip, so handle and readout cannot disagree', () => {
  // The defect this replaced: a value in range but off the grid left the
  // browser moving the handle while state held something else.
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    for (let p = -N; p <= N; p++) {
      const pct = BDPG_STATS.pricingPctForPosition(p, pr);
      const back = BDPG_STATS.pricingPositionForPct(pct, pr);
      assert.equal(BDPG_STATS.pricingPctForPosition(back, pr), pct,
        key + ' position ' + p + ' did not round-trip');
    }
  });
});

test('the left half is finer than the right on every real profile', () => {
  // Not an accident -- it is the split doing its job. Every profile's spread
  // is right-skewed (a site can be many times its average but not less than
  // nothing), so equal pixels mean a gentler scale below the average.
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    if (pr.source !== 'profile') return;
    const leftSpan = Math.abs(pr.min);
    const rightSpan = pr.max;
    assert.ok(rightSpan > leftSpan, key + ' is not right-skewed: ' + pr.min + '..' + pr.max);
    // One position near the centre is worth more gallons on the right.
    const oneLeft = Math.abs(BDPG_STATS.pricingPctForPosition(-1, pr));
    const oneRight = BDPG_STATS.pricingPctForPosition(1, pr);
    assert.ok(oneRight >= oneLeft, key + ': ' + oneRight + ' vs ' + oneLeft);
  });
});

test('a stored posture outside the current range is pulled to the nearest end', () => {
  const pr = PR('Small truck stop', 'Backroad');   // -51% .. +115%
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  // A +459% carried over from Medium/Interstate cannot be shown here.
  assert.equal(BDPG_STATS.pricingPositionForPct(4.59, pr), N);
  assert.equal(BDPG_STATS.pricingPositionForPct(-9, pr), -N);
});

test('an unusable position or range answers 0 rather than NaN', () => {
  const pr = PR('Medium truck stop', 'Highway');
  [null, undefined, '', 'x', NaN, {}].forEach((v) => {
    assert.equal(BDPG_STATS.pricingPctForPosition(v, pr), 0, JSON.stringify(v));
  });
  // A degenerate range has no halves to split.
  assert.equal(BDPG_STATS.pricingPositionForPct(0.5, { min: 0, max: 0 }), 0);
  assert.equal(BDPG_STATS.pricingPositionForPct(-0.5, { min: 0, max: 0 }), 0);
  assert.equal(BDPG_STATS.pricingTrackFraction(0, { min: 0, max: 0 }), 50);
});

test('positions beyond the ends clamp instead of running off the track', () => {
  const pr = PR('Large truck stop', 'Highway');
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  assert.equal(BDPG_STATS.pricingPctForPosition(-999, pr), pr.min);
  assert.equal(BDPG_STATS.pricingPctForPosition(999, pr), pr.max);
  assert.equal(BDPG_STATS.pricingPctForPosition(-N - 1, pr), pr.min);
  assert.equal(BDPG_STATS.pricingPctForPosition(N + 1, pr), pr.max);
});

test('the percentages the split scale reaches are the ones the formula uses', () => {
  // The presentation changed; the numbers did not. Every end still reproduces
  // the percentile gallons it was derived from.
  const { BusDevGallonsCalc: Calc } = require('./busDevGallonsCalculator.js');
  const N = BDPG_STATS.PRICING_POSITIONS_PER_SIDE;
  ALL_PR().forEach(({ key, pr }) => {
    if (pr.source !== 'profile') return;
    [-N, 0, N].forEach((p) => {
      const pct = BDPG_STATS.pricingPctForPosition(p, pr);
      assert.equal(Calc.pricingAdjustment(pct), pct, key + ' at position ' + p);
    });
    assert.equal(Math.round(pr.mid * (1 + BDPG_STATS.pricingPctForPosition(0, pr))), pr.mid,
      key + ': the centre must be the profile average exactly');
  });
});

// ── the prospect signal ─────────────────────────────────────────────────────
//
// This value is written into every saved record and rendered by the Prospects
// tracker. Until now it was computed as a side effect of rendering the
// Pre-Evaluation card, so "the card looks right" was the whole of its
// verification. That card is gone, which left the only live writer of a
// persisted field with no coverage at all.

const SIG = (o) => BDPG_STATS.prospectSignal(o);

// A complete, Strong-scoring prospect. Every test below starts here and
// changes one thing, so what moved the signal is never ambiguous.
const FULL = (o) => Object.assign({
  name: 'Acme Truck Plaza', city: 'Logan', stateCode: 'OH',
  locationType: 'Truck Stop', region: 'Midwest', regionPct: 0.915,
  regionData: { total: 38, byType: { 'Truck Stop': 37 } }
}, o);

test('a complete prospect in a strong region reads Strong', () => {
  const r = SIG(FULL());
  assert.deepEqual(r.missing, []);
  assert.equal(r.signal, 'Strong');
  assert.deepEqual(r.tones,
    { region: 'green', regionPct: 'green', networkPresence: 'green', typePresence: 'green' });
});

// ── the prerequisite gate ───────────────────────────────────────────────────

test('each missing prerequisite is named, and names nothing else', () => {
  assert.deepEqual(SIG(FULL({ name: '' })).missing, ['Truck Stop Name']);
  assert.deepEqual(SIG(FULL({ city: '' })).missing, ['City']);
  assert.deepEqual(SIG(FULL({ stateCode: '' })).missing, ['State']);
  assert.deepEqual(SIG(FULL({ locationType: '' })).missing, ['Location Type']);
});

test('missing prerequisites are listed in form order, not discovery order', () => {
  assert.deepEqual(SIG({}).missing,
    ['Truck Stop Name', 'City', 'State', 'Location Type']);
});

test('an incomplete prospect carries NO signal, not a provisional one', () => {
  // The gate that matters most. A half-entered prospect saved from the
  // calculator must not land in the tracker wearing a verdict computed from
  // the fields that happen to be filled.
  ['name', 'city', 'stateCode', 'locationType'].forEach((field) => {
    const r = SIG(FULL({ [field]: '' }));
    assert.equal(r.signal, '', 'blank ' + field + ' must clear the signal');
  });
});

test('the signal clears again when a filled prospect is emptied', () => {
  // The stale-value failure this gate exists to prevent: compute Strong,
  // then blank a field and compute again. The second answer must not be
  // the first one left lying around.
  assert.equal(SIG(FULL()).signal, 'Strong');
  assert.equal(SIG(FULL({ city: '' })).signal, '');
});

test('whitespace and falsy junk count as unfilled', () => {
  [undefined, null, '', 0, false].forEach((v) => {
    assert.equal(SIG(FULL({ name: v })).signal, '', JSON.stringify(v));
  });
});

// ── the four judgements ─────────────────────────────────────────────────────

test('an unresolved region is yellow, never red', () => {
  // A state code the map does not know is a typo to fix, not a verdict about
  // the prospect. Red here would read as "we assessed this and it is bad".
  const r = SIG(FULL({ region: null, regionPct: null }));
  assert.equal(r.tones.region, 'yellow');
  assert.notEqual(r.signal, 'Review');
  assert.equal(r.signal, 'Moderate');
});

test('region delta: positive green, negative red, zero yellow', () => {
  assert.equal(SIG(FULL({ regionPct: 0.915 })).tones.regionPct, 'green');
  assert.equal(SIG(FULL({ regionPct: -0.066 })).tones.regionPct, 'red');
  // Zero is yellow rather than green on purpose: an unconfigured region and
  // a genuinely average one are different claims, and 0 is usually the first.
  assert.equal(SIG(FULL({ regionPct: 0 })).tones.regionPct, 'yellow');
});

test('a negative region delta alone drops the whole prospect to Review', () => {
  const r = SIG(FULL({ regionPct: -0.066 }));
  assert.equal(r.signal, 'Review');
});

test('network presence tones on the count, and missing data is not failure', () => {
  assert.equal(SIG(FULL({ regionData: { total: 38, byType: { 'Truck Stop': 37 } } })).tones.networkPresence, 'green');
  assert.equal(SIG(FULL({ regionData: { total: 15, byType: { 'Truck Stop': 37 } } })).tones.networkPresence, 'yellow');
  assert.equal(SIG(FULL({ regionData: { total: 4, byType: { 'Truck Stop': 37 } } })).tones.networkPresence, 'red');
  // No entry for the region at all: "we cannot see" is not "we looked and
  // it is bad", so yellow and never red.
  assert.equal(SIG(FULL({ regionData: null })).tones.networkPresence, 'yellow');
  assert.notEqual(SIG(FULL({ regionData: null })).signal, 'Review');
});

test('the count thresholds are >20 green, 10..20 yellow, <10 red', () => {
  // Boundaries pinned because they are the difference between a Strong and a
  // Moderate badge on a tracker row.
  const t = BDPG_STATS.networkCountTone;
  assert.equal(t(21), 'green');
  assert.equal(t(20), 'yellow', '20 is NOT green -- the rule is strictly greater');
  assert.equal(t(10), 'yellow');
  assert.equal(t(9), 'red');
  assert.equal(t(0), 'red');
});

test('an unusable count reads red rather than throwing or passing', () => {
  const t = BDPG_STATS.networkCountTone;
  [null, undefined, '', 'x', NaN, {}].forEach((v) => {
    assert.equal(t(v), 'red', JSON.stringify(v));
  });
});

test('type presence looks up the prospect own type, not any type', () => {
  const rd = { total: 38, byType: { 'Truck Stop': 37, 'Fuel Stop': 1 } };
  assert.equal(SIG(FULL({ regionData: rd, locationType: 'Truck Stop' })).tones.typePresence, 'green');
  assert.equal(SIG(FULL({ regionData: rd, locationType: 'Fuel Stop' })).tones.typePresence, 'red');
});

test('a type absent from the region is yellow, not red', () => {
  const r = SIG(FULL({ regionData: { total: 38, byType: { 'Fuel Stop': 1 } } }));
  assert.equal(r.tones.typePresence, 'yellow');
});

test('type presence cannot be satisfied by an inherited property', () => {
  // byType comes from a parsed JSON file; a key like "constructor" must not
  // resolve through the prototype into a count.
  const r = SIG(FULL({ locationType: 'constructor',
    regionData: { total: 38, byType: {} } }));
  assert.equal(r.tones.typePresence, 'yellow');
});

// ── the roll-up ─────────────────────────────────────────────────────────────

test('any red means Review, whichever judgement it came from', () => {
  assert.equal(SIG(FULL({ regionPct: -0.1 })).signal, 'Review');
  assert.equal(SIG(FULL({ regionData: { total: 2, byType: { 'Truck Stop': 37 } } })).signal, 'Review');
  assert.equal(SIG(FULL({ regionData: { total: 38, byType: { 'Truck Stop': 2 } } })).signal, 'Review');
});

test('red outranks green: one bad judgement is not averaged away', () => {
  // Three greens and a red is Review, not Moderate. The signal is a flag for
  // attention, not a score.
  const r = SIG(FULL({ regionData: { total: 38, byType: { 'Truck Stop': 1 } } }));
  assert.equal(r.tones.region, 'green');
  assert.equal(r.tones.regionPct, 'green');
  assert.equal(r.tones.networkPresence, 'green');
  assert.equal(r.tones.typePresence, 'red');
  assert.equal(r.signal, 'Review');
});

test('Strong requires all four green; one yellow makes it Moderate', () => {
  assert.equal(SIG(FULL()).signal, 'Strong');
  assert.equal(SIG(FULL({ regionPct: 0 })).signal, 'Moderate');
  assert.equal(SIG(FULL({ regionData: { total: 15, byType: { 'Truck Stop': 37 } } })).signal, 'Moderate');
  assert.equal(SIG(FULL({ regionData: { total: 38, byType: {} } })).signal, 'Moderate');
});

test('the signal is only ever one of four values', () => {
  const seen = new Set();
  [0.9, 0, -0.1, null].forEach((pct) => {
    [null, { total: 38, byType: { 'Truck Stop': 37 } }, { total: 5, byType: {} }].forEach((rd) => {
      ['', 'Truck Stop'].forEach((lt) => {
        seen.add(SIG(FULL({ regionPct: pct, regionData: rd, locationType: lt,
          region: pct === null ? null : 'Midwest' })).signal);
      });
    });
  });
  [...seen].forEach((s) => {
    assert.ok(['', 'Strong', 'Moderate', 'Review'].includes(s), 'unexpected signal ' + s);
  });
});

test('every signal the tracker can receive has a tone to render it with', () => {
  // The tracker maps signal -> badge colour. A value this function can emit
  // that the map does not know would render as an unstyled grey chip.
  const TRACKER_TONES = { Strong: 'green', Moderate: 'yellow', Review: 'red' };
  ['Strong', 'Moderate', 'Review'].forEach((s) => {
    assert.ok(TRACKER_TONES[s], s + ' has no tracker tone');
  });
  // '' is the fourth, and the tracker renders it as an em dash rather than a
  // badge -- deliberately not in the map.
  assert.equal(TRACKER_TONES[''], undefined);
});

// ── hardening ───────────────────────────────────────────────────────────────

test('no input at all answers blank rather than throwing', () => {
  [undefined, null, {}].forEach((v) => {
    const r = SIG(v);
    assert.equal(r.signal, '');
    assert.equal(r.missing.length, 4);
  });
});

test('a malformed regionData cannot crash the signal', () => {
  [{}, { total: null }, { byType: null }, { total: 'x', byType: 'y' }].forEach((rd) => {
    const r = SIG(FULL({ regionData: rd }));
    assert.ok(['Strong', 'Moderate', 'Review'].includes(r.signal), JSON.stringify(rd));
  });
});

test('the function is pure: it does not mutate what it is handed', () => {
  // It is called from render() and from three field handlers; one of those
  // writing back into page state would be a very hard bug to find.
  const input = FULL();
  const snapshot = JSON.stringify(input);
  SIG(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test('the committed region data produces the signal the tracker will show', () => {
  // End to end against the real files, so a future recompute that flips a
  // region negative shows up here rather than on a prospect sheet.
  const nc = BDPG_STATS.normalizeNetworkContext(require('./network-context.json'));
  const rv = require('./region_variance.json');
  const r = SIG(FULL({
    region: 'Midwest', regionPct: rv.Midwest / 100, regionData: nc.byRegion.Midwest
  }));
  assert.equal(r.signal, 'Strong', 'Midwest is +93.5% over 38 locations');

  const sw = SIG(FULL({
    region: 'Southwest', regionPct: rv.Southwest / 100,
    regionData: nc.byRegion.Southwest, locationType: 'Truck Stop'
  }));
  assert.equal(sw.tones.regionPct, 'red', 'Southwest is -26.3%');
  assert.equal(sw.signal, 'Review');
});

// ── the qualifying rule ─────────────────────────────────────────────────────
//
// Two independent floors, and a location feeds the averages only if it clears
// BOTH. They catch different failures: the gallons floor keeps out a site
// that sells almost nothing, the months floor keeps out a site whose
// twelve-month average actually describes a few weeks.

const Q = (o) => BDPG_STATS.locationQualifies(o);

test('a location clearing both floors qualifies, with no reasons', () => {
  const q = Q({ avgGalMo: 8000, reportingMonths: 12 });
  assert.equal(q.ok, true);
  assert.deepEqual(q.reasons, []);
  // The verdict carries the floors it applied, because the table prints them.
  assert.equal(q.minGalMo, 1000);
  assert.equal(q.minMonths, 6);
});

test('rule 1 alone: the gallons floor is inclusive at exactly 1,000', () => {
  assert.equal(Q({ avgGalMo: 1001, reportingMonths: 12 }).ok, true);
  assert.equal(Q({ avgGalMo: 1000, reportingMonths: 12 }).ok, true);
  assert.equal(Q({ avgGalMo: 999, reportingMonths: 12 }).ok, false);
  assert.deepEqual(Q({ avgGalMo: 999, reportingMonths: 12 }).reasons, ['below-gallons']);
});

test('rule 2 alone: the months floor is inclusive at exactly 6', () => {
  assert.equal(Q({ avgGalMo: 8000, reportingMonths: 7 }).ok, true);
  assert.equal(Q({ avgGalMo: 8000, reportingMonths: 6 }).ok, true);
  assert.equal(Q({ avgGalMo: 8000, reportingMonths: 5 }).ok, false);
  assert.deepEqual(Q({ avgGalMo: 8000, reportingMonths: 5 }).reasons, ['below-months']);
});

test('high gallons buy no pass on months', () => {
  // The case rule 2 exists for: a site that opened in month 11 can post an
  // excellent monthly average off three weeks of trading.
  assert.deepEqual(Q({ avgGalMo: 40000, reportingMonths: 2 }).reasons, ['below-months']);
});

test('a full year of reporting buys no pass on gallons', () => {
  assert.deepEqual(Q({ avgGalMo: 120, reportingMonths: 12 }).reasons, ['below-gallons']);
});

test('the combined gate reports both failures, not whichever was checked first', () => {
  // The table says which rule a row failed, and "under both" is a real and
  // common state -- a site with no gallons usually has no months either.
  const q = Q({ avgGalMo: 0, reportingMonths: 0 });
  assert.equal(q.ok, false);
  assert.deepEqual(q.reasons, ['below-gallons', 'below-months']);
});

test('absent data fails rather than passing by omission', () => {
  // A file predating reportingMonths must not qualify every row on gallons
  // alone and silently reinstate the old single-floor rule.
  assert.deepEqual(Q({ avgGalMo: 8000 }).reasons, ['no-months']);
  assert.deepEqual(Q({ reportingMonths: 12 }).reasons, ['no-gallons']);
  assert.deepEqual(Q({}).reasons, ['no-gallons', 'no-months']);
  assert.equal(Q(null).ok, false);
});

test('"no figure" is distinguished from "figure below the floor"', () => {
  // Different words in front of a reader, and a different bucket in the
  // per-profile summary.
  assert.deepEqual(Q({ avgGalMo: null, reportingMonths: 12 }).reasons, ['no-gallons']);
  assert.deepEqual(Q({ avgGalMo: 5, reportingMonths: 12 }).reasons, ['below-gallons']);
  assert.deepEqual(Q({ avgGalMo: 8000, reportingMonths: null }).reasons, ['no-months']);
  assert.deepEqual(Q({ avgGalMo: 8000, reportingMonths: 0 }).reasons, ['below-months']);
});

test('both floors are overridable per call, and independently', () => {
  const loose = { minReportingGalMo: 0, minReportingMonths: 0 };
  assert.equal(Q({ avgGalMo: 1, reportingMonths: 1 }).ok, false);
  assert.equal(BDPG_STATS.locationQualifies({ avgGalMo: 1, reportingMonths: 1 }, loose).ok, true);
  assert.equal(BDPG_STATS.locationQualifies(
    { avgGalMo: 1, reportingMonths: 12 }, { minReportingGalMo: 0 }).ok, true,
  'relaxing gallons must not relax months');
  assert.equal(BDPG_STATS.locationQualifies(
    { avgGalMo: 8000, reportingMonths: 1 }, { minReportingMonths: 0 }).ok, true,
  'relaxing months must not relax gallons');
});

test('qualifies() is the boolean form of the same rule', () => {
  [{ avgGalMo: 8000, reportingMonths: 12 }, { avgGalMo: 10, reportingMonths: 12 },
    { avgGalMo: 8000, reportingMonths: 1 }, { avgGalMo: 0, reportingMonths: 0 }, {}]
    .forEach((l) => {
      assert.equal(BDPG_STATS.qualifies(l), BDPG_STATS.locationQualifies(l).ok,
        JSON.stringify(l));
    });
});

// ── the gate reaches every computation ──────────────────────────────────────

test('a short-reporting location is excluded from the median it would have moved', () => {
  const locs = [
    loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: 6000 }),
    loc({ id: 'c', avgGalMo: 8000 }),
    // Plenty of gallons, almost no year behind them.
    loc({ id: 'short', avgGalMo: 90000, reportingMonths: 2 })
  ];
  const b = BDPG_STATS.profileBaselines(locs, TABLE)[
    BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway')];
  assert.equal(b.n, 3, 'the 2-month site must not count');
  assert.equal(b.median, 6000, 'and must not drag the median up either');
});

test('the months floor reaches the ranges, the region figures and the deltas', () => {
  // Five call sites read the gate. A new computation that forgot it would
  // publish a figure built from part-year sites.
  const base = [
    loc({ id: 'a', state: 'OH', avgGalMo: 4000 }), loc({ id: 'b', state: 'OH', avgGalMo: 6000 }),
    loc({ id: 'c', state: 'OH', avgGalMo: 8000 })
  ];
  const withShort = base.concat([
    loc({ id: 's', state: 'OH', avgGalMo: 90000, reportingMonths: 3 })]);
  const K = BDPG_STATS.baselineKeyFor('Medium truck stop', 'Highway');
  assert.equal(BDPG_STATS.profileRanges(withShort, TABLE)[K].n, 3, 'ranges');
  assert.equal(BDPG_STATS.regionAverages(withShort, RR).Midwest.n, 3, 'region averages');
  assert.equal(BDPG_STATS.regionDeltas(withShort, TABLE, RR).Midwest.n, 3, 'region deltas');
  assert.equal(BDPG_STATS.networkSummary(withShort).n, 3, 'network summary');
  assert.equal(BDPG_STATS.completenessCounts(withShort, TABLE).withGallons, 3, 'completeness');
});

test('an excluded location is still counted and still listed', () => {
  // The rule removes rows from the MATHS, not from the table.
  const locs = [
    loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: 6000 }),
    loc({ id: 'c', avgGalMo: 8000 }),
    loc({ id: 'short', avgGalMo: 90000, reportingMonths: 2 }),
    loc({ id: 'low', avgGalMo: 200 })
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.total, 5, 'every row is still counted');
  assert.equal(c.complete, 5, 'and still has a complete profile');
  assert.equal(c.withGallons, 3, 'but only three feed an average');
  assert.equal(c.nonReporting, 2, 'two have a figure and still do not qualify');
});

test('the profile summary separates "no figure" from "does not qualify"', () => {
  const locs = [
    loc({ id: 'a', avgGalMo: 4000 }), loc({ id: 'b', avgGalMo: 6000 }),
    loc({ id: 'low', avgGalMo: 200 }),
    loc({ id: 'short', avgGalMo: 90000, reportingMonths: 1 }),
    loc({ id: 'none', avgGalMo: null })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Medium truck stop' && x.roadway === 'Highway');
  assert.equal(r.n, 2);
  assert.equal(r.nNonReporting, 2, 'low gallons and short reporting both land here');
  assert.equal(r.nMissingGallons, 1, 'a missing figure is its own case');
  assert.deepEqual(r.nonReportingIds.slice().sort(), ['low', 'short']);
});

// ── the committed file under the new rule ───────────────────────────────────

test('the committed file qualifies 152 of its 219 locations', () => {
  const locs = require('./network-locations.json').locations;
  assert.equal(locs.length, 219);
  assert.equal(locs.filter((l) => BDPG_STATS.qualifies(l)).length, 152);
});

test('every committed location carries a reportingMonths within 0..12', () => {
  // A row missing it would silently drop out of every average; a row reading
  // 13 would mean the generator is counting something other than months.
  require('./network-locations.json').locations.forEach((l) => {
    const m = BDPG_STATS.toFinite(l.reportingMonths);
    assert.ok(m !== null, l.id + ' has no reportingMonths');
    assert.ok(m >= 0 && m <= 12, l.id + ' has reportingMonths ' + m);
  });
});

test('the qualifying 152 are exactly the locations behind the eight medians', () => {
  // Cross-check on the pinned per-profile n values in
  // busDevGallonsCalculator.test.js: if they sum to anything but 152, a
  // median is being reached by a route that skips the gate.
  const b = BDPG_STATS.profileBaselines(
    require('./network-locations.json').locations, BDPG_CONFIG.BASELINE_TABLE);
  const total = Object.keys(b).reduce((s, k) => s + b[k].n, 0);
  assert.equal(total, 152);
});

test('raising a floor can only shrink a sample, never grow one', () => {
  // A property rather than a pinned number: guards against a future edit
  // inverting one of the two comparisons.
  const locs = require('./network-locations.json').locations;
  const loose = BDPG_STATS.profileBaselines(locs, BDPG_CONFIG.BASELINE_TABLE,
    { minReportingGalMo: 0, minReportingMonths: 0 });
  const live = BDPG_STATS.profileBaselines(locs, BDPG_CONFIG.BASELINE_TABLE);
  Object.keys(live).forEach((k) => {
    assert.ok(live[k].n <= loose[k].n,
      k + ': strict n ' + live[k].n + ' > loose n ' + loose[k].n);
  });
});

test('the new rule actually bites -- the old 500 floor admitted more', () => {
  // Proof this is a change in which locations count, not a relabelling.
  const locs = require('./network-locations.json').locations;
  const oldRule = locs.filter((l) => {
    const g = BDPG_STATS.toFinite(l.avgGalMo);
    return g !== null && g >= 500;
  }).length;
  assert.equal(oldRule, 166);
  assert.equal(locs.filter((l) => BDPG_STATS.qualifies(l)).length, 152);
});

test('an added location needs reporting months to count, and can carry them', () => {
  // Without reportingMonths on the add path a locally added location would
  // join the table, be marked LOCAL, and then contribute to nothing.
  const withMonths = BDPG_STATS.normalizeAddedLocation(FORM(), { allowedTypes: TYPES });
  assert.equal(withMonths.reportingMonths, 12);
  assert.equal(BDPG_STATS.qualifies(withMonths), true);

  const without = BDPG_STATS.normalizeAddedLocation(
    FORM({ reportingMonths: '' }), { allowedTypes: TYPES });
  assert.equal(without.reportingMonths, null);
  assert.equal(BDPG_STATS.qualifies(without), false,
    'and it says so on the row rather than quietly counting');
});

test('an added location clamps reporting months to the 12 that exist', () => {
  const mk = (m) => BDPG_STATS.normalizeAddedLocation(
    FORM({ reportingMonths: m }), { allowedTypes: TYPES }).reportingMonths;
  assert.equal(mk('99'), 12);
  assert.equal(mk('-3'), 0);
  assert.equal(mk('7.8'), 7, 'a part month is not a reporting month');
  assert.equal(mk('abc'), null);
});

test('"measured and short" is held apart from "never measured"', () => {
  // The caption prints both, and a reader who cannot add the printed numbers
  // up to the total reasonably assumes some rows went missing.
  const locs = [
    loc({ id: 'ok', avgGalMo: 8000 }),
    loc({ id: 'low', avgGalMo: 200 }),
    loc({ id: 'short', avgGalMo: 90000, reportingMonths: 2 }),
    loc({ id: 'none', avgGalMo: null }),
    loc({ id: 'none2', avgGalMo: null, reportingMonths: 0 })
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.withGallons, 1);
  assert.equal(c.nonReporting, 2, 'low gallons and short reporting: measured, excluded');
  assert.equal(c.missingGallons, 2, 'no figure at all, whatever the months say');
  assert.equal(c.withGallons + c.nonReporting + c.missingGallons, c.total,
    'the three buckets must partition the file, with no row in two of them');
});

test('the committed file partitions into 152 + 61 + 6', () => {
  // The three numbers the Network Locations card prints. They have to add up
  // to 219 on screen.
  const c = BDPG_STATS.completenessCounts(
    require('./network-locations.json').locations, BDPG_CONFIG.BASELINE_TABLE);
  assert.equal(c.total, 219);
  assert.equal(c.withGallons, 152, 'qualify and feed the averages');
  assert.equal(c.nonReporting, 61, 'have a figure and still fail a floor');
  assert.equal(c.missingGallons, 6, 'have no figure at all');
  assert.equal(c.withGallons + c.nonReporting + c.missingGallons, 219);
});

test('the committed file carries exactly the twelve fields the page expects', () => {
  // The page warns in red about any key it does not recognise, because an
  // unexpected field in a public file is how a member name or phone number
  // would leak. Nothing was testing it, and `sizeSource` sat in the committed
  // file firing that warning until someone happened to look -- a guard whose
  // alarm nobody checks is not a guard.
  //
  // This list must stay identical to BDPG.LOCATION_FIELDS in
  // bus-dev-potential-gallons/index.html. It is duplicated rather than
  // imported because that allowlist lives inside the page's inline script,
  // which has no module boundary to require across.
  const ALLOWED = ['avgGalMo', 'city', 'dieselLanes', 'distanceToInterstate',
    'gallons12mo', 'group', 'id', 'reportingMonths', 'roadway', 'size', 'state', 'type'];
  const locs = require('./network-locations.json').locations;
  const seen = [...new Set(locs.flatMap((l) => Object.keys(l)))].sort();
  assert.deepEqual(seen, ALLOWED.slice().sort());
  // Deliberately absent: `name`. Its absence is what makes the page's
  // unexpected-key warning fire if names ever leak into the public file.
  assert.ok(!seen.includes('name'));
});

// ── membership recommendation ───────────────────────────────────────────
// Bands are the network's own quartiles over the 190 reporting locations in
// network-locations.json (avgGalMo): p25 1,480 · median 6,059 · p75 17,455.

test('recommendation bands sit on the documented boundaries', () => {
  assert.equal(BDPG_STATS.recommendation(17500), 'Strong fit');
  assert.equal(BDPG_STATS.recommendation(17499), 'Good fit');
  assert.equal(BDPG_STATS.recommendation(6000),  'Good fit');
  assert.equal(BDPG_STATS.recommendation(5999),  'Marginal');
  assert.equal(BDPG_STATS.recommendation(1500),  'Marginal');
  assert.equal(BDPG_STATS.recommendation(1499),  'Below threshold');
  assert.equal(BDPG_STATS.recommendation(0),     'Below threshold');
});

test('a profile with no generated gallons has no recommendation, not a bad one', () => {
  // null gallons is a profile saved before Generate ran. Calling that
  // "Below threshold" would assert a verdict the calculator never produced.
  assert.equal(BDPG_STATS.recommendation(null), '');
  assert.equal(BDPG_STATS.recommendation(undefined), '');
  assert.equal(BDPG_STATS.recommendation(''), '');
  assert.equal(BDPG_STATS.recommendation(NaN), '');
  assert.equal(BDPG_STATS.recommendation('nonsense'), '');
  assert.equal(BDPG_STATS.recommendation({}), '');
});

test('a numeric string is accepted, as a stored jsonb value can be', () => {
  assert.equal(BDPG_STATS.recommendation('11153'), 'Good fit');
});

test('negative gallons cannot occur but must not fall through to a good band', () => {
  assert.equal(BDPG_STATS.recommendation(-1), 'Below threshold');
});
