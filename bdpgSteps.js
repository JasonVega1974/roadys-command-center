(function (root) {
  'use strict';

  // The Step 2 adjustments: which zone each one renders in, their order,
  // their numbering, their titles, and the formatting of the contribution
  // each one shows.
  //
  // Two zones, matching the two panels the page draws:
  //
  //   region -- the map panel on the left. Unnumbered: the map IS the input,
  //             and a number chip on a panel heading reads as a step the rep
  //             has to work through rather than a place to click.
  //   steps  -- the five adjustments stacked in the right panel, numbered 1-5.
  //
  // This lives outside index.html because it is a pure decision about what
  // the rep is told, and a pure decision belongs somewhere `node --test` can
  // reach it. An earlier phase shipped two blocking defects that both lived
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

  // `key` is the stable identity, not `n`. The numbering has been reordered
  // twice already; an id built from it goes stale every time, while a badge
  // addressed as 'pricing' keeps working however the rows are arranged.
  // `n` is null for the top zone, which is deliberately unnumbered.
  function entry(key, title, value, n) {
    var v = num(value);
    return {
      key: key,
      n: (n === undefined) ? null : n,
      title: title,
      value: v,
      valueText: v === null ? '—' : fmtPct(v),
      valueKind: v === null ? 'none' : 'pct'
    };
  }

  function rows(input) {
    var i = input || {};
    return {
      region: entry('region', 'Region', i.regionPct, null),
      steps: [
        entry('rating', 'Trucker Path Rating', i.reviewPct, 1),
        // amenityLevelPct, NOT the formula's combined amenityPct -- steps 2
        // and 3 are the two halves of that one term. See the invariant test.
        entry('amenities', 'Amenities', i.amenityLevelPct, 2),
        entry('restroom', 'Restroom / Shower Condition', i.restroomPct, 3),
        entry("rewards", "Roady's Rewards Participation", i.rewardsPct, 4),
        entry('pricing', 'Discount Pricing Strategy', i.pricingPct, 5)
      ]
    };
  }

  // Every entry from both panels, in display order. The page patches a single
  // badge during a slider drag and looks it up by key rather than by position,
  // so neither caller has to know which panel an adjustment lives in.
  function all(result) {
    var r = result || rows();
    return [r.region].concat(r.steps);
  }

  function byKey(result, key) {
    var list = all(result);
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  var BDPG_STEPS = {
    rows: rows,
    all: all,
    byKey: byKey
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_STEPS: BDPG_STEPS };
  } else {
    root.BDPG_STEPS = BDPG_STEPS;
  }
})(typeof window !== 'undefined' ? window : this);
