# Bus Dev Potential Gallons — 8-Region Model, Network Baselines, Tutorial & Weights

**Date:** 2026-09-24
**Files:** `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`,
`busDevGallonsCalculator.test.js`, `bus-dev-potential-gallons/index.html`,
`region_variance.json`, `network-context.json`

Six changes: an 8-region model replacing the current 5; real network baselines
as display context; region-variance sliders; a tutorial widget; an admin-only
Weights tab; and a regenerated `network-context.json`.

---

## 0. Rulings that shape everything below

### 0.1 The region slider is a ±10 manual nudge; network baselines never enter the formula

The gallon-report figures span **−43.3% to +76.1%**, so five of eight cannot be
represented on a −10…+10 slider. Confirmed with the user:

- `BDPG_NETWORK_BASELINES` is **display context only** — shown beside each
  slider and in the results, never read by `calculateEstimate()`.
- The slider **is** today's `regionPct`: range −10…+10, step 0.1, default from
  the committed `region_variance.json` (0 for every region today).
- Consequence: **official gallons do not change for any existing profile**
  until an admin deliberately moves a slider.
- The "Reset to network data" button therefore has no in-range target and
  becomes a plain **Reset**, snapping to the committed value.

### 0.2 Old region names cannot be migrated by name

The 5→8 split is not a renaming:

| old region | splits into |
|---|---|
| West (WA OR CA NV ID MT WY UT CO) | **Northwest** (WA OR ID MT WY) + **West** (CA NV UT CO) |
| Southwest (AZ NM TX OK) | **Southwest** (AZ NM OK) + **Texas** (TX) |
| Midwest (12 states) | **Upper Midwest** (ND SD MN WI MI IA) + **Midwest** (NE KS MO IL IN OH) |

A stored `"West"` is ambiguous — it could be Oregon or California. Any
name→name mapping is wrong for some records.

**Migration is by re-derivation from the stored state code**, which every
record carries (State is required before Generate). `readSummary()` already
falls back to `resolveRegion(stateCode)`; the change is to make that the
**primary** source and ignore a stored `region` string entirely. A record whose
state code is missing or unresolvable is flagged
*"region updated — please re-select state"* rather than guessed.

### 0.3 Admin gating is obscurity, not security

A PIN gate is added because the user asked for one and it matches the
dashboard's MASTER LOCK convention. It is a speed bump against accidental
edits. The page is public, the PIN is in readable JS, and every value lives in
`localStorage` — this must be stated in a code comment so nobody later mistakes
it for protection.

---

## 1. The 8-region model

### 1.1 Config

```js
var BDPG_REGION_MAP = {
  'Northwest':     ['WA','OR','ID','MT','WY','AK'],
  'West':          ['CA','NV','UT','CO','HI'],
  'Southwest':     ['AZ','NM','OK'],
  'Texas':         ['TX'],
  'Upper Midwest': ['ND','SD','MN','WI','MI','IA'],
  'Midwest':       ['NE','KS','MO','IL','IN','OH'],
  'Northeast':     ['ME','NH','VT','MA','RI','CT','NY','NJ','PA','DE','MD'],
  'Southeast':     ['VA','WV','KY','TN','NC','SC','GA','FL','AL','MS','LA','AR']
};

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
```

All 50 states, each exactly once. **DC remains unmapped** (as today).
**AK and HI are now mapped** — they were `.nomap` before.

### 1.2 Region keys replace the lowercase scheme

`effectiveRegionPct()` currently does `region.toLowerCase()` against
`region_variance.json`'s lowercase keys. `"Upper Midwest"` would become
`"upper midwest"` — a space-bearing key, fragile and easy to mistype.

**Change both to the exact region key.** `region_variance.json` becomes:

```json
{ "Northwest": 0, "West": 0, "Southwest": 0, "Texas": 0,
  "Upper Midwest": 0, "Midwest": 0, "Northeast": 0, "Southeast": 0, "asOf": "" }
```

and `effectiveRegionPct()` reads `v[region]` with a `hasOwn` guard, no case
transform.

**A stored `localStorage` override in the old 5-key lowercase shape is
discarded**, not half-migrated — its values are 0 today, and a partial carry
would silently apply an old region's number to a new region covering different
states. The admin sees a one-line notice that the local override was reset.

### 1.3 Display names everywhere the prospect can see

A new `BDPG.regionDisplayName(key)` returns the display name, falling back to
the key. Every **prospect-facing** surface uses it:

- the pitch driver bullet (`index.html` ~`:2448`, currently
  `'The ' + s.result.region + ' region runs …'`)
- the network credibility strip (`'locations in your region (…)'`)
- the exported packet
- the results' "Network Average (your region)" line

Internal surfaces (map tooltip, region chips, admin panel, tracker column,
Network Context table) show the **short key** plus the display name where space
allows — the rep benefits from the short key matching the config.

### 1.4 Map and colours

Eight fills are needed and **cyan stays reserved** for the selected-state
highlight. Existing five keep their hues so the map is not gratuitously
re-learned; three are added:

| region | colour | source |
|---|---|---|
| West | `#00D68F` | `--green` (unchanged) |
| Southwest | `#FF6B35` | `--orange` (unchanged) |
| Midwest | `#FFD60A` | `--yellow` (unchanged) |
| Northeast | `#7C3AED` | `--purple` (unchanged) |
| Southeast | `#FF4757` | `--red` (unchanged) |
| Northwest | `#0891B2` | `--teal` |
| Texas | `#E0218A` | new — magenta, distinct from red and orange |
| Upper Midwest | `#8BC34A` | new — lime, distinct from green and yellow |

Teal is the nearest hue to the reserved cyan. The user approved teal on the
condition that the contrast is checked: **the implementer must confirm the cyan
selection ring reads clearly against a teal fill in both themes, and report the
measured result before that task is committed.** If it does not separate
cleanly, stop and report rather than silently substituting another hue.

**AK and HI** are already drawn by `d3.geoAlbersUsa()`, which composites them as
insets — they render today but are greyed and unclickable because
`resolveRegion()` returns null. Once mapped they become coloured and clickable
with no projection work. **Verify this rather than assume it**; if the atlas
inset placement is wrong or they are missing, that is a finding, not a
silent gap.

### 1.5 Region chips

`regionChipsHtml()` iterates `REGION_COLORS` and will produce 8 chips. Each
chip shows the short key, the region %, and the location count. With eight
chips and longer names the row wraps — the implementation must confirm it wraps
cleanly rather than overflowing.

---

## 2. Network baselines (display context)

### 2.1 Config

```js
// Real 12-month contributed-gallon averages from the Roady's network.
// DISPLAY CONTEXT ONLY -- never an input to calculateEstimate(). The formula's
// region term is the admin slider (region_variance.json / the local override),
// which is a +/-10% manual adjustment. See spec 0.1: five of these eight values
// fall outside that range, so wiring them into the formula is not possible
// without changing what the tool computes for every saved profile.
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
```

Every `pctVsNetwork` was verified against `(avgGalMo / 12347) − 1`; all eight
round to the stated figure.

### 2.2 Texas low-sample flag

Texas (n=13) renders a visible **"low sample confidence (n=13)"** marker beside
its slider. Per-region `n` is not available for the other seven, so no other
region carries a count — the absence is not an assertion that their samples are
large.

### 2.3 Results display

Beneath the existing Published Calculator Figure:

```
Roady's Published Calculator:            12,500 gal/mo
Roady's Network Average (your region):   10,373 gal/mo
  Southeast / Gulf States · 12mo avg, 227 locations, as of 2026-09
```

Informational, in the **pitch** half (it is a credibility fact about the
network, like the existing network strip). Omitted entirely when the region is
unresolved or absent from the map — never dashed.

---

## 3. Region-variance sliders

Replaces the eight number inputs. Per region:

- range **−10 to +10**, step **0.1**
- value from the effective variance (override → committed → 0)
- live numeric readout beside the slider, updating as it moves
- **Reset** button per region, snapping to the committed `region_variance.json`
  value
- read-only context line: `Network data: 10,373 gal/mo · −16.0% vs network`
- Texas additionally shows the low-sample marker

Moving a slider calls `invalidateResult()` — the region % is an engine input,
and the existing `onSaveRegionOverride` path already invalidates for exactly
this reason.

The existing "Save locally" button, the JSON preview, the override-differs
notice and the `Clear override` button all carry over unchanged in behaviour.

---

## 4. Tutorial widget

Collapsible card between the page header and the ⓪ card, **visible to all**,
**collapsed by default**, toggled by a `?` button added to the page header.

Five tabs inside one card — clicking a tab swaps the body, no page re-render:

1. **Overview** — what the tool estimates and from what.
2. **Step 1 — Location Profile** — the eight baseline rows, what
   Profile / Roadway / Lanes mean, the 2,500–15,000 range.
3. **Step 2 — Adjustments** — the five terms (Region, Amenities, Trucker Path,
   Pricing, Rewards), what moves each and by how much.
4. **Results** — Official Calculator vs Final Potential Gallons, and the pitch
   half vs the internal half.
5. **Saving & Tracking** — the Prospects tab and saved profiles.

One short paragraph plus one concrete example per section. **Percentages in the
copy are read from config**, never hardcoded — a band change must not silently
make the tutorial lie. The widget's open/closed state is a UI flag and belongs
in `SIG_SKIP` so toggling it never registers as unsaved work.

---

## 5. Weights tab (admin-only)

### 5.1 Config

```js
var WEIGHT_CONFIG = {
  rangePosition: 50, condition: 10, hours: 10,
  distance: 10, corridor: 10, competition: 10
};
```

These **exactly reproduce today's behaviour**: `calculateNetworkFitGrade()`
currently computes `0.5 × rangePositionPct + 0.5 × signalAvg` where `signalAvg`
is the unweighted mean of five signals — i.e. 10% each. A test asserts the
default weights produce grades identical to the current implementation.

### 5.2 Engine change

`calculateNetworkFitGrade()` reads the effective weights instead of the
hardcoded `0.5 / 0.5`:

```
overallScore = (rangePosition% × rangePositionPct
              + condition% × conditionScore
              + hours% × hoursScore
              + distance% × distanceScore
              + corridor% × corridorScore
              + competition% × competitionScore) / 100
```

**`officialSubtotal` is untouched by this** — weights feed only the grade.

Weights are validated on read: every value numeric, each 0–100, and the six
summing to 100. Any failure falls back to `WEIGHT_CONFIG` defaults rather than
computing a grade from a broken set — the same hardening this file already
applies with `isNum` / `hasOwn` / `str`.

### 5.3 UI

A third sub-tab **⚙ Weights**, rendered only when the admin PIN is unlocked.
Six sliders (0–100, step 5), a live **Total: 100%** indicator that turns red
when it is not 100, a **Reset to defaults** button, and save to
`localStorage` under the admin namespace. A non-100 total **blocks saving** —
it must not be possible to persist a set the reader then silently ignores.

Changes take effect immediately: saving invalidates any open result, because a
displayed grade computed under different weights is the same stale-pair defect
the branch already guards against.

**All admin controls consolidate here**: the region-variance sliders and the
network-context generator move out of the calculator tab into this tab.

### 5.4 The PIN gate

**A 4-digit PIN the user sets — never a hardcoded constant.**

- **Default state: no PIN set.** Admin controls are fully visible and usable
  until somebody sets one, so the tool does not arrive locked with a secret
  nobody was told.
- **Set PIN** flow on first use: enter a 4-digit code twice, stored in
  `localStorage`.
- Once set, the PIN gates **all** admin controls — the Weights tab, the region
  sliders and the network-context generator.
- **Change PIN** inside the admin tab: requires the current PIN, then the new
  one twice.
- Unlock is per session; the stored PIN persists.
- Validation: exactly four digits. Reject anything else with a clear message
  rather than storing it.

The comment must state plainly that this is an accident guard and not access
control: the page is public, the stored PIN is readable in `localStorage`, and
every value it guards is editable there directly. It exists so a rep cannot
change grade weights by wandering into the wrong panel.

### 5.5 Amenity confirmation gate

Generate is **blocked** — not merely warned — until the rep has explicitly
selected a Confirmed Amenity Level.

This supersedes the "warn, do not block" ruling from the previous branch. The
reason the warning existed is unchanged: `suggestAmenityLevel({})` returns
"Very limited" (−5%) for an unsurveyed site, so *unanswered* reads identically
to *answered badly*, and that −5% lands inside `officialSubtotal` — the figure
the packet advertises as reproducing Roady's published calculator. Blocking
converts an assumption the rep may not notice into a decision they must make.

- The gate is satisfied by an explicit selection (`amenityOverridden === true`),
  **not** by the suggestion being adopted by default. Tapping the amenity cards
  produces real data and therefore a real suggestion, which the rep still has
  to confirm.
- `generateButtonHtml()`'s disabled `title` names this as a distinct missing
  prerequisite, alongside the ⓪ card and Steps 1–2.
- The existing yellow assumption notice stays — it explains *why* the gate is
  there.
- **The arithmetic does not change.** `suggestAmenityLevel()` is untouched, so
  no already-saved profile's figures move.

---

## 6. `network-context.json` for 8 regions

Regenerated from `location-list-2026-09-21.csv` (gitignored, present on disk,
never committed) using the new state assignments. The in-page generator's
hardcoded five-name list is replaced by
`Object.keys(BDPG_CONFIG.BDPG_REGION_MAP)`, so it can never again drift from
the region map.

`activeTotal` should remain **400** — the same rows, repartitioned. The
implementation must confirm the eight new counts sum to 400; a different total
means rows were dropped or double-counted.

---

## 7. Saved-profile migration

Per §0.2 — re-derive, never name-map.

- `readSummary()` derives `region` from the stored **state code** first; a
  stored `region` string is ignored.
- `onLoadProfile()` likewise re-derives.
- A record with no resolvable state code renders `region` as
  **"region updated — re-select state"** in the tracker and shows the same
  notice on load.
- No record's stored **gallons** change. Region % is 0 everywhere today, so
  re-deriving the region name cannot move a stored figure — this must be
  verified, not assumed.

---

## 8. Tests

Existing 48 must pass. Five are region-sensitive and were checked:
`MD`/`DE`→Northeast, `WV`→Southeast, `OK`→Southwest, `CO`→West all **still
hold** under the new map. The whole-map loop test is generic and adapts.

New tests:
- `BDPG_REGION_MAP` has exactly 8 regions; all 50 states present exactly once;
  no state in two regions.
- `BDPG_REGION_DISPLAY` and `BDPG_NETWORK_BASELINES` have exactly the same 8
  keys as `BDPG_REGION_MAP` (guards the three maps drifting apart).
- Each `pctVsNetwork` is within **0.001** of `(avgGalMo / overallAvgGalMo) − 1`.
  A **tolerance, not exact equality**: both fields were rounded independently
  from the same unrounded 12-month report — gallons to whole numbers, the
  percentage to one decimal — so the stored percentage need not reproduce one
  re-derived from the rounded gallons. Measured slack across all eight regions
  is 0.00012–0.00051; Northeast (0.06949 stored as 0.070) is the only one that
  crosses a rounding boundary, and it is not an outlier. 0.001 accepts every
  real value while still failing a transposed digit or a percentage pasted
  against the wrong region, which would be off by ≥0.01 — verified by
  deliberately breaking a value and watching the test fail.
- New-map spot checks: `AK`→Northwest, `HI`→West, `TX`→Texas, `MI`→Upper
  Midwest, `OH`→Midwest, `WA`→Northwest, `CA`→West.
- `WEIGHT_CONFIG` values sum to 100.
- Default weights reproduce the pre-change grade for a fixed input set.
- A weight set that does not sum to 100 falls back to defaults.
- `officialSubtotal` is unaffected by any weight change.

---

## 9. Invariants

- **`officialSubtotal` = `Baseline × (1 + Region% + Amenities% + Review%)`**,
  never including Pricing or Rewards. Network baselines are display context and
  must appear nowhere in `calculateEstimate()`.
- The PDF baseline table is **untouched**.
- The five adjustment bands are **untouched**.
- No saved profile's stored gallons change.
- Weights affect only the grade.
- No `undefined` / `null` / `NaN` / `[object Object]`; free text escaped;
  caret preserved on continuous inputs.
- The gallon-report CSV is never committed (already covered by `*.csv` in
  `.gitignore`); `location-list-2026-09-21.csv` likewise.

## 10. Known, accepted

With region % capped at ±10 the Network Fit Grade's range-position component
still clamps to 100% for any strongly positive region — `profileAdjustmentBounds()`
excludes region by design, and an existing test already asserts this clamp.
Pre-existing, unchanged by this work.
