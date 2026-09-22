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
