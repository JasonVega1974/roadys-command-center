(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BusDevGallonsCalc: factory(require('./busDevGallonsConfig.js').BDPG_CONFIG) };
  } else {
    root.BusDevGallonsCalc = factory(root.BDPG_CONFIG);
  }
})(typeof window !== 'undefined' ? window : this, function (BDPG_CONFIG) {
  'use strict';

  function getProfiles() {
    var seen = [];
    BDPG_CONFIG.BASELINE_TABLE.forEach(function (row) {
      if (seen.indexOf(row.profile) === -1) seen.push(row.profile);
    });
    return seen;
  }

  function getValidRoadways(profile) {
    var out = [];
    BDPG_CONFIG.BASELINE_TABLE.forEach(function (row) {
      if (row.profile === profile && out.indexOf(row.roadway) === -1) out.push(row.roadway);
    });
    return out;
  }

  function getBaselineRow(profile, roadway) {
    var found = null;
    BDPG_CONFIG.BASELINE_TABLE.forEach(function (row) {
      if (row.profile === profile && row.roadway === roadway) found = row;
    });
    return found ? { profile: found.profile, roadway: found.roadway, lanes: found.lanes, baseline: found.baseline } : null;
  }

  function resolveRegion(stateAbbr) {
    if (!stateAbbr) return null;
    var st = String(stateAbbr).toUpperCase();
    var found = null;
    Object.keys(BDPG_CONFIG.BDPG_REGION_MAP).forEach(function (region) {
      if (BDPG_CONFIG.BDPG_REGION_MAP[region].indexOf(st) !== -1) found = region;
    });
    return found;
  }

  function amenityAdjustment(level) {
    return BDPG_CONFIG.AMENITY_ADJUST.hasOwnProperty(level) ? BDPG_CONFIG.AMENITY_ADJUST[level] : 0;
  }

  function reviewAdjustment(rating) {
    if (rating === null || rating === undefined || rating === '') {
      return { pct: 0, flagged: true };
    }
    var n = Number(rating);
    if (isNaN(n)) return { pct: 0, flagged: true };
    var band = BDPG_CONFIG.REVIEW_BANDS.filter(function (b) { return n <= b.max; })[0];
    var last = BDPG_CONFIG.REVIEW_BANDS[BDPG_CONFIG.REVIEW_BANDS.length - 1];
    return { pct: band ? band.pct : last.pct, flagged: false };
  }

  function pricingAdjustment(level) {
    if (BDPG_CONFIG.PRICING_ADJUST.hasOwnProperty(level)) return BDPG_CONFIG.PRICING_ADJUST[level];
    return BDPG_CONFIG.PRICING_ADJUST[BDPG_CONFIG.PRICING_DEFAULT];
  }

  function rewardsAdjustment(level) {
    if (BDPG_CONFIG.REWARDS_ADJUST.hasOwnProperty(level)) return BDPG_CONFIG.REWARDS_ADJUST[level];
    return BDPG_CONFIG.REWARDS_ADJUST[BDPG_CONFIG.REWARDS_DEFAULT];
  }

  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

  // Formats a percentage magnitude for the exported math lines with up to 3
  // decimals, trailing zeros trimmed but never below 2 decimals -- so 0.06
  // prints "0.06", 0.025 prints "0.025" (not the lossy "0.03" from
  // toFixed(2)), and 0 prints "0.00". Sign is handled by pctTerm(), not here.
  function fmtPct(n) {
    var s = Math.abs(n).toFixed(3);
    if (s.length > 4 && s.charAt(s.length - 1) === '0') s = s.slice(0, -1);
    return s;
  }

  // Renders one term of a math-line sum with its own sign, so a negative
  // percentage reads "- 0.03" instead of "+ -0.03".
  function pctTerm(n) {
    return (n < 0 ? ' - ' : ' + ') + fmtPct(n);
  }

  function suggestAmenityLevel(details) {
    var d = details || {};
    var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS;

    var hasShowers = d.showers && d.showers !== 'none';
    var hasScale = d.scale === 'yes';
    var goodParking = opts.goodParking.indexOf(d.parking) !== -1;
    var goodFood = opts.goodFood.indexOf(d.food) !== -1;
    var noParking = d.parking === 'none' || !d.parking;
    var limitedFood = opts.limitedFood.indexOf(d.food) !== -1 || !d.food;

    if (hasShowers && goodFood && hasScale && goodParking) {
      return { level: 'Good / full service', reason: 'Showers, food service, a certified scale, and 16+ parking spots.' };
    }
    if (!hasShowers && noParking && limitedFood) {
      return { level: 'Very limited', reason: 'No showers, no truck parking, and no real food service.' };
    }
    return { level: 'Average', reason: 'Falls between the Good and Very limited thresholds.' };
  }

  function atLeastZero(n) { return n < 0 ? 0 : n; }

  function calculateEstimate(opts) {
    var row = getBaselineRow(opts.profile, opts.roadway);
    if (!row) return null;

    var regionPct = Number(opts.regionPct) || 0;
    var amenityPct = amenityAdjustment(opts.amenityLevel);
    var review = reviewAdjustment(opts.reviewRating);
    var pricingPct = pricingAdjustment(opts.pricingLevel);
    var rewardsPct = rewardsAdjustment(opts.rewardsLevel);

    // Three multipliers, each adding one more term to the one above it.
    // officialMultiplier must never gain a term -- it is the figure every
    // downstream surface reports as the network-adjusted baseline.
    //
    // Floored at zero. The region term used to be a +/-10% nudge, which no sum
    // of the other adjustments could drive negative. It now carries real
    // per-region deltas on a -100..+100 slider, so region -100 with amenity
    // -5 and review -5 reaches -0.10 and the tool would quote NEGATIVE
    // gallons. Today's worst real value is Texas at -36.7%, comfortably safe;
    // the floor is here because the control permits what the data does not.
    // Clamping the multiplier rather than the output keeps all three figures
    // and their printed math lines consistent with one another.
    var officialMultiplier = atLeastZero(1 + regionPct + amenityPct + review.pct);
    var pricingMultiplier = atLeastZero(officialMultiplier + pricingPct);
    var finalMultiplier = atLeastZero(pricingMultiplier + rewardsPct);

    var officialSubtotal = Math.round(row.baseline * officialMultiplier);
    var pricingAdjusted = Math.round(row.baseline * pricingMultiplier);
    var finalGallons = Math.round(row.baseline * finalMultiplier);

    var officialMathLine = fmtInt(row.baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) +
      ') = ' + fmtInt(officialSubtotal);
    var pricingMathLine = fmtInt(row.baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) + pctTerm(pricingPct) +
      ') = ' + fmtInt(pricingAdjusted);
    var finalMathLine = fmtInt(row.baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) +
      pctTerm(pricingPct) + pctTerm(rewardsPct) +
      ') = ' + fmtInt(finalGallons);

    return {
      baseline: row.baseline,
      regionPct: regionPct,
      amenityPct: amenityPct,
      reviewPct: review.pct,
      pricingPct: pricingPct,
      rewardsPct: rewardsPct,
      reviewFlagged: review.flagged,
      officialSubtotal: officialSubtotal,
      pricingAdjusted: pricingAdjusted,
      finalGallons: finalGallons,
      officialMathLine: officialMathLine,
      pricingMathLine: pricingMathLine,
      finalMathLine: finalMathLine
    };
  }

  return {
    getProfiles: getProfiles,
    getValidRoadways: getValidRoadways,
    getBaselineRow: getBaselineRow,
    resolveRegion: resolveRegion,
    amenityAdjustment: amenityAdjustment,
    reviewAdjustment: reviewAdjustment,
    pricingAdjustment: pricingAdjustment,
    rewardsAdjustment: rewardsAdjustment,
    suggestAmenityLevel: suggestAmenityLevel,
    calculateEstimate: calculateEstimate
  };
});
