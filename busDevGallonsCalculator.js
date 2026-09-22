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

  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

  function calculateEstimate(opts) {
    var row = getBaselineRow(opts.profile, opts.roadway);
    if (!row) return null;

    var regionPct = Number(opts.regionPct) || 0;
    var amenityPct = amenityAdjustment(opts.amenityLevel);
    var review = reviewAdjustment(opts.reviewRating);
    var pricingPct = pricingAdjustment(opts.pricingLevel);

    var officialMultiplier = 1 + regionPct + amenityPct + review.pct;
    var finalMultiplier = officialMultiplier + pricingPct;

    var officialSubtotal = Math.round(row.baseline * officialMultiplier);
    var finalGallons = Math.round(row.baseline * finalMultiplier);

    var officialMathLine = fmtInt(row.baseline) + ' × (1 + ' +
      regionPct.toFixed(2) + ' + ' + amenityPct.toFixed(2) + ' + ' + review.pct.toFixed(2) +
      ') = ' + fmtInt(officialSubtotal);
    var finalMathLine = fmtInt(row.baseline) + ' × (1 + ' +
      regionPct.toFixed(2) + ' + ' + amenityPct.toFixed(2) + ' + ' + review.pct.toFixed(2) + ' + ' + pricingPct.toFixed(2) +
      ') = ' + fmtInt(finalGallons);

    return {
      baseline: row.baseline,
      regionPct: regionPct,
      amenityPct: amenityPct,
      reviewPct: review.pct,
      pricingPct: pricingPct,
      reviewFlagged: review.flagged,
      officialSubtotal: officialSubtotal,
      finalGallons: finalGallons,
      officialMathLine: officialMathLine,
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
    calculateEstimate: calculateEstimate
  };
});
