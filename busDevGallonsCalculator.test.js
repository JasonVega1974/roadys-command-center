'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');

test('getProfiles returns the 4 distinct profiles in table order', () => {
  assert.deepEqual(BusDevGallonsCalc.getProfiles(), [
    'Fuel stop', 'Small truck stop', 'Medium truck stop', 'Large truck stop'
  ]);
});

test('getValidRoadways returns only roadways that exist for that profile', () => {
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Fuel stop'), ['Any']);
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Small truck stop'), ['Backroad', 'Highway', 'Interstate']);
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Medium truck stop'), ['Highway', 'Interstate']);
  assert.deepEqual(BusDevGallonsCalc.getValidRoadways('Large truck stop'), ['Highway', 'Interstate']);
});

test('getValidRoadways never offers Backroad for Medium or Large (open item 2)', () => {
  assert.ok(!BusDevGallonsCalc.getValidRoadways('Medium truck stop').includes('Backroad'));
  assert.ok(!BusDevGallonsCalc.getValidRoadways('Large truck stop').includes('Backroad'));
});

test('getBaselineRow returns the exact row for a valid combination', () => {
  assert.deepEqual(BusDevGallonsCalc.getBaselineRow('Medium truck stop', 'Interstate'), {
    profile: 'Medium truck stop', roadway: 'Interstate', lanes: '6+', baseline: 12500
  });
});

test('getBaselineRow returns null for an invalid combination', () => {
  assert.equal(BusDevGallonsCalc.getBaselineRow('Large truck stop', 'Backroad'), null);
});

test('all 8 baseline rows are reachable via profile+roadway', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  BDPG_CONFIG.BASELINE_TABLE.forEach(row => {
    assert.deepEqual(BusDevGallonsCalc.getBaselineRow(row.profile, row.roadway), row);
  });
});

test('resolveRegion maps confirmed border states correctly', () => {
  assert.equal(BusDevGallonsCalc.resolveRegion('MD'), 'Northeast');
  assert.equal(BusDevGallonsCalc.resolveRegion('DE'), 'Northeast');
  assert.equal(BusDevGallonsCalc.resolveRegion('WV'), 'Southeast');
  assert.equal(BusDevGallonsCalc.resolveRegion('OK'), 'Southwest');
  assert.equal(BusDevGallonsCalc.resolveRegion('CO'), 'West');
});

test('resolveRegion is case-insensitive and null for unmapped input', () => {
  assert.equal(BusDevGallonsCalc.resolveRegion('co'), 'West');
  assert.equal(BusDevGallonsCalc.resolveRegion('XX'), null);
  assert.equal(BusDevGallonsCalc.resolveRegion(''), null);
  assert.equal(BusDevGallonsCalc.resolveRegion(null), null);
});

test('every state in BDPG_REGION_MAP resolves to exactly one region', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  Object.keys(BDPG_CONFIG.BDPG_REGION_MAP).forEach(region => {
    BDPG_CONFIG.BDPG_REGION_MAP[region].forEach(st => {
      assert.equal(BusDevGallonsCalc.resolveRegion(st), region);
    });
  });
});

test('amenityAdjustment returns the exact configured percentage', () => {
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Very limited'), -0.05);
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Average'), 0);
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Good / full service'), 0.02);
});

test('reviewAdjustment boundaries: 2.9 / 3.0 / 3.5 / 3.6', () => {
  assert.equal(BusDevGallonsCalc.reviewAdjustment(2.9).pct, -0.05);
  assert.equal(BusDevGallonsCalc.reviewAdjustment(3.0).pct, 0);
  assert.equal(BusDevGallonsCalc.reviewAdjustment(3.5).pct, 0);
  assert.equal(BusDevGallonsCalc.reviewAdjustment(3.6).pct, 0.02);
});

test('reviewAdjustment with no rating is 0% and flagged', () => {
  const r = BusDevGallonsCalc.reviewAdjustment(null);
  assert.equal(r.pct, 0);
  assert.equal(r.flagged, true);
});

test('reviewAdjustment with a real rating is not flagged', () => {
  assert.equal(BusDevGallonsCalc.reviewAdjustment(4.2).flagged, false);
});

test('pricingAdjustment returns the exact configured percentage for each band', () => {
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Most aggressive (deepest discounts)'), 0.05);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Aggressive'), 0.025);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Standard / moderate'), 0);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('Light discounting'), -0.025);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('No discounts'), -0.05);
});

test('pricingAdjustment falls back to the configured default for empty/unrecognized input', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const defaultPct = BDPG_CONFIG.PRICING_ADJUST[BDPG_CONFIG.PRICING_DEFAULT];
  assert.equal(BusDevGallonsCalc.pricingAdjustment(''), defaultPct);
  assert.equal(BusDevGallonsCalc.pricingAdjustment(undefined), defaultPct);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('not a real band'), defaultPct);
});

test('calculateEstimate — case A @ Standard/0% pricing: officialSubtotal === finalGallons === 13750', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 13750);
});

test('calculateEstimate — case B @ Standard/0% pricing: 2250', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Fuel stop', roadway: 'Any',
    regionPct: 0, amenityLevel: 'Very limited', reviewRating: 2.7, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 2250);
  assert.equal(r.finalGallons, 2250);
});

test('calculateEstimate — case C @ Standard/0% pricing: 14550', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 14550);
  assert.equal(r.finalGallons, 14550);
});

test('calculateEstimate — case D @ Standard/0% pricing: 3240', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Backroad',
    regionPct: 0.06, amenityLevel: 'Average', reviewRating: 3.6, pricingLevel: 'Standard / moderate'
  });
  assert.equal(r.officialSubtotal, 3240);
  assert.equal(r.finalGallons, 3240);
});

test('calculateEstimate — case A @ Most aggressive pricing: officialSubtotal unchanged, finalGallons 14375', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)'
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 14375);
});

test('calculateEstimate — case A @ No discounts pricing: officialSubtotal unchanged, finalGallons 13125', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'No discounts'
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 13125);
});

test('calculateEstimate — case C @ Aggressive pricing: officialSubtotal unchanged, finalGallons 14925', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 'Aggressive'
  });
  assert.equal(r.officialSubtotal, 14550);
  assert.equal(r.finalGallons, 14925);
});

test('calculateEstimate — officialSubtotal is invariant across every pricing band', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const subtotals = BDPG_CONFIG.PRICING_LEVELS.map(level => BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: level
  }).officialSubtotal);
  assert.ok(subtotals.every(v => v === 14550), 'officialSubtotal must never change with pricing: ' + subtotals);
});

test('calculateEstimate — all 8 baseline rows at 0/0/0/0 equal the table exactly (both numbers)', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  BDPG_CONFIG.BASELINE_TABLE.forEach(row => {
    const r = BusDevGallonsCalc.calculateEstimate({
      profile: row.profile, roadway: row.roadway,
      regionPct: 0, amenityLevel: 'Average', reviewRating: 3.2, pricingLevel: 'Standard / moderate'
    });
    assert.equal(r.officialSubtotal, row.baseline);
    assert.equal(r.finalGallons, row.baseline);
  });
});

test('calculateEstimate returns null for an invalid profile/roadway combination', () => {
  assert.equal(BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Backroad',
    regionPct: 0, amenityLevel: 'Average', reviewRating: 3.2, pricingLevel: 'Standard / moderate'
  }), null);
});

test('calculateEstimate renders distinct official and final math lines', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)'
  });
  assert.equal(r.officialMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02) = 13,750');
  assert.equal(r.finalMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05) = 14,375');
});

test('suggestAmenityLevel: Good / full service rule', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '4-9', food: 'full restaurant', scale: 'yes', parking: '16-50' });
  assert.equal(r.level, 'Good / full service');
  assert.ok(r.reason.length > 0);
});

test('suggestAmenityLevel: Very limited rule', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: 'none', food: 'none', scale: 'no', parking: 'none' });
  assert.equal(r.level, 'Very limited');
});

test('suggestAmenityLevel: falls back to Average otherwise', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '1-3', food: 'grab-and-go', scale: 'no', parking: '1-15' });
  assert.equal(r.level, 'Average');
});

test('suggestAmenityLevel: fast food (not just full restaurant) still counts as good food', () => {
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '10+', food: 'fast food', scale: 'yes', parking: '100+' });
  assert.equal(r.level, 'Good / full service');
});
