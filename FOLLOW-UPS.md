# Known follow-ups

Defects found during development and deliberately deferred, with the evidence
behind the decision. None is a blocker; each was proven not to affect data a
real user already has. Newest first. Items closed by later work move to
**Resolved** at the bottom rather than being deleted, so the evidence that
produced them stays findable.

Entry 1 is a **pre-existing layout bug surfaced by other work**, not a
regression from it — it reproduces byte-for-byte on `3104ce9`. It is filed
rather than fixed because the fix is a box-model change the print path
already depends on.

---

## 1. In day mode, everything past the first viewport renders on the dark app background

**Where:** `bus-dev-potential-gallons/index.html` — the
`html,body{height:100%;background:var(--bg);...}` rule, against
`body.day-mode` re-pointing `--bg` on **`body` only**. `:root` (i.e. `html`)
keeps `--bg:#080C18`.

**Symptom:** in day mode the page renders light for exactly one viewport
height and dark navy below it. Because `html` carries its own `background`,
`body`'s background does **not** propagate to the canvas the way it normally
would; `body` paints only its own box, and `height:100%` pins that box to the
viewport. Everything past it — on a generated result that is most of the page,
including the whole pitch stack and the tracker — sits on `#080C18` with
day-mode text colours over it.

Measured, day mode, a generated result on screen:

| | |
|---|---|
| `getComputedStyle(html).backgroundColor` | `rgb(8, 12, 24)` |
| `getComputedStyle(body).backgroundColor` | `rgb(240, 242, 245)` |
| `body.getBoundingClientRect().height` | 1000 (the viewport) |
| `document.documentElement.scrollHeight` | 4446 |

**Pre-existing, and confirmed so rather than assumed.** HEAD bytes
(`3104ce9`) were served alongside the working tree and driven to the same
state: identical values, identical banding. It is also the exact mechanism
the `@media print` block's own comment already documents — "html carries its
own `background:var(--bg)` (see the `:root` block), so body's white does NOT
propagate to the print canvas -- everything past the first viewport-height
prints on the dark app background." That comment fixed the **print** half by
putting `.bdpg-print-mode` on `html`; the on-screen half was never addressed.

**Why it is filed rather than fixed:** it is unrelated to the amber recolour
and was found while screenshotting it. It is also more *visible* now — a warm
accent against a cold dark band reads as a rendering fault in a way the
previous cool cyan did not — which is a reason to decide about it, not a
reason for a recolour commit to reach into the page's box model. The fix is
one line but it is a layout change, and the print path already depends on
this exact arrangement.

**Fix when picked up:** either drop `background:var(--bg)` from the `html`
half of the `html,body` rule (letting body's background propagate to the
canvas as it normally would), or give `body.day-mode` a matching `html`-level
background. Prefer the first: it removes the special case instead of adding a
second one. Check the `@media print` block either way —
`html.bdpg-print-mode{background:#fff}` exists precisely because `html` is
currently painted, and would become redundant rather than wrong.
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


## D. (was #1) The day-mode map selection ring did not contrast with the teal Northwest fill

**Was:** in day mode the ring took `--accent` (`#0078D4`) and the Northwest
fill is `#0891B2`. Ring vs the solid teal measured **1.23:1**; against the
0.85-alpha fill as actually composited on the white card, **1.51:1**. Two
mid blue-greens, so no amount of theme-scoping the ring's own blue could
move it — as the 2026-09-24 glow fix (option 1) proved by not moving it.

**Fixed 2026-09-25** by the amber recolour, and not by any of the three
options the entry listed. Recolouring `--accent` to amber
(`#F59E0B` dark / `#B45309` day) forced the question the entry had been
holding: amber sits *inside* the eight-region palette's hue range, between
Midwest `#FFD60A` and Southwest `#FF6B35`, so the ring could not follow the
accent at all. It was decoupled to **white** in both themes instead — the one
hue not adjacent to anything on the map — and the drop-shadow followed it.

Measured on the same page and the same rendering engine, HEAD bytes vs
working-tree bytes, ring against the active region's 0.85-alpha fill
composited on its card:

| ring vs fill | before | after |
|---|---|---|
| **day, Northwest teal** | **1.51:1** (1.23:1 vs solid `#0891B2`) | **3.01:1** (3.68:1 vs solid) |
| dark, Northwest teal | 2.39:1 | 4.69:1 |
| day, worst of all eight | 1.04:1 (Northeast) | 1.35:1 (Midwest) |
| dark, worst of all eight | 1.02:1 (Midwest) | 1.92:1 (Midwest) |

Confirmed visually as well as numerically: on HEAD, day-mode Washington reads
as a slightly darker teal blob with no discernible outline; with the white
ring it is unambiguously outlined. Screenshots were taken of both.

**What this did not fix, and what closed that too:** going to plain white
moved the worst case to Midwest yellow at 1.35:1 — a regression for that one
region, since blue measured 3.35:1 there. That was open as #1 for exactly one
commit and is now **Resolved E**: the ring is dual-tone (white stroke,
`#0A0E1A` casing) and the floor across all eight is 4.43:1 dark / 4.42:1 day.
The teal numbers in the table above improved again with it — white on the
teal fill is unchanged at 3.01:1, but the casing adds 6.40:1 alongside it.

One more thing the white change closed: the `body.day-mode …path.sel{filter:…}`
override added on 2026-09-24 is gone, because the ring is now the same two
tones in both themes and the base rule carries them. The day-mode *stroke*
override stays — it is load-bearing for specificity against
`body.day-mode #bdpg-usa-svg path{stroke:#D8DCE3}` (0-1-1-2 beats path.sel's
0-1-1-1), which was the original ab77820 bug.


## E. (was #1 for one commit) The white selection ring was marginal against the Midwest yellow fill

**Was:** the amber recolour decoupled the map's selection ring from
`--accent` and made it plain white. That fixed the teal Northwest case
(**Resolved D**) and broke Midwest instead: white on the `#FFD60A` fill
measured **1.35:1** in day mode, **1.92:1** in dark. The ring survived only
on stroke width. It was also a regression for that one region specifically —
the old `#0078D4` measured 3.35:1 there, Midwest being the one fill blue was
good at.

**Fixed 2026-09-25, same day, by stopping the search for a hue.** The lesson
across three attempts — cyan, amber, white — is that there are eight
saturated fills spanning the wheel, so **any** single ring colour is adjacent
to one of them. The ring is now **dual-tone**: a white 2.2px stroke inside a
`#0A0E1A` casing, identical in both themes. The two tones fail on opposite
fills, so the ring reads at whichever of them is stronger on that particular
region.

Ring vs the active region's 0.85-alpha fill composited on its card
(`#0D1225` dark, `#FFFFFF` day). "reads at" is max(white, casing):

| region | dark: white / casing → reads at | day: white / casing → reads at |
|---|---|---|
| West `#00D68F` | 2.56 / 7.53 → **7.53** | 1.77 / 10.86 → **10.86** |
| Southwest `#FF6B35` | 3.72 / 5.17 → **5.17** | 2.46 / 7.82 → **7.82** |
| Midwest `#FFD60A` | 1.92 / 10.01 → **10.01** | 1.35 / 14.25 → **14.25** |
| Northeast `#7C3AED` | 6.95 / 2.77 → **6.95** | 4.36 / 4.42 → **4.42** |
| Southeast `#FF4757` | 4.35 / 4.43 → **4.43** | 2.89 / 6.65 → **6.65** |
| Northwest `#0891B2` | 4.69 / 4.11 → **4.69** | 3.01 / 6.40 → **6.40** |
| Texas `#E0218A` | 5.63 / 3.42 → **5.63** | 3.76 / 5.12 → **5.12** |
| Upper Midwest `#8BC34A` | 2.79 / 6.89 → **6.89** | 1.87 / 10.31 → **10.31** |
| **floor** | **4.43:1** (Southeast) | **4.42:1** (Northeast) |

Every previous treatment, for comparison — worst case across the same eight:

| ring | dark | day |
|---|---|---|
| cyan `#00C8FF` / day blue `#0078D4` | 1.02:1 | 1.04:1 |
| amber `#F59E0B` / `#B45309` | 1.12:1 | 1.15:1 |
| plain white | 1.92:1 | 1.35:1 |
| **white + `#0A0E1A` casing** | **4.43:1** | **4.42:1** |

**Verified against rendered pixels, not only arithmetic.** Element
screenshots were decoded and scanned across the ring on the two theoretical
worst cases in each theme:

| sample | rendered |
|---|---|
| Kansas, day (Midwest, the old 1.35:1) | fill `rgb(218,184,13)`, white stroke `rgb(255,255,255)`, casing `rgb(40,77,74)` → casing vs fill **4.82:1** |
| Pennsylvania, day (Northeast, theoretical floor 4.42) | fill `rgb(106,51,206)`, stroke `rgb(244,241,223)` → white vs fill **6.21:1** |
| Georgia, dark (Southeast, theoretical floor 4.43) | fill `rgb(218,62,77)`, stroke `rgb(255,255,255)`, casing `rgb(63,27,39)` → white vs fill **4.39:1**, casing vs neighbour **3.46:1** |

Each lands at or above the arithmetic floor, so the floor is the conservative
figure and the treatment clears 3:1 on every region in both themes.

One case the arithmetic does not cover and the change also fixes: a selected
coastal or border state meeting the **page background** in day mode.
A plain white ring there was effectively invisible (white on white); the dark
casing outlines it. Visible on California.

`#0A0E1A` is not a new colour — it is the ink `#bdpg-usa-svg path` already
strokes every state border with. Against the white stroke it is 19.25:1, so
the ring reads as a deliberate object rather than a halo whatever it is over.

**Implementation note, because it is not a real second stroke.** SVG gives
one stroke per element; a true dual stroke needs a duplicated path underneath,
which means changing what the map render emits. This is three zero-offset
1.5px `drop-shadow`s composed into a casing instead. Two consequences for
whoever touches it next: the casing is **outside-only** (a drop-shadow is the
silhouette painted behind the element, so no dark line appears on the fill
side), and it is **not flat `#0A0E1A`** but a blur composited over whatever
is behind it — which is why the rendered Kansas casing samples `rgb(40,77,74)`
rather than the literal. Both are accounted for in the measurements above. If
an exact casing is ever needed, the duplicated-path route is the correct one,
and it is a render change rather than a CSS change.
