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
        var monthStart = roadys;
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
          // `start` is emitted rather than left for the UI to re-derive. The
          // monthly table previously computed it as `end - adds + lost`, which
          // inverts this loop's own update expression — correct, but it would
          // silently go stale if the arithmetic here ever changed.
          start: monthStart,
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

  // These paths arrive from DOM `data-k` attributes once Task 8 wires the
  // binding layer, so they are user-influenceable. An unguarded walk lets
  // '__proto__.x' reach Object.prototype and poison every object in the page;
  // a NESTED path like 'a.__proto__.x' does it too, because `cur['__proto__']`
  // already resolves to a real object, so the container-creation guard never
  // fires. Every segment must be checked, not just the first.
  var UNSAFE_SEGMENT = /^(?:__proto__|constructor|prototype)$/;

  function hasUnsafeSegment(parts) {
    for (var i = 0; i < parts.length; i++) {
      if (UNSAFE_SEGMENT.test(parts[i])) return true;
    }
    return false;
  }

  function getPath(obj, path) {
    var parts = String(path).split('.'), cur = obj;
    if (hasUnsafeSegment(parts)) return undefined;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = String(path).split('.'), cur = obj;
    // Refuse the WHOLE write, not just the offending hop: a partial walk
    // would leave freshly-created containers behind in state.
    if (hasUnsafeSegment(parts)) return obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') {
        // A numeric next key means the missing container is an array.
        cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  // Decompose each historical year's realized attrition into the assumed
  // recurring rate plus whatever is left over. The residual is the
  // ownership-consolidation story from the workbook's col O note; it is
  // clamped at zero because a year quieter than the steady assumption has no
  // structural loss, not negative structural loss. steadyRate is recomputed
  // from the clamp so the two components always sum back to the realized total.
  function attritionSplit(history, steadyRate) {
    var steady = n(steadyRate);
    var rows = derivedAttrition(history).rows.map(function (r) {
      var structuralRate = Math.max(0, r.rate - steady);
      var effSteadyRate = r.rate - structuralRate;
      return {
        year: r.year, base: r.base,
        totalRate: r.rate, steadyRate: effSteadyRate, structuralRate: structuralRate,
        totalLost: r.lost,
        steadyLost: r.base * effSteadyRate / 100,
        structuralLost: r.base * structuralRate / 100
      };
    });
    return { rows: rows, steadyRate: steady };
  }

  function applyScenario(state, name) {
    var preset = (state.scenarios || {})[name];
    if (!preset) return state;
    Object.keys(preset).forEach(function (path) {
      setPath(state, path, preset[path]);
    });
    state.activeScenario = name;
    return state;
  }

  function avgMembers(r) { return (r.start + r.end) / 2; }

  var LEGACY_PART = { fuel: 'fuelPart', vendor: 'vendorPart', rewards: 'rewardsPart' };

  // Participation lives on its own tab now, but LEGACY_STATE (and any
  // scenario saved before the move) carries revenue.*Part. Reading through
  // this one helper is what keeps the golden revenue test meaningful.
  function partPct(state, program) {
    var p = (state.participation || {})[program];
    if (p && isFinite(Number(p.pct))) return Number(p.pct);
    return n((state.revenue || {})[LEGACY_PART[program]]);
  }

  // Annualized run-rate per year: every stream is charged for 12 months on
  // the average member count, which is what the v1 reported and what a
  // valuation multiple expects. `producing` is carried separately so the
  // activation lag is visible without changing the revenue basis.
  function revenueModel(state, M) {
    var rv = state.revenue || {}, months = 12;
    return M.years.map(function (r) {
      var m = avgMembers(r);
      var streams = {
        dues:            m * n(rv.duesPerLoc) * months,
        duesAncillary:   m * n(rv.duesAncillaryPerMember),
        settlement:      m * n(rv.settlementNetPerMember),
        fuelProgram:     m * (partPct(state, 'fuel') / 100) * n(rv.avgGallons) * n(rv.fuelProgramMargin) * months,
        vendor:          m * (partPct(state, 'vendor') / 100) * n(rv.vendorPM) * months,
        rewards:         m * (partPct(state, 'rewards') / 100) * n(rv.rewardsPM) * months,
        rewardsBreakage: m * n(rv.rewardsBreakagePerMember)
      };
      var total = Object.keys(streams).reduce(function (a, k) { return a + streams[k]; }, 0);
      return {
        year: r.year,
        label: r.year === n(state.CURRENT_YEAR, 2026)
          ? r.year + ' (proj. from ' + (state.DATA_ASOF || '') + ')' : String(r.year),
        members: m, producing: r.producing, streams: streams, total: total
      };
    });
  }

  // Three columns for the reconciliation tile: what the drivers imply, what
  // the P&L actually did, and the workbook's $20k benchmark. `actuals` is
  // null when nobody is signed in — the tile degrades, it does not break.
  function revPerMember(state, M, actuals) {
    var rv = state.revenue || {}, months = 12;
    var derived = {
      dues:            n(rv.duesPerLoc) * months,
      duesAncillary:   n(rv.duesAncillaryPerMember),
      settlement:      n(rv.settlementNetPerMember),
      fuelProgram:     (partPct(state, 'fuel') / 100) * n(rv.avgGallons) * n(rv.fuelProgramMargin) * months,
      vendor:          (partPct(state, 'vendor') / 100) * n(rv.vendorPM) * months,
      rewards:         (partPct(state, 'rewards') / 100) * n(rv.rewardsPM) * months,
      rewardsBreakage: n(rv.rewardsBreakagePerMember)
    };
    derived.total = Object.keys(derived).reduce(function (a, k) {
      return k === 'total' ? a : a + derived[k];
    }, 0);

    var bench = n((state.benchmark || {}).lostMemberValue);
    var actual = actuals && isFinite(Number(actuals.totalPerMemberYr))
      ? Number(actuals.totalPerMemberYr) : null;
    var billable = n((state.billing || {}).duesPerLocBillable);

    return {
      derived: derived,
      actual: actual,
      actualStreams: actuals ? (actuals.streams || null) : null,
      benchmark: bench,
      varianceVsActual: actual === null ? null : derived.total - actual,
      varianceVsBenchmark: derived.total - bench,
      duesRealization: billable ? 100 * n(rv.duesPerLoc) / billable : null
    };
  }

  // Both lenses apply to the model's own revenue total, built from net
  // per-member streams — never to the P&L's `Total Income`, which is ~95%
  // gross settlement pass-through and would overstate by roughly 6x.
  // ebitdaOverride lets Profit & Cash Flow supply a real computed EBITDA.
  function valuation(state, lastYear, ebitdaOverride) {
    var val = state.valuation || {};
    var basis = n(lastYear && lastYear.total);
    var rev = basis * n(val.revMultiple);
    var hasOverride = ebitdaOverride !== undefined && ebitdaOverride !== null;
    var ebitdaBase = hasOverride
      ? n(ebitdaOverride)
      : basis * (n(val.ebitdaMargin) / 100) + n(val.ebitdaNormalization);
    var ebitda = ebitdaBase * n(val.ebitdaMultiple);
    return {
      basis: basis, rev: rev,
      ebitdaBase: ebitdaBase, ebitda: ebitda,
      normalization: n(val.ebitdaNormalization),
      mid: (rev + ebitda) / 2,
      low: Math.min(rev, ebitda), high: Math.max(rev, ebitda)
    };
  }

  // Order and membership copied from CRM.html:1155 so the funnel here and
  // the funnel in the CRM cannot drift apart.
  var CRM_STAGES = ['Prospect', 'Qualified', 'Contacted', 'Meeting Scheduled',
    'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'Not Qualified'];
  var CRM_CLOSED_STAGES = ['Closed Won', 'Closed Lost', 'Not Qualified'];
  function isClosedStage(s) { return CRM_CLOSED_STAGES.indexOf(s) !== -1; }

  // ── Sales Pipeline ──────────────────────────────────────────────────────
  // leads: crm_leads rows. profiles: bd_value_profiles rows, joined on
  // lead_id — a modeled final_gallons beats the hand-typed est_gallons.
  function pipelineModel(state, leads, profiles) {
    leads = leads || []; profiles = profiles || [];
    var sp = state.salesPipeline || {};
    var weights = sp.stageWeights || {};

    var gallonsByLead = {};
    profiles.forEach(function (p) {
      if (!p || !p.lead_id) return;
      var g = Number(p.final_gallons);
      if (isFinite(g) && g > 0) gallonsByLead[p.lead_id] = g;
    });

    var byStage = {};
    CRM_STAGES.forEach(function (s) {
      byStage[s] = { count: 0, locations: 0, gallons: 0, dealValue: 0 };
    });

    var openLeads = 0, openLocations = 0, weighted = 0, gallons = 0, dealValue = 0;
    var wonCount = 0, lostCount = 0;
    var byOwner = {}, bySource = {};

    leads.forEach(function (l) {
      if (!l) return;
      var stage = l.stage || 'Prospect';
      var locs = n(l.locations, 0);
      var gal = gallonsByLead[l.id] !== undefined
        ? gallonsByLead[l.id] : n(l.est_gallons, 0);
      var val = n(l.deal_value, 0);

      if (!byStage[stage]) {
        byStage[stage] = { count: 0, locations: 0, gallons: 0, dealValue: 0 };
      }
      byStage[stage].count++; byStage[stage].locations += locs;
      byStage[stage].gallons += gal; byStage[stage].dealValue += val;

      if (stage === 'Closed Won') wonCount++;
      if (stage === 'Closed Lost') lostCount++;

      var owner = l.owner || '(unassigned)';
      var src = l.source || '(none)';
      byOwner[owner] = byOwner[owner] ||
        { openLeads: 0, openLocations: 0, leads: 0 };
      bySource[src] = bySource[src] || { leads: 0, locations: 0 };
      byOwner[owner].leads++;
      bySource[src].leads++; bySource[src].locations += locs;

      if (!isClosedStage(stage)) {
        openLeads++; openLocations += locs;
        weighted += locs * (n(weights[stage]) / 100);
        gallons += gal; dealValue += val;
        byOwner[owner].openLeads++; byOwner[owner].openLocations += locs;
      }
    });

    var horizon = n(sp.horizonMonths, 12) || 12;
    // Won/(Won+Lost), Not Qualified excluded: it never became a real
    // opportunity. null rather than 0 when nothing has closed, so the tab
    // can say "no closed deals yet" instead of showing a 0% win rate.
    var closed = wonCount + lostCount;

    return {
      byStage: byStage,
      openLeads: openLeads, openLocations: openLocations,
      weightedLocations: weighted,
      expectedPerMonth: weighted / horizon,
      winRate: closed > 0 ? 100 * wonCount / closed : null,
      wonCount: wonCount, lostCount: lostCount,
      byOwner: byOwner, bySource: bySource,
      gallons: gallons, dealValue: dealValue,
      isEmpty: leads.length === 0
    };
  }

  // The opt-in seam. Returns {} unless the user switched the basis, so the
  // default and unsigned paths are provably unchanged.
  function addsOpts(state, pipeline) {
    var sp = state.salesPipeline || {};
    if (sp.basis !== 'pipeline' || !pipeline) return {};
    return { addsPerMonthOverride: pipeline.expectedPerMonth };
  }

  // ── Fuel Gallon Production ──────────────────────────────────────────────
  // baselineFor(profile, roadway) is injected: the page wraps
  // BusDevGallonsCalc.getBaselineRow, node tests pass a stub. Keeping it an
  // argument is what lets this stay a pure function.
  function gallonProduction(state, baselineFor, pipeline) {
    var gcfg = state.gallons || {};
    var map = gcfg.groupProfile || {};
    var overrides = gcfg.groupBaselineOverride || {};
    var mapped = 0;

    var byGroup = (state.groups || []).map(function (g) {
      var pair = map[g.key];
      var row = null;
      if (pair && typeof baselineFor === 'function') {
        row = baselineFor(pair[0], pair[1]);
      }
      var engineBaseline = row ? n(row.baseline) : 0;
      var hasOverride = overrides[g.key] !== undefined
        && overrides[g.key] !== null && overrides[g.key] !== '';
      var baseline = hasOverride ? n(overrides[g.key]) : engineBaseline;
      var unmapped = !pair || !row;
      if (!unmapped) mapped++;
      return {
        key: g.key, label: g.label, count: n(g.count),
        profile: pair ? pair[0] : '', roadway: pair ? pair[1] : '',
        engineBaseline: engineBaseline, baseline: baseline,
        overridden: !!hasOverride, unmapped: unmapped,
        gallons: n(g.count) * baseline
      };
    });

    var existing = byGroup.reduce(function (a, r) { return a + r.gallons; }, 0);
    var inbound = pipeline ? n(pipeline.gallons) : 0;
    var total = groupTotal(state);

    return {
      byGroup: byGroup, mapped: mapped,
      existing: existing, inbound: inbound, total: existing + inbound,
      perMember: total ? existing / total : 0
    };
  }

  // ── Program Participation ───────────────────────────────────────────────
  function participationModel(state, M) {
    return M.years.map(function (r) {
      var m = avgMembers(r);
      return {
        year: r.year, members: m,
        fuel:    m * partPct(state, 'fuel') / 100,
        vendor:  m * partPct(state, 'vendor') / 100,
        rewards: m * partPct(state, 'rewards') / 100
      };
    });
  }

  // ── Cost to Acquire & Serve ─────────────────────────────────────────────
  function costModel(state, M, R) {
    var c = state.costs || {};
    var spendPerMonth = n(c.salesSpendPerMonth);
    var servePerMember = n(c.costToServePerMember);
    var flatCac = n(c.acquisitionPerMember);
    var unset = !spendPerMonth && !servePerMember && !flatCac;

    var byYear = M.years.map(function (r, i) {
      var months = M.months.filter(function (m) { return m.year === r.year; }).length;
      var spend = spendPerMonth * months;
      var adds = r.newModeled;
      // A flat per-member figure wins when supplied; otherwise derive from spend.
      var cac = flatCac || (adds > 0 ? spend / adds : 0);
      var members = avgMembers(r);
      return {
        year: r.year, months: months, spend: spend, adds: adds, cac: cac,
        acquisition: cac * adds,
        costToServe: servePerMember * members,
        revenue: R[i] ? R[i].total : 0
      };
    });

    // LTV from the model's own steady attrition, not a separate assumption:
    // average member life is 1/churn years.
    var steady = n((state.attrition || {}).steady) / 100;
    var lastR = R[R.length - 1];
    var revPerMemberYr = lastR && lastR.members ? lastR.total / lastR.members : 0;
    var grossPerYear = revPerMemberYr - servePerMember;
    var lifeYears = steady > 0 ? 1 / steady : null;
    var ltv = lifeYears !== null ? grossPerYear * lifeYears : null;

    var lastCac = byYear.length ? byYear[byYear.length - 1].cac : 0;

    return {
      byYear: byYear,
      cac: lastCac,
      costToServePerMember: servePerMember,
      lifeYears: lifeYears,
      ltv: unset ? null : ltv,
      // null, never Infinity: a zero CAC means "unset", not "instant payback".
      payback: (lastCac > 0 && grossPerYear > 0) ? lastCac / (grossPerYear / 12) : null,
      ltvCac: (lastCac > 0 && ltv !== null) ? ltv / lastCac : null,
      unset: unset
    };
  }

  // ── Staffing & Capacity ─────────────────────────────────────────────────
  function capacityModel(state, M, pipeline) {
    var reps = ((state.staffing || {}).reps || []).map(function (r) {
      return {
        name: r.name || '', capacityLeads: n(r.capacityLeads),
        costPerYear: n(r.costPerYear)
      };
    });
    var totalCapacity = reps.reduce(function (a, r) { return a + r.capacityLeads; }, 0);
    var totalCost = reps.reduce(function (a, r) { return a + r.costPerYear; }, 0);
    var unset = totalCapacity === 0;

    var byOwner = {};
    reps.forEach(function (r) {
      byOwner[r.name] = {
        capacityLeads: r.capacityLeads, costPerYear: r.costPerYear,
        openLeads: 0, openLocations: 0
      };
    });
    if (pipeline && pipeline.byOwner) {
      Object.keys(pipeline.byOwner).forEach(function (name) {
        byOwner[name] = byOwner[name] ||
          { capacityLeads: 0, costPerYear: 0, openLeads: 0, openLocations: 0 };
        byOwner[name].openLeads = pipeline.byOwner[name].openLeads;
        byOwner[name].openLocations = pipeline.byOwner[name].openLocations;
      });
    }

    var modeled = n((state.adds || {}).perMonth);
    if ((state.salesPipeline || {}).basis === 'pipeline' && pipeline) {
      modeled = pipeline.expectedPerMonth;
    }

    return {
      reps: reps, totalCapacity: totalCapacity, totalCost: totalCost,
      modeledAddsPerMonth: modeled,
      // null, not a negative number, when capacity was never entered:
      // a surplus computed against zero capacity would be a lie.
      gap: unset ? null : modeled - totalCapacity,
      byOwner: byOwner, unset: unset
    };
  }

  // ── Profit & Cash Flow ──────────────────────────────────────────────────
  function cashflowModel(state, M, R) {
    var cost = costModel(state, M, R);
    var cf = state.cashflow || {};
    var norm = n((state.valuation || {}).ebitdaNormalization);
    var capex = n(cf.capexPerYear);

    return R.map(function (r, i) {
      var cy = cost.byYear[i] || { acquisition: 0, costToServe: 0 };
      var ebitda = r.total - cy.costToServe - cy.acquisition + norm;
      return {
        year: r.year, revenue: r.total,
        costToServe: cy.costToServe, acquisition: cy.acquisition,
        normalization: norm, ebitda: ebitda,
        capex: capex, cash: ebitda - capex,
        margin: r.total ? 100 * ebitda / r.total : 0
      };
    });
  }

  return {
    MembershipModel: {
      defaultState: defaultState,
      derivedAttrition: derivedAttrition,
      runModel: runModel,
      LEGACY_STATE: LEGACY_STATE,
      _n: n,
      getPath: getPath,
      setPath: setPath,
      attritionSplit: attritionSplit,
      applyScenario: applyScenario,
      partPct: partPct,
      avgMembers: avgMembers,
      revenueModel: revenueModel,
      revPerMember: revPerMember,
      valuation: valuation,
      CRM_STAGES: CRM_STAGES,
      CRM_CLOSED_STAGES: CRM_CLOSED_STAGES,
      isClosedStage: isClosedStage,
      pipelineModel: pipelineModel,
      addsOpts: addsOpts,
      gallonProduction: gallonProduction,
      participationModel: participationModel,
      costModel: costModel,
      capacityModel: capacityModel,
      cashflowModel: cashflowModel
    }
  };
}));
