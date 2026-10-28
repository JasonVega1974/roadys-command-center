(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./membershipModelConfig.js').MGM_CONFIG);
  } else {
    root.MembershipModel = factory(root.MGM_CONFIG).MembershipModel;
  }
}(typeof window !== 'undefined' ? window : this, function (CONFIG) {
  'use strict';

  var clone = function (o) {
    return typeof structuredClone === 'function'
      ? structuredClone(o) : JSON.parse(JSON.stringify(o));
  };

  function defaultState(config) { return clone(config || CONFIG); }

  // Guard: a hand-edited or half-written field must degrade to a number,
  // never reach the arithmetic as NaN and poison every downstream figure.
  function n(v, dflt) {
    var x = Number(v);
    return isFinite(x) ? x : (dflt === undefined ? 0 : dflt);
  }

  function groupTotal(state) {
    return (state.groups || []).reduce(function (a, g) { return a + n(g.count); }, 0);
  }

  function ptpCount(state) {
    var g = (state.groups || []).filter(function (x) { return x.key === 'ptp'; })[0];
    return g ? n(g.count) : 0;
  }

  // lost / prior-year count, for every year where both are known.
  function derivedAttrition(history) {
    var h = history || [], rows = [];
    for (var i = 1; i < h.length; i++) {
      var prev = h[i - 1], cur = h[i];
      if (cur.lost != null && prev.count != null) {
        rows.push({
          year: cur.year, lost: cur.lost, base: prev.count,
          rate: 100 * cur.lost / prev.count
        });
      }
    }
    var last3 = rows.slice(-3);
    var avg = last3.length
      ? last3.reduce(function (a, r) { return a + r.rate; }, 0) / last3.length
      : 0;
    return { rows: rows, avg: avg };
  }

  // Monthly roll-forward. Annual rows are summed from `months`, so the
  // collapsible monthly table and the annual table cannot disagree.
  // opts.addsPerMonthOverride lets the Sales Pipeline tab drive adds; absent,
  // the flat rate applies, which is what an unsigned page always gets.
  function runModel(state, opts) {
    opts = opts || {};
    var startTotal = groupTotal(state);
    var ptp = ptpCount(state);
    var roadys = startTotal - ptp;

    var attr = state.attrition || {};
    var steadyM = n(attr.steady) / 100 / 12;
    var structural = attr.structural || {};

    var adds = state.adds || {};
    var hasOverride = opts.addsPerMonthOverride !== undefined
      && opts.addsPerMonthOverride !== null;
    var addsRate = hasOverride ? n(opts.addsPerMonthOverride) : n(adds.perMonth);
    var growth = n(adds.growthPct) / 100;
    var lag = Math.max(0, Math.round(n(adds.activationLag)));
    var ptpNet = n(adds.ptpNet);

    var CURRENT_YEAR = n(state.CURRENT_YEAR, 2026);
    var asOfMonth = n(state.ASOF_MONTH, 10);
    var horizon = n(state.HORIZON_YEARS, 3);

    var ytdRow = (state.history || []).filter(function (h) {
      return h.year === CURRENT_YEAR;
    })[0];
    var ytdAdds = ytdRow ? n(ytdRow.newR) : 0;

    var months = [], years = [];
    // Adds become revenue-producing only after `lag` months. Existing
    // members are all producing on day one.
    var queue = [], producing = roadys;

    for (var y = CURRENT_YEAR; y <= CURRENT_YEAR + horizon; y++) {
      var startAll = roadys + ptp;
      var monthCount = (y === CURRENT_YEAR) ? (12 - asOfMonth) : 12;
      if (monthCount < 0) monthCount = 0;
      var structYear = n(structural[y]);
      var structPerMonth = monthCount > 0 ? structYear / monthCount : 0;

      var newModeled = 0, lostTotal = 0, steadyTotal = 0, structTotal = 0;

      for (var m = 0; m < monthCount; m++) {
        var add = addsRate;
        var steadyLose = roadys * steadyM;
        var structLose = structPerMonth;
        var lose = steadyLose + structLose;

        roadys += add - lose;

        queue.push(add);
        if (queue.length > lag) producing += queue.shift();
        // Losses hit producing members too.
        producing = Math.max(0, producing - lose);

        newModeled += add; lostTotal += lose;
        steadyTotal += steadyLose; structTotal += structLose;

        months.push({
          year: y, month: m + 1 + (y === CURRENT_YEAR ? asOfMonth : 0),
          adds: add, lost: lose, steadyLost: steadyLose, structuralLost: structLose,
          end: roadys, producing: producing
        });
      }

      var ptpEnd = ptp + ptpNet * (y === CURRENT_YEAR ? (monthCount / 12) : 1);

      years.push({
        year: y, start: startAll,
        newAdds: newModeled + (y === CURRENT_YEAR ? ytdAdds : 0),
        newModeled: newModeled,
        ytd: (y === CURRENT_YEAR ? ytdAdds : 0),
        lost: lostTotal, steadyLost: steadyTotal, structuralLost: structTotal,
        end: roadys + ptpEnd, endRoadys: roadys, ptp: ptpEnd,
        producing: producing + ptpEnd
      });

      addsRate *= 1 + growth;
    }

    years.forEach(function (r) {
      r.net = r.end - r.start;
      r.pct = r.start ? 100 * r.net / r.start : 0;
    });

    return { months: months, years: years, startTotal: startTotal, ptp: ptp };
  }

  // The v1's defaults, verbatim, so the golden tests pin the refactor to the
  // behaviour that shipped. Do NOT update these when the config changes.
  // Note it carries revenue.fuelPart/vendorPart/rewardsPart rather than a
  // `participation` block — partPct() falls back to these, which is what
  // keeps the golden revenue test meaningful after the move (Task 4).
  var LEGACY_STATE = {
    CURRENT_YEAR: 2026, ASOF_MONTH: 10, HORIZON_YEARS: 3,
    groups: [
      { key: 'ts', label: 'Truck Stop', count: 159 },
      { key: 'tssc', label: 'Truck Stop-Service Center', count: 6 },
      { key: 'cstore', label: 'C-Stores', count: 22 },
      { key: 'ppo', label: 'PPO', count: 88 },
      { key: 'lite', label: "Roady's Lite", count: 7 },
      { key: 'fuel', label: 'Fuel Stops', count: 9 },
      { key: 'ptp', label: 'PTP', count: 89 }
    ],
    attrition: { steady: 9.7, structural: {} },
    adds: { perMonth: 3.2, growthPct: 5, activationLag: 0, ptpNet: 0 },
    history: [{ year: 2026, newR: 32, lost: null, count: null }],
    revenue: {
      duesPerLoc: 367, duesAncillaryPerMember: 0, settlementNetPerMember: 0,
      fuelProgramMargin: 0.03, avgGallons: 8000, fuelPart: 55,
      vendorPM: 150, vendorPart: 70, rewardsPM: 45, rewardsPart: 50,
      rewardsBreakagePerMember: 0
    },
    valuation: { revMultiple: 2.5, ebitdaMargin: 25, ebitdaMultiple: 5, ebitdaNormalization: 0 }
  };

  return {
    MembershipModel: {
      defaultState: defaultState,
      derivedAttrition: derivedAttrition,
      runModel: runModel,
      LEGACY_STATE: LEGACY_STATE,
      _n: n
    }
  };
}));
