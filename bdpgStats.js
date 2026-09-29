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

  // Diesel pump count -> a suggested Size. A triage aid, and NOT evidence.
  //
  // Read the collinearity note below before trusting anything grouped by a
  // size this produced. In short: for any location that is not lane-conflicted,
  // the lane tier already equals the roadway's expected band, so this rule
  // makes Size a one-to-one relabel of Roadway and adds no information the
  // roadway did not already carry. Measured on the real 249-location file it
  // sizes 223 rows and populates exactly three of the seven truck-stop
  // profiles -- Small/Backroad, Medium/Highway, Large/Interstate -- leaving
  // Small/Highway, Small/Interstate, Medium/Interstate and Large/Highway
  // permanently empty no matter how much data arrives.
  //
  // That is why summarizeByProfile reports nRuleSized separately and flags
  // ruleSizedMajority, and why the page blocks such a profile from Apply.
  // Lanes are a physical proxy, which is the one thing gallons are not -- so
  // the rule is safe to suggest with and unsafe to conclude from.
  var LANE_SIZE_RULE = { '1-2': 'Small', '3-5': 'Medium', '6+': 'Large' };

  // Size origins, in increasing order of how much weight a median may carry:
  //   ''       from source data (no source ships Size today, so unused)
  //   'lanes'  derived by LANE_SIZE_RULE -- a relabel of roadway
  //   'manual' set by hand from site characteristics
  var SIZE_ORIGINS = ['manual', 'lanes'];

  function suggestSizeFromLanes(lanes) {
    var tier = laneTierFor(lanes);
    if (tier === null) return null;
    return Object.prototype.hasOwnProperty.call(LANE_SIZE_RULE, tier)
      ? LANE_SIZE_RULE[tier] : null;
  }

  // Does Size participate in this type's profile lookup at all?
  //
  // Only truck stops. A fuel stop reaches its single profile on Type alone
  // and a C-Store reaches none, so writing a Size onto either is inert data
  // -- and worse than inert once anything counts it. Found by running the
  // lane rule over the real file: it sized 29 fuel stops, whose sizes could
  // not possibly affect their mapping, and the rule-sized majority check then
  // blocked Fuel stop from Apply. An eligible profile was disqualified by an
  // edit that changed nothing about it.
  function sizeAffectsProfile(type) { return typeClass(type) === 'truckstop'; }

  // The Size a baseline profile name implies. 'Small truck stop' -> 'Small'.
  // Fuel stop has no size: its single profile is roadway 'Any'.
  function profileSize(profile) {
    var p = String(profile || '').trim();
    for (var i = 0; i < SIZES.length; i++) {
      if (p.indexOf(SIZES[i] + ' ') === 0) return SIZES[i];
    }
    return null;
  }

  // A prospect's baseline needs at least this many comparable network
  // locations before the live median replaces the static table value.
  //
  // Three, not the five the Apply gate uses, and the difference is deliberate:
  // Apply rewrites a baseline for every future prospect in every region, this
  // picks one number for one prospect in one region and is recomputed from
  // scratch next time. A thinner sample is acceptable when nothing persists.
  var DYNAMIC_BASELINE_MIN_N = 3;

  // The locations comparable to one prospect: same region, same type, and for
  // a truck stop the same size and lane band. Exported separately from
  // dynamicBaseline() so the UI can report what matched without recomputing.
  //
  // sizeOrigin must be 'manual'. A lane-rule size is a relabel of roadway
  // (see LANE_SIZE_RULE), so grouping by it would make "the median for Medium
  // truck stops on a Highway" mean nothing more than "the median on a
  // Highway" -- the same reason a rule-sized profile is blocked from Apply.
  // 'manual' now arrives from two places: a curated sizeSource in
  // network-locations.json, and a per-browser admin edit.
  function comparableLocations(locations, row, region, opts) {
    var wantSize = profileSize(row.profile);
    var isFuel = typeClass(row.profile === 'Fuel stop' ? 'Fuel Stop' : 'Truck Stop') === 'fuel';
    return (locations || []).filter(function (loc) {
      if (!loc || loc.region !== region) return false;
      if (gallonStatus(loc.avgGalMo, opts) !== 'usable') return false;
      if (isFuel) return typeClass(loc.type) === 'fuel';
      if (typeClass(loc.type) !== 'truckstop') return false;
      if (laneTierFor(loc.dieselLanes) !== row.lanes) return false;
      if (loc.size !== wantSize) return false;
      return loc.sizeOrigin === 'manual';
    });
  }

  // The baseline for one prospect: the median of its comparable locations, or
  // the static table value when too few exist.
  //
  // Always returns a usable number. `source` says which it is, and the caller
  // is expected to show that -- a dynamic baseline and a fallback look
  // identical as figures and must never look identical on screen.
  //   'network'    median of n >= DYNAMIC_BASELINE_MIN_N comparables
  //   'static'     too few comparables; static table value
  //   'no-region'  prospect has no resolved region; nothing to compare within
  //   'no-profile' no such row in BASELINE_TABLE; there is no baseline at all
  function dynamicBaseline(sel, locations, baselineTable, opts) {
    var row = null;
    (baselineTable || []).forEach(function (r) {
      if (r.profile === (sel && sel.profile) && r.roadway === (sel && sel.roadway)) row = r;
    });
    if (!row) {
      return { baseline: null, source: 'no-profile', n: 0, median: null,
               staticBaseline: null, region: (sel && sel.region) || null, row: null };
    }
    var base = {
      staticBaseline: row.baseline, row: row,
      region: (sel && sel.region) || null, minN: optMinN(opts)
    };
    if (!base.region) {
      return assign(base, { baseline: row.baseline, source: 'no-region', n: 0, median: null });
    }
    var hits = comparableLocations(locations, row, base.region, opts);
    var med = median(hits.map(function (h) { return h.avgGalMo; }));
    if (hits.length < base.minN || med === null) {
      return assign(base, { baseline: row.baseline, source: 'static', n: hits.length, median: roundOrNull(med) });
    }
    return assign(base, { baseline: Math.round(med), source: 'network', n: hits.length, median: Math.round(med) });
  }

  function optMinN(opts) {
    var v = opts && toFinite(opts.minN);
    return v === null || v === undefined ? DYNAMIC_BASELINE_MIN_N : v;
  }

  function assign(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  // How far a live baseline has moved from the table it replaced, as a
  // fraction. null when there is nothing to compare. The UI flags this past a
  // threshold so a large divergence between the network and the config is
  // noticed rather than quietly applied.
  function baselineDivergence(d) {
    if (!d || d.source !== 'network') return null;
    if (!isFinite(d.staticBaseline) || d.staticBaseline === 0) return null;
    return (d.baseline - d.staticBaseline) / d.staticBaseline;
  }

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
        gallons: [], nMapped: 0, nManualSize: 0, nRuleSized: 0,
        nRuleSizedUsable: 0,
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
      if (loc.sizeOrigin === 'lanes') b.nRuleSized++;
      var st = gallonStatus(loc.avgGalMo, opts);
      // Counted against the USABLE sample specifically, because that is the
      // set the median is computed from. Rule-sized rows that never reach the
      // median cannot make it untrustworthy, and counting them against the
      // mapped total would block profiles whose actual sample is sound.
      if (st === 'usable' && loc.sizeOrigin === 'lanes') b.nRuleSizedUsable++;
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
        nRuleSized: b.nRuleSized,
        nRuleSizedUsable: b.nRuleSizedUsable,
        // The Apply gate. Strict majority of the usable sample: at exactly
        // half, the median still rests as much on hand-set sizes as on
        // relabelled roadways, and blocking there would be a judgement the
        // data does not force. An empty sample is not "majority" anything.
        ruleSizedMajority: b.gallons.length > 0 &&
          b.nRuleSizedUsable * 2 > b.gallons.length,
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
    LANE_SIZE_RULE: LANE_SIZE_RULE,
    SIZE_ORIGINS: SIZE_ORIGINS,
    suggestSizeFromLanes: suggestSizeFromLanes,
    sizeAffectsProfile: sizeAffectsProfile,
    profileSize: profileSize,
    comparableLocations: comparableLocations,
    dynamicBaseline: dynamicBaseline,
    baselineDivergence: baselineDivergence,
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
