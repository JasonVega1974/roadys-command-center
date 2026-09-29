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

// ── lane tiers ──────────────────────────────────────────────────────────────

test('laneTierFor maps pump counts onto the BASELINE_TABLE bands', () => {
  assert.equal(BDPG_STATS.laneTierFor(1), '1-2');
  assert.equal(BDPG_STATS.laneTierFor(2), '1-2');
  assert.equal(BDPG_STATS.laneTierFor(3), '3-5');
  assert.equal(BDPG_STATS.laneTierFor(5), '3-5');
  assert.equal(BDPG_STATS.laneTierFor(6), '6+');
  assert.equal(BDPG_STATS.laneTierFor(40), '6+');
});

test('laneTierFor rejects zero, negatives and unknowns', () => {
  // Zero diesel pumps is not a 1-2 lane site; it is a row that should not be
  // in the analysis at all.
  assert.equal(BDPG_STATS.laneTierFor(0), null);
  assert.equal(BDPG_STATS.laneTierFor(-3), null);
  assert.equal(BDPG_STATS.laneTierFor(null), null);
  assert.equal(BDPG_STATS.laneTierFor(''), null);
  assert.equal(BDPG_STATS.laneTierFor('abc'), null);
});

test('every lane band in BASELINE_TABLE is reachable from some pump count', () => {
  const bands = new Set(TABLE.map((r) => r.lanes));
  const produced = new Set([1, 2, 3, 4, 5, 6, 12].map(BDPG_STATS.laneTierFor));
  bands.forEach((b) => assert.ok(produced.has(b), `no pump count maps to ${b}`));
});

// ── profile matching ────────────────────────────────────────────────────────

const loc = (o) => Object.assign(
  { id: 'LOC-000', type: 'Truck Stop', size: '', roadway: '', dieselLanes: null, avgGalMo: 1000 }, o
);

test('a fuel stop maps on Type alone, ignoring size, roadway and lanes', () => {
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ type: 'Fuel Stop', size: '', roadway: '', dieselLanes: 9 }), TABLE);
  assert.equal(m.status, 'ok');
  assert.equal(m.row.profile, 'Fuel stop');
  assert.equal(m.row.roadway, 'Any');
});

test('service centers and c-stores are not-applicable, not incomplete', () => {
  for (const t of ['Service Center', 'C-Store', 'Something Else']) {
    assert.equal(BDPG_STATS.matchBaselineProfile(loc({ type: t }), TABLE).status,
      'not-applicable', t);
  }
});

test('a truck stop with no size needs size', () => {
  assert.equal(
    BDPG_STATS.matchBaselineProfile(loc({ roadway: 'Highway', size: '' }), TABLE).status,
    'need-size');
  assert.equal(
    BDPG_STATS.matchBaselineProfile(loc({ roadway: 'Highway', size: 'Unknown' }), TABLE).status,
    'need-size');
});

test('a truck stop with a size but no roadway needs roadway', () => {
  assert.equal(
    BDPG_STATS.matchBaselineProfile(loc({ size: 'Small', roadway: '' }), TABLE).status,
    'need-roadway');
  assert.equal(
    BDPG_STATS.matchBaselineProfile(loc({ size: 'Small', roadway: 'Unknown' }), TABLE).status,
    'need-roadway');
});

test('size + roadway resolve to the matching BASELINE_TABLE row', () => {
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ size: 'Medium', roadway: 'Interstate', dieselLanes: 8 }), TABLE);
  assert.equal(m.status, 'ok');
  assert.equal(m.row.profile, 'Medium truck stop');
  assert.equal(m.row.roadway, 'Interstate');
  assert.equal(m.row.baseline, 12500);
});

test('Medium and Large on a Backroad have no profile and cannot be fixed by filling fields', () => {
  // BASELINE_TABLE only carries Small truck stop / Backroad.
  for (const size of ['Medium', 'Large']) {
    const m = BDPG_STATS.matchBaselineProfile(loc({ size, roadway: 'Backroad' }), TABLE);
    assert.equal(m.status, 'no-profile', size);
  }
  assert.equal(
    BDPG_STATS.matchBaselineProfile(loc({ size: 'Small', roadway: 'Backroad' }), TABLE).status,
    'ok');
});

test('a lanes/roadway conflict is reported even when Size is still unset', () => {
  // The conflict does not depend on size: every roadway in BASELINE_TABLE
  // carries one lane band. Hiding it behind 'need-size' would have someone
  // research and set a size before learning the row was never going to map.
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ size: '', roadway: 'Interstate', dieselLanes: 4 }), TABLE);
  assert.equal(m.status, 'lane-conflict');
  assert.equal(m.expectedLanes, '6+');
  assert.equal(m.laneTier, '3-5');
});

test('each roadway in BASELINE_TABLE implies exactly one lane band', () => {
  // The precondition the pre-size conflict check rests on.
  const bands = {};
  TABLE.forEach((r) => {
    if (r.roadway === 'Any') return;
    bands[r.roadway] = bands[r.roadway] || new Set();
    bands[r.roadway].add(r.lanes);
  });
  Object.keys(bands).forEach((rw) => {
    assert.equal(bands[rw].size, 1, `${rw} spans ${[...bands[rw]].join('/')}`);
  });
});

test('roadway and pump count disagreeing is a conflict, not a silent pick', () => {
  // Interstate expects 6+; four pumps is the 3-5 band.
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ size: 'Small', roadway: 'Interstate', dieselLanes: 4 }), TABLE);
  assert.equal(m.status, 'lane-conflict');
  assert.equal(m.laneTier, '3-5');
  assert.equal(m.expectedLanes, '6+');
  assert.equal(m.row, null);
});

test('an unknown pump count is never a conflict', () => {
  for (const lanes of [null, '', 0, 'x']) {
    const m = BDPG_STATS.matchBaselineProfile(
      loc({ size: 'Small', roadway: 'Interstate', dieselLanes: lanes }), TABLE);
    assert.equal(m.status, 'ok', String(lanes));
  }
});

test('an agreeing pump count maps normally', () => {
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ size: 'Small', roadway: 'Interstate', dieselLanes: 8 }), TABLE);
  assert.equal(m.status, 'ok');
  assert.equal(m.row.baseline, 7500);
});

test('a fuel stop never conflicts on lanes', () => {
  // Its profile is roadway 'Any', so there is no pair to contradict.
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ type: 'Fuel Stop', dieselLanes: 20 }), TABLE);
  assert.equal(m.status, 'ok');
});

test('type matching is case- and whitespace-insensitive', () => {
  assert.equal(BDPG_STATS.matchBaselineProfile(loc({ type: '  fuel stop ' }), TABLE).status, 'ok');
  assert.equal(BDPG_STATS.typeClass('TRUCK STOP'), 'truckstop');
});

// ── roll-up ─────────────────────────────────────────────────────────────────

test('summarizeByProfile returns one entry per baseline row, in table order', () => {
  const out = BDPG_STATS.summarizeByProfile([], TABLE);
  assert.equal(out.length, TABLE.length);
  out.forEach((r, i) => {
    assert.equal(r.profile, TABLE[i].profile);
    assert.equal(r.roadway, TABLE[i].roadway);
    assert.equal(r.currentBaseline, TABLE[i].baseline);
  });
});

test('an empty profile reports null median and no false zero', () => {
  const out = BDPG_STATS.summarizeByProfile([], TABLE);
  out.forEach((r) => {
    assert.equal(r.median, null);
    assert.equal(r.p25, null);
    assert.equal(r.p75, null);
    assert.equal(r.delta, null);
    assert.equal(r.n, 0);
  });
});

test('medians are computed per profile and the delta is against the live baseline', () => {
  const locs = [
    loc({ id: 'A', size: 'Small', roadway: 'Highway', dieselLanes: 4, avgGalMo: 5000 }),
    loc({ id: 'B', size: 'Small', roadway: 'Highway', dieselLanes: 4, avgGalMo: 7000 }),
    loc({ id: 'C', size: 'Large', roadway: 'Interstate', dieselLanes: 9, avgGalMo: 20000 })
  ];
  const out = BDPG_STATS.summarizeByProfile(locs, TABLE);
  const smallHwy = out.find((r) => r.profile === 'Small truck stop' && r.roadway === 'Highway');
  assert.equal(smallHwy.n, 2);
  assert.equal(smallHwy.median, 6000);
  assert.equal(smallHwy.currentBaseline, 4000);
  assert.equal(smallHwy.delta, 2000);

  const largeInt = out.find((r) => r.profile === 'Large truck stop' && r.roadway === 'Interstate');
  assert.equal(largeInt.n, 1);
  assert.equal(largeInt.median, 20000);
  assert.equal(largeInt.delta, 5000);
});

test('conflicted and unmapped locations feed no median', () => {
  const locs = [
    loc({ id: 'OK', size: 'Small', roadway: 'Interstate', dieselLanes: 8, avgGalMo: 1000 }),
    loc({ id: 'CONFLICT', size: 'Small', roadway: 'Interstate', dieselLanes: 4, avgGalMo: 999999 }),
    loc({ id: 'NOSIZE', roadway: 'Interstate', dieselLanes: 8, avgGalMo: 999999 }),
    loc({ id: 'NA', type: 'C-Store', avgGalMo: 999999 })
  ];
  const out = BDPG_STATS.summarizeByProfile(locs, TABLE);
  const smallInt = out.find((r) => r.profile === 'Small truck stop' && r.roadway === 'Interstate');
  assert.equal(smallInt.n, 1);
  assert.equal(smallInt.median, 1000);
});

test('nMapped counts mapped rows while n counts only those with usable gallons', () => {
  const locs = [
    loc({ id: 'A', size: 'Small', roadway: 'Highway', avgGalMo: 5000 }),
    loc({ id: 'B', size: 'Small', roadway: 'Highway', avgGalMo: null })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Small truck stop' && x.roadway === 'Highway');
  assert.equal(r.nMapped, 2);
  assert.equal(r.n, 1);
  assert.equal(r.median, 5000);
});

test('nManualSize counts hand-set sizes, the circularity guard', () => {
  const locs = [
    loc({ id: 'A', size: 'Small', roadway: 'Highway', avgGalMo: 5000, sizeOrigin: 'manual' }),
    loc({ id: 'B', size: 'Small', roadway: 'Highway', avgGalMo: 6000, sizeOrigin: 'manual' }),
    loc({ id: 'C', size: 'Small', roadway: 'Highway', avgGalMo: 7000 })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Small truck stop' && x.roadway === 'Highway');
  assert.equal(r.n, 3);
  assert.equal(r.nManualSize, 2);
});

// ── completeness ────────────────────────────────────────────────────────────

test('completeness separates not-applicable from incomplete', () => {
  const locs = [
    loc({ id: '1', size: 'Small', roadway: 'Highway', avgGalMo: 100 }),
    loc({ id: '2', type: 'Fuel Stop', avgGalMo: 100 }),
    loc({ id: '3', type: 'Service Center' }),
    loc({ id: '4', type: 'C-Store' }),
    loc({ id: '5', roadway: 'Highway' }),
    loc({ id: '6', size: 'Small' }),
    loc({ id: '7', size: 'Small', roadway: 'Interstate', dieselLanes: 3 }),
    loc({ id: '8', size: 'Large', roadway: 'Backroad' })
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.total, 8);
  assert.equal(c.complete, 2);
  assert.equal(c.notApplicable, 2);
  assert.equal(c.incomplete, 4);
  assert.equal(c.needSize, 1);
  assert.equal(c.needRoadway, 1);
  assert.equal(c.laneConflict, 1);
  assert.equal(c.noProfile, 1);
  // complete + notApplicable + incomplete accounts for every row exactly once.
  assert.equal(c.complete + c.notApplicable + c.incomplete, c.total);
});

test('withGallons never exceeds complete', () => {
  // Above the reporting floor on purpose: withGallons means "a figure the
  // medians will use", so a sub-floor value would correctly count zero here
  // and this test would stop measuring what it is named for.
  const locs = [
    loc({ id: '1', size: 'Small', roadway: 'Highway', avgGalMo: 5000 }),
    loc({ id: '2', size: 'Small', roadway: 'Highway', avgGalMo: null })
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.complete, 2);
  assert.equal(c.withGallons, 1);
});

test('completeness of an empty set is all zeros, not NaN', () => {
  const c = BDPG_STATS.completenessCounts([], TABLE);
  assert.equal(c.total, 0);
  assert.equal(c.complete, 0);
  assert.equal(c.incomplete, 0);
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
    loc({ id: 'A', size: 'Small', roadway: 'Highway', avgGalMo: 5000 }),
    loc({ id: 'B', size: 'Small', roadway: 'Highway', avgGalMo: 7000 }),
    loc({ id: 'Z1', size: 'Small', roadway: 'Highway', avgGalMo: 0 }),
    loc({ id: 'Z2', size: 'Small', roadway: 'Highway', avgGalMo: 9 }),
    loc({ id: 'M', size: 'Small', roadway: 'Highway', avgGalMo: null })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Small truck stop' && x.roadway === 'Highway');
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
  for (let i = 0; i < 4; i++) locs.push(loc({ id: 'U' + i, size: 'Large', roadway: 'Interstate', avgGalMo: 20000 }));
  for (let i = 0; i < 6; i++) locs.push(loc({ id: 'N' + i, size: 'Large', roadway: 'Interstate', avgGalMo: 3 }));
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Large truck stop' && x.roadway === 'Interstate');
  assert.equal(r.nMapped, 10);
  assert.equal(r.n, 4);
  assert.ok(r.n < 5, 'must not clear the n>=5 gate on the strength of non-reporting rows');
});

test('completeness counts non-reporting across the whole file', () => {
  const locs = [
    loc({ id: '1', size: 'Small', roadway: 'Highway', avgGalMo: 5000 }),
    loc({ id: '2', size: 'Small', roadway: 'Highway', avgGalMo: 10 }),
    loc({ id: '3', roadway: 'Highway', avgGalMo: 0 }),      // unsized AND non-reporting
    loc({ id: '4', type: 'C-Store', avgGalMo: 1 })          // N/A AND non-reporting
  ];
  const c = BDPG_STATS.completenessCounts(locs, TABLE);
  assert.equal(c.nonReporting, 3);
  assert.equal(c.complete, 2);
  assert.equal(c.withGallons, 1, 'withGallons must mean "the medians will use it"');
});

// ── type mapping decisions ──────────────────────────────────────────────────

test('Truck Stop / Service Center maps as a truck stop', () => {
  assert.equal(BDPG_STATS.typeClass('Truck Stop / Service Center'), 'truckstop');
  const m = BDPG_STATS.matchBaselineProfile(
    loc({ type: 'Truck Stop / Service Center', size: 'Medium', roadway: 'Highway', dieselLanes: 4 }), TABLE);
  assert.equal(m.status, 'ok');
  assert.equal(m.row.profile, 'Medium truck stop');
});

test('Truck Stop / Service Center tolerates spacing and case', () => {
  assert.equal(BDPG_STATS.typeClass('truck stop  /  service center'), 'truckstop');
  assert.equal(BDPG_STATS.typeClass('TRUCK STOP / SERVICE CENTER'), 'truckstop');
});

test('PPO stays unmapped', () => {
  assert.equal(BDPG_STATS.typeClass('PPO'), 'none');
  assert.equal(BDPG_STATS.matchBaselineProfile(loc({ type: 'PPO' }), TABLE).status, 'not-applicable');
});

test('Service Center alone is still not a truck stop', () => {
  // Only the combined type maps; a pure service centre sells no diesel.
  assert.equal(BDPG_STATS.typeClass('Service Center'), 'none');
});

// ── lane-size rule ──────────────────────────────────────────────────────────

test('the lane rule maps each tier to one size', () => {
  assert.deepEqual(BDPG_STATS.LANE_SIZE_RULE, { '1-2': 'Small', '3-5': 'Medium', '6+': 'Large' });
  assert.equal(BDPG_STATS.suggestSizeFromLanes(1), 'Small');
  assert.equal(BDPG_STATS.suggestSizeFromLanes(2), 'Small');
  assert.equal(BDPG_STATS.suggestSizeFromLanes(3), 'Medium');
  assert.equal(BDPG_STATS.suggestSizeFromLanes(5), 'Medium');
  assert.equal(BDPG_STATS.suggestSizeFromLanes(6), 'Large');
  assert.equal(BDPG_STATS.suggestSizeFromLanes(40), 'Large');
});

test('the lane rule refuses unknown or impossible pump counts', () => {
  [null, undefined, '', 0, -1, 'x', {}].forEach((v) => {
    assert.equal(BDPG_STATS.suggestSizeFromLanes(v), null, JSON.stringify(v));
  });
});

test('the lane rule only ever emits sizes BASELINE_TABLE knows', () => {
  Object.keys(BDPG_STATS.LANE_SIZE_RULE).forEach((tier) => {
    assert.ok(BDPG_STATS.SIZES.indexOf(BDPG_STATS.LANE_SIZE_RULE[tier]) !== -1, tier);
  });
});

test('rule-sized and hand-sized are counted apart', () => {
  const locs = [
    loc({ id: 'H1', size: 'Small', roadway: 'Highway', avgGalMo: 5000, sizeOrigin: 'manual' }),
    loc({ id: 'R1', size: 'Small', roadway: 'Highway', avgGalMo: 6000, sizeOrigin: 'lanes' }),
    loc({ id: 'R2', size: 'Small', roadway: 'Highway', avgGalMo: 7000, sizeOrigin: 'lanes' })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Small truck stop' && x.roadway === 'Highway');
  assert.equal(r.nManualSize, 1);
  assert.equal(r.nRuleSized, 2);
  assert.equal(r.n, 3);
});

test('ruleSizedMajority gates on the usable sample, not the mapped one', () => {
  // Two usable hand-sized rows, plus three rule-sized rows that the reporting
  // floor keeps out of the median. The median rests entirely on hand-set
  // sizes, so this profile must NOT be blocked.
  const locs = [
    loc({ id: 'H1', size: 'Large', roadway: 'Interstate', avgGalMo: 20000, sizeOrigin: 'manual' }),
    loc({ id: 'H2', size: 'Large', roadway: 'Interstate', avgGalMo: 22000, sizeOrigin: 'manual' }),
    loc({ id: 'R1', size: 'Large', roadway: 'Interstate', avgGalMo: 3, sizeOrigin: 'lanes' }),
    loc({ id: 'R2', size: 'Large', roadway: 'Interstate', avgGalMo: 4, sizeOrigin: 'lanes' }),
    loc({ id: 'R3', size: 'Large', roadway: 'Interstate', avgGalMo: 5, sizeOrigin: 'lanes' })
  ];
  const r = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .find((x) => x.profile === 'Large truck stop' && x.roadway === 'Interstate');
  assert.equal(r.nRuleSized, 3);
  assert.equal(r.nRuleSizedUsable, 0);
  assert.equal(r.ruleSizedMajority, false);
});

test('ruleSizedMajority is true only on a strict majority', () => {
  function build(nRule, nManual) {
    const l = [];
    for (let i = 0; i < nRule; i++) l.push(loc({ id: 'R' + i, size: 'Medium', roadway: 'Highway', avgGalMo: 5000, sizeOrigin: 'lanes' }));
    for (let i = 0; i < nManual; i++) l.push(loc({ id: 'H' + i, size: 'Medium', roadway: 'Highway', avgGalMo: 5000, sizeOrigin: 'manual' }));
    return BDPG_STATS.summarizeByProfile(l, TABLE)
      .find((x) => x.profile === 'Medium truck stop' && x.roadway === 'Highway');
  }
  assert.equal(build(2, 2).ruleSizedMajority, false, 'exactly half is not a majority');
  assert.equal(build(3, 2).ruleSizedMajority, true);
  assert.equal(build(0, 4).ruleSizedMajority, false);
  assert.equal(build(4, 0).ruleSizedMajority, true);
  assert.equal(build(0, 0).ruleSizedMajority, false, 'an empty sample is not majority anything');
});

// The property that makes the rule triage rather than evidence. Pinned so a
// later "improvement" that lets rule-sized profiles feed Apply has to delete
// a test that explains why it must not.
test('PROPERTY: the lane rule makes Size a relabel of Roadway, not new information', () => {
  // Build one non-conflicted truck stop for every roadway at every pump count
  // that agrees with it, size them all by the rule, and check that roadway
  // alone determines the size that came out.
  const byRoadway = { Backroad: [1, 2], Highway: [3, 4, 5], Interstate: [6, 9, 20] };
  const seen = {};
  Object.keys(byRoadway).forEach((rw) => {
    byRoadway[rw].forEach((lanes) => {
      const size = BDPG_STATS.suggestSizeFromLanes(lanes);
      const l = loc({ roadway: rw, dieselLanes: lanes, size, sizeOrigin: 'lanes' });
      // Precondition: agreeing pump counts must not be conflicts.
      assert.equal(BDPG_STATS.matchBaselineProfile(l, TABLE).status, 'ok', `${rw}/${lanes}`);
      seen[rw] = seen[rw] || new Set();
      seen[rw].add(size);
    });
  });
  Object.keys(seen).forEach((rw) => {
    assert.equal(seen[rw].size, 1,
      `${rw} produced ${[...seen[rw]].join('/')} — if this ever exceeds 1 the rule has stopped being collinear with roadway and the Apply block can be revisited`);
  });
  assert.deepEqual([...seen.Backroad], ['Small']);
  assert.deepEqual([...seen.Highway], ['Medium']);
  assert.deepEqual([...seen.Interstate], ['Large']);
});

test('Size only participates in a truck stop profile lookup', () => {
  assert.equal(BDPG_STATS.sizeAffectsProfile('Truck Stop'), true);
  assert.equal(BDPG_STATS.sizeAffectsProfile('Truck Stop / Service Center'), true);
  assert.equal(BDPG_STATS.sizeAffectsProfile('Fuel Stop'), false);
  assert.equal(BDPG_STATS.sizeAffectsProfile('C-Store'), false);
  assert.equal(BDPG_STATS.sizeAffectsProfile('PPO'), false);
});

test('a size on a fuel stop cannot change how it maps', () => {
  // The invariant behind sizeAffectsProfile: if a fuel stop's mapping is
  // indifferent to Size, then nothing derived from Size may disqualify it.
  const sizes = ['', 'Small', 'Medium', 'Large'];
  const rows = sizes.map((s) => BDPG_STATS.matchBaselineProfile(
    loc({ type: 'Fuel Stop', size: s, sizeOrigin: s ? 'lanes' : '' }), TABLE));
  rows.forEach((m, i) => {
    assert.equal(m.status, 'ok', sizes[i]);
    assert.equal(m.row.profile, 'Fuel stop', sizes[i]);
  });
});

test('PROPERTY: the lane rule can populate only 3 of the 7 truck-stop profiles', () => {
  // Every non-conflicted truck stop, sized by the rule, across every roadway
  // and pump count. Four profiles stay empty no matter how much data arrives
  // -- including Small truck stop / Highway, whose baseline was the one
  // changed on 2026-09-24.
  const locs = [];
  [['Backroad', 1], ['Backroad', 2], ['Highway', 3], ['Highway', 4], ['Highway', 5],
    ['Interstate', 6], ['Interstate', 10], ['Interstate', 30]].forEach((p, i) => {
    locs.push(loc({
      id: 'P' + i, roadway: p[0], dieselLanes: p[1],
      size: BDPG_STATS.suggestSizeFromLanes(p[1]), sizeOrigin: 'lanes', avgGalMo: 5000
    }));
  });
  const populated = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .filter((s) => s.nMapped > 0)
    .map((s) => s.profile + '/' + s.roadway);
  assert.deepEqual(populated.sort(), [
    'Large truck stop/Interstate',
    'Medium truck stop/Highway',
    'Small truck stop/Backroad'
  ]);
  const empty = BDPG_STATS.summarizeByProfile(locs, TABLE)
    .filter((s) => s.nMapped === 0 && s.profile !== 'Fuel stop')
    .map((s) => s.profile + '/' + s.roadway);
  assert.ok(empty.indexOf('Small truck stop/Highway') !== -1,
    'Small/Highway must be unreachable by the rule alone');
  assert.equal(empty.length, 4);
});
