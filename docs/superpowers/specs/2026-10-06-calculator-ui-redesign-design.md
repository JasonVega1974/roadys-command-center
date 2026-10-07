# Calculator UI Redesign — Design

**Date:** 2026-10-06
**Status:** Approved
**Surface:** `bus-dev-potential-gallons/index.html` (Step 2 — Adjustments)

## Goal

Make the Potential Gallons calculator's adjustment inputs scannable at a glance:
a numbered **Adjustment Steps** flow where every step is one clearly separated
row carrying its own contribution percentage on the right.

**The math does not change.** Not one multiplier, threshold, band or level rule
moves. This is a presentation change over an unchanged engine.

> **Amended 2026-10-07 (final layout).** Step 2 is a **two-panel form**, not a
> single numbered column. The `#1 Profile / Roadway / Lanes` recap row is gone
> — it repeated a choice already made in the wizard's Step 1 and offered
> nothing to act on.
>
> **Left panel (~40%):** Region. The map fills the column, with the state input
> and the resolved-region pill beneath it, and the region `%` on the panel
> heading. It is deliberately **unnumbered**: the map *is* the input, and a
> number chip on it would read as a step to work through rather than a place to
> click. The regional `%` legend chips are gone — the map's colours carry the
> regions, and the exact figure is on the badge once a state is chosen.
>
> **Right panel (~60%):** the five adjustments the rep actually works through,
> numbered **1-5** — Trucker Path Rating, Amenities, Restroom / Shower,
> Roady's Rewards, Discount Pricing Strategy — each with its percentage on a
> shared right edge so the figures scan as a column. The six amenity dropdowns
> are a 2x3 grid with each select beside its own label, not six full-width rows:
> stacked, that one step would stand taller than the map and unbalance the
> panel.
>
> `bdpgSteps.rows()` returns `{ region, steps }`, and every entry carries a
> stable **`key`**. Badge element ids are built from that key, never from the
> position: the numbering has been reordered three times, and twice the numeric
> ids left `patchStepValue`'s callers pointing at the wrong badge, silently
> ending the live mid-drag updates. A key cannot go stale that way.

---

## §0 Decisions

These were settled before design and are binding on the plan.

### §0.1 No formula change is required, and none happens

`calculateEstimate()` already returns every per-step percentage —
`regionPct`, `amenityPct`, `reviewPct`, `pricingPct`, `rewardsPct`. The helpers
behind them (`amenityAdjustment`, `restroomAdjustment`, `reviewAdjustment`,
`rewardsAdjustment`, `pricingAdjustment`) are all exported already.

`busDevGallonsCalculator.js` and `busDevGallonsConfig.js` are **untouched by
this phase.** Any change to either is out of scope and a defect.

### §0.2 Step values derive from live state, not from a generated estimate

`BDPG.state.result` holds the engine's answer for one exact set of inputs, and
`invalidateResult()` nulls it the moment any input changes. It therefore does
**not** exist while the rep is working — which is precisely when the step rows
must show their percentages.

So each step's value is computed live from state, from the same sources the
existing controls already read:

| Step | Value | Live source |
|---|---|---|
| #1 Profile / Roadway / Lanes | baseline gal/mo | `BDPG.currentBaseline().baseline` |
| #2 Region | signed % | `BDPG.effectiveRegionPct(region)` |
| #3 Trucker Path Rating | signed % | `BusDevGallonsCalc.reviewAdjustment(rating).pct` |
| #4 Amenities | signed % | `BusDevGallonsCalc.amenityAdjustment(level)` |
| #5 Restroom / Shower Condition | signed % | `BusDevGallonsCalc.restroomAdjustment(level)` |
| #6 Roady's Rewards Participation | signed % | `BusDevGallonsCalc.rewardsAdjustment(level)` |
| #7 Discount Pricing Strategy | signed % | `BDPG.currentPricingPct()` |

Three of these are already computed at the top of `step2Html()` today
(`regionPct`, `levelPct`, `pcur`); the redesign reuses them rather than
recomputing.

### §0.3 Steps #4 and #5 split one formula term, deliberately

`amenityPct` is a **single** term in the formula: `amenityAdjustment(level) +
restroomAdjustment(level)`. The calculator's own comment states why they are
one figure — both are statements about amenities, and splitting them in the
formula would add a sixth term.

The step flow shows them as **two rows with two percentages**, because they are
two separate inputs the rep fills in separately. Both helpers are exported, so
computing each for display calculates nothing new and changes nothing.

**The results panel keeps its single combined Amenities row.** This asymmetry
is intentional and documented here so nobody later "fixes" it: the steps mirror
the *inputs*, the results panel mirrors the *formula*.

**Naming, to prevent a collision:** this spec writes the formula's combined
term as `amenityPct` (the name `calculateEstimate` returns) and the amenity
level's own contribution as **`amenityLevelPct`**. They are not the same
number, and `bdpgSteps.js` takes the latter.

Invariant: `amenityLevelPct + restroomPct === amenityPct` for all inputs. This
is a required test.

### §0.4 The three-card wizard stays; #1 is a read-only recap

The page already runs a three-card wizard: **Step 1 — Select Location Profile**,
**Step 2 — Adjustments**, **Step 3 — Supporting Details**.

The Adjustment Steps list lives **inside Step 2**. Its `#1` row is a
**read-only recap** of what Step 1 selected — profile type, roadway, and the
baseline gallons that produced — not a second selector.

Unchanged as a result: Step 1's selector, `step1Done()` / `step2Done()`, the tab
navigation (`:4122-4123`), and the in-app guide prose that tells reps to pick
the profile in Step 1 and tune adjustments in Step 2 (`:4258-4259`, `:4286`).

### §0.5 The amenity "not assessed" state survives

Today an amenity tile starts unset and the UI says `Amenity level: not assessed
(+0.0%) — optional`, plus a warning when partially answered: `Based on 2 of 4
answers; the rule reads a blank as a "no".`

Each dropdown therefore opens on a `— not assessed —` option whose value is `""`
and which stores `undefined` in state. This preserves the distinction between
*"we checked, there are none"* and *"nobody looked."*

Verified: unset and the first real option (`none` / `no`) derive the **same**
amenity level through `suggestAmenityLevel`, so the arithmetic is identical
either way. What differs is the claim the UI makes and whether
`amenityAnsweredCount()` — and the N-of-4 warning — stay meaningful. They must.

### §0.6 Dropdown options are generated, never hand-written

The six dropdowns are generated from `BDPG_CONFIG.AMENITY_DETAIL_OPTIONS`. A
hand-written option list could drift from the rule that reads it, and
`suggestAmenityLevel` matches on exact string values (`d.scale === 'yes'`,
`opts.goodParking.indexOf(d.parking)`).

The requested options match the constant exactly, so there is no mapping change:

| Field | Options (from `AMENITY_DETAIL_OPTIONS`) |
|---|---|
| showers | none / 1-3 / 4-9 / 10+ |
| food | none / grab-and-go / fast food / full restaurant |
| scale | yes / no |
| parking | none / 1-15 / 16-50 / 51-100 / 100+ |
| def | yes / no |
| laundry | yes / no |

---

## §1 Architecture

### §1.1 One step-row primitive

All seven rows render through a single function. Seven hand-built rows drift
apart — the previous phase's whole-branch review found exactly that failure
mode, one status rule hand-copied into three places that then had to be
collapsed before merge.

### §1.2 New module: `bdpgSteps.js`

The decision of **what each step displays** is a pure decision and goes in a
tested module, not inline in an 8,300-line HTML file.

This repeats the move the CRM phase made with `roadysBD.js`'s display helpers,
which its whole-branch review assessed as *"the tested seam actually earned its
keep."* Both blocking defects that phase shipped lived in untested rendering
glue.

A **new** module — rather than adding to `busDevGallonsCalculator.js` — keeps
the standing constraint *"`busDevGallonsCalculator.js` is untouched"* true
literally, not merely in spirit.

**Interface** (pure; no DOM, no globals, no page helpers injected):

```js
BDPG_STEPS.rows({
  baseline:     number|null,   // gal/mo, or null when no profile is chosen
  profile:      string,        // e.g. 'Large truck stop'
  roadway:      string,        // e.g. 'Interstate'
  regionPct:    number|null,   // null when no state is entered
  reviewPct:    number,
  amenityLevelPct: number,     // the amenity LEVEL's term ONLY — see §0.3.
                               // NOT the formula's combined `amenityPct`.
  restroomPct:  number,
  rewardsPct:   number,
  pricingPct:   number
}) -> [ { n, title, subtitle, value, valueText, valueKind }, ... ]  // always 7 rows
```

The caller passes numbers it already has; the module owns the step **order**,
the **numbering**, the **titles**, and the **formatting** of each value
(gallons for #1, signed percent for #2–#7). Those are the decisions that would
otherwise be hand-copied seven times.

`valueKind` is `'gallons' | 'pct' | 'none'` so the HTML can tone the figure
without re-deciding what it is.

The module does **not** render markup. The HTML owns presentation; the module
owns the data the presentation shows.

---

## §2 The Adjustment Steps flow

Layout, as approved:

```
ADJUSTMENT STEPS

┌────────────────────────────────────────┬──────────┐
│ ① Profile / Roadway / Lanes            │ 42,000   │
│   Large truck stop · Interstate     │  gal/mo  │
├────────────────────────────────────────┼──────────┤
│ ② Region                [ US MAP ]     │  −4.2%   │
│   State: ID   Region: Northwest        │          │
├────────────────────────────────────────┼──────────┤
│ ③ Trucker Path Rating   ★★★★☆  4.2     │  +2.0%   │
├────────────────────────────────────────┼──────────┤
│ ④ Amenities   (6 dropdowns)            │  +3.0%   │
├────────────────────────────────────────┼──────────┤
│ ⑤ Restroom / Shower Condition          │  +2.0%   │
├────────────────────────────────────────┼──────────┤
│ ⑥ Roady's Rewards Participation        │  +1.5%   │
├────────────────────────────────────────┼──────────┤
│ ⑦ Discount Pricing Strategy            │  +6.0%   │
└────────────────────────────────────────┴──────────┘
```

The map, the state input and the region chips move **inside step #2** — the
step they serve. The two-column `.bdpg-2col` split is replaced by the
full-width step stack.

Controls carried over **unchanged** into their step bodies: the star rating
slider and its band/clear button (#3), the Rewards segmented buttons (#6), the
restroom select (#5), the pricing slider with its centre marker, range labels,
% readout and live gallons line (#7).

---

## §3 Amenities (#4)

Six dropdowns replace the tap-to-cycle tiles. Each row shows the amenity's
label on the left and its current value in the dropdown on the right.

`onAmenityCycle(field)` is replaced by `onAmenitySelect(field, value)`, which
must differ from its predecessor in two ways:

1. **Guard on a real change.** `onAmenityCycle` called `invalidateResult()`
   unconditionally because a cycle always advances. A dropdown re-selecting the
   same value is a no-op, and must not strand a generated result. Follow the
   pattern `onRestroomChange` already uses.
2. **Validate the incoming value.** A select posts whatever is in the DOM.
   Anything not in `AMENITY_DETAIL_OPTIONS[field]` — including `''` — stores
   `undefined` (unset), mirroring `onRestroomChange`'s guard.

The existing `Amenity level: <level> (<pct>) — <reason>` line, with its
partial-answer warning, stays at the bottom of step #4's body. The bare
percentage appears in the step's right-hand slot like every other step.

**State shape is unchanged** (`s.amenityDetails`, `s.amenityLevel`,
`s.restroomLevel`), so saved prospect records, the draft autosave and the
prospects table are unaffected.

One pre-existing behaviour to preserve rather than tidy: `step2Html()` assigns
`s.amenityLevel` from the derived suggestion as a side effect of rendering. The
restructure must keep that assignment, or the level goes stale.

---

## §4 Removals

Two lines in the Discount Pricing Strategy section are removed:

1. `BDPG.pricingDescription(pcur)` — *"Fleet and aggregator discount programs
   drawing volume in — +98% above this profile's average."*
2. `BDPG.pricingAnchorNoteHtml(pr)` — *"Ends are this profile's observed spread
   over N reporting locations: p10 … · average … · p90 …"*

**The percentile detail survives as a `title` tooltip on the three range
labels.** The anchor note exists because, in the original author's words,
*"without this the percentages look arbitrary; with it they are attributable to
named percentiles of a stated sample."* Moving it to a tooltip keeps the
sourcing reachable for a rep asked where `+150%` came from, without the layout
cost.

Everything else in the section stays: the header, the slider, the centre
marker, the three range labels, the `%` readout, and the live gallons line.

Both removed functions become unreferenced. `pricingAnchorNoteHtml`'s text is
reused for the tooltip; `pricingDescription` is deleted outright along with its
definition.

---

## §5 Renames

"Discount / Aggregator Posture" becomes **"Discount Pricing Strategy"** across
eight user-visible strings. **JS identifiers are unchanged** —
`pricingPct`, `pricingTone`, `currentPricingPct`, `onPricingSlider`,
`PRICING_POSITIONS_PER_SIDE` and the rest keep their names.

| Site | Current text |
|---|---|
| `:4254` | guide prose: "… Trucker Path review score, pricing posture and Rewards participation" |
| `:5697` | aria-label: "Discount and aggregator posture. Centre is this profile's average; …" |
| `:5769` | section label: "Discount / Aggregator Posture" |
| `:5997` | gallons line: "At this posture, the baseline reads …" |
| `:6512` | pitch prose: "Moving your discount posture from X to Y …" |
| `:6747` | export summary: "Discount / aggregator posture: " |
| `:6829` | pitch prose: "Your discount and aggregator posture is projected to add …" |
| `:8167` | prospects table header: `<th>Pricing Posture</th>` |

Line numbers are advisory — locate by text. A ninth and tenth occurrence live
inside `pricingDescription` (`:5969`, `:5971`), which §4 deletes.

Out of scope: `:1590`'s "fleet/aggregator contributed gallons" — that defines
what *gallons* mean, not the posture control, and renaming it would misstate
the gallons definition.

---

## §6 Explicitly unchanged

- `busDevGallonsCalculator.js`, `busDevGallonsConfig.js`
- The formula, every multiplier, band and threshold
- `suggestAmenityLevel` and the `AMENITY_ADJUST` level logic
- The star rating slider (#3) — carried over as-is
- The results panel: official subtotal, adjustments, total projected gallons
- The map itself, the dark palette, typography, spacing tokens
- Saved record shape, draft autosave, the prospects table's data
- The existing test suite (297 passing at the start of this phase)

---

## §7 Risks

### §7.1 Focus restoration during state entry — the critical one

`onStateInput` re-renders **only** the Step 2 box via `outerHTML` and then
restores focus and cursor position. Typing a two-letter state code must not
visibly lose focus after the first keystroke.

The restructure moves the state input inside step #2 and adds six focusable
dropdowns to the same re-rendered subtree, so this behaviour is easy to break
silently. The plan must carry an **explicit test** for it: type both characters
of a state code and assert focus and caret position survive.

### §7.2 Fixtures must be shapes the real code path can produce

The previous phase shipped a feature whose entire draft presentation was dead
code: the loader filtered drafts out, so three separate reviews verified
rendering that production could never produce — because the fixtures were
seeded directly into the cache, bypassing the query.

Every fixture in this phase must be a state the real page can actually reach.
Where a fixture is injected, the verification must also exercise the real code
path that produces that state.

### §7.3 Browser-only verification behind a login gate

This phase is almost entirely rendering, and the page sits behind Supabase auth
that no implementer has credentials for. Verification uses the established
credential-free substitute: serve locally, remove the gate overlay, drive the
real renderers, assert on the produced DOM — subject to §7.2.

---

## §8 Testing

New `bdpgSteps.test.js` covering `BDPG_STEPS.rows()`:

- returns exactly seven rows, numbered 1–7, in the specified order
- each step's `valueText` formatting: gallons for #1, signed percent for #2–#7
- **`amenityLevelPct + restroomPct === amenityPct`** — the §0.3 invariant,
  asserted against `calculateEstimate()`'s own returned `amenityPct` for the
  same inputs, so the two surfaces are pinned to each other rather than to a
  hand-computed constant
- zero renders as a real value (`0.0%`), not as blank or missing
- negative percentages carry their sign
- a null baseline (no profile chosen) degrades to a dash rather than throwing
  or printing `null`
- a null `regionPct` (no state entered) degrades the same way

Plus: the existing suite must not drop below its starting count, and no
existing test may be edited or weakened.

`bus-dev-potential-gallons/index.html` has no automated coverage and this
phase adds none to it — that is the accepted limit `bdpgSteps.js` exists to
answer.

---

## §9 Out of scope

- Any change to the formula, the engine, or the config
- The results panel's layout or its combined Amenities row
- The three-card wizard's structure, completion logic or tab navigation
- Step 1's profile selector and Step 3's supporting details
- Renaming JS identifiers
- The prospects table beyond its one column header
