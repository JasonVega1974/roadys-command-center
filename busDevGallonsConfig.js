(function (root) {
  'use strict';

  var BASELINE_TABLE = [
    { profile: 'Fuel stop',         roadway: 'Any',        lanes: '1-2', baseline: 2500 },
    { profile: 'Small truck stop',  roadway: 'Backroad',   lanes: '1-2', baseline: 3000 },
    { profile: 'Small truck stop',  roadway: 'Highway',    lanes: '3-5', baseline: 5000 },
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
  // DISPLAY CONTEXT ONLY -- never an input to calculateEstimate(). The
  // formula's region term is the admin slider (region_variance.json / the
  // local override), which is a +/-10% manual adjustment. Five of these eight
  // values fall outside that range (from -43.3% to +76.1%), so wiring them
  // into the formula is not possible without changing what the tool computes
  // for every saved profile. A later task displays these figures; nothing
  // should ever pass BDPG_NETWORK_BASELINES into calculateEstimate().
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

  // Default pillar weights for calculateNetworkFitGrade(). These exactly
  // reproduce the pre-existing hardcoded behaviour: the function used to
  // compute 0.5 x rangePositionPct + 0.5 x mean(5 signals), i.e. 50% on
  // range position and 10% each on the five signals below. Do not change
  // these defaults without re-verifying every existing grade assertion.
  //
  // Frozen, and it has to stay frozen rather than being copied at the point of
  // use. resolveWeights() returns THIS object on every fallback, so without the
  // freeze one caller writing to the set it was handed would silently re-scale
  // every future grade in the session. Freezing is the fix that keeps the
  // object's identity intact: the page's storedWeightsWereDiscarded() asks
  // "did the engine hand back the shared defaults?" with `=== WEIGHT_CONFIG`,
  // and that question is what makes the "your saved weight set was discarded"
  // notice fire. Returning a defensive copy instead would answer false for
  // every corrupt set and kill the notice, so: freeze, do not clone. Page and
  // engine are both strict-mode, so a write here throws instead of no-opping.
  var WEIGHT_CONFIG = Object.freeze({
    rangePosition: 50, condition: 10, hours: 10,
    distance: 10, corridor: 10, competition: 10
  });

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
  // Region/Amenities/Review/Pricing, and like Pricing it is deliberately
  // OUTSIDE officialSubtotal -- that figure has to keep matching the published
  // PDF calculator. Default is "Undecided / unknown" (0%), which is also what
  // a profile saved before this term existed resolves to.
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

  // Supporting Details / amenity-detail dropdown option sets, plus the
  // thresholds suggestAmenityLevel() reads to produce a suggested level.
  var AMENITY_DETAIL_OPTIONS = {
    showers: ['none', '1-3', '4-9', '10+'],
    food: ['none', 'grab-and-go', 'fast food', 'full restaurant'],
    scale: ['yes', 'no'],
    parking: ['none', '1-15', '16-50', '51-100', '100+'],
    service: ['none', 'tire only', 'full bays'],
    defReefer: ['both', 'DEF', 'reefer', 'neither'],
    goodFood: ['fast food', 'full restaurant'],
    limitedFood: ['none', 'grab-and-go'],
    goodParking: ['16-50', '51-100', '100+']
  };

  // Supporting Details fields that also feed the Network Fit Grade's 5-signal
  // score. Same option labels are reused by CONDITION_ADJUST for "condition".
  var NETWORK_FIT_SIGNAL_OPTIONS = {
    condition: ['New or remodeled', 'Average', 'Older / dated'],
    hours: ['24/7', 'Extended', 'Business hours only'],
    distance: ['On exit', '1-5 mi', '5-15 mi', '15+ mi'],
    corridor: ['Major', 'Regional', 'Local'],
    competition: ['None within 15 mi', '1 within 15 mi', '2+ within 15 mi', 'Adjacent to a major chain']
  };

  var NETWORK_FIT_SIGNAL_SCORES = {
    condition:   { 'New or remodeled': 100, 'Average': 50, 'Older / dated': 0 },
    hours:       { '24/7': 100, 'Extended': 50, 'Business hours only': 0 },
    distance:    { 'On exit': 100, '1-5 mi': 100, '5-15 mi': 50, '15+ mi': 0 },
    corridor:    { 'Major': 100, 'Regional': 50, 'Local': 0 },
    competition: { 'None within 15 mi': 100, '1 within 15 mi': 50, '2+ within 15 mi': 0, 'Adjacent to a major chain': 0 }
  };

  var NETWORK_FIT_GRADE_BANDS = [
    { min: 85, grade: 'A', label: 'Flagship' },
    { min: 70, grade: 'B', label: 'Strong' },
    { min: 55, grade: 'C', label: 'Solid' },
    { min: 40, grade: 'D', label: 'Developing' },
    { min: 0,  grade: 'E', label: 'Niche' }
  ];

  // Condition-adjusted view (non-official). Same 3 labels as the condition
  // signal above, different purpose: a straight +/-% on finalGallons.
  var CONDITION_ADJUST = {
    'New or remodeled': 0.10,
    'Average': 0.00,
    'Older / dated': -0.10
  };

  // Placeholders. All zero = "not configured" -- see calculateMembershipFit().
  var MEMBERSHIP_CONFIG = {
    valuePerGallon: 0,
    plans: [
      { name: "Roady's", cost: 0 },
      { name: 'PTP', cost: 0 },
      { name: "Roady's Lite", cost: 0 }
    ]
  };

  var BDPG_CONFIG = {
    BASELINE_TABLE: BASELINE_TABLE,
    BDPG_REGION_MAP: BDPG_REGION_MAP,
    BDPG_REGION_DISPLAY: BDPG_REGION_DISPLAY,
    BDPG_NETWORK_BASELINES: BDPG_NETWORK_BASELINES,
    NETWORK_BASELINE_META: NETWORK_BASELINE_META,
    WEIGHT_CONFIG: WEIGHT_CONFIG,
    AMENITY_LEVELS: AMENITY_LEVELS,
    AMENITY_ADJUST: AMENITY_ADJUST,
    REVIEW_BANDS: REVIEW_BANDS,
    PRICING_LEVELS: PRICING_LEVELS,
    PRICING_ADJUST: PRICING_ADJUST,
    PRICING_DEFAULT: PRICING_DEFAULT,
    REWARDS_LEVELS: REWARDS_LEVELS,
    REWARDS_ADJUST: REWARDS_ADJUST,
    REWARDS_DEFAULT: REWARDS_DEFAULT,
    AMENITY_DETAIL_OPTIONS: AMENITY_DETAIL_OPTIONS,
    NETWORK_FIT_SIGNAL_OPTIONS: NETWORK_FIT_SIGNAL_OPTIONS,
    NETWORK_FIT_SIGNAL_SCORES: NETWORK_FIT_SIGNAL_SCORES,
    NETWORK_FIT_GRADE_BANDS: NETWORK_FIT_GRADE_BANDS,
    CONDITION_ADJUST: CONDITION_ADJUST,
    MEMBERSHIP_CONFIG: MEMBERSHIP_CONFIG
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BDPG_CONFIG: BDPG_CONFIG };
  } else {
    root.BDPG_CONFIG = BDPG_CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);
