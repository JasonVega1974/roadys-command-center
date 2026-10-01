(function (root) {
  'use strict';

  // Statistics and profile-matching for the Network Locations tab.
  //
  // This lives outside index.html for one reason: it is the code that decides
  // which real locations feed which baseline median, and those medians can be
  // pushed into the calculator. A rule that consequential should be executable
  // by `node --test`, not verified only by looking at a rendered table.
  //
  // Deliberately NOT part of busDevGallonsCalculator.js: nothing here is on the
  // estimate path. calculateEstimate() never calls into this file.

  // Linear interpolation between order statistics -- the R-7 / Excel
  // PERCENTILE.INC / d3.quantile definition. Stated because "the 25th
  // percentile" names at least nine different numbers depending on the
  // convention, and a P25 computed one way beside a P25 computed another is
  // the kind of disagreement nobody notices until it has moved a baseline.
  //
  // Returns null for an empty sample rather than 0 or NaN: "no locations
  // matched this profile" is not "this profile measured zero gallons", and the
  // table renders the two differently.
  function quantile(values, p) {
    var a = sortedNumeric(values);
    if (!a.length) return null;
    if (a.length === 1) return a[0];
    var h = (a.length - 1) * p;
    var lo = Math.floor(h);
    var hi = Math.ceil(h);
    if (lo === hi) return a[lo];
    return a[lo] + (h - lo) * (a[hi] - a[lo]);
  }

  function median(values) { return quantile(values, 0.5); }

  // The range a profile actually spans, for the Step 1 cards. p10/p90 rather
  // than min/max: one 60,000 gal/mo outlier should widen the picture, not
  // define it, and the same reasoning that made the baseline a median applies
  // to its endpoints.
  function p10(values) { return quantile(values, 0.10); }
  function p90(values) { return quantile(values, 0.90); }

  // The single numeric gate for this whole file. Returns null for anything
  // that is not a real number or a string that spells one.
  //
  // `Number()` alone is not that gate and the difference is not cosmetic:
  // Number(null), Number(''), Number(false) and Number([]) are all 0, and all
  // four are finite. Routing a location with a missing gallon figure through
  // `isFinite(Number(x))` therefore admits it to the sample as a measured
  // zero, dragging every median it touches toward the floor -- which is
  // exactly the failure the comment on sortedNumeric() warns about. The unit
  // tests caught three call sites doing this.
  function toFinite(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    if (typeof v === 'object') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Non-finite entries are dropped, not coerced. A location with a missing or
  // unparseable gallon figure must not land in the sample as a 0 -- that would
  // drag every median it touches toward zero and look like a measurement.
  function sortedNumeric(values) {
    var out = [];
    if (!values || typeof values.length !== 'number') return out;
    for (var i = 0; i < values.length; i++) {
      var n = toFinite(values[i]);
      if (n !== null) out.push(n);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  // Diesel lane count -> size. The business definition as of 2026-09-30:
  // Small 1-3, Medium 4-6, Large 7+, with Backroad an exception that has no
  // Medium or Large -- 1-4 lanes is Small, and 5+ is deliberately unmapped.
  //
  // Returns null for an unusable count (including 0: a location with no
  // diesel lanes is not a small one, it is one that should not be in this
  // analysis) and the sentinel 'over' for a backroad above its range, which
  // the caller surfaces as "Backroad with 5+ lanes - review" rather than
  // forcing a fit.
  //
  // Lanes and roadway are now INDEPENDENT. The old laneTierFor() existed to
  // produce a band that BASELINE_TABLE paired rigidly with a roadway, which
  // is what made a 4-lane Interstate a "conflict"; it is simply
  // Medium/Interstate now, and the conflict state is gone with it.
  var BACKROAD_MAX_LANES = 4;
  function sizeForLanes(lanes, roadway) {
    var n = toFinite(lanes);
    if (n === null || n < 1) return null;
    n = Math.floor(n);
    if (roadway === 'Backroad') return n <= BACKROAD_MAX_LANES ? 'Small' : 'over';
    if (n <= 3) return 'Small';
    if (n <= 6) return 'Medium';
    return 'Large';
  }

  var SIZES = ['Small', 'Medium', 'Large'];
  var ROADWAYS = ['Backroad', 'Highway', 'Interstate'];

  // ── the qualifying rule ───────────────────────────────────────────────────
  //
  // A location feeds the averages, medians, p10/p90, region deltas and counts
  // only if BOTH hold:
  //
  //   avgGalMo        >= MIN_REPORTING_GAL_MO   (1,000)
  //   reportingMonths >= MIN_REPORTING_MONTHS   (6)
  //
  // Anything failing either is still shown in the Network Locations table,
  // marked with the reason, but contributes to nothing.
  //
  // The two catch DIFFERENT failures, which is why neither replaces the
  // other:
  //
  //   The gallons floor is a plausibility guard. Measured on the real file:
  //   locations reporting exactly 0, and others in single and double digits.
  //   A site that sold nine gallons in a year is not a measurement of a
  //   working location, and letting it into a median drags the baseline
  //   toward the floor -- an earlier version of this file would have cut the
  //   Fuel stop baseline by 94% without this guard.
  //
  //   The months floor is a REPRESENTATIVENESS guard, and it catches what the
  //   gallons floor cannot: a location that opened in month 11, or closed in
  //   month 2, can post a perfectly healthy avgGalMo while that average
  //   describes a few weeks rather than a year. Its gallons look fine; its
  //   twelve-month average is an artefact of the window.
  //
  // Raised from 500 and introduced respectively on 2026-10-01. Both are
  // business judgements about what counts as an active, measurable location,
  // not properties of the maths -- override per call with
  // opts.minReportingGalMo / opts.minReportingMonths.
  var MIN_REPORTING_GAL_MO = 1000;
  var MIN_REPORTING_MONTHS = 6;

  // Type -> how a location reaches a baseline profile at all.
  //   'fuel'      one profile, reached on Type alone
  //   'truckstop' needs Size and Roadway
  //   anything else has no profile in BASELINE_TABLE and never will, which is
  //   a different state from "we have not filled this in yet".
  //
  // 'Truck Stop / Service Center' counts as a truck stop: it is a truck stop
  // that also has bays, and the service side does not change which baseline
  // profile it belongs to. A type this does not name has no profile -- see
  // EXCLUDED_NETWORK_TYPES below for the two that are also kept out of the
  // headline network counts.
  function typeClass(type) {
    var t = String(type || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (t === 'fuel stop') return 'fuel';
    if (t === 'truck stop') return 'truckstop';
    if (t === 'truck stop / service center') return 'truckstop';
    return 'none';
  }

  // ── network-context counts ────────────────────────────────────────────────
  //
  // network-context.json is a headcount of the whole member list, and the
  // whole member list is not the fuel network. PPO, C-Store and Service
  // Center rows are not retail diesel locations and no baseline profile
  // describes any of them; leaving them inside "400 active locations across
  // the Roady's network" made that number and the baseline card beside it
  // disagree about what the network IS, on the same screen. Dropping them
  // here makes every count the tool shows -- the pre-evaluation panel, the
  // region chips, the pitch strip -- describe the same set of locations the
  // baseline does.
  //
  // 'Truck Stop / Service Center' is NOT excluded and must never be: it is a
  // truck stop that also has bays, typeClass() maps it to 'truckstop', and it
  // is in network-locations.json. The match below is exact-string on purpose
  // for exactly this reason -- a substring or prefix test would silently take
  // those five locations out of the network with no other symptom.
  var EXCLUDED_NETWORK_TYPES = ['PPO', 'C-Store', 'Service Center'];

  // Groups excluded for the same reason, on a different axis. Roady's Lite
  // is a branding tier, not a location type -- its rows sit under 'Truck
  // Stop' in the context file -- so no type-based rule reaches them and this
  // has to be its own list. The 2026-09-30 network-locations.json dropped all
  // six; this keeps the context counts in step.
  var EXCLUDED_NETWORK_GROUPS = ["Roady's Lite"];

  function isExcludedNetworkType(type) {
    return matchesExcluded(type, EXCLUDED_NETWORK_TYPES);
  }

  function isExcludedNetworkGroup(group) {
    return matchesExcluded(group, EXCLUDED_NETWORK_GROUPS);
  }

  function matchesExcluded(value, list) {
    var v = String(value || '').trim().toLowerCase();
    if (!v) return false;
    for (var i = 0; i < list.length; i++) {
      if (v === list[i].toLowerCase()) return true;
    }
    return false;
  }

  // Rewrites a network-context object with the excluded types AND groups
  // dropped and every total recomputed from what is left. Applied on load
  // rather than only in the generator, so the file committed today is
  // corrected without needing the source CSV -- and it is idempotent, so a
  // file regenerated after this change passes through untouched. Returns a
  // new object; the input is never mutated.
  //
  // byTypeGroup is the authority whenever it exists, because it is the only
  // breakdown that carries both axes: byType alone cannot say which of its
  // 'Truck Stop' rows are Roady's Lite, so deriving totals from it would
  // drop the excluded TYPES and silently keep every excluded GROUP. A
  // context file predating byTypeGroup falls back to byType and can only
  // honour the type list -- `groupsApplied` reports which happened rather
  // than leaving the caller to guess.
  function normalizeNetworkContext(nc) {
    if (!nc || typeof nc !== 'object' || !nc.byRegion) return nc;
    var out = { asOf: nc.asOf, activeTotal: 0, groupsApplied: true, byRegion: {} };
    Object.keys(nc.byRegion).forEach(function (region) {
      var src = nc.byRegion[region] || {};
      var rd = { total: 0, byType: {}, byGroup: {}, byTypeGroup: {} };
      var byGroup = {};
      var hasTypeGroup = !!src.byTypeGroup && Object.keys(src.byTypeGroup).length > 0;

      Object.keys(src.byTypeGroup || {}).forEach(function (type) {
        if (isExcludedNetworkType(type)) return;
        var groups = src.byTypeGroup[type] || {};
        Object.keys(groups).forEach(function (g) {
          if (isExcludedNetworkGroup(g)) return;
          var n = toFinite(groups[g]);
          if (n === null) return;
          rd.byTypeGroup[type] = rd.byTypeGroup[type] || {};
          rd.byTypeGroup[type][g] = n;
          byGroup[g] = (byGroup[g] || 0) + n;
          rd.byType[type] = (rd.byType[type] || 0) + n;
          rd.total += n;
        });
      });

      if (!hasTypeGroup) {
        // No group breakdown to work from. Honour the type list and say so.
        out.groupsApplied = false;
        Object.keys(src.byType || {}).forEach(function (type) {
          if (isExcludedNetworkType(type)) return;
          var n = toFinite(src.byType[type]);
          if (n === null) return;
          rd.byType[type] = n;
          rd.total += n;
        });
      }
      rd.byGroup = byGroup;

      out.byRegion[region] = rd;
      out.activeTotal += rd.total;
    });
    return out;
  }

  // One place decides whether a gallon figure is usable, so the medians, the
  // completeness counts and the row markers can never disagree about which
  // locations are non-reporting.
  //   'usable'         a real figure at or above the floor
  //   'non-reporting'  a real figure below the floor
  //   'missing'        no figure at all -- not the same as reporting a zero
  //
  // This is HALF the qualifying rule. Nothing that feeds a computation may
  // call it alone -- use locationQualifies(), which also applies the months
  // floor. It stays separate because the table distinguishes "reports almost
  // nothing" from "reports plenty, but only briefly", and those need
  // different words in front of a reader.
  function gallonStatus(avgGalMo, opts) {
    var floor = optFloor(opts);
    var g = toFinite(avgGalMo);
    if (g === null) return 'missing';
    return g < floor ? 'non-reporting' : 'usable';
  }

  function optFloor(opts) {
    var f = opts && toFinite(opts.minReportingGalMo);
    return f === null || f === undefined ? MIN_REPORTING_GAL_MO : f;
  }

  function optMonths(opts) {
    var m = opts && toFinite(opts.minReportingMonths);
    return m === null || m === undefined ? MIN_REPORTING_MONTHS : m;
  }

  // The single gate every computation reads through.
  //
  // Returns the verdict AND why, because the table has to tell a reader
  // which rule a row failed -- and because "fails both" is a real and
  // common state (a site with no gallons usually has no reporting months
  // either), so the reasons are a list rather than a first-match string.
  //
  // Months missing entirely is a FAILURE, not a pass. A file predating the
  // reportingMonths field would otherwise qualify every row on gallons
  // alone and silently reinstate the old rule; better that such a file
  // visibly qualifies nothing until it is regenerated.
  function locationQualifies(loc, opts) {
    var l = loc || {};
    var floor = optFloor(opts);
    var minMonths = optMonths(opts);
    var g = toFinite(l.avgGalMo);
    var m = toFinite(l.reportingMonths);
    var reasons = [];
    if (g === null) reasons.push('no-gallons');
    else if (g < floor) reasons.push('below-gallons');
    if (m === null) reasons.push('no-months');
    else if (m < minMonths) reasons.push('below-months');
    return {
      ok: reasons.length === 0,
      reasons: reasons,
      avgGalMo: g,
      reportingMonths: m,
      minGalMo: floor,
      minMonths: minMonths
    };
  }

  function qualifies(loc, opts) { return locationQualifies(loc, opts).ok; }

  // Does Size participate in this type's profile lookup at all? Only truck
  // stops -- a fuel stop reaches its single profile on Type alone.
  function sizeAffectsProfile(type) { return typeClass(type) === 'truckstop'; }

  function findRow(baselineTable, profile, roadway) {
    var found = null;
    for (var i = 0; i < (baselineTable || []).length; i++) {
      var r = baselineTable[i];
      if (r.profile === profile && r.roadway === roadway) found = r;
    }
    return found;
  }

  // A profile needs at least this many reporting locations before its live
  // median replaces the static BASELINE_TABLE value.
  var DYNAMIC_BASELINE_MIN_N = 3;

  function optMinN(opts) {
    var v = opts && toFinite(opts.minN);
    return v === null || v === undefined ? DYNAMIC_BASELINE_MIN_N : v;
  }

  // Which of the 8 baseline profiles a location belongs to.
  //
  // Size comes from the lane count and roadway is an independent axis, so
  // there is no longer any way for the two to contradict each other -- the
  // 'lane-conflict' status this used to return is retired along with the
  // rigid roadway<->lane pairing that produced it.
  //
  // Status values:
  //   'ok'              mapped; contributes to that profile's median
  //   'need-lanes'      a truck stop with no usable diesel lane count
  //   'need-roadway'    a truck stop with no roadway set
  //   'backroad-over'   a backroad with 5+ lanes -- no profile exists and
  //                     none should be invented; flagged for review
  //   'no-profile'      size+roadway resolve to no BASELINE_TABLE row
  //   'not-applicable'  not a truck stop or fuel stop
  function matchBaselineProfile(loc, baselineTable) {
    var cls = typeClass(loc && loc.type);
    if (cls === 'none') return { status: 'not-applicable', row: null };

    if (cls === 'fuel') {
      var fuelRow = findRow(baselineTable, 'Fuel stop', 'Any');
      return fuelRow
        ? { status: 'ok', row: fuelRow, profile: 'Fuel stop', roadway: 'Any' }
        : { status: 'no-profile', row: null };
    }

    var roadway = String((loc && loc.roadway) || '').trim();
    if (ROADWAYS.indexOf(roadway) === -1) return { status: 'need-roadway', row: null };

    var size = sizeForLanes(loc && loc.dieselLanes, roadway);
    if (size === 'over') {
      return { status: 'backroad-over', row: null, roadway: roadway,
               lanes: toFinite(loc.dieselLanes) };
    }
    if (size === null) return { status: 'need-lanes', row: null, roadway: roadway };

    var profile = size + ' truck stop';
    var row = findRow(baselineTable, profile, roadway);
    if (!row) return { status: 'no-profile', row: null, profile: profile, roadway: roadway };
    return { status: 'ok', row: row, profile: profile, roadway: roadway, size: size };
  }

  // The live baseline per profile: the median avgGalMo of its reporting
  // locations, or the static BASELINE_TABLE value when fewer than
  // DYNAMIC_BASELINE_MIN_N of them exist.
  //
  // Median, not mean, and deliberately: a handful of very large sites drag an
  // average well above anything typical. Measured on the 233-location file
  // the Medium/Interstate mean is far above its 10,492 median.
  //
  // NOT filtered by region. Region is applied once, separately, as the
  // like-for-like delta below -- filtering here as well would count it twice.
  function profileBaselines(locations, baselineTable, opts) {
    var byKey = {};
    (baselineTable || []).forEach(function (r) {
      byKey[r.profile + '|' + r.roadway] = {
        profile: r.profile, roadway: r.roadway, lanes: r.lanes,
        staticBaseline: r.baseline, gallons: [], total: 0
      };
    });
    (locations || []).forEach(function (loc) {
      var m = matchBaselineProfile(loc, baselineTable);
      if (m.status !== 'ok' || !m.row) return;
      var b = byKey[m.row.profile + '|' + m.row.roadway];
      if (!b) return;
      // `total` counts every location in the profile, reporting or not --
      // it is what the Step 1 card shows as "# of network locations".
      b.total++;
      if (qualifies(loc, opts)) b.gallons.push(toFinite(loc.avgGalMo));
    });
    var out = {};
    Object.keys(byKey).forEach(function (k) {
      var b = byKey[k];
      var med = median(b.gallons);
      var enough = b.gallons.length >= optMinN(opts) && med !== null;
      out[k] = {
        profile: b.profile, roadway: b.roadway, lanes: b.lanes,
        n: b.gallons.length, total: b.total,
        median: med === null ? null : Math.round(med),
        staticBaseline: b.staticBaseline,
        baseline: enough ? Math.round(med) : b.staticBaseline,
        source: enough ? 'network' : 'static'
      };
    });
    return out;
  }

  function baselineKeyFor(profile, roadway) { return profile + '|' + roadway; }

  // Region delta, like-for-like.
  //
  // Each reporting location is scored against ITS OWN profile's median, and
  // the region's delta is the median of those ratios minus 1. Comparing a
  // location against the whole network instead would double-count: the
  // baseline already reflects the profile, so a region full of large
  // interstate sites would read as a strong region rather than as a region
  // that happens to hold large sites.
  //
  // Ratios use the profile's MEDIAN even where that profile fell back to the
  // static baseline for its own headline figure -- the ratio is a comparison
  // between a location and its peers, and the peer group is the observed one.
  function regionDeltas(locations, baselineTable, resolveRegion, opts) {
    var bases = profileBaselines(locations, baselineTable, opts);
    var byRegion = {};
    (locations || []).forEach(function (loc) {
      if (!qualifies(loc, opts)) return;
      var m = matchBaselineProfile(loc, baselineTable);
      if (m.status !== 'ok' || !m.row) return;
      var b = bases[baselineKeyFor(m.row.profile, m.row.roadway)];
      if (!b || !b.median) return;
      var reg = resolveRegion ? resolveRegion(loc.state) : loc.region;
      if (!reg) return;
      (byRegion[reg] = byRegion[reg] || []).push(toFinite(loc.avgGalMo) / b.median);
    });
    var out = {};
    Object.keys(byRegion).forEach(function (reg) {
      var med = median(byRegion[reg]);
      out[reg] = {
        region: reg, n: byRegion[reg].length,
        delta: med === null ? null : (med - 1),
        pct: med === null ? null : Math.round((med - 1) * 1000) / 10
      };
    });
    return out;
  }

  // Below this many reporting locations a region's delta is shown with a
  // "based on only X locations" caveat. Not a threshold on using it.
  var REGION_THIN_N = 8;

  // p10 / median / p90 per BASELINE_TABLE profile, for the Step 1 range bars.
  //
  // Gated at DYNAMIC_BASELINE_MIN_N, the same threshold profileBaselines()
  // uses to decide whether it trusts the observed median at all: a profile
  // whose centre is not worth showing has no business advertising a spread
  // around it. Below the gate the entry still reports its n, with all three
  // values null, so the caller renders a placeholder rather than having to
  // distinguish "no data" from "not asked for".
  function profileRanges(locations, baselineTable, opts) {
    var buckets = {};
    (baselineTable || []).forEach(function (r) {
      buckets[baselineKeyFor(r.profile, r.roadway)] = [];
    });
    (locations || []).forEach(function (loc) {
      if (!qualifies(loc, opts)) return;
      var m = matchBaselineProfile(loc, baselineTable);
      if (m.status !== 'ok' || !m.row) return;
      var k = baselineKeyFor(m.row.profile, m.row.roadway);
      if (buckets[k]) buckets[k].push(toFinite(loc.avgGalMo));
    });
    var out = {};
    Object.keys(buckets).forEach(function (k) {
      var vals = buckets[k];
      var enough = vals.length >= DYNAMIC_BASELINE_MIN_N;
      out[k] = {
        n: vals.length,
        low: enough ? Math.round(p10(vals)) : null,
        mid: enough ? Math.round(median(vals)) : null,
        high: enough ? Math.round(p90(vals)) : null
      };
    });
    return out;
  }

  // ── the discount slider's range, anchored to one profile's own spread ─────
  //
  // 0% on the slider is the profile's average (its median). The ends are the
  // percentages that land on the profile's own p10 and p90:
  //
  //     lowPct = p10 / median - 1        highPct = p90 / median - 1
  //
  // So the control cannot express a posture the network has never produced
  // for that kind of site, and the figures it does reach are attributable to
  // real locations rather than to a round number somebody picked. The spread
  // is wide on purpose -- Large/Highway runs -79% to +771%, because its p10
  // site does 673 gal/mo and its p90 does 28,006.
  //
  // The ends are snapped OUTWARD to whole percentage points so the figures
  // the caption quotes are the figures the control can actually produce.
  //
  // There is deliberately no `step` on the returned object. The control's
  // granularity is the position scale below, which steps at different rates
  // on either side of the average -- a single `step` field would be a number
  // that looks authoritative, matches nothing, and invites the next reader to
  // wire the slider back to a uniform grid.
  //
  // `rg` is one entry from profileRanges(). `fallback` is the flat range used
  // when the profile has no observed spread to anchor to.
  function pricingRangeForProfile(rg, fallback) {
    var fb = fallback || { min: -0.5, max: 0.5 };
    var flat = {
      min: fb.min, max: fb.max,
      source: 'fallback', n: (rg && rg.n) || 0,
      low: null, mid: null, high: null, lowPct: null, highPct: null
    };
    if (!rg || rg.mid === null || rg.low === null || rg.high === null) return flat;
    if (!(rg.mid > 0)) return flat;

    var lowPct = (rg.low / rg.mid) - 1;
    var highPct = (rg.high / rg.mid) - 1;
    // A profile whose p10 and p90 coincide has no spread to anchor to.
    if (!(highPct > lowPct)) return flat;

    // Whole percentage points, snapped outward so neither percentile falls
    // outside what the control can reach.
    function pts(v) { return Math.round(v * 100) / 100; }
    var min = pts(Math.floor(lowPct * 100) / 100);
    var max = pts(Math.ceil(highPct * 100) / 100);
    return {
      min: min, max: max,
      source: 'profile', n: rg.n,
      low: rg.low, mid: rg.mid, high: rg.high,
      lowPct: lowPct, highPct: highPct
    };
  }

  // ── the slider's SPLIT SCALE ──────────────────────────────────────────────
  //
  // The range a profile spans is wildly asymmetric -- Small/Highway runs -50%
  // to +640% -- because gallons distributions are right-skewed: a site can be
  // several times its profile's average but cannot be less than nothing. On a
  // plain linear track that put 0% (the profile's AVERAGE) at 7% of the
  // travel, so the handle sat hard left while the number meant "typical". A
  // rep reading position rather than text saw "almost no discounts". That is
  // not a cosmetic complaint: position is the first thing read on a slider.
  //
  // So the track is split. The control's value is a POSITION in
  // -N..+N, and position maps to a percentage piecewise-linearly:
  //
  //     position -N  ->  min   (the p10 percentage)
  //     position  0  ->  0     (the profile average, dead centre)
  //     position +N  ->  max   (the p90 percentage)
  //
  // Each half gets half the pixels regardless of how many percentage points
  // it covers, so the two halves have different scales -- which is the point.
  // The percentages themselves are untouched: real, uncapped, derived from
  // the observed percentiles.
  //
  // Why a position scale rather than nice equal steps on both sides: forcing
  // both halves onto a round step AND the same step count drags the ends off
  // the real percentiles by up to 24 points, and on several profiles pushes
  // the low end to exactly -100% -- a quote of zero gallons that the data
  // never suggested. Keeping the ends exact and letting the step fall where
  // it may costs nothing a reader can see, because every position still
  // lands on a whole percentage.
  var PRICING_POSITIONS_PER_SIDE = 50;

  function pricingPctForPosition(pos, range) {
    var N = PRICING_POSITIONS_PER_SIDE;
    var p = toFinite(pos);
    if (p === null) return 0;
    p = Math.max(-N, Math.min(N, Math.round(p)));
    if (p === 0) return 0;
    var r = range || {};
    // Rounded to whole percentage points, so the readout can never show a
    // figure like +457.3% that implies precision the percentiles do not have.
    var pts = p < 0
      ? Math.round((r.min || 0) * 100 * (-p / N))
      : Math.round((r.max || 0) * 100 * (p / N));
    return pts / 100;
  }

  function pricingPositionForPct(pct, range) {
    var N = PRICING_POSITIONS_PER_SIDE;
    var v = toFinite(pct);
    if (v === null || v === 0) return 0;
    var r = range || {};
    if (v < 0) {
      if (!(r.min < 0)) return 0;
      return Math.max(-N, Math.min(0, -Math.round(N * (v / r.min))));
    }
    if (!(r.max > 0)) return 0;
    return Math.max(0, Math.min(N, Math.round(N * (v / r.max))));
  }

  // Where a percentage sits along the track, 0..100. Exists so the midpoint
  // marker and the handle are placed by ONE rule -- a marker drawn at a
  // hardcoded 50% beside a handle positioned by any other formula is the same
  // bug this split scale was built to fix.
  function pricingTrackFraction(pct, range) {
    var N = PRICING_POSITIONS_PER_SIDE;
    return ((pricingPositionForPct(pct, range) + N) / (2 * N)) * 100;
  }

  // ── the prospect signal ───────────────────────────────────────────────────
  //
  // Strong / Moderate / Review for one prospect, plus the list of fields that
  // are still blank. The Prospects tracker renders this per row and counts it
  // in its summary chips, and each saved record carries it.
  //
  // It lives here, pure, because it is the last thing in the tool that the
  // page writes into a saved record with no test behind it. It used to be
  // computed as a side effect of rendering the Pre-Evaluation card, which at
  // least meant you could see it; that card is gone, so the only evidence it
  // still works is a badge on a tab nobody opens while filling the form in.
  //
  // Four judgements drive it, and ONLY these four:
  //   1. did the state resolve to a region
  //   2. is that region's measured delta positive, zero or negative
  //   3. how many locations the network has in that region
  //   4. how many of the prospect's own type it has there
  // Any red -> Review. All green -> Strong. Otherwise Moderate.
  //
  // The informational chips the old card also drew -- baseline range,
  // estimated profile, rewards posture -- are deliberately NOT here. They
  // never fed the signal (rewards especially: it is a posture the rep
  // chooses, and letting it flip a verdict about the prospect's market would
  // have been wrong), and nothing renders them any more.
  //
  // Counts, not percentages, set tones 3 and 4: more than 20 locations is
  // green, 10 to 20 yellow, fewer than 10 red.
  var SIGNAL_COUNT_GREEN_ABOVE = 20;
  var SIGNAL_COUNT_YELLOW_FROM = 10;

  function networkCountTone(n) {
    var v = toFinite(n);
    if (v === null) return 'red';
    return v > SIGNAL_COUNT_GREEN_ABOVE ? 'green'
      : (v >= SIGNAL_COUNT_YELLOW_FROM ? 'yellow' : 'red');
  }

  // `o.regionPct` is the region's delta as a fraction (the sign is all that
  // is read). `o.regionData` is one region's entry from a normalized
  // network-context, or null when the region is unknown or absent from it.
  function prospectSignal(o) {
    var i = o || {};
    var missing = [];
    if (!i.name) missing.push('Truck Stop Name');
    if (!i.city) missing.push('City');
    if (!i.stateCode) missing.push('State');
    if (!i.locationType) missing.push('Location Type');

    var region = i.region || null;
    var rd = i.regionData || null;

    // 1. A region either resolved or it did not. Never red: an unrecognised
    //    state code is a typo to fix, not a verdict about the prospect.
    var t1 = region ? 'green' : 'yellow';

    // 2. Zero reads yellow rather than green -- an unconfigured region and a
    //    genuinely average one are not the same claim, and 0% is far more
    //    often the former.
    var pct = region ? toFinite(i.regionPct) : null;
    var t2 = pct === null ? 'yellow' : (pct > 0 ? 'green' : (pct === 0 ? 'yellow' : 'red'));

    // 3. No data for the region is yellow, not red: "we cannot see" is not
    //    "we looked and it is bad".
    var t3 = !rd ? 'yellow' : networkCountTone(rd.total);

    // 4. Same rule for the prospect's own type within that region.
    var t4;
    if (!i.locationType) t4 = 'yellow';
    else if (!rd || !rd.byType || !hasOwnProp(rd.byType, i.locationType)) t4 = 'yellow';
    else t4 = networkCountTone(rd.byType[i.locationType]);

    var tones = [t1, t2, t3, t4];
    var anyRed = false, allGreen = true, k;
    for (k = 0; k < tones.length; k++) {
      if (tones[k] === 'red') anyRed = true;
      if (tones[k] !== 'green') allGreen = false;
    }
    var signal = anyRed ? 'Review' : (allGreen ? 'Strong' : 'Moderate');

    return {
      missing: missing,
      tones: { region: t1, regionPct: t2, networkPresence: t3, typePresence: t4 },
      // Blank while any prerequisite is unfilled, so a half-entered prospect
      // never carries a verdict. This gate is part of the contract: the three
      // handlers and render() all rely on it to clear a stale signal the
      // moment a field is emptied, rather than leaving the last one computed.
      signal: missing.length ? '' : signal
    };
  }

  // ── dated localStorage ────────────────────────────────────────────────────
  //
  // Decides whether a stored blob still describes the committed data. Lives
  // here rather than in the page so the rule can be tested: it is the thing
  // standing between a viewer and a browser that quietly shows different
  // medians from everyone else's, and "we believe it clears correctly" is not
  // good enough for that.
  //
  // Shape going forward is { asOf, <bodyKey> }. An undated blob is stale by
  // definition -- it was written before dating existed, against a file whose
  // lane counts and roadways have since been corrected wholesale.
  function datedStoreState(parsed, currentAsOf, bodyKey) {
    var key = bodyKey || 'edits';
    if (!parsed || typeof parsed !== 'object') {
      return { stale: false, asOf: null, body: null, dated: false };
    }
    var dated = hasOwnProp(parsed, 'asOf') && hasOwnProp(parsed, key);
    if (!dated) return { stale: true, asOf: null, body: parsed, dated: false };
    return {
      stale: String(parsed.asOf) !== String(currentAsOf),
      asOf: parsed.asOf === null || parsed.asOf === undefined ? null : String(parsed.asOf),
      body: parsed[key],
      dated: true
    };
  }

  function hasOwnProp(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // ── a new, locally added location ─────────────────────────────────────────
  //
  // Validation and normalization for the Add Location form, kept pure so the
  // rules can be tested without a DOM. Returns '' when the form is good.
  //
  // The id check is the load-bearing one: ids are the key every edit, hidden
  // row, average and count joins on, so two rows sharing one would collide
  // everywhere at once.
  function validateNewLocation(form, opts) {
    var f = form || {};
    var o = opts || {};
    var existing = o.existingIds || [];
    var types = o.allowedTypes || [];
    var roads = o.roadways || ROADWAYS;
    var id = String(f.id === null || f.id === undefined ? '' : f.id).trim();

    if (!id) return 'A Location ID (LID) is required.';
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return 'The LID may only contain letters, digits, hyphens and underscores.';
    for (var i = 0; i < existing.length; i++) {
      if (existing[i] === id) return 'LID ' + id + ' already exists.';
    }
    var st = String(f.state === null || f.state === undefined ? '' : f.state).trim().toUpperCase();
    if (!st) return 'A 2-letter state code is required.';
    if (o.resolveRegion && !o.resolveRegion(st)) return st + ' is not a state this tool maps to a region.';
    if (types.length && types.indexOf(String(f.type)) === -1) return 'Pick a location Type.';

    var lanesRaw = String(f.dieselLanes === null || f.dieselLanes === undefined ? '' : f.dieselLanes).trim();
    if (lanesRaw !== '') {
      var lanes = toFinite(lanesRaw);
      if (lanes === null || lanes < 0 || lanes > 99) return 'Diesel lanes must be a whole number from 0 to 99, or blank.';
    }
    var roadRaw = String(f.roadway === null || f.roadway === undefined ? '' : f.roadway).trim();
    if (roadRaw !== '' && roads.indexOf(roadRaw) === -1) {
      return 'Roadway must be one of ' + roads.join(', ') + ', or blank.';
    }
    var galRaw = String(f.gallons12mo === null || f.gallons12mo === undefined ? '' : f.gallons12mo).trim();
    if (galRaw !== '') {
      var g = toFinite(galRaw);
      if (g === null || g < 0) return '12-month gallons must be a non-negative number, or blank.';
    }
    return '';
  }

  // Same allowlist discipline as the file loader: only known fields survive,
  // so a hand-edited store cannot introduce a member name or a stray key.
  //
  // avgGalMo is DERIVED from gallons12mo and never carried through, because
  // one figure needs one source: a stored avgGalMo disagreeing with its own
  // annual total would place the row in a different profile average than its
  // gallons imply.
  function normalizeAddedLocation(row, opts) {
    if (!row || typeof row !== 'object') return null;
    var o = opts || {};
    var types = o.allowedTypes || [];
    var id = String(row.id === null || row.id === undefined ? '' : row.id).trim();
    if (!id) return null;

    function s(v) { return String(v === null || v === undefined ? '' : v).trim(); }
    var lanes = toFinite(row.dieselLanes);
    var g12 = toFinite(row.gallons12mo);
    var roadway = ROADWAYS.indexOf(s(row.roadway)) === -1 ? '' : s(row.roadway);
    var out = {
      id: id,
      addedLocally: true,
      city: s(row.city),
      state: s(row.state).toUpperCase().slice(0, 2),
      group: s(row.group),
      type: (types.length && types.indexOf(s(row.type)) === -1) ? types[0] : s(row.type),
      dieselLanes: (lanes === null || lanes < 0 || lanes > 99) ? null : Math.floor(lanes),
      roadway: roadway,
      distanceToInterstate: null,
      gallons12mo: (g12 === null || g12 < 0) ? null : g12,
      // Carried, and clamped to 0..12. Without it an added location could
      // never satisfy the months half of the qualifying rule, so it would
      // join the table, be marked LOCAL, and then contribute to nothing --
      // a feature that looks like it works and silently does not.
      reportingMonths: (function () {
        var m = toFinite(row.reportingMonths);
        if (m === null) return null;
        return Math.max(0, Math.min(12, Math.floor(m)));
      })()
    };
    out.avgGalMo = out.gallons12mo === null ? null : Math.round(out.gallons12mo / 12);
    var size = sizeForLanes(out.dieselLanes, out.roadway);
    out.size = (size === 'over' || !size) ? null : size;
    return out;
  }

  // The whole-network benchmark for the Network Locations summary card.
  //
  // Truck stops only -- 'Truck Stop' and 'Truck Stop / Service Center', the
  // two typeClass() calls 'truckstop'. Fuel stops are excluded from BOTH the
  // gallons sum and the count, because a figure captioned "per truck stop"
  // that divides fuel-stop gallons by a truck-stop count is measuring
  // nothing. Reporting rows only, same 500 gal/mo floor as everywhere else.
  //
  // Returns mean AND median deliberately. The mean answers "what does the
  // network move?" and the median "what does a typical site move?", and on
  // this file they are 17,003 against 7,829 -- a factor of 2.2, because a
  // handful of very large sites carry the sum. Reporting only the mean would
  // put a number on screen that contradicts every other gallons figure in
  // the tool; reporting only the median would not answer the question the
  // card is for. The caller must label both.
  function networkSummary(locations, opts) {
    var vals = [];
    var gallons12mo = 0;
    (locations || []).forEach(function (loc) {
      if (typeClass(loc.type) !== 'truckstop') return;
      if (!qualifies(loc, opts)) return;
      vals.push(toFinite(loc.avgGalMo));
      var g = toFinite(loc.gallons12mo);
      if (g !== null) gallons12mo += g;
    });
    if (!vals.length) {
      return { n: 0, gallons12mo: 0, meanGalMo: null, medianGalMo: null };
    }
    return {
      n: vals.length,
      gallons12mo: gallons12mo,
      // From the 12-month sum, as specified -- not the mean of avgGalMo.
      // They agree to the gallon here because avgGalMo is gallons12mo/12 in
      // this file, but the sum is the figure the card describes and is the
      // one that stays right if a row ever carries only one of the two.
      meanGalMo: Math.round(gallons12mo / 12 / vals.length),
      medianGalMo: Math.round(median(vals))
    };
  }

  // A region's headline gallons figure: the MEDIAN avgGalMo of its reporting
  // locations, with the count it rests on.
  //
  // Median, not mean, for the same reason profileBaselines() uses one -- a
  // handful of very large sites set a regional mean and nothing else does.
  // Measured on the real file the two answer different questions entirely:
  // Southeast's mean is 15,740 against a median of 5,985, so the mean
  // describes a region almost none of its locations resemble.
  //
  // This is deliberately NOT a like-for-like figure. regionDeltas() answers
  // "does this region outperform its own profile mix?" and is the number the
  // engine applies; this one answers "what does a location in this region
  // actually pump?" and is only ever displayed. They are different questions
  // and must never be assigned to each other.
  function regionAverages(locations, resolveRegion, opts) {
    var byRegion = {};
    (locations || []).forEach(function (loc) {
      if (!qualifies(loc, opts)) return;
      var reg = resolveRegion ? resolveRegion(loc.state) : loc.region;
      if (!reg) return;
      (byRegion[reg] = byRegion[reg] || []).push(toFinite(loc.avgGalMo));
    });
    var out = {};
    Object.keys(byRegion).forEach(function (reg) {
      var med = median(byRegion[reg]);
      out[reg] = {
        region: reg,
        n: byRegion[reg].length,
        median: med === null ? null : Math.round(med)
      };
    });
    return out;
  }

  // Per-profile roll-up over every location, in BASELINE_TABLE order.
  //
  // `n` counts locations that mapped AND carry a usable gallon figure -- those
  // two are not the same population, and a median captioned with the larger
  // count overstates its own evidence. `nMapped` is reported separately.
  //
  function summarizeByProfile(locations, baselineTable, opts) {
    var buckets = {};
    var order = [];
    (baselineTable || []).forEach(function (r) {
      var k = r.profile + '|' + r.roadway;
      buckets[k] = {
        profile: r.profile, roadway: r.roadway, lanes: r.lanes,
        currentBaseline: r.baseline,
        gallons: [], nMapped: 0,
        nNonReporting: 0, nonReportingIds: [], nMissingGallons: 0
      };
      order.push(k);
    });

    (locations || []).forEach(function (loc) {
      var m = matchBaselineProfile(loc, baselineTable);
      if (m.status !== 'ok' || !m.row) return;
      var k = m.row.profile + '|' + m.row.roadway;
      if (!Object.prototype.hasOwnProperty.call(buckets, k)) return;
      var b = buckets[k];
      b.nMapped++;
      var qa = locationQualifies(loc, opts);
      if (qa.ok) b.gallons.push(qa.avgGalMo);
      else if (qa.reasons.indexOf('no-gallons') !== -1) b.nMissingGallons++;
      else {
        // Everything that has a gallon figure but fails the rule -- on
        // volume, on months, or on both. Ids are carried so the Apply
        // confirmation can name what it dropped rather than report a bare
        // count.
        b.nNonReporting++;
        b.nonReportingIds.push(String(loc.id));
      }
    });

    return order.map(function (k) {
      var b = buckets[k];
      var med = median(b.gallons);
      return {
        profile: b.profile, roadway: b.roadway, lanes: b.lanes,
        currentBaseline: b.currentBaseline,
        n: b.gallons.length,
        nMapped: b.nMapped,
        nNonReporting: b.nNonReporting,
        nonReportingIds: b.nonReportingIds,
        nMissingGallons: b.nMissingGallons,
        median: med === null ? null : Math.round(med),
        p25: roundOrNull(quantile(b.gallons, 0.25)),
        p75: roundOrNull(quantile(b.gallons, 0.75)),
        delta: med === null ? null : Math.round(med) - b.currentBaseline
      };
    });
  }

  function roundOrNull(v) { return v === null ? null : Math.round(v); }

  // Counts for the "X of Y locations have complete profile data" indicator.
  // 'notApplicable' is held apart from 'incomplete' so rows nothing can fix
  // (Service Centers, C-Stores) never drag the completeness figure down and
  // send someone hunting for data that does not exist.
  function completenessCounts(locations, baselineTable, opts) {
    var out = {
      total: 0, complete: 0, withGallons: 0, incomplete: 0,
      notApplicable: 0, backroadOver: 0, noProfile: 0,
      needLanes: 0, needRoadway: 0,
      // Counted across the whole file, not just mapped rows: a non-reporting
      // location is non-reporting whether or not anyone has sized it yet.
      //
      // The two are disjoint and deliberately so: 'nonReporting' is "we
      // measured it and it does not clear the bar", 'missingGallons' is "we
      // have not measured it". Held apart because the caption has to
      // reconcile -- withGallons + nonReporting + missingGallons is the whole
      // file, and a reader who cannot add the printed numbers up to the total
      // reasonably assumes some rows went missing.
      nonReporting: 0,
      missingGallons: 0
    };
    (locations || []).forEach(function (loc) {
      out.total++;
      var qc = locationQualifies(loc, opts);
      if (qc.reasons.indexOf('no-gallons') !== -1) out.missingGallons++;
      else if (!qc.ok) out.nonReporting++;
      var m = matchBaselineProfile(loc, baselineTable);
      if (m.status === 'ok') {
        out.complete++;
        // "withGallons" means a figure the medians will actually use, so the
        // FULL qualifying rule applies here, not just the gallons half --
        // otherwise this count would promise evidence the analysis then
        // declines to use.
        if (qc.ok) out.withGallons++;
      } else if (m.status === 'not-applicable') {
        out.notApplicable++;
      } else {
        out.incomplete++;
        if (m.status === 'backroad-over') out.backroadOver++;
        else if (m.status === 'no-profile') out.noProfile++;
        else if (m.status === 'need-lanes') out.needLanes++;
        else if (m.status === 'need-roadway') out.needRoadway++;
      }
    });
    return out;
  }

  var BDPG_STATS = {
    median: median,
    quantile: quantile,
    toFinite: toFinite,
    sortedNumeric: sortedNumeric,
    typeClass: typeClass,
    p10: p10,
    p90: p90,
    EXCLUDED_NETWORK_TYPES: EXCLUDED_NETWORK_TYPES,
    EXCLUDED_NETWORK_GROUPS: EXCLUDED_NETWORK_GROUPS,
    isExcludedNetworkType: isExcludedNetworkType,
    isExcludedNetworkGroup: isExcludedNetworkGroup,
    normalizeNetworkContext: normalizeNetworkContext,
    profileRanges: profileRanges,
    pricingRangeForProfile: pricingRangeForProfile,
    PRICING_POSITIONS_PER_SIDE: PRICING_POSITIONS_PER_SIDE,
    pricingPctForPosition: pricingPctForPosition,
    pricingPositionForPct: pricingPositionForPct,
    pricingTrackFraction: pricingTrackFraction,
    networkCountTone: networkCountTone,
    prospectSignal: prospectSignal,
    datedStoreState: datedStoreState,
    validateNewLocation: validateNewLocation,
    normalizeAddedLocation: normalizeAddedLocation,
    networkSummary: networkSummary,
    gallonStatus: gallonStatus,
    locationQualifies: locationQualifies,
    qualifies: qualifies,
    MIN_REPORTING_GAL_MO: MIN_REPORTING_GAL_MO,
    MIN_REPORTING_MONTHS: MIN_REPORTING_MONTHS,
    sizeAffectsProfile: sizeAffectsProfile,
    sizeForLanes: sizeForLanes,
    BACKROAD_MAX_LANES: BACKROAD_MAX_LANES,
    profileBaselines: profileBaselines,
    baselineKeyFor: baselineKeyFor,
    regionDeltas: regionDeltas,
    regionAverages: regionAverages,
    REGION_THIN_N: REGION_THIN_N,
    DYNAMIC_BASELINE_MIN_N: DYNAMIC_BASELINE_MIN_N,
    matchBaselineProfile: matchBaselineProfile,
    summarizeByProfile: summarizeByProfile,
    completenessCounts: completenessCounts,
    SIZES: SIZES,
    ROADWAYS: ROADWAYS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_STATS: BDPG_STATS };
  } else {
    root.BDPG_STATS = BDPG_STATS;
  }
})(typeof window !== 'undefined' ? window : this);
