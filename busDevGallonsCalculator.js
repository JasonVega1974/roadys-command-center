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

  // Accepts the slider's number, or one of the five retired option strings
  // off a saved prospect. A string is translated rather than rejected: a
  // prospect saved at 'Most aggressive' must reopen at +0.05, not snap to
  // the 0 default and quietly restate its own estimate.
  //
  // Clamped to PRICING_HARD_LIMIT, NOT to PRICING_RANGE. The slider's actual
  // ends are derived per profile from its own p10/p90 and routinely exceed
  // the fallback range -- Large/Highway reaches +771% -- so clamping here to
  // +/-50% would truncate the very figure the control was showing the rep.
  // The envelope exists only to reject a corrupted stored value; it is far
  // outside anything a profile range can produce.
  function pricingAdjustment(level) {
    if (typeof level === 'string' && BDPG_CONFIG.PRICING_LEGACY_ADJUST.hasOwnProperty(level)) {
      return BDPG_CONFIG.PRICING_LEGACY_ADJUST[level];
    }
    var r = BDPG_CONFIG.PRICING_HARD_LIMIT;
    if (level === null || level === undefined || level === '' ||
        typeof level === 'boolean' || typeof level === 'object') return BDPG_CONFIG.PRICING_DEFAULT;
    var n = Number(level);
    if (!isFinite(n)) return BDPG_CONFIG.PRICING_DEFAULT;
    return Math.max(r.min, Math.min(r.max, n));
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

  // DEF and Laundry are SUPPORTING criteria, not core ones.
  //
  // "Good / full service" needs all four core amenities -- showers, real
  // food, a certified scale, 16+ parking -- plus at least one of DEF or
  // laundry. Making them core instead would have put the top band out of
  // reach of most of the network for the sake of two conveniences; making
  // them count for nothing would have ignored the brief. So they separate
  // a fully-equipped site from a merely adequate one, and nothing else:
  //
  //   * they never promote a site that is missing a core amenity, and
  //   * their absence never demotes a site to "Very limited", which stays
  //     defined by the absence of showers, parking and food.
  function suggestAmenityLevel(details) {
    var d = details || {};
    var opts = BDPG_CONFIG.AMENITY_DETAIL_OPTIONS;

    var hasShowers = d.showers && d.showers !== 'none';
    var hasScale = d.scale === 'yes';
    var goodParking = opts.goodParking.indexOf(d.parking) !== -1;
    var goodFood = opts.goodFood.indexOf(d.food) !== -1;
    var noParking = d.parking === 'none' || !d.parking;
    var limitedFood = opts.limitedFood.indexOf(d.food) !== -1 || !d.food;
    var hasDef = d.def === 'yes';
    var hasLaundry = d.laundry === 'yes';
    var allCore = hasShowers && goodFood && hasScale && goodParking;

    if (allCore && (hasDef || hasLaundry)) {
      return {
        level: 'Good / full service',
        reason: 'Showers, food service, a certified scale, 16+ parking spots, and ' +
          (hasDef && hasLaundry ? 'both DEF and laundry.' : (hasDef ? 'DEF.' : 'laundry.'))
      };
    }
    if (allCore) {
      return {
        level: 'Average',
        reason: 'All four core amenities, but neither DEF nor laundry.'
      };
    }
    if (!hasShowers && noParking && limitedFood) {
      return { level: 'Very limited', reason: 'No showers, no truck parking, and no real food service.' };
    }
    return { level: 'Average', reason: 'Falls between the Good and Very limited thresholds.' };
  }

  // Restroom / shower condition, a term of its own. Unrecognised or unset
  // reads as 0 -- the same neutral-by-default rule the amenity level follows.
  function restroomAdjustment(level) {
    return BDPG_CONFIG.RESTROOM_ADJUST.hasOwnProperty(level)
      ? BDPG_CONFIG.RESTROOM_ADJUST[level] : 0;
  }

  // DEF and inside-sales estimates, derived from FINAL monthly gallons.
  //
  // Downstream of the formula, never an input to it: these are consequences
  // of the fuel volume. Every rate is read from the passed config rather than
  // hardcoded, because all four are commercial assumptions an admin can edit.
  // Returns null when disabled so callers omit the section rather than
  // rendering zeros.
  function defInsideEstimate(finalGallons, cfg) {
    var c = cfg || BDPG_CONFIG.DEF_INSIDE_DEFAULTS;
    if (!c || c.enabled === false) return null;
    var g = Number(finalGallons);
    if (!isFinite(g) || g < 0) return null;

    var defPct = Number(c.defPctOfDiesel);
    var defPrice = Number(c.defPricePerGal);
    var perTxn = Number(c.gallonsPerTransaction);
    var ring = Number(c.avgInsideRing);
    if (!isFinite(defPct) || !isFinite(defPrice) || !isFinite(ring)) return null;
    // A zero or missing gallons-per-transaction would divide by zero and
    // report Infinity transactions on a customer-facing sheet.
    if (!isFinite(perTxn) || perTxn <= 0) return null;

    var defGal = g * defPct;
    var defSales = defGal * defPrice;
    var txns = g / perTxn;
    var insideSales = txns * ring;
    return {
      defGallonsMo: defGal, defGallonsYr: defGal * 12,
      defSalesMo: defSales, defSalesYr: defSales * 12,
      transactionsMo: txns, transactionsYr: txns * 12,
      insideSalesMo: insideSales, insideSalesYr: insideSales * 12,
      rates: { defPct: defPct, defPrice: defPrice, perTxn: perTxn, ring: ring }
    };
  }

  function atLeastZero(n) { return n < 0 ? 0 : n; }

  function calculateEstimate(opts) {
    var row = getBaselineRow(opts.profile, opts.roadway);
    if (!row) return null;

    // The baseline may be supplied by the caller. This is an INPUT, not a
    // formula change: every multiplier below is untouched and officialSubtotal
    // is still baseline x (1 + region + amenities + review).
    //
    // The page passes the per-prospect figure that BDPG_STATS.dynamicBaseline()
    // computes from comparable network locations; when that lookup falls back,
    // it passes nothing and the static table row stands. Validated here rather
    // than trusted, because a bad value would silently rescale every figure on
    // a customer-facing sheet -- anything that is not a positive finite number
    // falls back to the row.
    var supplied = opts.baseline;
    var baseline = row.baseline;
    if (supplied !== null && supplied !== undefined && supplied !== '' &&
        typeof supplied !== 'boolean' && typeof supplied !== 'object') {
      var b = Number(supplied);
      if (isFinite(b) && b > 0) baseline = b;
    }

    var regionPct = Number(opts.regionPct) || 0;
    // The amenity term is the level plus the restroom condition. One figure
    // in the formula and one row in the breakdown: both are statements about
    // amenities, and splitting them would add a sixth term to a formula the
    // brief says is unchanged.
    var amenityPct = amenityAdjustment(opts.amenityLevel) + restroomAdjustment(opts.restroomLevel);
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

    var officialSubtotal = Math.round(baseline * officialMultiplier);
    var pricingAdjusted = Math.round(baseline * pricingMultiplier);
    var finalGallons = Math.round(baseline * finalMultiplier);

    var officialMathLine = fmtInt(baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) +
      ') = ' + fmtInt(officialSubtotal);
    var pricingMathLine = fmtInt(baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) + pctTerm(pricingPct) +
      ') = ' + fmtInt(pricingAdjusted);
    var finalMathLine = fmtInt(baseline) + ' × (1' +
      pctTerm(regionPct) + pctTerm(amenityPct) + pctTerm(review.pct) +
      pctTerm(pricingPct) + pctTerm(rewardsPct) +
      ') = ' + fmtInt(finalGallons);

    return {
      baseline: baseline,
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
    restroomAdjustment: restroomAdjustment,
    defInsideEstimate: defInsideEstimate,
    reviewAdjustment: reviewAdjustment,
    pricingAdjustment: pricingAdjustment,
    rewardsAdjustment: rewardsAdjustment,
    suggestAmenityLevel: suggestAmenityLevel,
    calculateEstimate: calculateEstimate
  };
});
