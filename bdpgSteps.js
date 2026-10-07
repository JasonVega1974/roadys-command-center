(function (root) {
  'use strict';

  // The six Adjustment Steps: their order, numbering, titles and the
  // formatting of the contribution each one shows.
  //
  // Every step is an adjustment the rep can move, so every row is a signed
  // percentage. The profile/roadway baseline is deliberately NOT a step: it
  // is chosen in Step 1 of the wizard and repeating it here as a read-only
  // label added a row nobody could act on.
  //
  // This lives outside index.html because it is a pure decision about what
  // the rep is told, and a pure decision belongs somewhere `node --test` can
  // reach it. The previous phase shipped two blocking defects that both lived
  // in untested rendering glue; this is the seam that stops that repeating.
  //
  // Deliberately NOT part of busDevGallonsCalculator.js: nothing here is on
  // the estimate path, and that file is contractually untouched by this work.
  // This module reads numbers the engine already produced and decides how to
  // say them. It never computes one.

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // One decimal, signed, with the same U+2212 minus the rest of the page uses.
  //
  // Zero gets NO sign: "+0.0%" asserts an increase that is not there, and zero
  // is the resting value of four of these six adjustments. The sign is
  // decided from the ROUNDED magnitude, not the raw value -- a value like
  // -0.0004 rounds to "0.0" at one decimal, and a signed "−0.0%" would
  // assert a decrease that the displayed figure doesn't show, which is the
  // same false assertion as "+0.0%" in the other direction.
  function fmtPct(n) {
    var p = n * 100;
    var magText = Math.abs(p).toFixed(1);
    var sign = magText === '0.0' ? '' : (p > 0 ? '+' : '−');
    return sign + magText + '%';
  }

  function pctRow(n, title, value) {
    var v = num(value);
    return {
      n: n,
      title: title,
      subtitle: '',
      value: v,
      valueText: v === null ? '—' : fmtPct(v),
      valueKind: v === null ? 'none' : 'pct'
    };
  }

  function rows(input) {
    var i = input || {};
    return [
      pctRow(1, 'Region', i.regionPct),
      pctRow(2, 'Trucker Path Rating', i.reviewPct),
      // amenityLevelPct, NOT the formula's combined amenityPct -- steps 3 and
      // 4 are the two halves of that one term. See the invariant test.
      pctRow(3, 'Amenities', i.amenityLevelPct),
      pctRow(4, 'Restroom / Shower Condition', i.restroomPct),
      pctRow(5, "Roady's Rewards Participation", i.rewardsPct),
      pctRow(6, 'Discount Pricing Strategy', i.pricingPct)
    ];
  }

  var BDPG_STEPS = {
    rows: rows
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_STEPS: BDPG_STEPS };
  } else {
    root.BDPG_STEPS = BDPG_STEPS;
  }
})(typeof window !== 'undefined' ? window : this);
