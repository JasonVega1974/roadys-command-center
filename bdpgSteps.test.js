'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BDPG_STEPS } = require('./bdpgSteps.js');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');

// A fully-populated input with SIX DISTINCT values, so no two adjustments
// share a figure. Equal values would let a test pass even if two entries had
// their fields swapped, because the assertions would be indistinguishable.
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

const k = (res, key) => BDPG_STEPS.byKey(res, key);

// ── zones ───────────────────────────────────────────────────────────────

test('splits into the unnumbered region panel and five numbered steps', () => {
  const r = BDPG_STEPS.rows(input());
  assert.equal(r.region.key, 'region');
  assert.deepEqual(r.steps.map(e => e.key),
    ['rating', 'amenities', 'restroom', 'rewards', 'pricing']);
});

test('region is unnumbered and the steps run 1-5 in order', () => {
  // The map IS the region input; a number chip on the panel heading would
  // read as a step to work through rather than a place to click.
  const r = BDPG_STEPS.rows(input());
  assert.equal(r.region.n, null);
  assert.deepEqual(r.steps.map(e => e.n), [1, 2, 3, 4, 5]);
});

test('titles are the six agreed names in the agreed places', () => {
  const r = BDPG_STEPS.rows(input());
  assert.equal(r.region.title, 'Region');
  assert.deepEqual(r.steps.map(e => e.title), [
    'Trucker Path Rating',
    'Amenities',
    'Restroom / Shower Condition',
    "Roady's Rewards Participation",
    'Discount Pricing Strategy'
  ]);
});

test('every entry in both panels carries the full field set, never undefined', () => {
  // These render straight into markup; an undefined would print the literal
  // string "undefined" into a customer-facing sheet.
  BDPG_STEPS.all(BDPG_STEPS.rows(input())).forEach(e => {
    assert.equal(typeof e.key, 'string');
    assert.equal(typeof e.title, 'string');
    assert.equal(typeof e.valueText, 'string');
    assert.ok(['pct', 'none'].indexOf(e.valueKind) !== -1);
  });
});

// ── lookup by key ───────────────────────────────────────────────────────

test('all() returns both panels in display order', () => {
  assert.deepEqual(BDPG_STEPS.all(BDPG_STEPS.rows(input())).map(e => e.key),
    ['region', 'rating', 'amenities', 'restroom', 'rewards', 'pricing']);
});

test('byKey finds entries in either panel, and null for an unknown key', () => {
  // The page patches one badge mid-drag by key: 'region' lives in the left
  // panel and 'pricing' in the right one, and the caller should not have to
  // know which.
  const r = BDPG_STEPS.rows(input());
  assert.equal(k(r, 'region').title, 'Region');
  assert.equal(k(r, 'pricing').title, 'Discount Pricing Strategy');
  assert.equal(k(r, 'nope'), null);
});

// ── each entry reads its own input ──────────────────────────────────────

test('each adjustment reads its own input and no other', () => {
  const r = BDPG_STEPS.rows(input());
  assert.equal(k(r, 'region').value, -0.042);
  assert.equal(k(r, 'rating').value, 0.01);
  assert.equal(k(r, 'amenities').value, 0.02);
  assert.equal(k(r, 'restroom').value, -0.02);
  assert.equal(k(r, 'rewards').value, 0.015);
  assert.equal(k(r, 'pricing').value, 0.06);
});

// ── formatting ──────────────────────────────────────────────────────────

test('positive percentages carry a plus and one decimal', () => {
  assert.equal(k(BDPG_STEPS.rows(input()), 'rating').valueText, '+1.0%');
});

test('negative percentages carry a minus sign', () => {
  assert.equal(k(BDPG_STEPS.rows(input()), 'region').valueText, '−4.2%');
});

test('zero renders as 0.0% with no sign', () => {
  // A "+" on zero asserts an increase that is not there, and zero is the
  // resting value of four of these six adjustments.
  const e = k(BDPG_STEPS.rows(input({ rewardsPct: 0 })), 'rewards');
  assert.equal(e.value, 0);
  assert.equal(e.valueText, '0.0%');
  assert.equal(e.valueKind, 'pct');
});

test('a near-zero percentage that rounds to 0.0 prints unsigned, either direction', () => {
  // The sign comes from the ROUNDED magnitude. A signed "0.0%" would assert
  // a direction the displayed figure does not show.
  assert.equal(k(BDPG_STEPS.rows(input({ regionPct: -0.0004 })), 'region').valueText, '0.0%');
  assert.equal(k(BDPG_STEPS.rows(input({ regionPct: 0.0003 })), 'region').valueText, '0.0%');
});

test('no state entered shows a dash rather than 0.0%', () => {
  // 0.0% would assert that the region was looked up and found neutral.
  const e = k(BDPG_STEPS.rows(input({ regionPct: null })), 'region');
  assert.equal(e.value, null);
  assert.equal(e.valueText, '—');
  assert.equal(e.valueKind, 'none');
});

test('a junk percentage degrades to a dash instead of printing NaN', () => {
  const e = k(BDPG_STEPS.rows(input({ reviewPct: 'lots' })), 'rating');
  assert.equal(e.value, null);
  assert.equal(e.valueText, '—');
});

test('rows() survives being called with nothing at all', () => {
  const r = BDPG_STEPS.rows();
  assert.equal(r.region.key, 'region');
  assert.equal(r.steps.length, 5);
  assert.equal(k(r, 'region').valueText, '—');
});

// ── the invariant that ties two of the steps to the formula ─────────────

test('amenities and restroom sum to the formula\'s single combined amenity term, and map to the right fields', () => {
  // The formula has ONE amenity term; the flow shows it as two rows because
  // they are two separate inputs. This pins the two surfaces to each other
  // rather than to a hand-computed constant: if either helper ever changes,
  // this fails rather than the UI quietly disagreeing with the math.
  //
  // The two levels below resolve to DIFFERENT adjustments (-0.05 vs +0.02),
  // deliberately: a same-valued fixture would pass even if the two entries
  // had their fields swapped, because the sum is commutative. Asserting each
  // entry individually, not just the sum, is what catches a swap.
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

  const r = BDPG_STEPS.rows(input({
    amenityLevelPct: amenityAdj,
    restroomPct: restroomAdj
  }));

  assert.equal(k(r, 'amenities').value, amenityAdj);
  assert.equal(k(r, 'restroom').value, restroomAdj);

  const sum = k(r, 'amenities').value + k(r, 'restroom').value;
  assert.ok(Math.abs(sum - e.amenityPct) < 1e-9,
    'amenities+restroom (' + sum + ') must equal the formula amenityPct (' + e.amenityPct + ')');
});
