# Known follow-ups

Defects found during development and deliberately deferred, with the evidence
behind the decision. None is a blocker; each was proven not to affect data a
real user already has. Newest first. Items closed by later work move to
**Resolved** at the bottom rather than being deleted, so the evidence that
produced them stays findable.

Entries 1 and 2 are **awaiting a decision from the user**, not implementation
work waiting for a slot.

---

## 1. Awaiting a decision: the day-mode map selection ring is rescued by a night-mode artifact

**Where:** `bus-dev-potential-gallons/index.html` — `#bdpg-usa-svg path.sel`
(≈line 118) sets `stroke:var(--accent); stroke-width:2.2;
filter:drop-shadow(0 0 7px rgba(0,200,255,.7))`, and the day-mode override
(≈line 36) re-points **only** the stroke colour:
`body.day-mode #bdpg-usa-svg path.sel{stroke:var(--accent);}`.

**Symptom:** in day mode `--accent` is `#0078D4` and the Northwest fill is
`#0891B2`. Computed relative luminances are 0.1819 and 0.2352, giving a
contrast ratio of **1.23:1** between the selection ring and the shape it is
supposed to outline — well under any legibility threshold. Dark mode is clean
(ring `rgb(0,200,255)` on `rgba(8,145,178,.85)`). What keeps day mode usable
is the `drop-shadow` glow, which is hardcoded cyan and **not theme-scoped**:
the light theme is leaning on a dark-theme value that nothing guarantees will
stay.

**Why it is not being fixed here:** the teal is the user's own colour choice
and the 8-region palette shipped with their conditional approval, so which
remedy to take is theirs. All three are cheap and none needs the other:

1. **Theme-scope the glow** — add a `body.day-mode …path.sel{filter:…}` rule
   using a day-appropriate colour, so the ring stops depending on a cyan value
   that only makes sense at night. Smallest change, keeps every hue.
2. **Thicken the day-mode `.sel` stroke** — raise `stroke-width` in the
   day-mode block so the ring reads by width rather than by contrast. Also
   keeps every hue.
3. **Change the Northwest hue** — move `#0891B2` far enough from `#0078D4`
   that the ring contrasts on its own. Largest blast radius: the colour is
   also used by the region chips and the map legend.

Not blocking, and deliberately not decided by an implementer.

---

## 2. Open decision: `onRegionCsvCompute()` is now largely redundant and is silently truncated

**Where:** `bus-dev-potential-gallons/index.html` — `BDPG.onRegionCsvCompute()`
(≈line 970), the ⚙ Weights tab's "Compute Region %" tool.

**What changed:** the tool computes each region's average gallons against the
network average from an uploaded per-location CSV. That is the same quantity
`BDPG_NETWORK_BASELINES` now encodes as committed config, from the real
12-month network report (227 locations) rather than from whatever CSV happens
to be to hand. And since the ±10 clamp landed in `effectiveRegionPct()`, its
output no longer reaches the formula as computed: a fixture producing
Northwest +85.2% and West −97.9% is truncated to +10.0 / −10.0 before it can
affect anything.

**Symptom (corrected 2026-09-24 — the earlier description of this entry was
wrong):** this entry used to say an admin "reads 'Northwest: 85.2' in the
message" while the slider sat at 10.0. That could never happen. The
confirmation line was written into `#bdpg-csv-result` and then `BDPG.render()`
replaced `#bdpg-content`'s `innerHTML` wholesale, destroying the element it had
just been written to — the message rendered for **zero frames** and the only
feedback an admin ever got was the sliders visibly moving. So option 1 below
would have fixed nothing on its own.

Both halves are now fixed (final fix round, whole-branch review M-1/M-2):

- The confirmation lives in `BDPG.state.csvResultMsg` and is re-emitted by
  `BDPG.csvResultHtml()` on every render, so it survives and is actually read.
  It is cleared by a new upload and by Save/Clear override, so it can never
  describe numbers that are no longer in force.
- `onRegionCsvCompute()` now clamps **at the write** as well as the read, so
  `roadysBDPGRegionOverride` never holds an out-of-contract value, and the
  message states how many regions were truncated.

That makes **option 1 done**. The remaining question — options 2 and 3 — is
still open and still a product call.

**Why it was not decided here:** retiring or redirecting a working admin tool
is a product call. Three options, all coherent:

1. ~~**Leave it truncating** and make the confirmation line print the clamped
   values (and say they were clamped), so the three surfaces agree.~~
   **Implemented 2026-09-24.** The message, the stored file, the sliders and
   the calculation now all state the same clamped numbers.
2. **Redirect it to write context** — have it produce `BDPG_NETWORK_BASELINES`-
   shaped display figures instead of a formula override, which is what the
   unclamped range −43.3%…+76.1% is actually good for.
3. **Retire it** — `BDPG_NETWORK_BASELINES` already carries the committed
   numbers, and the ±10 slider already covers manual nudges.

Whichever is chosen, do not simply widen the clamp: `REGION_PCT_BOUND` is the
formula's contract, and the previous branch's packet read "the West region
runs 163.2% above the network average" precisely because that contract was not
enforced (see **Resolved B**).

---

## 3. `resolveRegion()` does not trim whitespace

**Where:** `busDevGallonsCalculator.js` — `resolveRegion()` (≈lines 34–42)
uppercases its argument but never trims it, so `' TX '` matches no region and
returns `null`.

**Symptom:** a saved record whose `stateCode` carries surrounding whitespace
resolves to no region at all: the tracker shows the `—` flag, the region term
contributes 0% and the prospect-facing region bullet is omitted. Nothing
throws and no gallons move.

**Why it was deferred:** unreachable through the UI. Both state inputs are
`maxlength="2"`, so a two-character value plus a space cannot be typed, and
`onRegionCsvCompute()` trims its own CSV cells before calling in. Reaching it
needs a hand-edited `localStorage` record or a caller that does not exist yet.
It is also an engine change, and the review that found it was scoped to an
`index.html`-only polish task.

**Fix when picked up:** `String(stateAbbr).trim().toUpperCase()`. Add a test
for `' tx '`, `'TX\n'` and `''` at the same time — `''` must keep returning
`null`, not match something.

---

## 4. Step 3's diesel-lane field re-renders on blur and throws away focus on the field you just moved to

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

## 5. The headline gallons figure and its ×12 annual math are built in three places

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

## 6. Step 2's state-code input parks the caret at the end after every keystroke

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

## 7. Loading a profile whose saved `state` snapshot is missing keys throws and leaves the page inert

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

## 8. A profile without `truckerPathRating` renders `Trucker Path Rating NaN`

**Where:** same file, the Step 2 rating display.

**Symptom:** the literal string `NaN` on screen instead of a value or `—`.
Cosmetic — nothing throws and no stored number is wrong.

**Why it was deferred:** same evidence as #7. The base build always writes
`"truckerPathRating":""`, and a base-written record loaded into the current
build renders `—` correctly. Only hand-edited storage reaches it.

**Fix when picked up:** apply the same `isNum()` guard used by
`trackerRowHtml()` and `trackerStatsHtml()`, degrading to `—`.

---

## 9. GS Performance Metrics charts never render

**Where:** `index.html` — `renderGSMetrics()` calls `mkchart('mss-c1')` …
`mkchart('mss-c4')`, but the canvases in the markup are `gs-c1` … `gs-c4`.
`mkchart()` silently no-ops on an unknown id, so all four panels stay blank with
no console error.

**Why it was deferred:** predates all of this work — confirmed present in
`git show 5ddf34d:index.html`. Unrelated to the Bus Dev Potential Gallons tool.

**Fix when picked up:** align the ids. Decide which pair is canonical before
editing, since either the four `mkchart()` calls or the four canvas ids change.

---

## 10. Unterminated HTML comment renders stray `═══ -->`

**Where:** `index.html`, near line 2199.

**Symptom:** literal `═══ -->` text visible in the rendered dashboard.

**Why it was deferred:** pre-existing and cosmetic.

---

## 11. Dashboard Overview territory map is unreachable through the UI

**Where:** `index.html` — the panel holding the territory map has no visible tab
button, and neither map auto-renders from nav in a data-less environment. Both
render correctly when their function is called directly, so this is a missing
entry point, not a broken map.

**Why it was deferred:** proven pre-existing by serving `8e22110` side-by-side
with identical behaviour. Out of scope for the extraction work.

---

## 12. Dashboard MASTER LOCK defaults to locked

**Where:** `index.html`. PIN `1234`. Noted only because it makes automated
probes of the dashboard read as empty until unlocked — expected behaviour, not a
defect. Recorded so the next person debugging a blank dashboard does not lose
time to it.

(Unrelated to the calculator's own admin PIN, which is deliberately **unset**
by default and has no hardcoded value anywhere — see
`BDPG.ADMIN_PIN_KEY` / `BDPG.storedAdminPin()`.)

---

## 13. Tracker Summary's Grade Distribution aggregates across weight scales without a marker

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

## 14. "Region performance" can never read green out of the box, so Pre-Eval can never say "Strong candidate"

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

# Resolved

Kept for the evidence, not as work. Nothing below needs doing.

## A. (was #3) Open question: should Generate be gated on an explicit amenity confirmation?

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

## B. (was #2) The region-variance percentage was printed verbatim to a prospect with no plausibility bound

**The defect:** `pitchDrivers()` rendered "The {region} region runs {x}% above
the network average" straight from `effectiveRegionPct()`, and the override
feeding it was written by `onRegionCsvCompute()` with no clamp. Reproduced on
the previous branch: the packet read **"The West region runs 163.2% above the
network average"** with a math line of
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
on read instead, which protects strictly more callers, but it does mean
`onRegionCsvCompute()` still stores and still displays the raw figure — the
remaining half of this entry's "decide what an out-of-band result should do"
now lives on as open entry **#2** above.
