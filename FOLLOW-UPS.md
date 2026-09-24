# Known follow-ups

Defects found during development and deliberately deferred, with the evidence
behind the decision. None is a blocker; each was proven not to affect data a
real user already has. Newest first.

---

## 1. The headline gallons figure and its ×12 annual math are built in three places

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

## 2. The region-variance percentage is printed verbatim to a prospect with no plausibility bound

**Where:** `bus-dev-potential-gallons/index.html` — `pitchDrivers()` renders
"The {region} region runs {x}% above the network average — your geography works
in your favor." straight from `effectiveRegionPct()`. The override that feeds it
is written by `onRegionCsvCompute()`, which applies no clamp before putting the
value in `localStorage`.

**Symptom:** reproduced during the final review by running the region CSV
generator over a small synthetic location list: the packet read **"The West
region runs 163.2% above the network average"** and the packet's own math line
read `2,500 × (1 + 1.632 - 0.05 + 0.00) = 6,455`. Nothing between the CSV upload
and the printed handout sanity-checks the figure.

**Why it was deferred:** unreachable with the data actually shipped — the
committed `region_variance.json` is all zeros, so the bullet never fires in
production. It is a data-quality guard against an implausible input, not a
defect in this branch's work, and the only path that turns it on is a GS
uploading their own CSV.

**Fix when picked up:** bound the value where it is *produced*
(`onRegionCsvCompute`), not where it is printed, so the internal region chips and
the official math line are protected too — and decide what an out-of-band result
should do: refuse the CSV, clamp with a visible warning, or store it but suppress
the prospect-facing bullet. Silently clamping a number the rep then quotes in a
call would be a worse failure than the one being fixed.

---

## 3. Open question: should Generate be gated on an explicit amenity confirmation?

**Where:** `bus-dev-potential-gallons/index.html` — `step2Html()` adopts
`suggestAmenityLevel()`'s result whenever `amenityOverridden` is false, and
`suggestAmenityLevel({})` returns the bottom band, "Very limited" (−5%). Nothing
requires the rep to touch the six amenity cards before Generate.

**Symptom:** an unsurveyed prospect takes −5% inside `officialSubtotal` — the
figure the packet advertises as reproducing Roady's published calculator — and
the leave-behind presents them as bottom-band. Measured: baseline 5,000 → official
4,750, with the packet also offering "Reaching a 'Good / full service' amenity
level moves your projection by 7.0% — about 350 gal/mo."

**What was done instead:** Step 2 now says so, unmistakably, whenever no amenity
detail has been entered and no level has been confirmed — a yellow notice naming
the assumed level, the exact percentage (read from `AMENITY_ADJUST`, not a
literal), and the fact that it lands inside the Published Calculator Figure; the
"Suggested: … — No showers, no truck parking, and no real food service." line is
replaced with "Assumed with no data", because that reason string is a statement
of fact about a site nobody has looked at.

**Why the gate itself was deferred:** blocking Generate is a behavioural change
larger than the round that surfaced this, and a rep may legitimately know the
site is sparse without having filled the cards — a hard gate would make them
enter data they do not have in order to record a judgement they do have. Whether
the tool should insist is the user's call, not the implementer's.

**Fix when picked up:** if gating is wanted, gate on *confirmation* rather than
on the six cards (`amenityOverridden === true` OR at least one card set), so a
rep can affirm "Very limited" in one click. Do **not** fix it by changing
`suggestAmenityLevel()` to return a neutral band for an empty object: that moves
`officialSubtotal` on every already-saved profile, which silently rewrites a
number a customer has already been shown.

---

## 4. Step 2's state-code input parks the caret at the end after every keystroke

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
branch. Recorded because the Task 11 invariant checklist names caret survival in
"both state fields" and this one is a partial pass.

**Fix when picked up:** read `document.activeElement.selectionStart` before the
`outerHTML` swap and restore `Math.min(saved, input.value.length)` instead of
jumping to the end. Decide first whether end-of-field is actually wanted for a
two-character code.

---

## 5. Loading a profile without `amenityDetails` throws and leaves the page inert

**Where:** `bus-dev-potential-gallons/index.html` — `step2Html()` reads
`s.amenityDetails[f]` with no guard; reached via `onLoadProfile()`.

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'showers')`.
The render aborts part-way and the page stops responding — it does not recover
without a reload. `onTrackerExport()` survives it via its own `try/catch`; the
tracker's **Load** button does not.

**Why it was deferred:** not reachable with any profile a user can actually
have. The pre-extraction dashboard build (`8e22110`) was served and its own Save
button driven: every record it writes carries `"amenityDetails":{}`, because
both builds deep-clone a state literal that contains the key. That exact
base-written record was then pasted into the current build and opened with the
new tracker **Load** — it loads cleanly. The crash requires hand-editing
`localStorage` to delete the key.

Nor is the path new. Base `8e22110` already had a **Load** button (in the old
"My Profiles" modal), the same `onLoadProfile()` with no defaulting, and the
same unguarded access; stripping the key there reproduces the identical error.
The tracker added a second door to an already-open room.

**Fix when picked up:** default `amenityDetails` to `{}` in `onLoadProfile()`,
alongside the `prospect` and `preEvalOpen` defaults already there, and guard the
read in `step2Html()`.

---

## 6. A profile without `truckerPathRating` renders `Trucker Path Rating NaN`

**Where:** same file, the Step 2 rating display.

**Symptom:** the literal string `NaN` on screen instead of a value or `—`.
Cosmetic — nothing throws and no stored number is wrong.

**Why it was deferred:** same evidence as #5. The base build always writes
`"truckerPathRating":""`, and a base-written record loaded into the current
build renders `—` correctly. Only hand-edited storage reaches it.

**Fix when picked up:** apply the same `isNum()` guard used by
`trackerRowHtml()` and `trackerStatsHtml()`, degrading to `—`.

---

## 7. GS Performance Metrics charts never render

**Where:** `index.html` — `renderGSMetrics()` calls `mkchart('mss-c1')` …
`mkchart('mss-c4')`, but the canvases in the markup are `gs-c1` … `gs-c4`.
`mkchart()` silently no-ops on an unknown id, so all four panels stay blank with
no console error.

**Why it was deferred:** predates all of this work — confirmed present in
`git show 5ddf34d:index.html`. Unrelated to the Bus Dev Potential Gallons tool.

**Fix when picked up:** align the ids. Decide which pair is canonical before
editing, since either the four `mkchart()` calls or the four canvas ids change.

---

## 8. Unterminated HTML comment renders stray `═══ -->`

**Where:** `index.html`, near line 2199.

**Symptom:** literal `═══ -->` text visible in the rendered dashboard.

**Why it was deferred:** pre-existing and cosmetic.

---

## 9. Dashboard Overview territory map is unreachable through the UI

**Where:** `index.html` — the panel holding the territory map has no visible tab
button, and neither map auto-renders from nav in a data-less environment. Both
render correctly when their function is called directly, so this is a missing
entry point, not a broken map.

**Why it was deferred:** proven pre-existing by serving `8e22110` side-by-side
with identical behaviour. Out of scope for the extraction work.

---

## 10. Dashboard MASTER LOCK defaults to locked

**Where:** `index.html`. PIN `1234`. Noted only because it makes automated
probes of the dashboard read as empty until unlocked — expected behaviour, not a
defect. Recorded so the next person debugging a blank dashboard does not lose
time to it.
