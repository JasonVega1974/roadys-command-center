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
  var BASELINE_TABLE = [
    { profile: 'Fuel stop',         roadway: 'Any',        lanes: '1-2', baseline: 2500 },
    { profile: 'Small truck stop',  roadway: 'Backroad',   lanes: '1-2', baseline: 3000 },
    { profile: 'Small truck stop',  roadway: 'Highway',    lanes: '3-5', baseline: 4000 },
    { profile: 'Small truck stop',  roadway: 'Interstate', lanes: '6+',  baseline: 7500 },
    { profile: 'Medium truck stop', roadway: 'Highway',    lanes: '3-5', baseline: 7500 },
    { profile: 'Medium truck stop', roadway: 'Interstate', lanes: '6+',  baseline: 12500 },
    { profile: 'Large truck stop',  roadway: 'Highway',    lanes: '3-5', baseline: 10000 },
    { profile: 'Large truck stop',  roadway: 'Interstate', lanes: '6+',  baseline: 15000 }
  ];

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

  // 4th adjustment (new): pricing/discount posture. Additive, same mechanism
  // as Region/Amenities/Review. Default is "Standard / moderate" (0%).
  var PRICING_LEVELS = [
    'Most aggressive (deepest discounts)',
    'Aggressive',
    'Standard / moderate',
    'Light discounting',
    'No discounts'
  ];

  var PRICING_ADJUST = {
    'Most aggressive (deepest discounts)': 0.05,
    'Aggressive': 0.025,
    'Standard / moderate': 0.00,
    'Light discounting': -0.025,
    'No discounts': -0.05
  };
  var PRICING_DEFAULT = 'Standard / moderate';

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
    goodFood: ['fast food', 'full restaurant'],
    limitedFood: ['none', 'grab-and-go'],
    goodParking: ['16-50', '51-100', '100+']
  };

  var BDPG_CONFIG = {
    BASELINE_TABLE: BASELINE_TABLE,
    BDPG_REGION_MAP: BDPG_REGION_MAP,
    BDPG_REGION_DISPLAY: BDPG_REGION_DISPLAY,
    BDPG_NETWORK_BASELINES: BDPG_NETWORK_BASELINES,
    NETWORK_BASELINE_META: NETWORK_BASELINE_META,
    AMENITY_LEVELS: AMENITY_LEVELS,
    AMENITY_ADJUST: AMENITY_ADJUST,
    REVIEW_BANDS: REVIEW_BANDS,
    PRICING_LEVELS: PRICING_LEVELS,
    PRICING_ADJUST: PRICING_ADJUST,
    PRICING_DEFAULT: PRICING_DEFAULT,
    REWARDS_LEVELS: REWARDS_LEVELS,
    REWARDS_ADJUST: REWARDS_ADJUST,
    REWARDS_DEFAULT: REWARDS_DEFAULT,
    AMENITY_DETAIL_OPTIONS: AMENITY_DETAIL_OPTIONS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_CONFIG: BDPG_CONFIG };
  } else {
    root.BDPG_CONFIG = BDPG_CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);
