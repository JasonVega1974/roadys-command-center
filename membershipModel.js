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

  // Independent of state.groups (2026-10-30): PTP was never a real location
  // type, just a sales-channel tag, and its locations were dissolved out of
  // the groups array into the real types they belong to (gallons production
  // redesign). But PTP's HELD-FLAT treatment here -- excluded from steady/
  // structural attrition, growing only by adds.ptpNet -- is a separate,
  // deliberate modeling decision with its own history (see ptpNote) that has
  // nothing to do with gallons grouping. Coupling it to a group lookup would
  // have silently zeroed it the moment the group was dissolved, moving every
  // former-PTP location onto the normal attrition/growth curve as a side
  // effect of an unrelated fix. state.ptpHeldCount is its own field so this
  // stays correct regardless of what state.groups contains.
  function ptpCount(state) {
    return n(state.ptpHeldCount);
  }

  // lost / prior-year count, for every year where both are known.
  function derivedAttrition(history) {
    var h = history || [], rows = [];
    for (var i = 1; i < h.length; i++) {
      var prev = h[i - 1], cur = h[i];
      // `prev.count > 0`, not `!= null`. A prior count of zero is not a
      // derivable rate -- it divided to Infinity, and `avg` then averaged
      // Infinity, so the Historical tab's three-year average and the Member
      // Losses `3-YR DERIVED` tile both read "Infinity%" while
      // attritionSplit's decomposition read "NaN%". Every count is
      // user-editable, so clearing one to 0 is reachable.
      //
      // Excluding the row rather than emitting `rate: null` is deliberate:
      // `rows` already means "the years a rate can be derived for", and
      // `rows.length === 0` is the signal every renderer already checks for
      // "nothing derivable". A null-rate row would need a new guard in each.
      if (cur.lost != null && prev.count != null && prev.count > 0) {
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
    // ptpCount() stopped reading state.groups for 'ptp' on 2026-10-30 (see
    // its own comment) and reads this field instead. Added here, with the
    // SAME 89 the groups row above already carried, purely so this fixture
    // keeps producing the exact behaviour it pinned before that refactor --
    // not a config change the "do NOT update" rule above is about. The
    // `ptp` groups row stays, unused by ptpCount now, because the fixture
    // is verbatim.
    ptpHeldCount: 89,
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

  // Deep-overlay a saved state onto the current defaults, reporting what the
  // saved copy did not carry and what it carried that this build no longer
  // knows. Object.assign would not do: 17 of the 25 top-level keys are nested
  // objects, so a shallow merge replaces each wholesale and a state saved
  // before a nested field existed reloads with that field undefined -- and
  // n(undefined) is 0, so it becomes a silent zero, not an error.
  //
  // Arrays replace wholesale on purpose: groups / history / sources are
  // user-editable lists, so a saved list is an intentional whole and must
  // never be merged element-wise against a longer or shorter default.
  //
  // Presence is tested with `in`, never truthiness, so an explicit 0 or null
  // in the saved state survives instead of being overwritten by the default.
  // Removes the residue of a removed feature: `copy` maps left in saved state
  // and saved scenarios by a text-override layer that was reverted.
  //
  // It lives in the engine, not the page, so the test suite can see it. In an
  // earlier round of this same fix the decision logic was written straight
  // into the page, and 98 passing tests could not reach five of six findings
  // against it. Being hard to test is not a property of the problem here.
  //
  // Deletes `copy` at ANY depth and keeps every other key, including keys this
  // build does not recognise -- mergeState deliberately retains unknown state,
  // and that retention is exactly what let this residue survive the revert.
  // Over-stripping would silently discard a user's data, so the rule is one
  // key name and nothing else.
  //
  // ITERATIVE, with an explicit stack, because a recursive version was
  // DATA-TRIGGERABLE: a review measured RangeError between 2 000 and 5 000
  // levels of nesting while JSON.parse builds 20 000 levels from a 120 KB
  // file. The strip runs over the whole scenario list in one call, so a single
  // pathological record disabled stripping for every record -- and the page's
  // degradation then published the lot. An explicit stack has no depth limit.
  //
  // Returns {obj, removed, failed}:
  //   removed -- a caller that strips a store on read needs the count to
  //              decide whether to write the cleaned version back. Stripping
  //              without reporting left the on-disk store dirty forever while
  //              every consumer saw clean data: true of the hand-off, false of
  //              the store.
  //   failed  -- deletes that did NOT succeed, so a caller can fail closed
  //              rather than trust a strip that silently did nothing. `delete`
  //              throws in strict mode on a frozen or non-configurable
  //              property; swallowing that and reporting success would be the
  //              wrong-object-reported-as-fixed shape this whole fix exists to
  //              close.
  //
  // This function MUST NOT THROW on any input. Every route that publishes runs
  // downstream of it, and the page's response to a throw was to hand the
  // unstripped data onward.
  function stripResidue(obj) {
    var removed = 0, failed = 0;
    var seen = (typeof WeakSet === 'function') ? new WeakSet() : null;
    var stack = [obj], v, keys, i;

    while (stack.length) {
      v = stack.pop();
      if (!v || typeof v !== 'object') continue;
      // Guards cycles AND shared references. `seen.add` precedes the delete,
      // so a second visit to a shared object always finds it already clean.
      if (seen) { if (seen.has(v)) continue; seen.add(v); }

      if (Array.isArray(v)) {
        for (i = 0; i < v.length; i++) stack.push(v[i]);
        continue;
      }
      if (v.copy !== undefined) {
        try { delete v.copy; removed++; }
        catch (e) { failed++; }
      }
      keys = Object.keys(v);
      for (i = 0; i < keys.length; i++) stack.push(v[keys[i]]);
    }
    return { obj: obj, removed: removed, failed: failed };
  }

  // The sound half of the guard, and the reason this one works where three
  // earlier versions did not: it tests for a KEY NAME, not for a value.
  //
  // The original leak could not be detected by matching values, because the
  // page rounds and reformats figures on the way to the screen -- a margin
  // stored at two decimals and displayed at one defeated three successive
  // guards. A key name is not rounded, not reformatted and not localised. It
  // is either in the serialised payload or it is not.
  //
  // So a publish boundary can verify its own outbound payload independently of
  // whether the strip ran, succeeded, or was even present. Takes the already-
  // serialised JSON where possible; `false` means refuse to publish.
  // Three outcomes, not two, because a publish boundary that refuses needs to
  // say WHICH refusal it is:
  //
  //   'clean'        -- verified to carry no residue; publish it.
  //   'residue'      -- verified to carry residue; refuse, and a reload fixes
  //                     it, because the reload strips.
  //   'unverifiable' -- could not be serialised, so nothing can be concluded;
  //                     refuse, and a reload does NOT fix it.
  //
  // The two refusals were one at first, and a probe caught the cost: a clean
  // but pathologically deep record (JSON.stringify is recursive and gives up
  // long before JSON.parse does) was refused as though it carried residue, and
  // told the reader to reload and retry -- advice that cannot work, for a
  // record that was never dirty. Failing closed is right; lying about why is
  // not.
  // There is deliberately NO revision constant here any more.
  //
  // One existed, and the page compared it against a constant of its own. Two
  // reviews beat that pairing: first because nothing coupled the two numbers
  // (the engine moved to 5 and the whole suite still passed), then because a
  // second assignment to the page's constant shadowed it while the suite
  // stayed green and every page load reported a false skew. Both are
  // bookkeeping failures of a number standing in for behaviour.
  //
  // The page smoke-tests the behaviour instead -- a correct engine strips a
  // `copy` key and refuses a payload carrying one -- so a stale engine is
  // detected by what it DOES. See the comment on the MM binding in
  // membership-growth-model/index.html, and the test that pins the same three
  // assertions from this side.

  function residueVerdict(json) {
    if (typeof json !== 'string') {
      try { json = JSON.stringify(json); } catch (e) { return 'unverifiable'; }
    }
    // JSON.stringify(undefined) RETURNS undefined rather than throwing, so the
    // catch above does not fire. An earlier version then called .indexOf on it
    // and threw -- a guard beaten by its own structure, the sixth time in this
    // fix. Anything not a string by here cannot be checked, so it cannot be
    // published.
    if (typeof json !== 'string') return 'unverifiable';
    // `"copy":` and not `"copy"`, because JSON puts a colon after a key and
    // nothing else. Matching the bare quoted word also refused a scenario note
    // whose value was the word copy. A quoted occurrence inside a string VALUE
    // is escaped as \"copy\", so it cannot collide either way.
    return json.indexOf('"copy":') < 0 ? 'clean' : 'residue';
  }

  // The containment for the admin card hide/show feature. Lives here, not in
  // the page, so it gets the same Node test coverage as the rest of this
  // file rather than a hand-eyeballed review of page JS -- the page has no
  // test harness (it is a <script> that assigns globals, not a requireable
  // module; see the SR-11 layer-2 test's own comment on why require() cannot
  // reach it).
  //
  // This is the DELIBERATE OPPOSITE of mergeState's retain-unknown behaviour.
  // mergeState keeps an unrecognised key so a feature that is still mid-build
  // does not lose data on a round trip -- that is right for the model's
  // `state`, where an unrecognised field might be tomorrow's feature. It is
  // wrong here: `hiddenSections` never travels through mergeState at all (it
  // lives in MGM.uiPrefs, never in MGM.state -- see the card-hide-show plan),
  // but if it ever did, keeping an unknown key is exactly how the `copy`
  // residue survived a feature revert. So this drops what it does not
  // recognise, on both read and write, rather than keeping it.
  //
  // allowlist is passed in rather than read from a module-level constant: the
  // allowlist is UI inventory (which cards exist on the page), which this
  // pure engine has no business knowing, and passing it keeps this function
  // testable with a small list instead of the real 60-entry one.
  function sanitizeHiddenSections(raw, allowlist) {
    var allow = {};
    (allowlist || []).forEach(function (id) { if (typeof id === 'string') allow[id] = true; });
    var out = {};
    // Not an object, or an array (typeof [] === 'object'), or null
    // (typeof null === 'object') -- all three fail closed to {} rather than
    // throwing or coercing something unintended into a key.
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (k) {
      // hasOwnProperty, not `k in allow`: allow is a plain object built from
      // the allowlist, so an id that happens to be a native Object property
      // name ('constructor', 'toString', '__proto__') must not read as
      // present via the prototype chain rather than via an actual list entry.
      if (!Object.prototype.hasOwnProperty.call(allow, k)) return;  // unknown: DROPPED
      if (raw[k]) out[k] = true;   // coerced; a falsey value is simply absent
    });
    return out;
  }

  function mergeState(defaults, saved) {
    var added = [], unknown = [];

    function walk(dst, src, path) {
      Object.keys(dst).forEach(function (k) {
        var p = path ? path + '.' + k : k;
        if (!(k in src)) { added.push(p); return; }
        var dv = dst[k], sv = src[k];
        var bothPlain = dv && sv
          && typeof dv === 'object' && typeof sv === 'object'
          && !Array.isArray(dv) && !Array.isArray(sv);
        if (bothPlain) walk(dv, sv, p);
        else dst[k] = sv === undefined ? dv : sv;
      });
      Object.keys(src).forEach(function (k) {
        var p = path ? path + '.' + k : k;
        if (!(k in dst)) { unknown.push(p); dst[k] = src[k]; }
      });
    }

    walk(defaults, saved || {}, '');
    return { state: defaults, added: added, unknown: unknown };
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

  // The rewards rate AND the share that applies to it, decided together, in
  // one place, from ONE field.
  //
  // A blended rate is a P&L total over ALL active members, so the participation
  // share is already inside it; applying one again double-discounts the stream.
  // The basis therefore has to travel with the number, and the field NAME is
  // what carries it: `rewardsBlendedPM` means "already blended, no share".
  //
  // THIS IS THE THIRD DESIGN, and the first two failed in opposite directions:
  //
  //   1. a rate plus participation.rewards.pct = 100, with a comment calling
  //      the share "a no-op by construction". It was a no-op only while the
  //      value stayed 100. resetSection('revenue') pulls in the rate and
  //      leaves participation alone -- the pair straddled revenue.* and
  //      participation.* and that function is per-path by design -- so every
  //      pre-commit scenario HALVED the stream.
  //
  //   2. a rate plus a separate `rewardsPMIsBlended` boolean. mergeState fills
  //      absent keys from defaults, so a pre-commit scenario came back with
  //      the marker TRUE and its own old rate intact: the share it was saved
  //      with was discarded and the stream DOUBLED. Every entry path did it --
  //      load, import, scenarioLoad, pullScenarios -- with no admin action.
  //
  // The lesson, which is the durable part: DEFAULTS-WIN-FOR-ABSENT-KEYS IS
  // RIGHT FOR A NEW INDEPENDENT FIELD AND WRONG FOR A FIELD THAT CHANGES WHAT
  // A NEIGHBOURING VALUE MEANS. A qualifier must not be able to arrive without
  // the thing it qualifies.
  //
  // With one field there is nothing to separate. A pre-commit scenario has no
  // `rewardsBlendedPM`, so mergeState adds it at the shipped calibration and
  // REPORTS it in `added`; the saved `rewardsPM` survives as a retained
  // unknown. The stream moves by the difference between two calibrations, not
  // by a factor of two, and the notice says a field was filled from defaults.
  //
  // `rewardsPM` IS STILL READ, and an earlier version of this comment said
  // "that nothing reads" -- which the legacy branch below contradicts four
  // lines later, and a review measured at 207.1% of reference. It is read in
  // exactly one circumstance: when `rewardsBlendedPM` is ABSENT AS A KEY,
  // which is the legacy shape and the only shape whose rate takes a
  // participation share. A present-but-unusable blended value no longer
  // reaches it.
  //
  // LEGACY_STATE carries `rewardsPM`/`rewardsPart` and no blended field, so it
  // takes the legacy branch and the v1 goldens are unaffected -- including
  // through a merge, which design 2 could not say.
  // A usable numeric rate, or null. Rejects a boolean, an array and an object
  // by TYPE rather than by whether they coerce: `true` coerced to the rate 1
  // and `[]` to the rate 0, so the guard was testing coercibility and calling
  // the result a figure.
  //
  // A negative rate is rejected too. Revenue per member cannot be negative
  // here -- the one stream that legitimately is, fuel settlement, has its own
  // field -- so a negative belongs in the unusable bucket rather than quietly
  // inverting a stream.
  // A STRING IS ACCEPTED ON PURPOSE, and this is load-bearing: an imported
  // JSON scenario carries whatever the file held, and a hand-edited or
  // third-party export legitimately stores a number as a string. The UI path
  // never needs it -- the bound input writes a number or null -- so anyone
  // reading only the UI path would reasonably "tighten" this to number-only
  // and silently break every imported scenario. It stays.
  //
  // Whitespace is NOT a figure, though. Number(' ') is 0, so ' ', '	' and a
  // non-breaking space all arrived as a usable rate of zero and printed the
  // deliberate-$0 reading instead of "not supplied" -- the
  // absence-rendered-as-a-business-fact defect this model has corrected about
  // thirty times. Trimming first makes them empty, and empty is absent.
  //
  // MAGNITUDE IS BOUNDED, because validating the input is not the same as
  // validating what the model does with it. 1e308 passed every check here and
  // then `members x rate x 12` overflowed to Infinity, which propagated into
  // the revenue streams. A per-member MONTHLY rate has a real-world bound; a
  // billion dollars is already absurd by six orders of magnitude, so anything
  // beyond it is corrupt data rather than a figure, and saying so here keeps
  // one predicate instead of spreading finiteness checks over every product.
  var RATE_CEILING = 1e9;

  function usableRate(v) {
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    var t = (typeof v === 'string') ? v.trim() : v;
    if (t === '') return null;
    var x = Number(t);
    return (isFinite(x) && x >= 0 && x <= RATE_CEILING) ? x : null;
  }

  // WHICH SHAPE the state is in, and WHETHER ITS VALUE IS USABLE, are separate
  // questions. Conflating them is what reopened this bug a third time.
  //
  // The previous version took the legacy branch whenever rewardsBlendedPM
  // failed to coerce -- so `''` (one keystroke in its own number input),
  // null, a corrupt string, `{}`, NaN or a deleted key all silently fell
  // through to rv.rewardsPM, which the shipped config NO LONGER CONTAINS.
  // Measured: the rewards stream ZEROED with nothing rendered to say so, and
  // with a superseded rate still in state it reached 207.1% of reference --
  // design 2's doubling arriving through a different door. mergeState cannot
  // help, because `''` is PRESENT: it survives a merge and is not reported in
  // `added`.
  //
  // So the shape is decided by KEY PRESENCE and nothing else, and an
  // unusable value is an ERROR STATE rather than a fallback:
  //
  //   blended key present -> blended, always. A bad value yields rate null
  //                          and unset:true, never a silent legacy read.
  //   blended key absent  -> legacy, always. That is the only shape whose
  //                          rate is participation-discounted.
  //
  // rate null contributes nothing through n(), which matches this model's
  // convention that an em dash means "no figure supplied" while $0 means "a
  // deliberate zero" -- and `unset` is what lets a surface say the first
  // rather than print the second.
  function rewardsRate(state) {
    var rv = state.revenue || {};
    var hasBlended = Object.prototype.hasOwnProperty.call(rv, 'rewardsBlendedPM');

    if (hasBlended) {
      var b = usableRate(rv.rewardsBlendedPM);
      return { rate: b, share: 1, blended: true, unset: b === null };
    }
    var l = usableRate(rv.rewardsPM);
    return { rate: l, share: partPct(state, 'rewards') / 100,
             blended: false, unset: l === null };
  }

  // The effective share for any programme, for DISPLAY as well as arithmetic.
  // Four surfaces printed partPct raw beside a figure computed without it --
  // one row reading "x 50.0%" next to the 100% result, and the same
  // contradiction in the printed report.
  function effectiveSharePct(state, program) {
    if (program === 'rewards') return rewardsRate(state).share * 100;
    return partPct(state, program);
  }

  // Annualized run-rate per year: every stream is charged for 12 months on
  // the average member count, which is what the v1 reported and what a
  // valuation multiple expects. `producing` is carried separately so the
  // activation lag is visible without changing the revenue basis.
  function revenueModel(state, M) {
    var rv = state.revenue || {}, months = 12;
    // Read as ONE pair, once. Calling rewardsRate twice on a line made the
    // atomicity of rate-and-share incidental rather than explicit, which is
    // the shape the owner named as this build's recurring root cause.
    var rr = rewardsRate(state);
    return M.years.map(function (r) {
      var m = avgMembers(r);
      var streams = {
        dues:            m * n(rv.duesPerLoc) * months,
        duesAncillary:   m * n(rv.duesAncillaryPerMember),
        settlement:      m * n(rv.settlementNetPerMember),
        fuelProgram:     m * (partPct(state, 'fuel') / 100) * n(rv.avgGallons) * n(rv.fuelProgramMargin) * months,
        vendor:          m * (partPct(state, 'vendor') / 100) * n(rv.vendorPM) * months,
        rewards:         m * rr.share * n(rr.rate) * months,
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
    var rr = rewardsRate(state);          // one pair, read once
    var derived = {
      dues:            n(rv.duesPerLoc) * months,
      duesAncillary:   n(rv.duesAncillaryPerMember),
      settlement:      n(rv.settlementNetPerMember),
      fuelProgram:     (partPct(state, 'fuel') / 100) * n(rv.avgGallons) * n(rv.fuelProgramMargin) * months,
      vendor:          (partPct(state, 'vendor') / 100) * n(rv.vendorPM) * months,
      rewards:         rr.share * n(rr.rate) * months,
      rewardsBreakage: n(rv.rewardsBreakagePerMember)
    };
    derived.total = Object.keys(derived).reduce(function (a, k) {
      return k === 'total' ? a : a + derived[k];
    }, 0);

    var bench = n((state.benchmark || {}).lostMemberValue);
    // null and '' must NOT coerce. Number(null) is 0 and isFinite(0) is true,
    // so a loaded P&L period that carries no per-member total produced
    // `actual: 0` and a full-size variance against it -- the Revenue per
    // Member tab printed "P&L actual $0" and a $5,941 shortfall against a
    // figure nobody had supplied. A loaded period legitimately omits this
    // line, so this is a reachable state, not a malformed one.
    var raw = actuals ? actuals.totalPerMemberYr : null;
    var actual = (raw !== null && raw !== undefined && raw !== ''
                  && isFinite(Number(raw))) ? Number(raw) : null;
    // Realization is measured against the ACTUAL BILLING TOTAL, not against
    // duesPerLocBillable.
    //
    // It used to be duesPerLoc / duesPerLocBillable, and the Oct 29
    // recalibration set the first to the second -- so the ratio read exactly
    // 100.00% by construction and would have read 100.00% if both fields were
    // 999. A review caught that the metric had become a tautology at the very
    // moment it was supposed to confirm the recalibration.
    //
    // Modelled annual dues revenue over actual annual billing is a real
    // comparison: it cannot be satisfied by making two fields equal, and it
    // surfaces the denominator mismatch that duesPerLoc carries -- the rate is
    // dues over PAYING LOCATIONS, applied here to MEMBERS, which are not the
    // same population.
    //
    // monthlyDuesTotalExclCStores, NOT monthlyDuesTotal (2026-10-30): a
    // C-Store's legitimately low $100-250 fee pulls the billing total down
    // against a duesPerLoc assumption calibrated on non-C-Store locations, so
    // the unexcluded total would read a realization gap that is really just
    // C-Stores' own pricing, not a drift between assumption and actual. This
    // is a SEPARATE field the refresh script computes directly from the
    // billing CSV with the same C-Store rows removed -- not duesPerLocBillable
    // (excl.) times payingLocations (excl.) multiplied back out, which would
    // recreate the exact duesPerLoc/duesPerLocBillable tautology shape a prior
    // review already found and fixed once in this same function.
    var billing = state.billing || {};
    var annualBilled = n(billing.monthlyDuesTotalExclCStores) * 12;
    // The SAME member basis revenueModel uses -- avgMembers of the first year,
    // not M.startTotal. Using the integer start read 100.51% against a
    // modelled revenue built on the average, so the numerator and denominator
    // described slightly different populations and the metric was off by the
    // very kind of gap it exists to surface.
    //
    // KNOWN LIMITATION, flagged not fixed (2026-10-30): modelledMembers is
    // every active location, C-Stores included; annualBilled above now
    // excludes them. So once a real refresh populates a non-zero
    // cstoreExcludedCompanies, this ratio compares a full-population
    // numerator against a C-Store-excluded denominator -- realization will
    // read roughly 1/(1 - cstoreShare) too high, re-opening the exact "model
    // claims more per location than was billed" gap the Oct 29 recalibration
    // (3b7b979) was written to close. Excluding C-Store's own modelled
    // member count from `modelledMembers` would fix it, but that is a
    // growth-model population split nobody has asked for yet and is
    // deliberately NOT done here -- see one-quantity-one-field and
    // keep-changes-to-what-was-asked discipline elsewhere in this build.
    // The test below is a deliberate tripwire: it is pinned to the CURRENT
    // (zero-exclusion) state and will start failing the moment a real
    // refresh changes that, which is the signal to bring this back as its
    // own explicit decision rather than letting it drift silently past.
    var modelledMembers = (M && M.years && M.years.length)
      ? n(avgMembers(M.years[0])) : 0;

    return {
      derived: derived,
      actual: actual,
      actualStreams: actuals ? (actuals.streams || null) : null,
      benchmark: bench,
      varianceVsActual: actual === null ? null : derived.total - actual,
      varianceVsBenchmark: derived.total - bench,
      duesRealization: (annualBilled && modelledMembers)
        ? 100 * (modelledMembers * n(rv.duesPerLoc) * months) / annualBilled
        : null
    };
  }

  // Both lenses apply to the model's own revenue total, built from net
  // per-member streams — never to the P&L's `Total Income`, which is ~95%
  // gross settlement pass-through, and using it as the basis would
  // overstate it substantially -- see mgm_pnl_actuals for the figures.
  // (A multiple is deliberately not quoted here: this repo is public,
  // and a multiple next to a committed total back-solves a gated one.)
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

    // How many lenses actually have a basis. A lens at zero is not a $0
    // valuation, it is an absent method -- and averaging a real method with an
    // absent one returns half the real answer. `indicated` is therefore the
    // figure to display: the midpoint when two methods exist, the single
    // method when one does, and null when none does. Every consumer -- tile,
    // Valuation card, printed report, CSV, scenario comparison -- must read
    // `indicated` and `lensCount`, never `mid`, so the screen and the paper
    // cannot disagree. `mid` is kept because it is still the correct
    // two-method midpoint and the tests pin it.
    //
    // A NEGATIVE lens COUNTS as a basis; only an exact zero is "absent".
    // That split is deliberate, not incidental: every unsupplied input in
    // this model defaults to an explicit 0 (no margin, no costs, no
    // add-backs), so a zero lens means "nothing was supplied". A negative
    // EBITDA lens is the opposite -- it can only arise from real entered
    // costs exceeding revenue, which is a measured result and the most
    // decision-relevant thing this model can say. Treating it as absent would
    // hide a loss and leave the revenue lens standing alone as the headline.
    // Truthiness gives exactly that split (0 falsy, -1 truthy), so do not
    // "tidy" these conditions into `> 0`.
    var lenses = [];
    if (rev) lenses.push(rev);
    if (ebitda) lenses.push(ebitda);

    return {
      basis: basis, rev: rev,
      ebitdaBase: ebitdaBase, ebitda: ebitda,
      normalization: n(val.ebitdaNormalization),
      mid: (rev + ebitda) / 2,
      low: Math.min(rev, ebitda), high: Math.max(rev, ebitda),
      lensCount: lenses.length,
      indicated: lenses.length === 2 ? (rev + ebitda) / 2
               : lenses.length === 1 ? lenses[0]
               : null
    };
  }

  // The headline figure AND the words that go with it, decided once. Two
  // surfaces already branch on lensCount independently (the tile and the
  // Valuation card), and the printed report and the About tab are still to
  // come -- four copies of one rule is exactly how the newAdds/newModeled
  // divergence survived three tasks. A caller that reads this cannot label a
  // single-method figure as a midpoint.
  //
  // Note which states are which:
  //   2 lenses -> a real midpoint of two methods
  //   1 lens   -> that method alone; calling it a midpoint would be false
  //   0 lenses -> no value at all, NOT zero
  //
  // A NEGATIVE lens counts as a lens: every unsupplied input in this model
  // defaults to an explicit 0, so zero means "nothing supplied", while a
  // negative EBITDA can only come from entered costs exceeding revenue -- a
  // measured result. Do not tidy the truthiness checks in valuation() into
  // `> 0`; a test fails if you do.
  function valuationHeadline(v) {
    v = v || {};
    var n2 = v.lensCount === 2, n1 = v.lensCount === 1;
    var which = v.rev && !v.ebitda ? 'revenue multiple'
              : v.ebitda && !v.rev ? 'EBITDA multiple'
              : null;
    return {
      value: n2 || n1 ? v.indicated : null,
      label: n2 ? 'VALUATION MIDPOINT' : n1 ? 'INDICATED VALUE' : 'INDICATED VALUE',
      caption: n2 ? 'midpoint of two methods'
             : n1 ? (which ? which + ', single method' : 'single method')
             : 'no lens has a basis',
      isMidpoint: n2,
      hasValue: n2 || n1
    };
  }

  // ── P&L recalibration proposal (Half B, 2026-10-30) ─────────────────────
  //
  // Pure and testable on purpose: this is the ONE place that derives a
  // candidate public driver value from gated P&L figures, so it is the one
  // place equivalent-protection rounding and the collision check have to be
  // right. Everything else (sizing the before/after headline, rendering the
  // review panel, the admin's apply click) lives at the page level, which
  // already owns the full valuation pipeline (MGM.runFor) this function has
  // no need to duplicate.
  //
  // `streams[k]` IS ALREADY $/member/YEAR -- not a raw period total needing
  // a member-count division. Half A's own entry form says so directly
  // ("Per-stream actuals, per member per year", "Actual $/member/yr"
  // column), and the Revenue per Member reconciliation table, the CSV
  // export and the variance-disclosure note all treat
  // rpm.actualStreams[k]/rpm.derived[k] as that same unit with no further
  // member-count division anywhere in this file. A FIRST VERSION of this
  // function divided by an active-member count on top of that (modelled on
  // the Oct 29 recalibration's "programme fee total / months / members",
  // which derives a per-member rate from a RAW total off the workbook -- a
  // different source, already in a different unit, than what Half A's form
  // actually asks an admin to type). That double-divided the three
  // P&L-sourced drivers down to effectively zero against the real active
  // base. Caught by an independent review, not by this function's own
  // original test suite, which asserted its own (wrong) formula's output
  // rather than checking it against revPerMember's actual unit contract --
  // see the round-trip test in membershipModel.test.js that replaced those
  // assertions.
  //
  // This function's real job, given that: convert a $/member/YEAR figure to
  // $/member/MONTH where the public driver is monthly (rewardsBlendedPM),
  // re-scale for a period that is not a full 12 months (an admin who typed
  // an annualized estimate derived from partial-year data), round with
  // equivalent protection, and flag a near-boundary collision. `months` is
  // the loaded period's period_months (NOT hardcoded 12 -- a 9-month figure
  // an admin entered as "the annual rate implied by this partial period" is
  // a different thing from one entered against a full year).
  //
  // duesPerLoc does NOT derive from mgm_pnl_actuals at all -- it tracks
  // billing.duesPerLocBillableExclCStores, a billing-CSV figure that is
  // already public and already protected by the true-stop-only exclusion,
  // so it gets no additional rounding and no collision check: there is no
  // sensitive figure behind it to protect.
  function pnlRecalibrationProposal(streams, billing, months) {
    streams = streams || null;
    billing = billing || {};
    var m = n(months);
    m = (isFinite(m) && m > 0) ? m : 12;

    // Rounds toward the nearest multiple of `step`, then flags when the
    // rounding moved the value by less than a tenth of its own step --
    // i.e. the raw figure already sat suspiciously close to a rounding
    // boundary, so this particular rounding provides little real distance
    // from the gated figure behind it. A human reviewing REAL numbers can
    // widen the step; this function's job is only to say so, never to guess
    // a better step on its own.
    function round(exact, step) {
      if (exact == null || !isFinite(exact)) return { exact: null, proposed: null, flagged: false };
      var proposed = Math.round(exact / step) * step;
      // -0 reads as "0" in every caller, but printing it is a visible tell
      // that this driver's true sign flipped at a rounding boundary.
      if (proposed === 0) proposed = 0;
      var movedBy = Math.abs(proposed - exact);
      return { exact: exact, proposed: proposed, flagged: movedBy < step * 0.1 };
    }

    // `monthly`: rewardsBlendedPM's PUBLIC field is $/member/MONTH, so the
    // already-annual stream figure divides by 12 once more than the two
    // annual drivers do. Checked explicitly for finiteness BEFORE n()
    // coerces it -- n() silently treats non-numeric junk as 0, which would
    // turn a corrupt stored value into a confidently-proposed real zero
    // instead of "nothing usable here", the exact defect class this model
    // has fought everywhere else (see usableRate/rewardsRate above).
    var fromPnl = function (key, step, monthly) {
      if (!streams || streams[key] === null || streams[key] === undefined || streams[key] === '') {
        return { exact: null, proposed: null, flagged: false };
      }
      var raw = Number(streams[key]);
      if (!isFinite(raw)) return { exact: null, proposed: null, flagged: false };
      var annual = raw * (12 / m);
      return round(monthly ? annual / 12 : annual, step);
    };

    // 0 is the refresh script's own "cannot compute" sentinel for this
    // field (paying_locations_excl is zero -- see
    // tools/refresh-membership-config.py), never a real billable rate. That
    // is THIS field's own convention, not a reversal of "a real reported
    // zero is a genuine figure" elsewhere: duesPerLocBillableExclCStores is
    // a computed billing aggregate with a known not-computable sentinel,
    // not an admin-typed P&L actual.
    var duesExact = billing.duesPerLocBillableExclCStores;
    var duesUsable = duesExact !== null && duesExact !== undefined && duesExact !== ''
      && isFinite(Number(duesExact)) && Number(duesExact) !== 0;
    var duesProposed = duesUsable ? Math.round(Number(duesExact) * 100) / 100 : null;

    return {
      duesPerLoc: { exact: duesProposed, proposed: duesProposed, flagged: false,
                    path: 'revenue.duesPerLoc', step: 0.01 },
      rewardsBlendedPM: Object.assign(
        fromPnl('rewards', 2, true), { path: 'revenue.rewardsBlendedPM', step: 2 }),
      rewardsBreakagePerMember: Object.assign(
        fromPnl('rewardsBreakage', 25, false), { path: 'revenue.rewardsBreakagePerMember', step: 25 }),
      settlementNetPerMember: Object.assign(
        fromPnl('settlement', 25, false), { path: 'revenue.settlementNetPerMember', step: 25 })
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
  // Baselines live in state.gallons.baselines -- this tool's own independent
  // copy of the Bus Dev Potential Gallons tool's 8 profile/roadway
  // baselines, never a live sync (membershipModelConfig.js's comment on
  // `gallons` has the full reasoning). Unlike the pre-2026-10-30 version,
  // which took an injected baselineFor(profile, roadway) so the page could
  // wrap a live read of a DIFFERENT tool's config, nothing needs injecting
  // now: the data this function needs is already inside `state`.
  function baselineLookup(state) {
    var rows = (state.gallons || {}).baselines || [];
    var map = {};
    rows.forEach(function (r) { map[r.profile + '|' + r.roadway] = n(r.baseline); });
    return map;
  }

  // A group's locations split across multiple profile/roadway combinations
  // (2026-10-30 redesign): a group is real estate, not a single engine
  // profile, so gallons.groupSplits.<key> is an array of rows, each with its
  // own location count and optional per-row baseline override, summing to
  // the group's gallons. `mapped`/a group's own `unmapped` stay GROUP-level
  // (not row-level): the UI's "N group(s) are unmapped and contribute zero
  // gallons" warning cares whether a group contributes anything at all, not
  // whether every one of its rows individually resolved -- a group with one
  // mapped row and one unmapped row still produces real gallons and is not
  // the failure case that warning exists for.
  function gallonProduction(state, pipeline) {
    var gcfg = state.gallons || {};
    var splits = gcfg.groupSplits || {};
    var base = baselineLookup(state);
    var mapped = 0, totalRows = 0;

    var byGroup = (state.groups || []).map(function (g) {
      var rows = splits[g.key] || [];
      var groupGallons = 0, groupLocations = 0;
      var detailRows = rows.map(function (row) {
        totalRows++;
        var key = row.profile + '|' + row.roadway;
        var hasBase = Object.prototype.hasOwnProperty.call(base, key);
        var engineBaseline = hasBase ? base[key] : 0;
        var hasOverride = row.baselineOverride !== undefined
          && row.baselineOverride !== null && row.baselineOverride !== '';
        var baseline = hasOverride ? n(row.baselineOverride) : engineBaseline;
        var locations = n(row.locations);
        var gallons = locations * baseline;
        groupGallons += gallons;
        groupLocations += locations;
        return {
          profile: row.profile, roadway: row.roadway, locations: locations,
          engineBaseline: engineBaseline, baseline: baseline,
          overridden: !!hasOverride, unmapped: !hasBase, gallons: gallons
        };
      });
      var unmapped = rows.length === 0
        || detailRows.every(function (r) { return r.unmapped; });
      if (!unmapped) mapped++;
      return {
        key: g.key, label: g.label, count: n(g.count),
        rows: detailRows, locations: groupLocations,
        unmapped: unmapped, gallons: groupGallons
      };
    });

    var existing = byGroup.reduce(function (a, r) { return a + r.gallons; }, 0);
    var inbound = pipeline ? n(pipeline.gallons) : 0;
    var total = groupTotal(state);

    return {
      byGroup: byGroup, mapped: mapped, totalRows: totalRows,
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
        // Reports ALL members as participating when the rate is blended,
        // because that is what the rate covers. Showing half of them beside a
        // stream that counts all of them would be two surfaces disagreeing.
        rewards: m * rewardsRate(state).share
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
      mergeState: mergeState,
      stripResidue: stripResidue,
      residueVerdict: residueVerdict,
      sanitizeHiddenSections: sanitizeHiddenSections,
      attritionSplit: attritionSplit,
      applyScenario: applyScenario,
      partPct: partPct,
      rewardsRate: rewardsRate,
      effectiveSharePct: effectiveSharePct,
      avgMembers: avgMembers,
      revenueModel: revenueModel,
      revPerMember: revPerMember,
      valuation: valuation,
      valuationHeadline: valuationHeadline,
      pnlRecalibrationProposal: pnlRecalibrationProposal,
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
