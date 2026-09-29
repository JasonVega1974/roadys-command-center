'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');
const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');

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

test('BDPG_REGION_MAP has exactly 8 regions covering all 50 states once', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const keys = Object.keys(BDPG_CONFIG.BDPG_REGION_MAP);
  assert.equal(keys.length, 8);
  const seen = {};
  keys.forEach(r => BDPG_CONFIG.BDPG_REGION_MAP[r].forEach(st => {
    assert.ok(!seen[st], st + ' appears in two regions');
    seen[st] = r;
  }));
  assert.equal(Object.keys(seen).length, 50, 'expected 50 states, got ' + Object.keys(seen).length);
  assert.ok(!seen.DC, 'DC must stay unmapped');
});

test('new region assignments resolve correctly', () => {
  const m = { AK:'Northwest', HI:'West', WA:'Northwest', CA:'West', TX:'Texas',
              OK:'Southwest', MI:'Upper Midwest', IA:'Upper Midwest',
              OH:'Midwest', NE:'Midwest', MD:'Northeast', WV:'Southeast' };
  Object.keys(m).forEach(st => assert.equal(BusDevGallonsCalc.resolveRegion(st), m[st], st));
});

test('display, baseline and region maps share exactly the same 8 keys', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const r = Object.keys(BDPG_CONFIG.BDPG_REGION_MAP).sort();
  assert.deepEqual(Object.keys(BDPG_CONFIG.BDPG_REGION_DISPLAY).sort(), r);
  assert.deepEqual(Object.keys(BDPG_CONFIG.BDPG_NETWORK_BASELINES).sort(), r);
});

test('each network baseline pct is consistent with its own avg over the overall avg', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const overall = BDPG_CONFIG.NETWORK_BASELINE_META.overallAvgGalMo;
  Object.keys(BDPG_CONFIG.BDPG_NETWORK_BASELINES).forEach(r => {
    const b = BDPG_CONFIG.BDPG_NETWORK_BASELINES[r];
    const derived = (b.avgGalMo / overall) - 1;
    // Tolerance, not exact equality: avgGalMo and pctVsNetwork were each
    // rounded independently from the same unrounded 12-month report (gallons
    // to whole numbers, pct to one decimal), so the stored pct need not
    // exactly reproduce a pct re-derived from the rounded gallons. Measured
    // slack across all eight regions is 0.00012..0.00051; 0.001 accepts every
    // real value while still catching a transposed digit or a pct pasted
    // against the wrong region, which would be off by >= 0.01.
    assert.ok(Math.abs(b.pctVsNetwork - derived) < 0.001,
      r + ': stored ' + b.pctVsNetwork + ' vs derived ' + derived.toFixed(5));
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

// ── uncapped region variance and the multiplier floor ───────────────────────

test('a real uncapped region delta flows straight into the subtotal', () => {
  // Midwest measures +58.8%. Under the old +/-10% cap this was impossible to
  // express; it is now the actual input.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Highway', regionPct: 0.588,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 'Standard / moderate', rewardsLevel: 'Undecided / unknown'
  });
  assert.equal(e.baseline, 4000);
  assert.equal(e.officialSubtotal, 6432);          // 4000 * (1 + 0.588 + 0 + 0.02)
  assert.equal(e.officialMathLine, '4,000 × (1 + 0.588 + 0.00 + 0.02) = 6,432');
});

test('a large negative region delta still produces a sane figure', () => {
  // Texas measures -36.7%, the worst real value.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', regionPct: -0.367,
    amenityLevel: 'Very limited', reviewRating: 2.0,
    pricingLevel: 'No discounts', rewardsLevel: 'Not participating'
  });
  assert.ok(e.officialSubtotal > 0, 'the worst real region must not floor out');
  assert.equal(e.officialSubtotal, Math.round(15000 * (1 - 0.367 - 0.05 - 0.05)));
  assert.ok(e.finalGallons > 0);
});

test('the multiplier is floored at zero, so gallons are never negative', () => {
  // The slider permits -100 even though no region measures anywhere near it.
  // Without the floor this returns a negative quote.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Highway', regionPct: -1.0,
    amenityLevel: 'Very limited', reviewRating: 1.0,
    pricingLevel: 'No discounts', rewardsLevel: 'Not participating'
  });
  assert.equal(e.officialSubtotal, 0);
  assert.equal(e.pricingAdjusted, 0);
  assert.equal(e.finalGallons, 0);
});

test('the floor never lets a later figure resurrect a clamped one', () => {
  // pricingMultiplier builds on the CLAMPED officialMultiplier, so a positive
  // pricing term adds to zero rather than to a negative number.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Highway', regionPct: -2.0,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 'Most aggressive (deepest discounts)',
    rewardsLevel: "Participating in Roady's Rewards"
  });
  assert.equal(e.officialSubtotal, 0);
  assert.equal(e.finalGallons, Math.round(4000 * 0.10));
});

test('the floor does not touch an ordinary estimate', () => {
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', regionPct: 0.072,
    amenityLevel: 'Good / full service', reviewRating: 4.5,
    pricingLevel: 'Aggressive', rewardsLevel: "Participating in Roady's Rewards"
  });
  assert.equal(e.officialSubtotal, Math.round(12500 * (1 + 0.072 + 0.02 + 0.02)));
  assert.ok(e.finalGallons > e.officialSubtotal);
});

test('the grade, weights, condition and membership helpers are gone', () => {
  // Removed with the internal results section. Asserted so a later re-export
  // has to be deliberate rather than accidental.
  ['calculateNetworkFitGrade', 'resolveWeights', 'conditionAdjustedGallons',
    'calculateMembershipFit'].forEach((k) => {
    assert.equal(BusDevGallonsCalc[k], undefined, k + ' should no longer be exported');
  });
  ['WEIGHT_CONFIG', 'NETWORK_FIT_SIGNAL_OPTIONS', 'NETWORK_FIT_SIGNAL_SCORES',
    'NETWORK_FIT_GRADE_BANDS', 'CONDITION_ADJUST', 'MEMBERSHIP_CONFIG'].forEach((k) => {
    assert.equal(BDPG_CONFIG[k], undefined, k + ' should no longer be in the config');
  });
});

test('the amenity rule reads exactly the four details the UI still asks for', () => {
  // service and defReefer were collected and never read; the option sets must
  // not reintroduce a question that cannot change the answer.
  const opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS;
  assert.equal(opts.service, undefined);
  assert.equal(opts.defReefer, undefined);
  ['showers', 'food', 'scale', 'parking'].forEach((k) => {
    assert.ok(opts[k], k + ' must remain an offered detail');
  });
  const base = { showers: '4-9', food: 'fast food', scale: 'yes', parking: '51-100' };
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(base).level, 'Good / full service');
  assert.equal(
    BusDevGallonsCalc.suggestAmenityLevel(
      Object.assign({}, base, { service: 'none', defReefer: 'neither' })).level,
    'Good / full service');
});

test('an untouched amenity form still returns Very limited, which is why the gate exists', () => {
  // The -5% that the removed confirmation dropdown was built to catch. The
  // Generate gate now requires all four rule-reading details to be answered,
  // so this value can never reach a headline unobserved.
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel({}).level, 'Very limited');
  assert.equal(BDPG_CONFIG.AMENITY_ADJUST['Very limited'], -0.05);
});
