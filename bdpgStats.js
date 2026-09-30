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

  // A location reporting less than this many gallons a month is treated as
  // non-reporting, not as a low-volume site: excluded from every median and
  // from anything the Apply button writes, but kept visible and counted.
  //
  // This is a PLAUSIBILITY floor, and it is a different guard from the n>=5
  // sample-size floor -- the two catch different failures and neither
  // substitutes for the other. Measured on the real 249-location file: 27
  // locations report exactly 0 and 35 report under 100. The 24 Fuel Stops
  // there run 0, 0, 0, 0, 2, 9, 12, 14, 27, 48, 112, ... with a median of 152
  // against a live baseline of 2,500. n=24 clears the sample-size floor
  // comfortably, so without this constant a two-click Apply would have cut
  // that baseline by 94% and the calculator would have started quoting
  // prospects ~150 gal/mo. A site that sold nine gallons in a year is not a
  // measurement of a working location.
  //
  // Tunable on purpose: the right threshold is a business judgement about
  // what counts as an active location, not a property of the maths. Pass
  // opts.minReportingGalMo to override.
  var MIN_REPORTING_GAL_MO = 500;

  // Type -> how a location reaches a baseline profile at all.
  //   'fuel'      one profile, reached on Type alone
  //   'truckstop' needs Size and Roadway
  //   anything else has no profile in BASELINE_TABLE and never will, which is
  //   a different state from "we have not filled this in yet".
  //
  // 'Truck Stop / Service Center' counts as a truck stop: it is a truck stop
  // that also has bays, and the service side does not change which baseline
  // profile it belongs to. 'PPO' stays unmapped -- it is not a retail fuel
  // location and no profile describes it.
  function typeClass(type) {
    var t = String(type || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (t === 'fuel stop') return 'fuel';
    if (t === 'truck stop') return 'truckstop';
    if (t === 'truck stop / service center') return 'truckstop';
    return 'none';
  }

  // One place decides whether a gallon figure is usable, so the medians, the
  // completeness counts and the row markers can never disagree about which
  // locations are non-reporting.
  //   'usable'         a real figure at or above the floor
  //   'non-reporting'  a real figure below the floor
  //   'missing'        no figure at all -- not the same as reporting a zero
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
      if (gallonStatus(loc.avgGalMo, opts) === 'usable') b.gallons.push(toFinite(loc.avgGalMo));
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
      if (gallonStatus(loc.avgGalMo, opts) !== 'usable') return;
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
      var st = gallonStatus(loc.avgGalMo, opts);
      if (st === 'usable') b.gallons.push(toFinite(loc.avgGalMo));
      else if (st === 'non-reporting') {
        b.nNonReporting++;
        // Ids are carried so the Apply confirmation can name what it dropped
        // rather than report a bare count.
        b.nonReportingIds.push(String(loc.id));
      } else b.nMissingGallons++;
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
      nonReporting: 0
    };
    (locations || []).forEach(function (loc) {
      out.total++;
      if (gallonStatus(loc.avgGalMo, opts) === 'non-reporting') out.nonReporting++;
      var m = matchBaselineProfile(loc, baselineTable);
      if (m.status === 'ok') {
        out.complete++;
        // "withGallons" means a figure the medians will actually use, so the
        // floor applies here too -- otherwise this count would promise
        // evidence the analysis then declines to use.
        if (gallonStatus(loc.avgGalMo, opts) === 'usable') out.withGallons++;
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
    gallonStatus: gallonStatus,
    MIN_REPORTING_GAL_MO: MIN_REPORTING_GAL_MO,
    sizeAffectsProfile: sizeAffectsProfile,
    sizeForLanes: sizeForLanes,
    BACKROAD_MAX_LANES: BACKROAD_MAX_LANES,
    profileBaselines: profileBaselines,
    baselineKeyFor: baselineKeyFor,
    regionDeltas: regionDeltas,
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
