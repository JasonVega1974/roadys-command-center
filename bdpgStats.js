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

  // Diesel pump count -> the lane band BASELINE_TABLE speaks in. Returns null
  // for anything that is not a positive whole number of pumps, including 0:
  // a location recorded with zero diesel pumps is not a "1-2 lane" site, it is
  // a site whose pump count says it should not be in this analysis at all.
  function laneTierFor(lanes) {
    var n = toFinite(lanes);
    if (n === null || n < 1) return null;
    n = Math.floor(n);
    if (n <= 2) return '1-2';
    if (n <= 5) return '3-5';
    return '6+';
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

  function findRow(baselineTable, profile, roadway) {
    var found = null;
    for (var i = 0; i < (baselineTable || []).length; i++) {
      var r = baselineTable[i];
      if (r.profile === profile && r.roadway === roadway) found = r;
    }
    return found;
  }

  // The rule the whole tab turns on. Given one location's effective (source +
  // admin edits) values, which of the 8 baseline profiles does it belong to?
  //
  // Status values, all distinct on purpose because the UI and the completeness
  // count treat them differently:
  //   'ok'             mapped; contributes to that profile's median
  //   'need-size'      a truck stop with no Size set -- the gap this tab exists to close
  //   'need-roadway'   a truck stop with no Roadway set
  //   'no-profile'     Size+Roadway are both set but BASELINE_TABLE has no such
  //                    row (Medium/Backroad and Large/Backroad do not exist).
  //                    Not fixable by filling anything in.
  //   'lane-conflict'  Roadway and the diesel pump count disagree about the
  //                    lane band. Excluded from every median rather than
  //                    resolved in favour of one of them -- see below.
  //   'not-applicable' Service Center, C-Store, anything that is not a truck
  //                    stop or fuel stop. No profile exists; not incomplete.
  //
  // On 'lane-conflict': BASELINE_TABLE pairs roadway and lanes rigidly
  // (Backroad<->1-2, Highway<->3-5, Interstate<->6+), so an Interstate site
  // with 4 diesel pumps matches no row. Picking roadway-wins or lanes-wins
  // would quietly place it in a band one of its own two fields denies, and
  // this table is meant to be the source of truth for baselines. It is flagged
  // and excluded instead.
  //
  // Fuel stops skip the lane check entirely: their single profile is
  // roadway 'Any', so there is no roadway/lane pair to contradict.
  function matchBaselineProfile(loc, baselineTable) {
    var cls = typeClass(loc && loc.type);
    if (cls === 'none') return { status: 'not-applicable', row: null };

    if (cls === 'fuel') {
      var fuelRow = findRow(baselineTable, 'Fuel stop', 'Any');
      return fuelRow
        ? { status: 'ok', row: fuelRow, profile: 'Fuel stop', roadway: 'Any' }
        : { status: 'no-profile', row: null };
    }

    var size = String((loc && loc.size) || '').trim();
    var roadway = String((loc && loc.roadway) || '').trim();
    if (ROADWAYS.indexOf(roadway) === -1) return { status: 'need-roadway', row: null };

    // The lane check runs BEFORE the size check, and deliberately so. Every
    // roadway in BASELINE_TABLE carries exactly one lane band across all its
    // rows (Backroad->1-2, Highway->3-5, Interstate->6+), so a roadway and a
    // pump count can be known to disagree without knowing the size at all.
    // Ordering it after 'need-size' would hide a broken row behind a missing
    // field: somebody researches and sets the size, and only then learns the
    // location was never going to map. Surfacing the data error first is the
    // whole point of a tab meant to be the source of truth.
    var tier = laneTierFor(loc.dieselLanes);
    var expected = expectedLanesFor(baselineTable, roadway);
    // An unknown pump count is not a conflict -- there is nothing to disagree
    // with. Nor is an ambiguous roadway, where the table offers more than one
    // band for it and no single expectation exists to contradict.
    if (tier !== null && expected !== null && tier !== expected) {
      return {
        status: 'lane-conflict', row: null, roadway: roadway,
        laneTier: tier, expectedLanes: expected,
        profile: SIZES.indexOf(size) === -1 ? null : size + ' truck stop'
      };
    }

    if (SIZES.indexOf(size) === -1) return { status: 'need-size', row: null };

    var profile = size + ' truck stop';
    var row = findRow(baselineTable, profile, roadway);
    if (!row) return { status: 'no-profile', row: null, profile: profile, roadway: roadway };
    return { status: 'ok', row: row, profile: profile, roadway: roadway };
  }

  // The one lane band a roadway implies, or null when the table does not
  // agree with itself about that roadway. Derived from BASELINE_TABLE rather
  // than hardcoded, so adding a Medium/Backroad row at a different band makes
  // this return null -- declining to call a conflict -- instead of asserting a
  // pairing the table no longer supports.
  function expectedLanesFor(baselineTable, roadway) {
    var band = null;
    for (var i = 0; i < (baselineTable || []).length; i++) {
      var r = baselineTable[i];
      if (r.roadway !== roadway) continue;
      if (band === null) band = r.lanes;
      else if (band !== r.lanes) return null;
    }
    return band;
  }

  // Per-profile roll-up over every location, in BASELINE_TABLE order.
  //
  // `n` counts locations that mapped AND carry a usable gallon figure -- those
  // two are not the same population, and a median captioned with the larger
  // count overstates its own evidence. `nMapped` is reported separately.
  //
  // `nManualSize` is the subset whose Size came from an admin edit rather than
  // source data. It exists because Size is the one field being hand-set, and a
  // median grouped by a hand-set field is only as independent as the hand that
  // set it. A profile reading n=12 of which 11 are hand-sized is not twelve
  // observations of anything.
  function summarizeByProfile(locations, baselineTable, opts) {
    var buckets = {};
    var order = [];
    (baselineTable || []).forEach(function (r) {
      var k = r.profile + '|' + r.roadway;
      buckets[k] = {
        profile: r.profile, roadway: r.roadway, lanes: r.lanes,
        currentBaseline: r.baseline,
        gallons: [], nMapped: 0, nManualSize: 0,
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
      if (loc.sizeOrigin === 'manual') b.nManualSize++;
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
        nManualSize: b.nManualSize,
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
      notApplicable: 0, laneConflict: 0, noProfile: 0,
      needSize: 0, needRoadway: 0,
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
        if (m.status === 'lane-conflict') out.laneConflict++;
        else if (m.status === 'no-profile') out.noProfile++;
        else if (m.status === 'need-size') out.needSize++;
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
    laneTierFor: laneTierFor,
    typeClass: typeClass,
    gallonStatus: gallonStatus,
    MIN_REPORTING_GAL_MO: MIN_REPORTING_GAL_MO,
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
