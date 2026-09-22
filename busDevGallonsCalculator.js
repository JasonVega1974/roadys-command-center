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

  function profileAdjustmentBounds() {
    var amenityVals = Object.keys(BDPG_CONFIG.AMENITY_ADJUST).map(function (k) { return BDPG_CONFIG.AMENITY_ADJUST[k]; });
    var reviewVals = BDPG_CONFIG.REVIEW_BANDS.map(function (b) { return b.pct; });
    return {
      min: Math.min.apply(null, amenityVals) + Math.min.apply(null, reviewVals),
      max: Math.max.apply(null, amenityVals) + Math.max.apply(null, reviewVals)
    };
  }

  function profileRange(profile) {
    var rows = BDPG_CONFIG.BASELINE_TABLE.filter(function (r) { return r.profile === profile; });
    if (!rows.length) return null;
    var baselines = rows.map(function (r) { return r.baseline; });
    var bounds = profileAdjustmentBounds();
    var profileMin = Math.min.apply(null, baselines);
    var profileMax = Math.max.apply(null, baselines);
    return {
      rangeLo: Math.round(profileMin * (1 + bounds.min)),
      rangeHi: Math.round(profileMax * (1 + bounds.max))
    };
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function signalScore(signal, value) {
    var map = BDPG_CONFIG.NETWORK_FIT_SIGNAL_SCORES[signal];
    return (map && map.hasOwnProperty(value)) ? map[value] : 0;
  }

  function gradeForScore(score) {
    var band = BDPG_CONFIG.NETWORK_FIT_GRADE_BANDS.filter(function (b) { return score >= b.min; })[0];
    return band || BDPG_CONFIG.NETWORK_FIT_GRADE_BANDS[BDPG_CONFIG.NETWORK_FIT_GRADE_BANDS.length - 1];
  }

  function calculateNetworkFitGrade(opts) {
    var range = profileRange(opts.profile);
    var d = opts.supportingDetails || {};

    var rangePositionPct;
    if (!range || range.rangeHi === range.rangeLo) {
      rangePositionPct = 0;
    } else {
      rangePositionPct = clamp((opts.officialSubtotal - range.rangeLo) / (range.rangeHi - range.rangeLo), 0, 1) * 100;
    }

    var signalScores = {
      condition: signalScore('condition', d.condition),
      hours: signalScore('hours', d.hours),
      distance: signalScore('distance', d.distance),
      corridor: signalScore('corridor', d.corridor),
      competition: signalScore('competition', d.competition)
    };
    var signalKeys = Object.keys(signalScores);
    var signalAvg = signalKeys.reduce(function (sum, k) { return sum + signalScores[k]; }, 0) / signalKeys.length;

    var overallScore = 0.5 * rangePositionPct + 0.5 * signalAvg;
    var band = gradeForScore(overallScore);

    return {
      rangeLo: range ? range.rangeLo : null,
      rangeHi: range ? range.rangeHi : null,
      rangePositionPct: rangePositionPct,
      signalScores: signalScores,
      signalAvg: signalAvg,
      overallScore: overallScore,
      grade: band.grade,
      gradeLabel: band.label
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
    suggestAmenityLevel: suggestAmenityLevel,
    calculateEstimate: calculateEstimate,
    calculateNetworkFitGrade: calculateNetworkFitGrade
  };
});
