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

  function calculateEstimate(opts) {
    var row = getBaselineRow(opts.profile, opts.roadway);
    if (!row) return null;

    var regionPct = Number(opts.regionPct) || 0;
    var amenityPct = amenityAdjustment(opts.amenityLevel);
    var review = reviewAdjustment(opts.reviewRating);
    var pricingPct = pricingAdjustment(opts.pricingLevel);
    var rewardsPct = rewardsAdjustment(opts.rewardsLevel);

    // Three multipliers, each adding one more term to the one above it.
    // officialMultiplier is the line that must never gain a term: it is what
    // reproduces Roady's published calculator.
    var officialMultiplier = 1 + regionPct + amenityPct + review.pct;
    var pricingMultiplier = officialMultiplier + pricingPct;
    var finalMultiplier = pricingMultiplier + rewardsPct;

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

  var WEIGHT_KEYS = ['rangePosition', 'condition', 'hours', 'distance', 'corridor', 'competition'];

  // A weight set reaches here from localStorage, so it can be anything. A set
  // that is not six finite numbers in 0..100 summing to exactly 100 is not
  // "close enough" -- it would silently produce a grade nobody configured, so
  // it is discarded whole rather than patched. Same stance as isNum/hasOwn
  // elsewhere in this project.
  function resolveWeights(w) {
    if (!w) return BDPG_CONFIG.WEIGHT_CONFIG;
    var total = 0;
    for (var i = 0; i < WEIGHT_KEYS.length; i++) {
      var v = w[WEIGHT_KEYS[i]];
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100) return BDPG_CONFIG.WEIGHT_CONFIG;
      total += v;
    }
    // Exactly the six keys, not "at least" them. An object carrying a seventh
    // key is not a valid set with harmless extras -- it is evidence the value
    // came from something other than this tool's own six sliders (a hand edit,
    // an older or newer shape, another product's config). Accepting it would
    // pass the strays straight through into grade.weights and, from there,
    // into a saved record's weight stamp. Own enumerable keys only, which is
    // all JSON.parse can produce; the six are already known present, so a
    // count is the whole test. Runs after the loop so a non-object argument
    // has already fallen back on the typeof check above rather than reaching
    // Object.keys().
    if (Object.keys(w).length !== WEIGHT_KEYS.length) return BDPG_CONFIG.WEIGHT_CONFIG;
    return total === 100 ? w : BDPG_CONFIG.WEIGHT_CONFIG;
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

    var w = resolveWeights(opts.weights);
    var overallScore = (w.rangePosition * rangePositionPct +
                        w.condition * signalScores.condition +
                        w.hours * signalScores.hours +
                        w.distance * signalScores.distance +
                        w.corridor * signalScores.corridor +
                        w.competition * signalScores.competition) / 100;
    var band = gradeForScore(overallScore);

    return {
      rangeLo: range ? range.rangeLo : null,
      rangeHi: range ? range.rangeHi : null,
      rangePositionPct: rangePositionPct,
      signalScores: signalScores,
      signalAvg: signalAvg,
      weights: w,
      overallScore: overallScore,
      grade: band.grade,
      gradeLabel: band.label
    };
  }

  function conditionAdjustedGallons(finalGallons, condition) {
    var pct = BDPG_CONFIG.CONDITION_ADJUST.hasOwnProperty(condition) ? BDPG_CONFIG.CONDITION_ADJUST[condition] : 0;
    return Math.round(finalGallons * (1 + pct));
  }

  function calculateMembershipFit(finalGallons) {
    var cfg = BDPG_CONFIG.MEMBERSHIP_CONFIG;
    var vpg = Number(cfg.valuePerGallon) || 0;

    if (vpg <= 0) {
      return { valuePerGallonConfigured: false, valuePerGallon: 0, monthlyValue: null, plans: [] };
    }

    var monthlyValue = finalGallons * vpg;
    var plans = cfg.plans.map(function (p) {
      var cost = Number(p.cost) || 0;
      if (cost <= 0) return { name: p.name, configured: false };
      var breakevenGallons = Math.max(1, Math.round(cost / vpg));
      var coverageMultiple = Math.round((finalGallons / breakevenGallons) * 100) / 100;
      return { name: p.name, configured: true, cost: cost, breakevenGallons: breakevenGallons, coverageMultiple: coverageMultiple };
    });

    return { valuePerGallonConfigured: true, valuePerGallon: vpg, monthlyValue: monthlyValue, plans: plans };
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
    calculateEstimate: calculateEstimate,
    calculateNetworkFitGrade: calculateNetworkFitGrade,
    resolveWeights: resolveWeights,
    conditionAdjustedGallons: conditionAdjustedGallons,
    calculateMembershipFit: calculateMembershipFit
  };
});
