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
  assert.equal(r.finalMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05 + 0.00) = 14,375');
});

test('calculateEstimate — case C @ Aggressive finalMathLine prints the exact 0.025 pricing term and "- 0.03" region term (not the lossy "+ -0.03")', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 'Aggressive'
  });
  assert.equal(r.finalGallons, 14925, 'gallon value must not change, only the equation string');
  assert.equal(r.finalMathLine, '15,000 × (1 - 0.03 + 0.00 + 0.00 + 0.025 + 0.00) = 14,925');
  assert.ok(r.finalMathLine.includes('0.025'), 'pricing term must print 0.025, not the rounded 0.03');
  assert.ok(!r.finalMathLine.includes('+ -0.03'), 'must never print the "+ -0.03" form for a negative term');
});

test('calculateEstimate — case A @ No discounts finalMathLine reads "- 0.05" for the negative pricing term', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'No discounts'
  });
  assert.equal(r.finalGallons, 13125, 'gallon value must not change, only the equation string');
  assert.equal(r.finalMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02 - 0.05 + 0.00) = 13,125');
  assert.ok(r.finalMathLine.includes('- 0.05'), 'pricing term must read "- 0.05"');
  assert.ok(!r.finalMathLine.includes('+ -0.05'), 'must never print the "+ -0.05" form for a negative term');
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

test('calculateNetworkFitGrade: Fuel stop at exact baseline scores ~71% range-position, not near 0', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Fuel stop', officialSubtotal: 2500,
    supportingDetails: { condition: 'Average', hours: 'Extended', distance: '5-15 mi', corridor: 'Regional', competition: '1 within 15 mi' }
  });
  assert.equal(r.rangeLo, 2250);
  assert.equal(r.rangeHi, 2600);
  assert.ok(r.rangePositionPct > 65 && r.rangePositionPct < 75, 'expected ~71, got ' + r.rangePositionPct);
});

test('calculateNetworkFitGrade: case A officialSubtotal (13750) clamps range-position at 100 regardless of pricing', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Medium truck stop', officialSubtotal: 13750,
    supportingDetails: { condition: 'New or remodeled', hours: '24/7', distance: 'On exit', corridor: 'Major', competition: 'None within 15 mi' }
  });
  assert.equal(r.rangeLo, 6750);
  assert.equal(r.rangeHi, 13000);
  assert.equal(r.rangePositionPct, 100);
  assert.equal(r.grade, 'A');
});

test('calculateNetworkFitGrade: grade is identical regardless of what finalGallons/pricing would have been -- it never receives finalGallons at all', () => {
  // Same officialSubtotal (14550), passed directly -- proves the function's
  // contract by construction: it has no pricingLevel/finalGallons parameter to leak through.
  const r1 = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Large truck stop', officialSubtotal: 14550, supportingDetails: {}
  });
  const r2 = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Large truck stop', officialSubtotal: 14550, supportingDetails: {}
  });
  assert.deepEqual(r1, r2);
});

test('calculateNetworkFitGrade: never divides by zero for a single-baseline-row profile', () => {
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Fuel stop', officialSubtotal: 2500, supportingDetails: {}
  });
  assert.ok(Number.isFinite(r.rangePositionPct));
  assert.ok(!Number.isNaN(r.rangePositionPct));
});

test('calculateNetworkFitGrade: missing supporting details score 0 for that signal, never throw', () => {
  assert.doesNotThrow(() => {
    const r = BusDevGallonsCalc.calculateNetworkFitGrade({ profile: 'Small truck stop', officialSubtotal: 5000, supportingDetails: {} });
    assert.equal(r.signalScores.condition, 0);
  });
});

test('calculateNetworkFitGrade: grade bands are correctly ordered', () => {
  const worst = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Large truck stop', officialSubtotal: 9000,
    supportingDetails: { condition: 'Older / dated', hours: 'Business hours only', distance: '15+ mi', corridor: 'Local', competition: 'Adjacent to a major chain' }
  });
  assert.equal(worst.grade, 'E');
});

test('conditionAdjustedGallons applies +10/0/-10 to finalGallons', () => {
  assert.equal(BusDevGallonsCalc.conditionAdjustedGallons(10000, 'New or remodeled'), 11000);
  assert.equal(BusDevGallonsCalc.conditionAdjustedGallons(10000, 'Average'), 10000);
  assert.equal(BusDevGallonsCalc.conditionAdjustedGallons(10000, 'Older / dated'), 9000);
});

test('calculateMembershipFit: today\'s actual placeholder state (all 0) is "not configured", never NaN/Infinity', () => {
  const r = BusDevGallonsCalc.calculateMembershipFit(10000);
  assert.equal(r.valuePerGallonConfigured, false);
  assert.deepEqual(r.plans, []);
  assert.equal(r.monthlyValue, null);
  const flat = JSON.stringify(r);
  assert.ok(!/NaN/.test(flat) && !/Infinity/.test(flat), 'result must never contain NaN or Infinity: ' + flat);
});

test('calculateMembershipFit: valuePerGallon set, only one plan cost set', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const original = JSON.parse(JSON.stringify(BDPG_CONFIG.MEMBERSHIP_CONFIG));
  try {
    BDPG_CONFIG.MEMBERSHIP_CONFIG.valuePerGallon = 0.05;
    BDPG_CONFIG.MEMBERSHIP_CONFIG.plans[0].cost = 100; // Roady's only

    const r = BusDevGallonsCalc.calculateMembershipFit(10000);
    assert.equal(r.valuePerGallonConfigured, true);
    assert.equal(r.monthlyValue, 500);
    const roadys = r.plans.filter(p => p.name === "Roady's")[0];
    const ptp = r.plans.filter(p => p.name === 'PTP')[0];
    assert.equal(roadys.configured, true);
    assert.equal(roadys.breakevenGallons, 2000);
    assert.equal(roadys.coverageMultiple, 5);
    assert.equal(ptp.configured, false);
    assert.equal('breakevenGallons' in ptp, false);
  } finally {
    BDPG_CONFIG.MEMBERSHIP_CONFIG.valuePerGallon = original.valuePerGallon;
    BDPG_CONFIG.MEMBERSHIP_CONFIG.plans = original.plans;
  }
});

test('calculateMembershipFit: degenerate input (large valuePerGallon, small cost) guards against division by zero', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const original = JSON.parse(JSON.stringify(BDPG_CONFIG.MEMBERSHIP_CONFIG));
  try {
    BDPG_CONFIG.MEMBERSHIP_CONFIG.valuePerGallon = 1000;
    BDPG_CONFIG.MEMBERSHIP_CONFIG.plans[0].cost = 100; // Roady's: 100/1000 = 0.1, rounds to 0

    const r = BusDevGallonsCalc.calculateMembershipFit(10000);
    assert.equal(r.valuePerGallonConfigured, true);
    const roadys = r.plans.filter(p => p.name === "Roady's")[0];
    assert.equal(roadys.configured, true);
    assert.ok(roadys.breakevenGallons >= 1, 'breakevenGallons must be >= 1, got ' + roadys.breakevenGallons);
    assert.ok(Number.isFinite(roadys.coverageMultiple), 'coverageMultiple must be finite, got ' + roadys.coverageMultiple);
    const flat = JSON.stringify(r);
    assert.ok(!/NaN/.test(flat) && !/Infinity/.test(flat), 'result must never contain NaN or Infinity: ' + flat);
  } finally {
    BDPG_CONFIG.MEMBERSHIP_CONFIG.valuePerGallon = original.valuePerGallon;
    BDPG_CONFIG.MEMBERSHIP_CONFIG.plans = original.plans;
  }
});

test('calculateEstimate — case E: case A + Most aggressive pricing + Rewards participating', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)',
    rewardsLevel: "Participating in Roady's Rewards"
  });
  // 12,500 × (1 + .06 + .02 + .02 + .05 + .05) = 12,500 × 1.20
  assert.equal(r.finalGallons, 15000);
  assert.equal(r.officialSubtotal, 13750, 'official must exclude pricing AND rewards');
  assert.equal(r.pricingAdjusted, 14375, 'pricing-adjusted excludes rewards only');
});

test('calculateEstimate — case F: case B + No discounts + Not participating', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Fuel stop', roadway: 'Any',
    regionPct: 0, amenityLevel: 'Very limited', reviewRating: 2.7,
    pricingLevel: 'No discounts', rewardsLevel: 'Not participating'
  });
  // 2,500 × (1 + 0 - .05 - .05 - .05 - .05) = 2,500 × 0.80
  assert.equal(r.finalGallons, 2000);
  assert.equal(r.officialSubtotal, 2250, 'official must exclude pricing AND rewards');
  assert.equal(r.pricingAdjusted, 2125);
});

test('calculateEstimate — officialSubtotal is invariant across every rewards band', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const subtotals = BDPG_CONFIG.REWARDS_LEVELS.map(level => BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate',
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5,
    pricingLevel: 'Aggressive', rewardsLevel: level
  }).officialSubtotal);
  assert.ok(subtotals.every(v => v === 14550), 'officialSubtotal must never change with rewards: ' + subtotals);
});

test('rewardsAdjustment returns 0 for an unknown or absent level', () => {
  assert.equal(BusDevGallonsCalc.rewardsAdjustment(undefined), 0);
  assert.equal(BusDevGallonsCalc.rewardsAdjustment(''), 0);
  assert.equal(BusDevGallonsCalc.rewardsAdjustment('constructor'), 0);
  assert.equal(BusDevGallonsCalc.rewardsAdjustment('Undecided / unknown'), 0);
});

test('an estimate with no rewardsLevel equals one at the default — old profiles do not move', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const base = {
    profile: 'Medium truck stop', roadway: 'Interstate',
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 'Most aggressive (deepest discounts)'
  };
  const withoutRewards = BusDevGallonsCalc.calculateEstimate(base);
  const atDefault = BusDevGallonsCalc.calculateEstimate(
    Object.assign({}, base, { rewardsLevel: BDPG_CONFIG.REWARDS_DEFAULT }));
  assert.equal(withoutRewards.finalGallons, 14375, 'unchanged from the pre-rewards value');
  assert.equal(withoutRewards.finalGallons, atDefault.finalGallons);
  assert.equal(withoutRewards.finalMathLine, atDefault.finalMathLine);
});

test('rewards does not widen profileRange, so the Network Fit Grade is unaffected', () => {
  // profileAdjustmentBounds() sums ONLY amenity + review extremes: -0.05 + -0.05
  // and +0.02 + +0.02. Medium truck stop baselines are 7,500 and 12,500.
  const r = BusDevGallonsCalc.calculateNetworkFitGrade({
    profile: 'Medium truck stop', officialSubtotal: 13750, supportingDetails: {}
  });
  assert.equal(r.rangeLo, 6750);
  assert.equal(r.rangeHi, 13000);
});
