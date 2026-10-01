'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BusDevGallonsCalc } = require('./busDevGallonsCalculator.js');
const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
const { BDPG_STATS } = require('./bdpgStats.js');
const TABLE = BDPG_CONFIG.BASELINE_TABLE;

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
    profile: 'Medium truck stop', roadway: 'Interstate', lanes: '4-6', baseline: 10210
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

test('pricingAdjustment falls back to the default for unusable input', () => {
  [null, undefined, '', true, {}, [], NaN, 'nonsense'].forEach((v) => {
    assert.equal(BusDevGallonsCalc.pricingAdjustment(v), BDPG_CONFIG.PRICING_DEFAULT,
      JSON.stringify(v));
  });
  assert.equal(BDPG_CONFIG.PRICING_DEFAULT, 0, 'the default posture is neutral');
});

test('calculateEstimate — case A @ Standard/0% pricing: officialSubtotal === finalGallons === 13750', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8, pricingLevel: 0
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 13750);
});

test('calculateEstimate — case B @ Standard/0% pricing: 2250', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Fuel stop', roadway: 'Any', baseline: 2500,
    regionPct: 0, amenityLevel: 'Very limited', reviewRating: 2.7, pricingLevel: 0
  });
  assert.equal(r.officialSubtotal, 2250);
  assert.equal(r.finalGallons, 2250);
});

test('calculateEstimate — case C @ Standard/0% pricing: 14550', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', baseline: 15000,
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 0
  });
  assert.equal(r.officialSubtotal, 14550);
  assert.equal(r.finalGallons, 14550);
});

test('calculateEstimate — case D @ Standard/0% pricing: 3240', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Backroad', baseline: 3000,
    regionPct: 0.06, amenityLevel: 'Average', reviewRating: 3.6, pricingLevel: 0
  });
  assert.equal(r.officialSubtotal, 3240);
  assert.equal(r.finalGallons, 3240);
});

test('calculateEstimate — case A @ Most aggressive pricing: officialSubtotal unchanged, finalGallons 14375', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 0.05
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 14375);
});

test('calculateEstimate — case A @ No discounts pricing: officialSubtotal unchanged, finalGallons 13125', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: -0.05
  });
  assert.equal(r.officialSubtotal, 13750);
  assert.equal(r.finalGallons, 13125);
});

test('calculateEstimate — case C @ Aggressive pricing: officialSubtotal unchanged, finalGallons 14925', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', baseline: 15000,
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 0.025
  });
  assert.equal(r.officialSubtotal, 14550);
  assert.equal(r.finalGallons, 14925);
});

test('calculateEstimate — officialSubtotal is invariant across every pricing band', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  // Swept at a literal 5 points: the control has no uniform step any more
  // (its track is split at the profile average), and this test is about the
  // FORMULA being invariant to pricing, not about the control's granularity.
  const r = BDPG_CONFIG.PRICING_RANGE;
  const bands = [];
  for (let p = r.min; p <= r.max + 1e-9; p += 0.05) bands.push(Math.round(p * 1000) / 1000);
  const subtotals = bands.map(level => BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', baseline: 15000,
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: level
  }).officialSubtotal);
  assert.ok(subtotals.every(v => v === 14550), 'officialSubtotal must never change with pricing: ' + subtotals);
});

test('calculateEstimate — all 8 baseline rows at 0/0/0/0 equal the table exactly (both numbers)', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  BDPG_CONFIG.BASELINE_TABLE.forEach(row => {
    const r = BusDevGallonsCalc.calculateEstimate({
      profile: row.profile, roadway: row.roadway,
      regionPct: 0, amenityLevel: 'Average', reviewRating: 3.2, pricingLevel: 0
    });
    assert.equal(r.officialSubtotal, row.baseline);
    assert.equal(r.finalGallons, row.baseline);
  });
});

test('calculateEstimate returns null for an invalid profile/roadway combination', () => {
  assert.equal(BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Backroad',
    regionPct: 0, amenityLevel: 'Average', reviewRating: 3.2, pricingLevel: 0
  }), null);
});

test('calculateEstimate renders distinct official and final math lines', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 0.05
  });
  assert.equal(r.officialMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02) = 13,750');
  assert.equal(r.finalMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02 + 0.05 + 0.00) = 14,375');
});

test('calculateEstimate — case C @ Aggressive finalMathLine prints the exact 0.025 pricing term and "- 0.03" region term (not the lossy "+ -0.03")', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', baseline: 15000,
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5, pricingLevel: 0.025
  });
  assert.equal(r.finalGallons, 14925, 'gallon value must not change, only the equation string');
  assert.equal(r.finalMathLine, '15,000 × (1 - 0.03 + 0.00 + 0.00 + 0.025 + 0.00) = 14,925');
  assert.ok(r.finalMathLine.includes('0.025'), 'pricing term must print 0.025, not the rounded 0.03');
  assert.ok(!r.finalMathLine.includes('+ -0.03'), 'must never print the "+ -0.03" form for a negative term');
});

test('calculateEstimate — case A @ No discounts finalMathLine reads "- 0.05" for the negative pricing term', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: -0.05
  });
  assert.equal(r.finalGallons, 13125, 'gallon value must not change, only the equation string');
  assert.equal(r.finalMathLine, '12,500 × (1 + 0.06 + 0.02 + 0.02 - 0.05 + 0.00) = 13,125');
  assert.ok(r.finalMathLine.includes('- 0.05'), 'pricing term must read "- 0.05"');
  assert.ok(!r.finalMathLine.includes('+ -0.05'), 'must never print the "+ -0.05" form for a negative term');
});

test('suggestAmenityLevel: Good / full service needs the four core plus DEF or laundry', () => {
  const core = { showers: '4-9', food: 'full restaurant', scale: 'yes', parking: '16-50' };
  // All four core amenities but neither supporting one: Average, not Good.
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(core).level, 'Average');
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(
    Object.assign({}, core, { def: 'yes' })).level, 'Good / full service');
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(
    Object.assign({}, core, { laundry: 'yes' })).level, 'Good / full service');
  const both = BusDevGallonsCalc.suggestAmenityLevel(
    Object.assign({}, core, { def: 'yes', laundry: 'yes' }));
  assert.equal(both.level, 'Good / full service');
  assert.ok(/both DEF and laundry/.test(both.reason));
});

test('DEF and laundry never promote a site missing a core amenity', () => {
  const noShowers = { showers: 'none', food: 'full restaurant', scale: 'yes', parking: '16-50',
    def: 'yes', laundry: 'yes' };
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(noShowers).level, 'Average');
});

test('their absence never demotes a site to Very limited', () => {
  // Very limited stays defined by showers, parking and food alone.
  const sparse = { showers: 'none', food: 'none', scale: 'no', parking: 'none' };
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(sparse).level, 'Very limited');
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(
    Object.assign({}, sparse, { def: 'yes', laundry: 'yes' })).level, 'Very limited',
    'DEF and laundry alone do not lift a site out of Very limited either');
  const midling = { showers: '4-9', food: 'none', scale: 'no', parking: 'none' };
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(midling).level, 'Average');
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
  const r = BusDevGallonsCalc.suggestAmenityLevel({ showers: '10+', food: 'fast food', scale: 'yes', parking: '100+', laundry: 'yes' });
  assert.equal(r.level, 'Good / full service');
});

test('calculateEstimate — case E: case A + Most aggressive pricing + Rewards participating', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 0.05,
    rewardsLevel: "Participating in Roady's Rewards"
  });
  // 12,500 × (1 + .06 + .02 + .02 + .05 + .05) = 12,500 × 1.20
  assert.equal(r.finalGallons, 15000);
  assert.equal(r.officialSubtotal, 13750, 'official must exclude pricing AND rewards');
  assert.equal(r.pricingAdjusted, 14375, 'pricing-adjusted excludes rewards only');
});

test('calculateEstimate — case F: case B + No discounts + Not participating', () => {
  const r = BusDevGallonsCalc.calculateEstimate({
    profile: 'Fuel stop', roadway: 'Any', baseline: 2500,
    regionPct: 0, amenityLevel: 'Very limited', reviewRating: 2.7,
    pricingLevel: -0.05, rewardsLevel: 'Not participating'
  });
  // 2,500 × (1 + 0 - .05 - .05 - .05 - .05) = 2,500 × 0.80
  assert.equal(r.finalGallons, 2000);
  assert.equal(r.officialSubtotal, 2250, 'official must exclude pricing AND rewards');
  assert.equal(r.pricingAdjusted, 2125);
});

test('calculateEstimate — officialSubtotal is invariant across every rewards band', () => {
  const { BDPG_CONFIG } = require('./busDevGallonsConfig.js');
  const subtotals = BDPG_CONFIG.REWARDS_LEVELS.map(level => BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', baseline: 15000,
    regionPct: -0.03, amenityLevel: 'Average', reviewRating: 3.5,
    pricingLevel: 0.025, rewardsLevel: level
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
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500,
    regionPct: 0.06, amenityLevel: 'Good / full service', reviewRating: 3.8,
    pricingLevel: 0.05
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
    profile: 'Small truck stop', roadway: 'Highway', baseline: 4000, regionPct: 0.588,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 0, rewardsLevel: 'Undecided / unknown'
  });
  assert.equal(e.baseline, 4000);
  assert.equal(e.officialSubtotal, 6432);          // 4000 * (1 + 0.588 + 0 + 0.02)
  assert.equal(e.officialMathLine, '4,000 × (1 + 0.588 + 0.00 + 0.02) = 6,432');
});

test('a large negative region delta still produces a sane figure', () => {
  // Texas measures -36.7%, the worst real value.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Large truck stop', roadway: 'Interstate', baseline: 15000, regionPct: -0.367,
    amenityLevel: 'Very limited', reviewRating: 2.0,
    pricingLevel: -0.05, rewardsLevel: 'Not participating'
  });
  assert.ok(e.officialSubtotal > 0, 'the worst real region must not floor out');
  assert.equal(e.officialSubtotal, Math.round(15000 * (1 - 0.367 - 0.05 - 0.05)));
  assert.ok(e.finalGallons > 0);
});

test('the multiplier is floored at zero, so gallons are never negative', () => {
  // The slider permits -100 even though no region measures anywhere near it.
  // Without the floor this returns a negative quote.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Highway', baseline: 4000, regionPct: -1.0,
    amenityLevel: 'Very limited', reviewRating: 1.0,
    pricingLevel: -0.05, rewardsLevel: 'Not participating'
  });
  assert.equal(e.officialSubtotal, 0);
  assert.equal(e.pricingAdjusted, 0);
  assert.equal(e.finalGallons, 0);
});

test('the floor never lets a later figure resurrect a clamped one', () => {
  // pricingMultiplier builds on the CLAMPED officialMultiplier, so a positive
  // pricing term adds to zero rather than to a negative number.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Small truck stop', roadway: 'Highway', baseline: 4000, regionPct: -2.0,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 0.05,
    rewardsLevel: "Participating in Roady's Rewards"
  });
  assert.equal(e.officialSubtotal, 0);
  assert.equal(e.finalGallons, Math.round(4000 * 0.10));
});

test('the floor does not touch an ordinary estimate', () => {
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 12500, regionPct: 0.072,
    amenityLevel: 'Good / full service', reviewRating: 4.5,
    pricingLevel: 0.025, rewardsLevel: "Participating in Roady's Rewards"
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
  assert.ok(opts.def && opts.laundry, 'DEF and laundry are now offered');
  ['showers', 'food', 'scale', 'parking'].forEach((k) => {
    assert.ok(opts[k], k + ' must remain an offered detail');
  });
  const base = { showers: '4-9', food: 'fast food', scale: 'yes', parking: '51-100', def: 'yes' };
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel(base).level, 'Good / full service');
  assert.equal(
    BusDevGallonsCalc.suggestAmenityLevel(
      Object.assign({}, base, { service: 'none', defReefer: 'neither' })).level,
    'Good / full service');
});

test('an untouched amenity form still returns Very limited from the rule itself', () => {
  // Unchanged engine behaviour, and the reason the page stopped calling the
  // rule at all when nothing is answered: an empty object satisfies every
  // "no showers / no parking / no food" test at once, so the rule cannot
  // tell unanswered from answered-badly. The page now leaves the level unset
  // in that case rather than gating on it -- see the comment in step2Html.
  assert.equal(BusDevGallonsCalc.suggestAmenityLevel({}).level, 'Very limited');
  assert.equal(BDPG_CONFIG.AMENITY_ADJUST['Very limited'], -0.05);
});

test('an unset amenity level contributes exactly nothing', () => {
  // How the page expresses "not assessed": no level, therefore no
  // adjustment. amenityAdjustment() returns 0 for anything it does not
  // recognise, so '' is neutral without asserting the site is Average.
  assert.equal(BusDevGallonsCalc.amenityAdjustment(''), 0);
  assert.equal(BusDevGallonsCalc.amenityAdjustment(null), 0);
  assert.equal(BusDevGallonsCalc.amenityAdjustment(undefined), 0);
  assert.equal(BusDevGallonsCalc.amenityAdjustment('Average'), 0);
});

test('the dynamic threshold is 3, deliberately below the Apply floor of 5', () => {
  assert.equal(BDPG_STATS.DYNAMIC_BASELINE_MIN_N, 3);
});

test('the formula is unchanged: a dynamic baseline is just a different input', () => {
  // Same adjustments, two baselines -- the multiplier must be identical.
  const args = {
    profile: 'Medium truck stop', roadway: 'Highway', baseline: 7500, regionPct: 0.588,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 0, rewardsLevel: 'Undecided / unknown'
  };
  const stat = BusDevGallonsCalc.calculateEstimate(args);
  const dyn = BusDevGallonsCalc.calculateEstimate(Object.assign({}, args, { baseline: 15605 }));
  assert.equal(stat.baseline, 7500);
  assert.equal(dyn.baseline, 15605);
  // Compared against the multiplier directly, not by dividing the two
  // subtotals: both are rounded, so their ratios differ by ~1e-5 no matter
  // how correct the arithmetic is. Asserting each figure reproduces
  // round(baseline * m) is the check that actually means "same formula".
  const m = 1 + 0.588 + 0 + 0.02;
  assert.equal(stat.officialSubtotal, Math.round(7500 * m));
  assert.equal(dyn.officialSubtotal, Math.round(15605 * m));
  // And the percentage terms in the printed math line are identical.
  assert.equal(stat.officialMathLine.replace(/^[\d,]+ /, ''),
               dyn.officialMathLine.replace(/^[\d,]+ /, '').replace(/= [\d,]+$/, '') +
               '= ' + stat.officialSubtotal.toLocaleString('en-US'));
});

test('a baseline override is ignored unless it is a usable positive number', () => {
  // No baseline in args: the point is what happens when the override is
  // unusable, and the answer is "the table row". Read from the table rather
  // than restated, so updating a median cannot make this test assert that
  // the fallback is a number the table no longer holds.
  const args = { profile: 'Medium truck stop', roadway: 'Highway', regionPct: 0,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 0, rewardsLevel: 'Undecided / unknown' };
  const fromTable = BusDevGallonsCalc.getBaselineRow('Medium truck stop', 'Highway').baseline;
  [null, undefined, '', 0, -5, 'x', NaN].forEach((b) => {
    assert.equal(BusDevGallonsCalc.calculateEstimate(Object.assign({}, args, { baseline: b })).baseline,
      fromTable, 'bad override ' + JSON.stringify(b) + ' must fall back to the table');
  });
  assert.equal(BusDevGallonsCalc.calculateEstimate(Object.assign({}, args, { baseline: '9000' })).baseline, 9000);
});

// ── restroom condition ──────────────────────────────────────────────────────

test('restroom condition is +2 / 0 / -2, and unset is neutral', () => {
  assert.equal(BusDevGallonsCalc.restroomAdjustment('Clean / updated'), 0.02);
  assert.equal(BusDevGallonsCalc.restroomAdjustment('Standard'), 0);
  assert.equal(BusDevGallonsCalc.restroomAdjustment('Dated / worn'), -0.02);
  [null, undefined, '', 'Sparkling'].forEach((v) => {
    assert.equal(BusDevGallonsCalc.restroomAdjustment(v), 0, JSON.stringify(v));
  });
});

test('restroom condition sums into the amenity term, not a sixth term', () => {
  const args = { profile: 'Medium truck stop', roadway: 'Highway', baseline: 7500, regionPct: 0,
    amenityLevel: 'Good / full service', reviewRating: 4.0,
    pricingLevel: 0, rewardsLevel: 'Undecided / unknown' };
  const plain = BusDevGallonsCalc.calculateEstimate(args);
  const clean = BusDevGallonsCalc.calculateEstimate(
    Object.assign({}, args, { restroomLevel: 'Clean / updated' }));
  const worn = BusDevGallonsCalc.calculateEstimate(
    Object.assign({}, args, { restroomLevel: 'Dated / worn' }));
  assert.equal(plain.amenityPct, 0.02);
  assert.equal(Math.round(clean.amenityPct * 1000) / 1000, 0.04);
  assert.equal(Math.round(worn.amenityPct * 1000) / 1000, 0);
  // The formula still has five terms: the restroom rides inside amenities.
  assert.equal(clean.officialSubtotal,
    Math.round(plain.baseline * (1 + 0 + 0.04 + 0.02)));
});

// ── DEF and inside sales ────────────────────────────────────────────────────

test('DEF and inside sales follow the spreadsheet', () => {
  const d = BusDevGallonsCalc.defInsideEstimate(10000);
  assert.equal(d.defGallonsMo, 200);                 // 10,000 x 2%
  assert.equal(d.defSalesMo, 900);                   // 200 x $4.50
  assert.equal(Math.round(d.transactionsMo * 100) / 100, 90.91);   // 10,000 / 110
  assert.equal(Math.round(d.insideSalesMo * 100) / 100, 1665.45);  // x $18.32
  assert.equal(d.defGallonsYr, 2400);
  assert.equal(d.defSalesYr, 10800);
  assert.equal(Math.round(d.insideSalesYr * 100) / 100, 19985.45);
});

test('DEF and inside sales scale linearly with gallons', () => {
  const a = BusDevGallonsCalc.defInsideEstimate(10000);
  const b = BusDevGallonsCalc.defInsideEstimate(20000);
  assert.equal(b.defSalesMo, a.defSalesMo * 2);
  assert.equal(b.insideSalesMo, a.insideSalesMo * 2);
});

test('the DEF section returns null when switched off', () => {
  assert.equal(BusDevGallonsCalc.defInsideEstimate(10000, { enabled: false }), null);
});

test('DEF rates are read from config, never hardcoded', () => {
  const d = BusDevGallonsCalc.defInsideEstimate(10000, {
    enabled: true, defPctOfDiesel: 0.05, defPricePerGal: 3,
    gallonsPerTransaction: 100, avgInsideRing: 10
  });
  assert.equal(d.defGallonsMo, 500);
  assert.equal(d.defSalesMo, 1500);
  assert.equal(d.transactionsMo, 100);
  assert.equal(d.insideSalesMo, 1000);
});

test('a zero gallons-per-transaction returns null rather than Infinity', () => {
  // Would otherwise print an infinite transaction count on a customer sheet.
  [0, -5, null, 'x'].forEach((v) => {
    assert.equal(BusDevGallonsCalc.defInsideEstimate(10000, {
      enabled: true, defPctOfDiesel: 0.02, defPricePerGal: 4.5,
      gallonsPerTransaction: v, avgInsideRing: 18.32
    }), null, JSON.stringify(v));
  });
});

test('DEF and inside sales never touch the estimate', () => {
  const args = { profile: 'Medium truck stop', roadway: 'Highway', baseline: 7500, regionPct: 0.489,
    amenityLevel: 'Average', reviewRating: 4.0,
    pricingLevel: 0, rewardsLevel: 'Undecided / unknown' };
  const e = BusDevGallonsCalc.calculateEstimate(args);
  const before = JSON.stringify(e);
  BusDevGallonsCalc.defInsideEstimate(e.finalGallons);
  assert.equal(JSON.stringify(BusDevGallonsCalc.calculateEstimate(args)), before);
});

test('zero gallons produces zeroes, not nulls', () => {
  const d = BusDevGallonsCalc.defInsideEstimate(0);
  assert.equal(d.defSalesMo, 0);
  assert.equal(d.insideSalesMo, 0);
});

// ── the real file reproduces the agreed figures ─────────────────────────────

test('the committed network file reproduces the agreed profile baselines', () => {
  const locs = require('./network-locations.json').locations;
  const b = BDPG_STATS.profileBaselines(locs, BDPG_CONFIG.BASELINE_TABLE);
  const K = BDPG_STATS.baselineKeyFor;
  // Recomputed 2026-09-30 after the manual roadway/diesel-lane sizing pass.
  const expect = [
    ['Fuel stop', 'Any', 3318, 9], ['Small truck stop', 'Backroad', 6174, 4],
    ['Small truck stop', 'Highway', 2338, 12], ['Small truck stop', 'Interstate', 7647, 15],
    ['Medium truck stop', 'Highway', 4013, 36], ['Medium truck stop', 'Interstate', 10210, 53],
    ['Large truck stop', 'Highway', 3216, 9], ['Large truck stop', 'Interstate', 20232, 28]
  ];
  expect.forEach((e) => {
    const x = b[K(e[0], e[1])];
    assert.equal(x.n, e[3], e[0] + '/' + e[1] + ' n');
    assert.equal(x.median, e[2], e[0] + '/' + e[1] + ' median');
  });
  // Every profile now clears the threshold, so all eight read from the
  // network and BASELINE_TABLE is displayed nowhere. It is still kept in
  // step with these figures -- see its comment.
  Object.keys(b).forEach((k) => {
    assert.equal(b[k].source, 'network', k + ' should not be on the static fallback');
    assert.equal(b[k].baseline, b[k].median, k + ' baseline must be its observed median');
  });
});

test('BASELINE_TABLE agrees with the medians it is the fallback for', () => {
  // The table is displayed nowhere today, which is exactly how it rotted
  // last time: Medium/Highway sat at 7,500 against an observed 15,705 and
  // nothing contradicted it. This is the contradiction.
  const locs = require('./network-locations.json').locations;
  const b = BDPG_STATS.profileBaselines(locs, BDPG_CONFIG.BASELINE_TABLE);
  BDPG_CONFIG.BASELINE_TABLE.forEach((row) => {
    const x = b[BDPG_STATS.baselineKeyFor(row.profile, row.roadway)];
    if (x.median === null) return;   // no observation to check against
    assert.equal(row.baseline, x.median,
      row.profile + '/' + row.roadway + ': table says ' + row.baseline +
      ', the file says ' + x.median);
  });
});

test('the committed network file reproduces the agreed region deltas', () => {
  const locs = require('./network-locations.json').locations;
  const d = BDPG_STATS.regionDeltas(locs, BDPG_CONFIG.BASELINE_TABLE, BusDevGallonsCalc.resolveRegion);
  // Recomputed 2026-09-30 after the manual roadway/diesel-lane sizing pass.
  const expect = { Midwest: [91.5, 33], Northeast: [87, 7], West: [-26.1, 8],
    Northwest: [3.3, 22], Texas: [19.3, 9], Southeast: [-2.1, 47],
    Southwest: [-25.1, 13], 'Upper Midwest': [-6.6, 27] };
  Object.keys(expect).forEach((reg) => {
    assert.equal(d[reg].n, expect[reg][1], reg + ' n');
    assert.equal(d[reg].pct, expect[reg][0], reg + ' delta');
  });
});

test('no location carries a size that contradicts the lane rule', () => {
  // Size is derived from dieselLanes + roadway and the file's own `size`
  // column is ignored, so a row where the two disagree is a contradiction
  // nothing in the running tool would ever surface. Two did -- R01835 and
  // R01965, both 4-lane Backroad labelled Medium -- and between them they
  // moved Small/Backroad's median by 1,523 and flipped West's delta by 36
  // points, depending on which rule you read the file with. Corrected in
  // the file; pinned here so a future regeneration cannot reintroduce the
  // ambiguity silently.
  const locs = require('./network-locations.json').locations;
  const bad = locs.filter((r) => BDPG_STATS.sizeAffectsProfile(r.type) &&
    r.size !== BDPG_STATS.sizeForLanes(r.dieselLanes, r.roadway));
  assert.deepEqual(bad.map((r) => r.id), []);
});

test('the committed network file carries no C-Stores and no PPOs', () => {
  const locs = require('./network-locations.json').locations;
  BDPG_STATS.EXCLUDED_NETWORK_TYPES.forEach((t) => {
    assert.equal(locs.filter((r) => r.type === t).length, 0, t);
  });
  assert.equal(locs.length, 219);
});

test('the committed network file carries no excluded groups', () => {
  // Removed 2026-09-30. All six were non-reporting, so no median, region
  // delta or displayed figure moved -- the file got smaller and nothing
  // else changed, which is the only reason this was a safe removal.
  const locs = require('./network-locations.json').locations;
  BDPG_STATS.EXCLUDED_NETWORK_GROUPS.forEach((g) => {
    assert.equal(locs.filter((r) => r.group === g).length, 0, g);
  });
});

test('the committed network file and network-context agree on what the network is', () => {
  // The two files are built from different sources; if one counts a type the
  // other has dropped, the pitch strip and the baseline card describe
  // different networks on the same screen.
  const nc = BDPG_STATS.normalizeNetworkContext(require('./network-context.json'));
  const seen = new Set();
  Object.values(nc.byRegion).forEach((r) => Object.keys(r.byType).forEach((t) => seen.add(t)));
  BDPG_STATS.EXCLUDED_NETWORK_TYPES.forEach((t) => assert.ok(!seen.has(t), t));
  // 400 less 128 PPO, 21 C-Store, 23 Service Center and 6 Roady's Lite.
  assert.equal(nc.activeTotal, 222);
  assert.equal(nc.groupsApplied, true, 'the context file must carry byTypeGroup');
  const groups = new Set();
  Object.values(nc.byRegion).forEach((r) => Object.keys(r.byGroup).forEach((g) => groups.add(g)));
  BDPG_STATS.EXCLUDED_NETWORK_GROUPS.forEach((g) => assert.ok(!groups.has(g), g));
  // The stronger statement: after normalizing, the context file describes
  // only the types network-locations.json is allowed to contain. The two
  // files come from different exports, so this is what keeps them talking
  // about the same network rather than merely similar ones.
  const allowed = ['Truck Stop', 'Truck Stop / Service Center', 'Fuel Stop'];
  [...seen].forEach((t) => assert.ok(allowed.includes(t), 'unexpected type in context: ' + t));
});

test('the committed region_variance.json matches the computed deltas', () => {
  // The file the page ships and the computation it displays beside it must
  // not drift; a stale file would show one figure and apply another.
  const rv = require('./region_variance.json');
  const locs = require('./network-locations.json').locations;
  const d = BDPG_STATS.regionDeltas(locs, BDPG_CONFIG.BASELINE_TABLE, BusDevGallonsCalc.resolveRegion);
  Object.keys(d).forEach((reg) => {
    assert.equal(rv[reg], d[reg].pct, reg);
    assert.equal(rv.n[reg], d[reg].n, reg + ' n');
  });
});

// ── the pricing slider ──────────────────────────────────────────────────────

test('the pricing range is -50%..+50% in steps of 5, defaulting to neutral', () => {
  const r = BDPG_CONFIG.PRICING_RANGE;
  assert.equal(r.min, -0.50);
  assert.equal(r.max, 0.50);
  assert.equal(BDPG_CONFIG.PRICING_DEFAULT, 0);
});

test('the pricing range is symmetric and its step divides it evenly', () => {
  // A step that does not divide the range leaves the slider unable to
  // reach its own maximum, which no assertion on min/max alone would
  // catch. Symmetry is what makes "neutral" the centre of the control.
  const r = BDPG_CONFIG.PRICING_RANGE;
  assert.equal(r.min, -r.max, 'neutral must sit at the midpoint');
  // The fallback range carries no step: granularity comes from the position
  // scale, which gives both halves the same number of positions by design.
  assert.equal(r.step, undefined, 'the range must not claim a uniform step');
  assert.equal(BDPG_STATS.pricingTrackFraction(0, r), 50, 'neutral is centred');
});

test('pricingAdjustment passes a slider value straight through', () => {
  [-0.25, -0.2, -0.1, -0.05, 0, 0.05, 0.15, 0.25].forEach((v) => {
    assert.equal(BusDevGallonsCalc.pricingAdjustment(v), v, String(v));
  });
});

test('pricingAdjustment clamps only at the hard limit, not the fallback range', () => {
  // Clamped to the HARD LIMIT, not to the fallback range: the slider's ends
  // are per-profile now and legitimately exceed +/-50% (Large/Highway tops
  // out near +780%), so clamping the formula at the fallback would truncate
  // the figure the control was showing. The envelope only rejects corruption.
  const h = BDPG_CONFIG.PRICING_HARD_LIMIT;
  assert.equal(BusDevGallonsCalc.pricingAdjustment(-50), h.min);
  assert.equal(BusDevGallonsCalc.pricingAdjustment(9999), h.max);
  assert.equal(BusDevGallonsCalc.pricingAdjustment(Infinity), 0);
  assert.equal(BusDevGallonsCalc.pricingAdjustment(-Infinity), 0);
  // Everything a real profile range can produce passes through untouched.
  [-0.93, -0.5, -0.25, 0.25, 0.5, 1.15, 4.59, 7.71].forEach((v) => {
    assert.equal(BusDevGallonsCalc.pricingAdjustment(v), v, String(v));
  });
});

test('the hard limit is far wider than any profile range can reach', () => {
  // If a future file produced a p90 ratio above the envelope, the envelope
  // would start silently truncating real postures -- the exact failure it
  // was widened to avoid. This fails first if that day comes.
  const locs = require('./network-locations.json').locations;
  const ranges = BDPG_STATS.profileRanges(locs, BDPG_CONFIG.BASELINE_TABLE);
  const h = BDPG_CONFIG.PRICING_HARD_LIMIT;
  Object.keys(ranges).forEach((k) => {
    const pr = BDPG_STATS.pricingRangeForProfile(ranges[k], BDPG_CONFIG.PRICING_RANGE);
    assert.ok(pr.min >= h.min, k + ' low end ' + pr.min + ' is outside the envelope');
    assert.ok(pr.max <= h.max, k + ' high end ' + pr.max + ' is outside the envelope');
  });
});

test('pricingAdjustment accepts a numeric string, as an <input> hands it over', () => {
  assert.equal(BusDevGallonsCalc.pricingAdjustment('0.15'), 0.15);
  assert.equal(BusDevGallonsCalc.pricingAdjustment('-0.05'), -0.05);
});

test('a prospect saved under the old five options reopens at its own percentage', () => {
  // The whole point of keeping PRICING_LEGACY_ADJUST: a record quoted at
  // "Most aggressive" must not silently become neutral and restate its own
  // estimate at a different number.
  const legacy = { 'Most aggressive (deepest discounts)': 0.05, 'Aggressive': 0.025,
    'Standard / moderate': 0, 'Light discounting': -0.025, 'No discounts': -0.05 };
  Object.keys(legacy).forEach((k) => {
    assert.equal(BusDevGallonsCalc.pricingAdjustment(k), legacy[k], k);
  });
});

test('the range reaches ten times further than the retired options', () => {
  // The reason for the change: +/-5% could not express the gap between a
  // site running several fleet and aggregator programs and one running
  // none. Widened to +/-25% and then to +/-50% for the same reason.
  const oldMax = Math.max.apply(null,
    Object.keys(BDPG_CONFIG.PRICING_LEGACY_ADJUST).map((k) => BDPG_CONFIG.PRICING_LEGACY_ADJUST[k]));
  assert.equal(oldMax, 0.05);
  assert.equal(BDPG_CONFIG.PRICING_RANGE.max / oldMax, 10);
});

test('every slider step is a term in the formula and nothing else', () => {
  const r = BDPG_CONFIG.PRICING_RANGE;
  const args = { profile: 'Medium truck stop', roadway: 'Interstate', baseline: 10000,
    regionPct: 0.10, amenityLevel: 'Average', reviewRating: 4.0,
    rewardsLevel: 'Undecided / unknown' };
  for (let p = r.min; p <= r.max + 1e-9; p += 0.05) {
    const pct = Math.round(p * 1000) / 1000;
    const e = BusDevGallonsCalc.calculateEstimate(Object.assign({}, args, { pricingLevel: pct }));
    assert.equal(e.pricingPct, pct, String(pct));
    // officialSubtotal excludes pricing by definition, at every step.
    assert.equal(e.officialSubtotal, Math.round(10000 * (1 + 0.10 + 0 + 0.02)), String(pct));
    assert.equal(e.finalGallons, Math.round(10000 * (1 + 0.10 + 0 + 0.02 + pct)), String(pct));
  }
});

test('the extremes of the slider span a full baseline, end to end', () => {
  // Read from the range rather than restated, so widening it again cannot
  // leave this test quietly asserting the old span from inside the new one.
  const r = BDPG_CONFIG.PRICING_RANGE;
  const args = { profile: 'Large truck stop', roadway: 'Interstate', baseline: 20000,
    regionPct: 0, amenityLevel: 'Average', reviewRating: 4.0,
    rewardsLevel: 'Undecided / unknown' };
  const lo = BusDevGallonsCalc.calculateEstimate(Object.assign({}, args, { pricingLevel: r.min }));
  const hi = BusDevGallonsCalc.calculateEstimate(Object.assign({}, args, { pricingLevel: r.max }));
  assert.equal(hi.finalGallons - lo.finalGallons, Math.round(20000 * (r.max - r.min)));
  assert.equal(hi.finalGallons - lo.finalGallons, 20000, 'at +/-50% the ends differ by 1x baseline');
  assert.equal(lo.officialSubtotal, hi.officialSubtotal, 'the published figure never moves');
});

test('the slider cannot drive the estimate negative', () => {
  // The bottom of the slider on top of a deeply negative region is what the
  // multiplier floor exists for.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 10000,
    regionPct: -1, amenityLevel: 'Very limited', reviewRating: 2.0,
    pricingLevel: BDPG_CONFIG.PRICING_RANGE.min, rewardsLevel: 'Not participating'
  });
  assert.equal(e.finalGallons, 0);
  assert.ok(e.finalGallons >= 0);
});

test('the worst stack a rep can actually select now lands just above zero', () => {
  // What widening to +/-50% actually changed, measured rather than assumed.
  // Every value here is one a rep can legitimately pick: the worst real
  // region (Upper Midwest, -32.6%), "Very limited" amenities, worn
  // restrooms, a sub-3.0 rating, no rewards, and the bottom of the slider.
  // Together they leave a multiplier of 0.0040 -- 40 gal/mo on a 10,000
  // baseline, against 2,540 at the old -25% bottom.
  //
  // So the floor is not reached, but the margin is now 0.4% rather than
  // 25%. One more negative term, or a region worse than any observed
  // today, tips it under -- which is the whole reason the floor stays.
  const args = { profile: 'Medium truck stop', roadway: 'Interstate', baseline: 10000,
    regionPct: -0.326, amenityLevel: 'Very limited', restroomLevel: 'Dated / worn',
    reviewRating: 2.0, rewardsLevel: 'Not participating' };

  const atMin = BusDevGallonsCalc.calculateEstimate(
    Object.assign({}, args, { pricingLevel: BDPG_CONFIG.PRICING_RANGE.min }));
  assert.equal(atMin.finalGallons, 40);
  assert.ok(atMin.finalGallons > 0, 'not floored -- but only just');
  assert.ok(atMin.officialSubtotal > 0, 'the published figure is unaffected by pricing');

  const atOldMin = BusDevGallonsCalc.calculateEstimate(
    Object.assign({}, args, { pricingLevel: -0.25 }));
  assert.equal(atOldMin.finalGallons, 2540, 'the margin the old range left');
});

test('one step past the worst selectable stack is what the floor catches', () => {
  // The floor is load-bearing at this range: nudge the region a further 1%
  // -- still well inside what a future recomputation could produce -- and
  // the unclamped multiplier goes negative.
  const e = BusDevGallonsCalc.calculateEstimate({
    profile: 'Medium truck stop', roadway: 'Interstate', baseline: 10000,
    regionPct: -0.336, amenityLevel: 'Very limited', restroomLevel: 'Dated / worn',
    reviewRating: 2.0, pricingLevel: -0.50, rewardsLevel: 'Not participating'
  });
  assert.equal(e.finalGallons, 0, 'clamped, never negative');
});

test('the retired option list is gone from the config surface', () => {
  assert.equal(BDPG_CONFIG.PRICING_LEVELS, undefined, 'nothing may enumerate options again');
  assert.equal(BDPG_CONFIG.PRICING_ADJUST, undefined);
  assert.ok(BDPG_CONFIG.PRICING_RANGE, 'the range replaces them');
});
