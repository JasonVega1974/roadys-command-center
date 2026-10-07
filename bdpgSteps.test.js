'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BDPG_STEPS } = require('./bdpgSteps.js');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');

// A fully-populated input, so each test can vary one field. Every one of the
// six adjustment steps carries a DISTINCT value (and restroomPct is the
// opposite sign of amenityLevelPct) so that a swap of any two fields -- e.g.
// rows 4 and 5 trading places -- changes both the values and their rendered
// signs, rather than silently passing because two steps happened to share
// a number.
function input(over) {
  return Object.assign({
    regionPct: -0.042,
    reviewPct: 0.01,
    amenityLevelPct: 0.02,
    restroomPct: -0.02,
    rewardsPct: 0.015,
    pricingPct: 0.06
  }, over || {});
}

function byN(rows, n) { return rows.filter(r => r.n === n)[0]; }

// ── shape ───────────────────────────────────────────────────────────────

test('returns exactly six rows, numbered 1-6 in order', () => {
  const rows = BDPG_STEPS.rows(input());
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(r => r.n), [1, 2, 3, 4, 5, 6]);
});

test('every row carries the full field set, never undefined', () => {
  // The HTML renders these straight into markup; an undefined would print
  // the literal string "undefined" into a customer-facing sheet.
  BDPG_STEPS.rows(input()).forEach(r => {
    assert.equal(typeof r.title, 'string');
    assert.equal(typeof r.subtitle, 'string');
    assert.equal(typeof r.valueText, 'string');
    assert.ok(['pct', 'none'].indexOf(r.valueKind) !== -1);
  });
});

test('titles are the six agreed step names in the agreed order', () => {
  assert.deepEqual(BDPG_STEPS.rows(input()).map(r => r.title), [
    'Region',
    'Trucker Path Rating',
    'Amenities',
    'Restroom / Shower Condition',
    "Roady's Rewards Participation",
    'Discount Pricing Strategy'
  ]);
});

// ── every step is a signed percentage ───────────────────────────────────────

test('each adjustment step reads its own input', () => {
  // Every value here is distinct across steps 2-7 -- see the comment on
  // input() -- so this also catches two fields being swapped with each
  // other, not just a field being misread as a constant.
  const rows = BDPG_STEPS.rows(input());
  assert.equal(byN(rows, 1).value, -0.042);
  assert.equal(byN(rows, 2).value, 0.01);
  assert.equal(byN(rows, 3).value, 0.02);
  assert.equal(byN(rows, 4).value, -0.02);
  assert.equal(byN(rows, 5).value, 0.015);
  assert.equal(byN(rows, 6).value, 0.06);
});

test('positive percentages carry a plus and one decimal', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 2).valueText, '+1.0%');
});

test('negative percentages carry a minus sign', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 1).valueText, '−4.2%');
});

test('zero renders as 0.0% with no sign', () => {
  // A "+" on zero asserts an increase that is not there, and zero is the
  // resting value of four of these six steps.
  const r = byN(BDPG_STEPS.rows(input({ rewardsPct: 0 })), 5);
  assert.equal(r.value, 0);
  assert.equal(r.valueText, '0.0%');
  assert.equal(r.valueKind, 'pct');
});

test('a near-zero percentage that rounds to 0.0 prints unsigned, either direction', () => {
  // The sign has to come from the ROUNDED magnitude, not the raw value.
  // -0.0004 (i.e. -0.04%) rounds to "0.0" at one decimal -- a "−0.0%" would
  // assert a decrease that doesn't show up in the printed figure, same as
  // the exact-zero case above but from the negative side. regionPct is
  // admin-editable, so this is reachable, not just a theoretical rounding
  // edge.
  const neg = byN(BDPG_STEPS.rows(input({ regionPct: -0.0004 })), 1);
  assert.equal(neg.valueText, '0.0%');

  const pos = byN(BDPG_STEPS.rows(input({ regionPct: 0.0003 })), 1);
  assert.equal(pos.valueText, '0.0%');
});

test('no state entered shows a dash rather than 0.0%', () => {
  // 0.0% would assert that the region was looked up and found neutral.
  const r = byN(BDPG_STEPS.rows(input({ regionPct: null })), 1);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
  assert.equal(r.valueKind, 'none');
});

test('a junk percentage degrades to a dash instead of printing NaN', () => {
  const r = byN(BDPG_STEPS.rows(input({ reviewPct: 'lots' })), 2);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
});

test('rows() survives being called with nothing at all', () => {
  const rows = BDPG_STEPS.rows();
  assert.equal(rows.length, 6);
  assert.equal(byN(rows, 1).valueText, '—');
});

// ── the invariant that ties steps 3 and 4 to the formula ────────────────

test('steps 3 and 4 sum to the formula\'s single combined amenity term, and map to the right fields', () => {
  // The formula has ONE amenity term; the step flow shows it as two rows
  // because they are two separate inputs. This pins the two surfaces to each
  // other rather than to a hand-computed constant: if either helper ever
  // changes, this fails rather than the UI quietly disagreeing with the math.
  //
  // The two levels below resolve to DIFFERENT adjustments (-0.05 vs +0.02),
  // deliberately: a same-valued fixture would pass this test even if rows 3
  // and 4 had their fields swapped, because the sum is commutative. Asserting
  // each row individually, not just the sum, is what catches a swap.
  const amenityLevel = 'Very limited';
  const restroomLevel = 'Clean / updated';

  const amenityAdj = BusDevGallonsCalc.amenityAdjustment(amenityLevel);
  const restroomAdj = BusDevGallonsCalc.restroomAdjustment(restroomLevel);

  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop',
    roadway: 'Interstate',
    regionPct: 0,
    amenityLevel: amenityLevel,
    restroomLevel: restroomLevel,
    reviewRating: '',
    pricingLevel: 0,
    rewardsLevel: ''
  });
  assert.ok(e, 'expected a real estimate for this profile/roadway pair');

  const rows = BDPG_STEPS.rows(input({
    amenityLevelPct: amenityAdj,
    restroomPct: restroomAdj
  }));

  assert.equal(byN(rows, 3).value, amenityAdj);
  assert.equal(byN(rows, 4).value, restroomAdj);

  const sum = byN(rows, 3).value + byN(rows, 4).value;
  assert.ok(Math.abs(sum - e.amenityPct) < 1e-9,
    'steps 3+4 (' + sum + ') must equal the formula amenityPct (' + e.amenityPct + ')');
});
