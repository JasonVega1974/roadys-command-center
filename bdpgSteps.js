(function (root) {
  'use strict';

  // The seven Adjustment Steps: their order, numbering, titles and the
  // formatting of the contribution each one shows.
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

  function str(v) {
    return typeof v === 'string' ? v : '';
  }

  // One decimal, signed, with the same U+2212 minus the rest of the page uses.
  //
  // Zero gets NO sign: "+0.0%" asserts an increase that is not there, and zero
  // is the resting value of four of these six adjustments.
  function fmtPct(n) {
    var p = n * 100;
    var sign = p > 0 ? '+' : (p < 0 ? '−' : '');
    return sign + Math.abs(p).toFixed(1) + '%';
  }

  function fmtGal(n) {
    return Math.round(n).toLocaleString('en-US') + ' gal/mo';
  }

  // Both parts when both exist, whichever one exists otherwise. Joining only
  // on "both present" would silently drop a roadway that is genuinely set.
  function joinDot(a, b) {
    var parts = [];
    if (a) parts.push(a);
    if (b) parts.push(b);
    return parts.join(' · ');
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
    var baseline = num(i.baseline);

    return [
      {
        n: 1,
        title: 'Profile / Roadway / Lanes',
        subtitle: joinDot(str(i.profile), str(i.roadway)),
        value: baseline,
        valueText: baseline === null ? '—' : fmtGal(baseline),
        valueKind: baseline === null ? 'none' : 'gallons'
      },
      pctRow(2, 'Region', i.regionPct),
      pctRow(3, 'Trucker Path Rating', i.reviewPct),
      // amenityLevelPct, NOT the formula's combined amenityPct -- steps 4 and
      // 5 are the two halves of that one term. See the invariant test.
      pctRow(4, 'Amenities', i.amenityLevelPct),
      pctRow(5, 'Restroom / Shower Condition', i.restroomPct),
      pctRow(6, "Roady's Rewards Participation", i.rewardsPct),
      pctRow(7, 'Discount Pricing Strategy', i.pricingPct)
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
