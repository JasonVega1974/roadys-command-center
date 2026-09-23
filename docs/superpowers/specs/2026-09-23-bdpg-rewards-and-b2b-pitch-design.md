# Bus Dev Potential Gallons — Rewards Participation + B2B Pitch Framing

**Date:** 2026-09-23
**Files:** `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`,
`busDevGallonsCalculator.test.js`, `bus-dev-potential-gallons/index.html`

Two changes to the Bus Dev Potential Gallons tool:

1. **Rewards Participation** — a 5th adjustment term in the engine, carried
   through every surface that already shows the other four.
2. **B2B pitch framing** — the results section is rewritten to address the
   prospect directly, with internal-only content separated out and excluded
   from the leave-behind.

---

## 1. The formula

### 1.1 The spec's two readings, and which one governs

The request described the three numbers two different ways:

- *multiplicative* — `pricingAdjusted = officialSubtotal × (1 + Pricing%)`,
  then `finalGallons = pricingAdjusted × (1 + Rewards%)`
- *additive* — "actually implement this as additive on the base like the
  others: `Baseline × (1 + Region% + Amenities% + Review% + Pricing% + Rewards%)`"

They do not agree. For Case E the multiplicative chain gives
12,500 → 13,750 → 14,437 → **15,159**; the additive form gives
12,500 × 1.20 = **15,000**. The stated expected result for Case E is 15,000,
so **additive governs**, and `pricingAdjusted` is defined additively:

```
officialSubtotal = Baseline × (1 + Region% + Amenities% + Review%)
pricingAdjusted  = Baseline × (1 + Region% + Amenities% + Review% + Pricing%)
finalGallons     = Baseline × (1 + Region% + Amenities% + Review% + Pricing% + Rewards%)
```

`pricingAdjusted` as defined here is *exactly today's `finalGallons`*. That is
what makes this change safe: at Rewards 0% (the default), `finalGallons` is
numerically unchanged, so **every existing test passes without modification**.

### 1.2 The engine invariant

**`officialSubtotal` must always equal `Baseline × (1 + Region% + Amenities% +
Review%)` and must never include Pricing or Rewards.** It is the figure that
has to match Roady's published PDF calculator in front of a customer. This is
the invariant the final review verifies explicitly.

### 1.3 Rewards bands

```js
var REWARDS_LEVELS = ['Participating in Roady\'s Rewards', 'Undecided / unknown', 'Not participating'];
var REWARDS_ADJUST = {
  'Participating in Roady\'s Rewards': 0.05,
  'Undecided / unknown': 0.00,
  'Not participating': -0.05
};
var REWARDS_DEFAULT = 'Undecided / unknown';
```

`rewardsAdjustment(level)` mirrors `pricingAdjustment()` exactly: a known level
returns its percentage; anything else returns the default's 0.00. An unknown or
absent value therefore contributes nothing rather than throwing.

### 1.4 `calculateEstimate()` return shape

Adds three keys; changes no existing one's meaning:

| key | value |
|---|---|
| `rewardsPct` | the resolved rewards percentage |
| `pricingAdjusted` | `Baseline × (1 + Region + Amen + Review + Pricing)` |
| `pricingMathLine` | equation string for `pricingAdjusted` |

`officialSubtotal`, `officialMathLine`, `finalGallons` and `finalMathLine`
keep their names. `finalMathLine` gains the rewards term;
`officialMathLine` must not.

### 1.5 Two functions that must NOT change

- **`profileAdjustmentBounds()`** sums only the amenity and review extremes. It
  already excludes pricing; it must exclude rewards for the same reason —
  it defines the range the Network Fit Grade scores a position within, and that
  range is built from `officialSubtotal`. The existing test asserting
  `rangeLo 6750 / rangeHi 13000` is the regression guard.
- **`calculateNetworkFitGrade()`** receives `officialSubtotal` and has no
  pricing or rewards parameter to leak through. Unchanged.

### 1.6 Two functions that legitimately shift

`conditionAdjustedGallons(finalGallons, …)` and
`calculateMembershipFit(finalGallons)` both take `finalGallons`, which now
includes rewards. That is correct and intended: both answer "what does the
realistic projection support?", and the realistic projection includes rewards.
No signature change.

### 1.7 Tests

All 42 existing tests must pass unmodified. Two new cases:

| case | inputs | expected |
|---|---|---|
| **E** | Case A (Medium/Interstate, 12,500, Region +6%, Good amenities +2%, rating 3.8 +2%) + Most aggressive pricing +5% + Participating +5% | `officialSubtotal` 13,750 · `finalGallons` **15,000** |
| **F** | Case B (Fuel stop/Any, 2,500, Region 0%, Very limited −5%, rating 2.7 −5%) + No discounts −5% + Not participating −5% | `officialSubtotal` 2,250 · `finalGallons` **2,000** |

Plus:
- `officialSubtotal` is invariant across every rewards band (mirrors the
  existing pricing-invariance test).
- `rewardsAdjustment()` returns 0 for an unknown/absent level.
- An estimate computed with no `rewardsLevel` equals one computed with the
  default — proof that old saved profiles are numerically unchanged.
- `profileRange()`/`calculateNetworkFitGrade()` unchanged by rewards.

Target: **48 passing, 0 failing** — 42 existing plus the six above.

---

## 2. Rewards in the UI

### 2.1 Step 2 control

A segmented control (`.bdpg-seg`) directly below the existing Discount /
Pricing Posture control, same visual treatment, three buttons:
green `--green` (Participating +5%) · neutral `--yellow` (Undecided 0%) ·
red `--red` (Not participating −5%). Each shows its percentage beneath the
label, matching how the pricing segments already render.

Handler `BDPG.onRewardsChange(value)` mirrors `onPricingChange` exactly,
including the `if (changed) BDPG.invalidateResult()` guard.

### 2.2 `invalidateResult()` — the critical integration point

`rewardsLevel` is an engine input. It **must** join the invalidating set
documented in the comment block above `BDPG.invalidateResult()`. A new engine
input that does not invalidate reopens the exact Critical defect fixed in the
previous branch: a saved record describing an input set its stored result was
never computed from. The comment's "Inputs that invalidate" list gets a
`rewardsLevel` line.

### 2.3 Default and migration

- `BDPG.state.rewardsLevel` initialises to `''`; `step2Html()` defaults it to
  `REWARDS_DEFAULT` on first render, exactly as it already does for
  `pricingLevel`.
- `onLoadProfile()` defaults a missing `rewardsLevel` to `REWARDS_DEFAULT`,
  alongside the existing `preEvalOpen` and `prospect` defaults.
- `readSummary()` falls back to `sum.rewardsLevel || st.rewardsLevel || ''`.

An old profile therefore loads at Undecided / 0% and its numbers do not move.

### 2.4 Waterfall — 5 bars become 6

`waterfallData()` and the table in `resultsHtml()` mirror each other by
design (the code comment says so explicitly); both change together:

```
1. Baseline                                      12,500
2. Region-adjusted (+6.0%)                       13,250
3. Official calculator subtotal (+Amen +Review)  13,750
4. Pricing adjustment (+5.0%)                      +625
5. Rewards adjustment (+5.0%)                      +625
6. Final Potential Gallons                       15,000
```

Bar 4 runs `officialSubtotal → pricingAdjusted`; bar 5 (new) runs
`pricingAdjusted → finalGallons`; bar 6 stays the accent-coloured total
(`0 → finalGallons`). Green when the step adds, red when it subtracts — the
existing convention.

### 2.5 Other surfaces

- **Pre-Evaluation panel** — an eighth chip, "Rewards signal": green
  `Rewards: +5%` / yellow `Rewards: undecided` / red `Rewards: −5%`. It is
  **informational only and must not feed the overall signal roll-up**, which
  stays computed from chips 1–4. Rewards is a posture the rep sets, not a
  fact about the prospect's market, and folding it in would let a pricing
  choice change a "Strong candidate" verdict.

  **The chip array is position-coupled and the coupling is silent.**
  `preEval()` returns `chips[0..6]` with the overall signal last at index 6,
  and `preEvalHtml()` reads exactly that: `chips.slice(0, 6)` for the grid and
  `chips[6]` for the overall callout. Inserting the rewards chip makes the
  array 8 long, so **both** must move to `slice(0, 7)` and `chips[7]`. Missing
  either one does not throw — it drops a chip from the grid or renders the
  rewards chip as the overall verdict. Safer still, and preferred: append the
  rewards chip *before* the overall one and have `preEvalHtml()` derive the
  split as "all but the last" / "the last" rather than hardcoding indices
  again.
- **Tracker** — a Rewards column (chip: green/yellow/red), giving 12 columns.
  The empty-state `colspan="11"` becomes `colspan="12"`.
- **`trackerSummary()`** carries `rewardsLevel`.
- **Copy Summary** gains a Rewards line and the rewards math line.
- **Print packet** gains a Rewards step (see §3.5).

---

## 3. B2B pitch framing

### 3.1 The split — pitch above, internal below

The results section divides in two, with a labelled divider:

**Prospect-facing (above):** hero · How We Get There · Opportunities to Grow ·
What This Means For Your Business · About the Roady's Network · the waterfall.

**Internal (below a `INTERNAL — not shown to the prospect` divider):**
Network Fit Grade + position-in-range · Condition-Adjusted View
(non-official) · Analysis (math lines, Network Fit detail) · Your Amenity
Profile chart · Network Context table.

**Export Pitch Summary contains only the prospect-facing half.** A "Grade D —
Developing" badge or a bullet diagnosing weak amenities is useful to the rep
and damaging in front of the customer.

### 3.2 Hero

```
Roady's can drive 15,000 gallons/month to Westgate Travel Plaza
That's ≈ 180,000 gallons annually — based on your location profile,
region, and network data.
Roady's Published Calculator Figure: 13,750 gal/mo
  (matches Roady's published prospective-member calculator)
```

The official figure is labelled **"Roady's Published Calculator Figure"**, not
"Network Baseline" — "Baseline" already names row 1 of the waterfall (the raw
12,500 table value), and using it for 13,750 would put two different numbers
under one word on the same screen.

The prospect name comes from `BDPG.displayName()`. With no name entered it
falls back to "Prospect"; the hero then reads "…to this location" rather than
"…to Prospect".

### 3.3 How We Get There

3–4 bullets generated from the actual selected values — never hardcoded. A
bullet appears **only** if its signal is positive:

| condition | bullet |
|---|---|
| `roadway === 'Interstate'` | "Your Interstate location puts you in the path of high-volume fleet corridors — the strongest traffic signal in our network." |
| `roadway === 'Highway'` | "Your highway location sits on a steady regional freight corridor." |
| `regionPct > 0` | "The [West] region runs [+6.0%] above network average — your geography works in your favor." |
| `amenityPct > 0` | "Your [Good / full service] amenity rating places you above the network average for driver satisfaction." |
| `reviewPct > 0` | "Your [3.8] Trucker Path rating clears the 3.6 threshold — drivers already rate you well." |
| `pricingPct > 0` | "[Aggressive] discount pricing is projected to drive an additional [+5.0]% gallon volume above baseline." |
| `rewardsPct > 0` | "Participating in Roady's Rewards adds an estimated +5% volume uplift as loyalty members are directed to your stop." |

If no bullet qualifies, the section is omitted entirely rather than rendering
an empty heading.

### 3.4 Opportunities to Grow

Negative and neutral signals go here instead, phrased as upside — never as a
deficiency diagnosis. Gains use the existing lever arithmetic,
`Math.round(baseline × (targetPct − currentPct))`:

- **Rewards first when applicable** (it is the actual ask): "Adding Roady's
  Rewards participation could add an estimated +5% ≈ 250 gal/mo to your
  projection."
- Amenities below the top band, review below 3.6, and a more aggressive
  pricing tier each produce their existing lever line, reworded as opportunity.

These lever calculations currently live in `analysisNarrativeHtml()`. They
**move** here rather than being duplicated; the internal Analysis section keeps
the math lines and the Network Fit detail.

### 3.5 What This Means For Your Business

```
Monthly potential   15,000 gal/mo
Annual potential   180,000 gal/yr
```

Framed "Join Roady's and here's what your first year looks like."

The membership line ("membership pays for itself at Z gal/mo — your projection
is N× that") renders **only** when `calculateMembershipFit()` reports
`valuePerGallonConfigured` and at least one configured plan.
`MEMBERSHIP_CONFIG` currently ships all zeros, so today it does not render —
and the card must then **omit the line silently**, never show "Membership
pricing not configured" to a prospect. The internal section keeps the existing
not-configured notice for the rep.

### 3.6 About the Roady's Network

A strip of facts (not projections) from `network-context.json`:

- "[400] active locations across the Roady's network" — `activeTotal`
- "[78] locations in your region" — `byRegion[region].total`
- "[4] [Fuel Stop] locations like yours already in the network" —
  `byRegion[region].byType[locationType]`

The third stat requires a `hasOwnProperty` check: `byType` keys come from the
source CSV's Type column while `locationType` comes from the ⓪ card's own
list, and they do not always match (the Pre-Evaluation panel's chip 4 already
handles this mismatch). **A missing stat is omitted, never rendered as "—"** —
a dash in a credibility strip shown to a customer reads as a broken page. If
`networkContext` is absent or the region is unresolved, the whole strip is
omitted. Footnoted with the file's `asOf` date.

### 3.7 Export Pitch Summary

- Both buttons rename from "Export PDF" to "Export Pitch Summary" — the one
  under the results and the one on each tracker row.
- Print header: **"Roady's Fuel Network — Value Proposition for [Prospect
  Name]"**, then the date, then "Prepared by [GS Name]" when that field is
  filled.
- The packet contains the prospect-facing sections only (§3.1), plus the
  waterfall chart image, and now includes a Rewards step in the math steps.
- The `body.bdpg-print-mode` gate stays exactly as-is, so a plain
  File > Print on another page is still unaffected.

### 3.8 GS Name field

One optional text input in the ⓪ Prospect Profile card, beside Street Address:
`BDPG.state.prospect.gsName`. Persisted with the profile. Used only in the
print header, and only when non-empty. It is **not** an engine input and must
**not** invalidate the result — same treatment as prospect name/street/notes.

---

## 4. What must not regress

- `officialSubtotal` never includes Pricing or Rewards (§1.2) — verified
  explicitly in the final review.
- 48/48 tests pass at every commit.
- `rewardsLevel` invalidates the result (§2.2).
- Network Fit Grade is unchanged by rewards (§1.5).
- Old saved profiles load with rewards defaulted, numbers unmoved (§2.3).
- No `undefined` / `null` / `NaN` / `[object Object]` in any cell or bullet,
  for legacy, partial and corrupt records.
- Free text (prospect name, city, notes, GS name) escaped everywhere it is
  interpolated — the pitch copy interpolates the prospect name in several new
  places.
- Focus/caret preserved on continuous inputs; the new GS Name field follows
  the `onProspectInput` pattern (no full re-render on `input`).
- The shared delegated sort handler is untouched.

## 5. Known, accepted

The range bar's endpoints are hardcoded 2,500–15,000 and `pos()` clamps at
100%. Rewards raises the theoretical maximum to 18,000, so the Final marker
pins to the right edge more often. This is pre-existing — pricing alone already
allowed 17,250 — and is not addressed here.
