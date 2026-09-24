# Known follow-ups

Defects found during development and deliberately deferred, with the evidence
behind the decision. None is a blocker; each was proven not to affect data a
real user already has. Newest first. Items closed by later work move to
**Resolved** at the bottom rather than being deleted, so the evidence that
produced them stays findable.

Entry 1 is **awaiting a decision from the user**, not implementation work
waiting for a slot.

---

## 1. Awaiting a decision: the day-mode map selection ring does not contrast with the teal Northwest fill

**Where:** `bus-dev-potential-gallons/index.html` — `#bdpg-usa-svg path.sel`
(line 133) sets `stroke:var(--accent); stroke-width:2.2;
filter:drop-shadow(0 0 7px rgba(0,200,255,.7))`, with two day-mode overrides
near the top of the stylesheet (lines 36 and 51) re-pointing the stroke and
the glow to the day `--accent`.

**Symptom:** in day mode `--accent` is `#0078D4` and the Northwest fill is
`#0891B2`. Computed relative luminances are 0.1819 and 0.2352, giving a
contrast ratio of **1.23:1** between the selection ring and the shape it is
supposed to outline — well under any legibility threshold. Dark mode is clean:
ring `rgb(0,200,255)` on `rgba(8,145,178,.85)`, 1.88:1 and far brighter.

**Option 1 below was taken on `feat/bdpg-8-regions-admin-tools`** (the
branch's final commit). Measured on the same page and the same rendering
engine, HEAD bytes vs working-tree bytes, Northwest (`WA`) selected:

| day mode | before | after |
|---|---|---|
| ring stroke | `rgb(0,120,212)` | `rgb(0,120,212)` |
| glow | `rgba(0,200,255,.7)` | `rgba(0,120,212,.7)` |
| **ring vs teal fill** | **1.23:1** | **1.23:1** |
| ring vs its own glow | 2.31:1 | 1.00:1 |
| glow vs page background `#F0F2F5` | 1.75:1 | 4.04:1 |

Dark mode is unchanged in every measured value. **Read that table honestly:
the ring-versus-fill number did not move, and could not have** — the fix never
touches the stroke colour, and both colours are mid blue-green. What it does
fix is the two-different-blues mismatch (a light theme depending on a value
that only means anything at night), and it roughly doubles the halo's contrast
against the light background the drop-shadow actually spills onto. It also
removes the bright cyan that was visually propping day mode up, so the ring
now reads as the marginal outline it has always been rather than being rescued
by an artifact.

**Still open**, and still the user's call — the teal is their own colour choice
and the 8-region palette shipped with their conditional approval:

1. ~~**Theme-scope the glow** — add a `body.day-mode …path.sel{filter:…}` rule
   using a day-appropriate colour.~~ **Implemented 2026-09-24.** A correctness
   fix; it does not move the 1.23:1.
2. **Thicken the day-mode `.sel` stroke** — raise `stroke-width` in the
   day-mode block so the ring reads by width rather than by contrast. Keeps
   every hue.
3. **Change the Northwest hue** — move `#0891B2` far enough from `#0078D4`
   that the ring contrasts on its own. Largest blast radius: the colour is
   also used by the region chips and the map legend.

Not blocking, and deliberately not decided by an implementer.

---

## 2. `resolveRegion()` does not trim whitespace

**Where:** `busDevGallonsCalculator.js` — `resolveRegion()` (≈lines 34–42)
uppercases its argument but never trims it, so `' TX '` matches no region and
returns `null`.

**Symptom:** a saved record whose `stateCode` carries surrounding whitespace
resolves to no region at all: the tracker shows the `—` flag, the region term
contributes 0% and the prospect-facing region bullet is omitted. Nothing
throws and no gallons move.

**Why it was deferred:** unreachable through the UI. Both state inputs are
`maxlength="2"`, so a two-character value plus a space cannot be typed. The
one bulk caller that fed it untyped data — the region-variance CSV tool — has
since been retired (**Resolved C**); the surviving CSV consumer,
`onNetworkContextCsvCompute()`, passes raw cells straight through, so a
location export with a padded `State` column would silently drop those rows
from `network-context.json`. Reaching the defect otherwise needs a hand-edited
`localStorage` record or a caller that does not exist yet. It is also an engine
change, and the review that found it was scoped to an `index.html`-only polish
task.

**Fix when picked up:** `String(stateAbbr).trim().toUpperCase()`. Add a test
for `' tx '`, `'TX\n'` and `''` at the same time — `''` must keep returning
`null`, not match something.

---

## 3. Step 3's diesel-lane field re-renders on blur and throws away focus on the field you just moved to

**Where:** `bus-dev-potential-gallons/index.html` — `supportingDetailsHtml()`,
the `#bdpg-sd-lanes` input: `oninput="…actualLanes=this.value"
onblur="BDPG.render()"`.

**Symptom:** tab or click from "Actual Diesel Lanes Observed" into the next
field and the blur fires a full `BDPG.render()`, which replaces the whole Step
3 card — including the element that just took focus. Measured: focus
`#bdpg-sd-lanes`, then focus `#bdpg-sd-name`; 80 ms later `#bdpg-sd-name` is a
different DOM node and `document.activeElement` is `<body>`. The next
keystroke goes nowhere. `#bdpg-sd-name`'s own handler is blameless — typing
into it in isolation keeps focus and the caret across repeated keystrokes.

**Why it was deferred:** pre-existing and unchanged by this branch — the same
line is present at `main:bus-dev-potential-gallons/index.html:1735`, byte for
byte. The `render()` is there on purpose (the lane-count warning below the
field is computed during render), so this is not a stray call to delete.
Surfaced by the Task 12 focus-preservation sweep, which found every other
continuous input on the page — all ten text fields, the six weight sliders and
the eight region sliders — preserving focus correctly.

**Fix when picked up:** record `document.activeElement.id` before the render
and restore focus (and `selectionStart`) after it, or narrow the blur handler
to patching just the lane-warning element instead of a full render.

---

## 4. The headline gallons figure and its ×12 annual math are built in three places

**Where:** `bus-dev-potential-gallons/index.html` — `pitchHeroHtml()` (the
`finalGallons` headline and the `finalGallons * 12` line beneath it),
`pitchBusinessCaseHtml()` (Monthly potential / Annual potential), and
`summaryText()` (the Copy Summary line "Roady's can drive X gal/mo — Z gal/yr").

**Symptom:** none today. All three currently print the same two numbers; they
already differ in *wording*, which is the visible half of the same split.

**Why it was deferred:** consolidating them is a refactor of working, verified
code — the three surfaces were each checked number-by-number against the engine
in the final whole-branch review and all agreed. Landing that refactor as the
last commit of the branch buys less than it risks. It is recorded because
`pitchSectionsHtml()` is the single-source guard for the *HTML* surfaces and
cannot reach `summaryText()` at all: Copy Summary is plain text, and it is the
one of the three that ends up pasted into a prospect's inbox, where a drifted
number would be hardest to notice and impossible to retract.

**Fix when picked up:** extract one helper returning `{ monthly, annual }` (or
the two formatted strings) from `state.result.estimate`, and have all three call
it. Decide first whether the three wordings should also converge, or whether the
hero / business case / email each legitimately need their own phrasing around
the same pair of numbers.

---

## 5. Step 2's state-code input parks the caret at the end after every keystroke

**Where:** `bus-dev-potential-gallons/index.html` — `onStateInput()`. The handler
replaces `#bdpg-step2` wholesale via `outerHTML`, which destroys the focused
`#bdpg-state` input, then refocuses the replacement with
`input.setSelectionRange(input.value.length, input.value.length)`.

**Symptom:** focus and the typed character both survive, but the caret moves to
the end of the field rather than staying where it was. Measured: seed `"D"`,
caret at 0, press `i` → value `"ID"` (correct), `selectionStart` 2, expected 1.
The other nine text inputs on the page (prospect name / street / city / GS name
/ notes / Step 0 State, and Step 3's three duplicates) all hold the caret
exactly, verified in the same pass.

**Why it was deferred:** it is the current deliberate behaviour, not an
oversight — the line is explicit and the surrounding comment explains the
refocus. The field is `maxlength="2"` and uppercase-only, so "end of field" and
"after the character I just typed" are the same position for every real typing
sequence; only a deliberate insertion in front of an existing letter differs.
Pre-existing: the handler and its `setSelectionRange` predate the rewards/pitch
branch. Recorded because the invariant checklist names caret survival in
"both state fields" and this one is a partial pass.

**Fix when picked up:** read `document.activeElement.selectionStart` before the
`outerHTML` swap and restore `Math.min(saved, input.value.length)` instead of
jumping to the end. Decide first whether end-of-field is actually wanted for a
two-character code.

---

## 6. Loading a profile whose saved `state` snapshot is missing keys throws and leaves the page inert

**Where:** `bus-dev-potential-gallons/index.html` — `step2Html()` reads
`s.amenityDetails[f]` with no guard; reached via `onLoadProfile()`.

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'showers')`.
The render aborts part-way and the page stops responding — it does not recover
without a reload. `onTrackerExport()` survives it via its own `try/catch`; the
tracker's **Load** button does not. A record whose entire `state` is `null`
fails one step earlier and just as hard:
`TypeError: Cannot set properties of null (setting 'result')` from
`onLoadProfile()` itself. Both reproduced again in the Task 12 sweep.

**Why it was deferred:** not reachable with any profile a user can actually
have. The pre-extraction dashboard build (`8e22110`) was served and its own Save
button driven: every record it writes carries `"amenityDetails":{}`, because
both builds deep-clone a state literal that contains the key. That exact
base-written record was then pasted into the current build and opened with the
new tracker **Load** — it loads cleanly. So does a realistic 5-region legacy
record. The crash requires hand-editing `localStorage` to delete the key or to
null out `state`.

Nor is the path new. Base `8e22110` already had a **Load** button (in the old
"My Profiles" modal), the same `onLoadProfile()` with no defaulting, and the
same unguarded access; stripping the key there reproduces the identical error.
The tracker added a second door to an already-open room.

**Fix when picked up:** default `state` to `{}` and `amenityDetails` to `{}` in
`onLoadProfile()`, alongside the `prospect` and `preEvalOpen` defaults already
there, and guard the read in `step2Html()`.

---

## 7. A profile without `truckerPathRating` renders `Trucker Path Rating NaN`

**Where:** same file, the Step 2 rating display.

**Symptom:** the literal string `NaN` on screen instead of a value or `—`.
Cosmetic — nothing throws and no stored number is wrong.

**Why it was deferred:** same evidence as #6. The base build always writes
`"truckerPathRating":""`, and a base-written record loaded into the current
build renders `—` correctly. Only hand-edited storage reaches it.

**Fix when picked up:** apply the same `isNum()` guard used by
`trackerRowHtml()` and `trackerStatsHtml()`, degrading to `—`.

---

## 8. GS Performance Metrics charts never render

**Where:** `index.html` — `renderGSMetrics()` calls `mkchart('mss-c1')` …
`mkchart('mss-c4')`, but the canvases in the markup are `gs-c1` … `gs-c4`.
`mkchart()` silently no-ops on an unknown id, so all four panels stay blank with
no console error.

**Why it was deferred:** predates all of this work — confirmed present in
`git show 5ddf34d:index.html`. Unrelated to the Bus Dev Potential Gallons tool.

**Fix when picked up:** align the ids. Decide which pair is canonical before
editing, since either the four `mkchart()` calls or the four canvas ids change.

---

## 9. Unterminated HTML comment renders stray `═══ -->`

**Where:** `index.html`, near line 2199.

**Symptom:** literal `═══ -->` text visible in the rendered dashboard.

**Why it was deferred:** pre-existing and cosmetic.

---

## 10. Dashboard Overview territory map is unreachable through the UI

**Where:** `index.html` — the panel holding the territory map has no visible tab
button, and neither map auto-renders from nav in a data-less environment. Both
render correctly when their function is called directly, so this is a missing
entry point, not a broken map.

**Why it was deferred:** proven pre-existing by serving `8e22110` side-by-side
with identical behaviour. Out of scope for the extraction work.

---

## 11. Dashboard MASTER LOCK defaults to locked

**Where:** `index.html`. PIN `1234`. Noted only because it makes automated
probes of the dashboard read as empty until unlocked — expected behaviour, not a
defect. Recorded so the next person debugging a blank dashboard does not lose
time to it.

(Unrelated to the calculator's own admin PIN, which is deliberately **unset**
by default and has no hardcoded value anywhere — see
`BDPG.ADMIN_PIN_KEY` / `BDPG.storedAdminPin()`.)

---

## 12. Tracker Summary's Grade Distribution aggregates across weight scales without a marker

**Where:** `bus-dev-potential-gallons/index.html` — `BDPG.trackerStatsHtml()`
(≈line 4195): the `Avg Official Subtotal` stat (≈4247) and the
`Grade Distribution` chips (≈4251).

**Symptom:** every tracker *row* honestly marks a letter computed under other
weights (`⚠ other weights` / `⚠ weights unknown`), but the summary chips
(`A ×1  B ×1  C ×1  D ×1`) count those letters together with nothing saying they
are not on one scale. The same argument now applies to the `Avg Official
Subtotal` figure, since the final fix round added a per-row `⚠ other region %`
marker for stored gallons computed under a different region adjustment.

**Why it was deferred (final whole-branch review, M-4):** it is the aggregate
form of the per-row stamping this branch already built twice (grade weights,
then region %), and it wants its own decision about what a mixed-scale
distribution should *display* — count only same-scale rows, split the chip, or
caption the block — rather than a marker bolted on as a last commit. No data is
wrong; the roll-up is simply less qualified than the rows beneath it.

---

## 13. "Region performance" can never read green out of the box, so Pre-Eval can never say "Strong candidate"

**Where:** `bus-dev-potential-gallons/index.html` — the Pre-Evaluation region
chip (`c2`, ≈line 1673) and the `judged` chip set (≈1736–1738).

**Symptom:** `region_variance.json` ships all zeros, so the region-performance
chip reads "0% (not configured)" — yellow — for every prospect, and because
chips 1–4 are the judged set the **Overall signal can never reach "Strong
candidate"** on a fresh install. Verified: the same prospect flipped Moderate →
Strong only after an admin set +7.5%.

**Why it is recorded rather than fixed (final whole-branch review, M-5):** the
chip is honest — there genuinely is no configured variance — so this is a
product observation, not a defect. It is worth the user's attention because
this branch has just added the real per-region 12-month figures
(`BDPG_NETWORK_BASELINES`), which would make that chip meaningful as display
context without touching the formula. That would be a deliberate design change
to what the chip measures, not a bug fix.

---

## 14. The amenity bullet claims a network comparison the config cannot support

**Where:** `bus-dev-potential-gallons/index.html` — the amenity driver bullet
says the site's amenity rating "places you above the network average for driver
satisfaction."

**Symptom:** `AMENITY_ADJUST` supports "above the **Average band**" — a fixed
config threshold — not "above the **network average**", which would require
amenity data across the network that this tool does not have. The page says so
itself: the amenity chart's own caption reads "No network average available
yet."

**Why it was deferred:** this is the same defect as the region bullet fixed in
`856f7de`, in a weaker form. It differs in two ways that keep it off the
critical path: the number behind it is fixed config rather than an
admin-adjustable slider, so it cannot drift; and it sits on the **internal**
half, so it never reaches the customer. Found during the final re-review, after
the branch's last fix round.

**Fix when picked up:** reword to name the band ("above the Average amenity
band"), or supply real network amenity data and keep the comparison. Do not
leave it claiming a measurement the tool cannot make.

---

## 15. A no-op baseline re-click marks a saved profile dirty

**Where:** `bus-dev-potential-gallons/index.html` — `onBaselineCardClick()`
clears `autoSetNote` unconditionally, while invalidating the result only on a
real profile/roadway change.

**Symptom:** after a Location Type auto-set, re-clicking the **already
selected** baseline card changes no data but clears the note, which flips
`stateSig()` and makes `hasUnsavedWork()` true. The rep is then prompted to
discard changes they did not make. Reproduced end to end: clean after Save →
no-op re-click → prompt on Load, with the result itself intact.

**Why it was deferred:** pre-existing — introduced by `083cc38` (2026-09-23),
confirmed an ancestor of this branch's base `74027bf`. It needs a deliberate
no-op click to reach, and `autoSetNote` is genuinely serialized, re-rendered and
restored from the snapshot, so excluding it from the signature is not obviously
right either — a record really does differ without it. Wants a decision about
whether the note is data or chrome, which is more than a last-commit change.

**Fix when picked up:** either make the clear conditional on a real change
(matching the invalidation guard one line above it), or decide the note is
chrome and add it to `SIG_SKIP`. Not both.

---

# Resolved

Kept for the evidence, not as work. Nothing below needs doing.

## A. (was an earlier #3) Open question: should Generate be gated on an explicit amenity confirmation?

**The question:** `step2Html()` adopted `suggestAmenityLevel()`'s result
whenever `amenityOverridden` was false, and `suggestAmenityLevel({})` returns
the bottom band, "Very limited" (−5%). Nothing required the rep to touch the
six amenity cards before Generate, so an unsurveyed prospect took −5% inside
`officialSubtotal` — the figure the packet advertises as reproducing Roady's
published calculator. Measured: baseline 5,000 → official 4,750.

**Resolved:** the user answered **yes**, and the gate was implemented on the
`feat/bdpg-8-regions-admin-tools` branch in commits `c5bd3da` (the gate) and
`cd1335f` (moving it to the chokepoint). It is gated on *confirmation* —
`BDPG.amenityConfirmed()` requires `amenityOverridden === true` **and** a level
from `AMENITY_LEVELS` — exactly as this entry recommended, so a rep can affirm
"Very limited" in one click without inventing data. `suggestAmenityLevel()` was
left alone, so no already-saved profile's `officialSubtotal` moved.

The gate lives as the **first statement of `BDPG.onGenerate()`**, not only on
the button's `disabled` attribute. That matters: `BDPG.onTrackerExport()` calls
`onGenerate()` directly, and the first version of the fix guarded the button
only — an unconfirmed legacy profile still produced the −5% figure and reached
`window.print()` by the one route that hands paper to a customer.
`onTrackerExport()` also pre-checks the saved record's own fields so the rep
gets "open it and confirm one in Step 2" rather than a generic failure.
Re-verified in the Task 12 checklist: button disabled while unconfirmed,
direct `onGenerate()` returns false with `state.result` still null, and the
tracker Export path reaches `print()` zero times.

## B. (was #2 in the pre-clamp numbering) The region-variance percentage was printed verbatim to a prospect with no plausibility bound

**The defect:** `pitchDrivers()` rendered "The {region} region runs {x}% above
the network average" straight from `effectiveRegionPct()`, and the override
feeding it was written by the region-variance CSV tool (`onRegionCsvCompute()`,
since retired — **Resolved C**) with no clamp. Reproduced on the previous
branch: the packet read **"The West region runs 163.2% above the network
average"** with a math line of
`2,500 × (1 + 1.632 − 0.05 + 0.00) = 6,455`.

**Resolved:** by the ±10 clamp added in Task 7 of the
`feat/bdpg-8-regions-admin-tools` branch (commit `993084d`). A single
`BDPG.REGION_PCT_BOUND = 10` plus `BDPG.clampRegionPct()` now bounds the value
at every point it can reach the formula or the screen — the slider's
`min`/`max`, the rendered readout, `effectiveRegionPct()`, Reset and Save — so
no stored number, however it got there, can produce a percentage outside ±10.
Verified in the Task 12 checklist against a hand-edited override of +500/−500
and against a CSV fixture computing +85.2%/−97.9%: every one of the eight
regions read back within ±10 through `effectiveRegionPct()`, the sliders and
the internal chips, and `estimate.regionPct` reached the formula as 0.1.

This entry recommended bounding the value *where it is produced*. It is bounded
on read instead, which protects strictly more callers. The producer that made
that distinction matter — the CSV tool, the only path that ever generated an
out-of-band figure — no longer exists, so the remaining half of this entry's
"decide what an out-of-band result should do" is closed too: see
**Resolved C**. The read-side clamp stays, and remains the guarantee for every
other way a number can reach `roadysBDPGRegionOverride`, hand-editing included.

## C. (was #2 until this commit) The region-variance CSV tool computed a figure the config already carried, and silently truncated it

**The defect:** `BDPG.onRegionCsvCompute()`, the ⚙ Weights tab's "Compute
Region %" tool, averaged each region's gallons against the network average
from an uploaded per-location CSV. That is the same quantity
`BDPG_NETWORK_BASELINES` now encodes as committed config, computed from the
real 12-month network report (227 locations) rather than from whatever CSV
happened to be to hand. And since the ±10 clamp landed (**Resolved B**), the
tool's output could not reach the formula as computed: a fixture producing
Northwest +85.2% and West −97.9% was truncated to +10.0 / −10.0.

An earlier version of this entry claimed an admin "reads 'Northwest: 85.2' in
the message" while the slider sat at 10.0. That could never happen — the
confirmation line was written into `#bdpg-csv-result` and then `BDPG.render()`
replaced `#bdpg-content`'s `innerHTML` wholesale, so the message rendered for
zero frames. Both halves were then fixed in the final fix round (`856f7de`,
`042cb1d`): the message moved into `BDPG.state.csvResultMsg` so it survived a
render, and the compute clamped at the write as well as the read and said how
many regions were truncated.

**Resolved — retired, not fixed.** The user's ruling on the remaining options
(redirect it to write context, or retire it) was to **retire it**: it computes
what `BDPG_NETWORK_BASELINES` already encodes, the ±10 clamp makes its output
misleading, and a tool that silently truncates is worse than no tool. Removed
on `feat/bdpg-8-regions-admin-tools` in the branch's final commit:
`regionCsvHtml()`, `onRegionCsvFile()`, `onRegionCsvCompute()`,
`csvResultHtml()`, the `BDPG.regionCsv` state object, `state.csvResultMsg` and
its `SIG_SKIP` entry, the two `csvResultMsg = null` clears in
`onSaveRegionOverride()` / `onClearRegionOverride()`, and the call site in
`adminPanelHtml()`. The element ids `bdpg-csv-result`, `bdpg-csv-state-col`
and `bdpg-csv-gal-col` are gone with it.

**Deliberately kept:** `BDPG.parseCsv()`, which the tool *shared* with the
network-context generator, and the generator itself
(`onNetworkContextCsvCompute()` and its "Regenerate network-context.json"
disclosure) — a different tool that regenerates `network-context.json` and
stays. Verified after removal: the generator parses an 11-row fixture and
emits all 8 regions, quoted fields and `""` escapes still parse, and no
console error appears on load.

The ±10 clamp and the region sliders are untouched: Save, Reset, Clear
override, the Texas slider and the write-side clamp all still behave exactly
as **Resolved B** describes. The manual ±10 slider is now the only writer of
`roadysBDPGRegionOverride`.
