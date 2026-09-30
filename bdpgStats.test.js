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

const loc = (o) => Object.assign(
  { id: 'R1', type: 'Truck Stop', roadway: 'Highway', dieselLanes: 5, avgGalMo: 8000 }, o);

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
  assert.equal(b.n, 2);
  assert.equal(b.source, 'static');
  assert.equal(b.baseline, 7500);
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

test('the reporting floor is 500 gal/mo', () => {
  assert.equal(BDPG_STATS.MIN_REPORTING_GAL_MO, 500);
});

test('gallonStatus separates missing from non-reporting from usable', () => {
  assert.equal(BDPG_STATS.gallonStatus(null), 'missing');
  assert.equal(BDPG_STATS.gallonStatus(undefined), 'missing');
  assert.equal(BDPG_STATS.gallonStatus(''), 'missing');
  // A reported zero is a claim about the location; a missing figure is not.
  assert.equal(BDPG_STATS.gallonStatus(0), 'non-reporting');
  assert.equal(BDPG_STATS.gallonStatus(499), 'non-reporting');
  assert.equal(BDPG_STATS.gallonStatus(500), 'usable');
  assert.equal(BDPG_STATS.gallonStatus(501), 'usable');
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
  // 570, 625, 2067, 2694, 3318, 5630, 5667, 16014, 17455
  assert.equal(floored.n, 9);
  assert.equal(floored.nNonReporting, 15);
  assert.equal(floored.n + floored.nNonReporting, 24);
  assert.equal(floored.median, 3318);
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
  ['PPO', 'ppo', ' C-Store ', 'c-store'].forEach((t) => {
    assert.equal(BDPG_STATS.isExcludedNetworkType(t), true, t);
  });
  ['Truck Stop', 'Fuel Stop', 'Service Center', '', null, 'PPO Plus'].forEach((t) => {
    assert.equal(BDPG_STATS.isExcludedNetworkType(t), false, String(t));
  });
});

test('Service Center is deliberately not excluded from the network counts', () => {
  // It has no baseline profile, but it was never in network-locations.json
  // either, so dropping it would not reconcile anything. Pinning the decision
  // so a later "make it consistent" change has to be a deliberate one.
  assert.deepEqual(BDPG_STATS.EXCLUDED_NETWORK_TYPES, ['PPO', 'C-Store']);
});

