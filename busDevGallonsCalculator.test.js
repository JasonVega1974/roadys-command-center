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
