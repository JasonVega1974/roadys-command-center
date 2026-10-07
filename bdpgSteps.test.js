'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BDPG_STEPS } = require('./bdpgSteps.js');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');

// A fully-populated input, so each test can vary one field.
function input(over) {
  return Object.assign({
    baseline: 42000,
    profile: 'Large truck stop',
    roadway: 'Interstate',
    regionPct: -0.042,
    reviewPct: 0.02,
    amenityLevelPct: 0.02,
    restroomPct: 0.02,
    rewardsPct: 0.015,
    pricingPct: 0.06
  }, over || {});
}

function byN(rows, n) { return rows.filter(r => r.n === n)[0]; }

// ── shape ───────────────────────────────────────────────────────────────

test('returns exactly seven rows, numbered 1-7 in order', () => {
  const rows = BDPG_STEPS.rows(input());
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(r => r.n), [1, 2, 3, 4, 5, 6, 7]);
});

test('every row carries the full field set, never undefined', () => {
  // The HTML renders these straight into markup; an undefined would print
  // the literal string "undefined" into a customer-facing sheet.
  BDPG_STEPS.rows(input()).forEach(r => {
    assert.equal(typeof r.title, 'string');
    assert.equal(typeof r.subtitle, 'string');
    assert.equal(typeof r.valueText, 'string');
    assert.ok(['gallons', 'pct', 'none'].indexOf(r.valueKind) !== -1);
  });
});

test('titles are the seven agreed step names in the agreed order', () => {
  assert.deepEqual(BDPG_STEPS.rows(input()).map(r => r.title), [
    'Profile / Roadway / Lanes',
    'Region',
    'Trucker Path Rating',
    'Amenities',
    'Restroom / Shower Condition',
    "Roady's Rewards Participation",
    'Discount Pricing Strategy'
  ]);
});

// ── step 1: baseline gallons, not a percentage ──────────────────────────

test('step 1 shows baseline gallons with a thousands separator', () => {
  const r = byN(BDPG_STEPS.rows(input()), 1);
  assert.equal(r.value, 42000);
  assert.equal(r.valueText, '42,000 gal/mo');
  assert.equal(r.valueKind, 'gallons');
});

test('step 1 subtitle joins profile and roadway', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 1).subtitle,
    'Large truck stop · Interstate');
});

test('step 1 subtitle keeps whichever part exists', () => {
  // Joining only when BOTH exist drops a roadway that is genuinely there.
  assert.equal(byN(BDPG_STEPS.rows(input({ profile: '' })), 1).subtitle, 'Interstate');
  assert.equal(byN(BDPG_STEPS.rows(input({ roadway: '' })), 1).subtitle, 'Large truck stop');
  assert.equal(byN(BDPG_STEPS.rows(input({ profile: '', roadway: '' })), 1).subtitle, '');
});

test('no profile chosen shows a dash, never null or NaN', () => {
  const r = byN(BDPG_STEPS.rows(input({ baseline: null })), 1);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
  assert.equal(r.valueKind, 'none');
});

// ── steps 2-7: signed percentages ───────────────────────────────────────

test('each adjustment step reads its own input', () => {
  const rows = BDPG_STEPS.rows(input());
  assert.equal(byN(rows, 2).value, -0.042);
  assert.equal(byN(rows, 3).value, 0.02);
  assert.equal(byN(rows, 4).value, 0.02);
  assert.equal(byN(rows, 5).value, 0.02);
  assert.equal(byN(rows, 6).value, 0.015);
  assert.equal(byN(rows, 7).value, 0.06);
});

test('positive percentages carry a plus and one decimal', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 3).valueText, '+2.0%');
});

test('negative percentages carry a minus sign', () => {
  assert.equal(byN(BDPG_STEPS.rows(input()), 2).valueText, '−4.2%');
});

test('zero renders as 0.0% with no sign', () => {
  // A "+" on zero asserts an increase that is not there, and zero is the
  // resting value of four of these six steps.
  const r = byN(BDPG_STEPS.rows(input({ rewardsPct: 0 })), 6);
  assert.equal(r.value, 0);
  assert.equal(r.valueText, '0.0%');
  assert.equal(r.valueKind, 'pct');
});

test('no state entered shows a dash rather than 0.0%', () => {
  // 0.0% would assert that the region was looked up and found neutral.
  const r = byN(BDPG_STEPS.rows(input({ regionPct: null })), 2);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
  assert.equal(r.valueKind, 'none');
});

test('a junk percentage degrades to a dash instead of printing NaN', () => {
  const r = byN(BDPG_STEPS.rows(input({ reviewPct: 'lots' })), 3);
  assert.equal(r.value, null);
  assert.equal(r.valueText, '—');
});

test('rows() survives being called with nothing at all', () => {
  const rows = BDPG_STEPS.rows();
  assert.equal(rows.length, 7);
  assert.equal(byN(rows, 1).valueText, '—');
});

// ── the invariant that ties steps 4 and 5 to the formula ────────────────

test('steps 4 and 5 sum to the formula\'s single combined amenity term', () => {
  // The formula has ONE amenity term; the step flow shows it as two rows
  // because they are two separate inputs. This pins the two surfaces to each
  // other rather than to a hand-computed constant: if either helper ever
  // changes, this fails rather than the UI quietly disagreeing with the math.
  const amenityLevel = 'Good / full service';
  const restroomLevel = 'Clean / updated';

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
    amenityLevelPct: BusDevGallonsCalc.amenityAdjustment(amenityLevel),
    restroomPct: BusDevGallonsCalc.restroomAdjustment(restroomLevel)
  }));

  const sum = byN(rows, 4).value + byN(rows, 5).value;
  assert.ok(Math.abs(sum - e.amenityPct) < 1e-9,
    'steps 4+5 (' + sum + ') must equal the formula amenityPct (' + e.amenityPct + ')');
});
