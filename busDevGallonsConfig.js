(function (root) {
  'use strict';

  // Baselines reflect the Roady's Prospective Member Gallons Calculator (PDF).
  // Profile 3 updated 2026-09-24 based on real network analysis (n=12, median 1,946,
  // P75 4,517 — PDF figure of 5,000 was above the full P25–P75 band).
  // Source: reports/baseline-audit-2026-09-24.html (committed).
  // Full lane enrichment, all 226 locations: reports/lane-enrichment-2026-09-24.csv
  // (gitignored, local only). The 117 High/Medium-confidence subset actually used
  // for the join: reports/lane-enrichment-high-medium.csv (gitignored, local only).
  //
  // SUPERSEDED AS THE CURRENT ANALYSIS, 2026-09-27: a re-cut against diesel pump
  // counts matched 169 locations (up from 67) and produced medians by lane tier
  // -- 1-2: 3,202 (n=8), 3-5: 6,059 (n=87), 6+: 11,985 (n=74). It is recorded in
  // BDPG.BASELINE_ANALYSIS (index.html), not here. Every baseline below is
  // deliberately UNCHANGED by it, pending a review of those medians against
  // these figures; the 2026-09-24 note above is still the reason Profile 3
  // reads 4,000 today. Do not treat the new medians as agreed baselines.
  //
  // `lanes` is stored with an ASCII hyphen, not an en dash: the Step 3
  // lane-mismatch warning parses it with row.lanes.split('-')[1]
  // (index.html), so an en dash would make the upper bound NaN and silently
  // stop the "more lanes than this row expects" warning from ever firing.
  // The en-dash form is presentation only -- preEvalMappedProfile() applies
  // .replace('-', '–') when it renders.
  // 2026-09-30: lanes and roadway are now INDEPENDENT dimensions. Size is
  // defined by diesel lane count (Small 1-3, Medium 4-6, Large 7+) and the
  // roadway is a separate axis, so a 4-lane Interstate is simply
  // Medium/Interstate rather than a contradiction. The old table paired the
  // two rigidly -- Backroad<->1-2, Highway<->3-5, Interstate<->6+ -- which is
  // what produced the lanes/roadway "conflict" state that no longer exists.
  //
  // Backroad is the one exception and has no Medium or Large: 1-4 lanes is
  // Small/Backroad, and 5+ on a backroad is left unmapped for review rather
  // than forced into a profile. See BDPG_STATS.sizeForLanes().
  //
  // These baselines are now the FALLBACK only. The live figure is the median
  // avgGalMo of the network locations in each profile (BDPG_STATS
  // .profileBaselines); the row below is used when a profile has fewer than
  // three reporting locations.
  //
  // Baselines updated 2026-09-30 to the observed network medians.
  //
  // These are the FALLBACK, not the live figure. profileBaselines() computes
  // each profile's median from network-locations.json and only reaches this
  // table when a profile has fewer than DYNAMIC_BASELINE_MIN_N reporting
  // locations -- today Small/Backroad alone, at n=2. That is exactly why the
  // old values were allowed to rot: nothing displayed them, so nothing
  // contradicted them, and Medium/Highway sat at 7,500 against an observed
  // 15,705.
  //
  // Two things that rot cost, now fixed:
  //   * a profile that goes thin falls back to a number in the right
  //     neighbourhood instead of one off by 2x, and
  //   * BASELINE_DIVERGENCE_FLAG stops firing on seven profiles that are not
  //     anomalous. It compares the live median against this table, so a stale
  //     table made "the network disagrees with the baseline" the normal case
  //     and trained the reader to ignore the one warning that matters.
  //
  // Recomputed 2026-09-30 after the manual sizing pass: roadway and
  // dieselLanes were corrected on 47 locations, which reassigns profiles and
  // moves most medians. Several moved a long way -- Medium/Highway 15,705 ->
  // 4,013 on n=12 -> n=36, Large/Highway 8,606 -> 3,216 -- because the
  // corrected lane counts pulled a lot of previously mis-profiled sites into
  // different rows, not because any location's gallons changed.
  //
  // Small/Backroad now has an observed median (6,174 over n=4) and is no
  // longer on the static fallback. Every one of the eight is `source:
  // network` as of this file, so nothing below is currently displayed --
  // see the paragraph above about why they are kept accurate anyway.

  // Recomputed 2026-10-01 under the qualifying rule (>= 1,000 gal/mo AND
  // >= 6 reporting months). 152 of 219 locations qualify, down from 166
  // under the old 500 gal/mo floor alone. Most medians rose, several a long
  // way -- Large/Highway 3,216 -> 15,307 -- because the months floor removes
  // part-year locations whose twelve-month average was an artefact of a
  // short window rather than a measurement of a working site.
  var BASELINE_TABLE = [
    { profile: 'Fuel stop',         roadway: 'Any',        lanes: 'any', baseline: 5630 },
    { profile: 'Small truck stop',  roadway: 'Backroad',   lanes: '1-4', baseline: 6174 },
    { profile: 'Small truck stop',  roadway: 'Highway',    lanes: '1-3', baseline: 2338 },
    { profile: 'Small truck stop',  roadway: 'Interstate', lanes: '1-3', baseline: 8400 },
    { profile: 'Medium truck stop', roadway: 'Highway',    lanes: '4-6', baseline: 5250 },
    { profile: 'Medium truck stop', roadway: 'Interstate', lanes: '4-6', baseline: 10492 },
    { profile: 'Large truck stop',  roadway: 'Highway',    lanes: '7+',  baseline: 15307 },
    { profile: 'Large truck stop',  roadway: 'Interstate', lanes: '7+',  baseline: 23565 }
  ];

  // ── data version ──────────────────────────────────────────────────────────
  //
  // The committed data files' `asOf`, held once so it can do two jobs:
  //
  //   1. Cache-bust the three JSON fetches (?v=DATA_ASOF). Without it a
  //      browser can keep serving a pre-deploy copy of
  //      network-locations.json out of its HTTP cache, and every figure the
  //      page shows is then quietly a version behind.
  //   2. Date the per-browser localStorage. Stored per-row edits and hidden
  //      rows predating this value describe a file that no longer exists --
  //      they were made against different lane counts and roadways -- so
  //      they are cleared on load rather than left to shadow the committed
  //      data with no way for a viewer to know.
  //
  // A test asserts this equals network-locations.json's and
  // region_variance.json's own asOf, because a constant that silently drifts
  // from the files it versions is worse than no constant: it would pin the
  // cache to a stale key and wave stale localStorage through.
  //
  // network-context.json carries its own earlier asOf (2026-09-24) and is
  // deliberately not pinned to this -- it is a separate export on its own
  // cadence. It still gets the cache-buster; the param only has to change
  // when anything in the data set does.
  var DATA_ASOF = '2026-10-01';

  // Geographic-variance regions for the calculator only. Not the GS-territory
  // REGIONS map already in index.html — different partition, different purpose.
  // 8-region model (was 5): West split into Northwest/West, Southwest split
  // into Southwest/Texas, Midwest split into Upper Midwest/Midwest. This is a
  // re-partition, not a rename -- a record with an old stored region string
  // must be re-derived from its state code, never name-mapped.
  var BDPG_REGION_MAP = {
    'Northwest':     ['WA', 'OR', 'ID', 'MT', 'WY', 'AK'],
    'West':          ['CA', 'NV', 'UT', 'CO', 'HI'],
    'Southwest':     ['AZ', 'NM', 'OK'],
    'Texas':         ['TX'],
    'Upper Midwest': ['ND', 'SD', 'MN', 'WI', 'MI', 'IA'],
    'Midwest':       ['NE', 'KS', 'MO', 'IL', 'IN', 'OH'],
    'Northeast':     ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD'],
    'Southeast':     ['VA', 'WV', 'KY', 'TN', 'NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'LA', 'AR']
  };

  // Display names for prospect-facing surfaces (pitch bullets, network
  // credibility strip, exported packet). Internal surfaces show the short
  // key above, with this name added where space allows.
  var BDPG_REGION_DISPLAY = {
    'Northwest':     'Pacific Northwest / Northern Rockies',
    'West':          'Pacific West / Mountain West',
    'Southwest':     'Desert Southwest',
    'Texas':         'Lone Star',
    'Upper Midwest': 'Great Lakes & Northern Plains',
    'Midwest':       'Heartland / Central Plains',
    'Northeast':     'New England & Mid-Atlantic',
    'Southeast':     'Southeast / Gulf States'
  };

  // Real 12-month contributed-gallon averages from the Roady's network.
  // DISPLAY CONTEXT ONLY -- never an input to calculateEstimate().
  //
  // These are still not the formula's region term, but the reason changed on
  // 2026-09-30. The +/-10% cap that used to make them unusable is gone: the
  // slider now spans -100..+100 and region_variance.json carries the real
  // per-region deltas. What remains is that these two figures are DIFFERENT
  // MEASUREMENTS. pctVsNetwork below is each region's average against the
  // network average across 227 locations; the slider is the adjustment an
  // admin has chosen to apply. They are shown side by side in the admin panel
  // precisely so the gap between them stays visible. Never assign one to the
  // other in code.
  //
  // avgGalMo and pctVsNetwork both come from the same unrounded 12-month
  // source report, but each was rounded independently for display (gallons
  // to the nearest whole number, percent to one decimal). Re-deriving pct
  // from the rounded avgGalMo will NOT exactly reproduce the stored pct in
  // general -- measured slack across all eight regions is ~0.0001-0.0005.
  // Do not "fix" a pct that looks off by a thousandth against that
  // derivation; the stored value is the more accurate one.
  //
  // FALLBACK ONLY as of 2026-09-30. The results page reads
  // BDPG.effectiveNetworkAverage(), which takes the median avgGalMo of the
  // region's reporting locations in network-locations.json and only reaches
  // these figures for a region the file cannot speak for (fewer than
  // DYNAMIC_BASELINE_MIN_N reporting locations -- no region is in that state
  // today). Two things follow, and both matter if these values are ever
  // touched again:
  //
  //   * They are MEANS from a retired 227-location gallon report; the live
  //     path is a MEDIAN over a different, smaller file. They read much
  //     higher -- Southeast 10,373 here against 5,985 observed -- because a
  //     few very large sites set a mean and nothing else does. Do not
  //     reconcile the two by editing these numbers to match; they are
  //     different statistics over different populations, and the caption
  //     says which one produced the figure on screen.
  //   * pctVsNetwork is not displayed anywhere. It is kept because the
  //     internal-consistency test below pins it against overallAvgGalMo,
  //     which is what would catch a careless edit to this block.
  var BDPG_NETWORK_BASELINES = {
    'Northwest':     { avgGalMo: 11153, pctVsNetwork: -0.097 },
    'West':          { avgGalMo: 10883, pctVsNetwork: -0.119 },
    'Southwest':     { avgGalMo: 12933, pctVsNetwork:  0.047 },
    'Texas':         { avgGalMo:  7003, pctVsNetwork: -0.433, lowSample: true, n: 13 },
    'Upper Midwest': { avgGalMo:  8820, pctVsNetwork: -0.286 },
    'Midwest':       { avgGalMo: 21737, pctVsNetwork:  0.761 },
    'Northeast':     { avgGalMo: 13205, pctVsNetwork:  0.070 },
    'Southeast':     { avgGalMo: 10373, pctVsNetwork: -0.160 }
  };

  // Metadata for the retired report above. `locations` and `label` are no
  // longer displayed: the caption that cited "Roady's 227-location network
  // report" now names the region's own reporting count out of
  // network-locations.json, so that every number on the results page comes
  // from one file. `asOf` survives as the fallback path's date, and
  // `overallAvgGalMo` as the anchor the pctVsNetwork consistency test needs.
  var NETWORK_BASELINE_META = {
    overallAvgGalMo: 12347, locations: 227, asOf: '2026-09',
    label: "From Roady's network data (12mo avg, 227 locations, as of 2026-09)"
  };

  var AMENITY_LEVELS = ['Very limited', 'Average', 'Good / full service'];

  var AMENITY_ADJUST = {
    'Very limited': -0.05,
    'Average': 0.00,
    'Good / full service': 0.02
  };

  // Ordered low-to-high; each band's `max` is inclusive. Trucker Path ratings
  // are one-decimal, so 3.5 and 3.6 are adjacent values with no gap between bands.
  var REVIEW_BANDS = [
    { max: 2.9, pct: -0.05 },
    { max: 3.5, pct: 0.00 },
    { max: 5.0, pct: 0.02 }
  ];

  // 4th adjustment: discount / aggregator posture. Additive, same mechanism
  // as Region/Amenities/Review.
  //
  // This constant is now the FALLBACK range only -- used when the selected
  // profile has fewer than DYNAMIC_BASELINE_MIN_N reporting locations and so
  // has no observed spread to anchor a slider to. The live control is derived
  // from that profile's own p10/p90 (BDPG_STATS.pricingRangeForProfile), so
  // its ends differ per profile and are much wider than this: Large/Highway
  // runs -80% to +780%.
  //
  // The history, because the direction of travel is the point: five fixed
  // options spanning +/-5%, then a flat +/-25%, then a flat +/-50%, now the
  // profile's own measured range. Each widening was for the same reason --
  // the control could not express what the network actually does, and a site
  // carrying several fleet and aggregator discount programs genuinely runs
  // many times the volume of an identical site carrying none.
  //
  // Default is 0: the profile's average, no assumed posture. The original
  // default was 'Standard / moderate', which was also 0, so a prospect saved
  // under any past version of this control reopens on the same number.
  //
  // None of this changes the formula, but it does change what the formula can
  // reach, and the multiplier floor in calculateEstimate() is what keeps a
  // deeply negative posture from quoting negative gallons. It is tested
  // against these ranges -- do not remove it.
  var PRICING_RANGE = { min: -0.50, max: 0.50 };
  var PRICING_DEFAULT = 0;

  // The envelope pricingAdjustment() clamps to, and the only clamp the
  // FORMULA knows about. It has to be far wider than the fallback range
  // because a profile-anchored slider legitimately reaches its own p90:
  // Large/Highway tops out at +771%, so clamping the formula at +50% would
  // silently truncate the figure the control was showing.
  //
  //   max 20  -- +2000%, generous headroom over the widest observed p90 ratio
  //              (+7.71). A number past this is a corrupted record, not a
  //              posture, and flattening it to the top of the range would
  //              quote a prospect an enormous figure rather than a wrong one.
  //   min -1  -- -100% exactly cancels the baseline. Nothing below it means
  //              anything; calculateEstimate()'s multiplier floor handles the
  //              rest of the sum going negative.
  var PRICING_HARD_LIMIT = { min: -1, max: 20 };

  // The retired five. Kept ONLY so a saved prospect carrying one of these
  // strings reopens at the percentage it was calculated with rather than
  // silently snapping to the default -- pricingAdjustment() reads this when
  // it is handed a string. Nothing renders these, and nothing should add to
  // them; the control is a number now.
  var PRICING_LEGACY_ADJUST = {
    'Most aggressive (deepest discounts)': 0.05,
    'Aggressive': 0.025,
    'Standard / moderate': 0.00,
    'Light discounting': -0.025,
    'No discounts': -0.05
  };

  // 5th adjustment: Roady's Rewards participation. Additive, same mechanism as
  // Region/Amenities/Review/Pricing, and like Pricing it sits OUTSIDE
  // officialSubtotal. That used to be because officialSubtotal had to match
  // the published PDF calculator; since the region term now carries real
  // uncapped deltas it no longer matches anything published, and the figure
  // is labelled "Network-Adjusted Baseline" instead. The split is kept
  // because the two groups answer different questions: what the network does
  // at a location like this, versus what this operator chooses to do about
  // pricing and rewards. Default is "Undecided / unknown" (0%), which is also
  // what a profile saved before this term existed resolves to.
  var REWARDS_LEVELS = [
    "Participating in Roady's Rewards",
    'Undecided / unknown',
    'Not participating'
  ];

  var REWARDS_ADJUST = {
    "Participating in Roady's Rewards": 0.05,
    'Undecided / unknown': 0.00,
    'Not participating': -0.05
  };
  var REWARDS_DEFAULT = 'Undecided / unknown';

  // The amenity-detail option sets, plus the thresholds suggestAmenityLevel()
  // reads to produce a level.
  //
  // showers / food / scale / parking are the four the rule actually reads, and
  // are therefore the four the UI asks for. `service` and `defReefer` used to
  // sit beside them, collected on every prospect and read by nothing -- gone
  // with the confirmation dropdown, since a field that cannot change the
  // output has no business being a question.
  var AMENITY_DETAIL_OPTIONS = {
    showers: ['none', '1-3', '4-9', '10+'],
    food: ['none', 'grab-and-go', 'fast food', 'full restaurant'],
    scale: ['yes', 'no'],
    parking: ['none', '1-15', '16-50', '51-100', '100+'],
    def: ['yes', 'no'],
    laundry: ['yes', 'no'],
    goodFood: ['fast food', 'full restaurant'],
    limitedFood: ['none', 'grab-and-go'],
    goodParking: ['16-50', '51-100', '100+']
  };

  // Restroom / shower condition. A separate additive term, summed with the
  // amenity level's own percentage into the single Amenities figure the
  // breakdown shows -- it is a judgement about upkeep, which the level (a
  // judgement about what exists) cannot express. Default Standard is 0%, so
  // it stays inert until somebody actually assesses the site.
  var RESTROOM_LEVELS = ['Clean / updated', 'Standard', 'Dated / worn'];
  var RESTROOM_ADJUST = {
    'Clean / updated': 0.02,
    'Standard': 0.00,
    'Dated / worn': -0.02
  };
  var RESTROOM_DEFAULT = 'Standard';

  // DEF and inside-sales estimates, from the calculator spreadsheet. Applied
  // to FINAL monthly gallons, never to the baseline -- they are a consequence
  // of the fuel volume, not an input to it, and nothing here touches
  // calculateEstimate().
  //
  // Every figure is an editable admin value rather than a literal, because
  // all four are commercial assumptions that will be revised without a code
  // change. `enabled` removes the whole section from every surface.
  var DEF_INSIDE_DEFAULTS = {
    enabled: true,
    defPctOfDiesel: 0.02,
    defPricePerGal: 4.50,
    gallonsPerTransaction: 110,
    avgInsideRing: 18.32
  };

  var BDPG_CONFIG = {
    DATA_ASOF: DATA_ASOF,
    BASELINE_TABLE: BASELINE_TABLE,
    BDPG_REGION_MAP: BDPG_REGION_MAP,
    BDPG_REGION_DISPLAY: BDPG_REGION_DISPLAY,
    BDPG_NETWORK_BASELINES: BDPG_NETWORK_BASELINES,
    NETWORK_BASELINE_META: NETWORK_BASELINE_META,
    AMENITY_LEVELS: AMENITY_LEVELS,
    AMENITY_ADJUST: AMENITY_ADJUST,
    REVIEW_BANDS: REVIEW_BANDS,
    PRICING_RANGE: PRICING_RANGE,
    PRICING_HARD_LIMIT: PRICING_HARD_LIMIT,
    PRICING_LEGACY_ADJUST: PRICING_LEGACY_ADJUST,
    PRICING_DEFAULT: PRICING_DEFAULT,
    REWARDS_LEVELS: REWARDS_LEVELS,
    REWARDS_ADJUST: REWARDS_ADJUST,
    REWARDS_DEFAULT: REWARDS_DEFAULT,
    AMENITY_DETAIL_OPTIONS: AMENITY_DETAIL_OPTIONS,
    RESTROOM_LEVELS: RESTROOM_LEVELS,
    RESTROOM_ADJUST: RESTROOM_ADJUST,
    RESTROOM_DEFAULT: RESTROOM_DEFAULT,
    DEF_INSIDE_DEFAULTS: DEF_INSIDE_DEFAULTS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_CONFIG: BDPG_CONFIG };
  } else {
    root.BDPG_CONFIG = BDPG_CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);
