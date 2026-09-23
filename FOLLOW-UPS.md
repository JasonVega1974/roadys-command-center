# Known follow-ups

Defects found during development and deliberately deferred, with the evidence
behind the decision. None is a blocker; each was proven not to affect data a
real user already has. Newest first.

---

## 1. Loading a profile without `amenityDetails` throws and leaves the page inert

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

## 2. A profile without `truckerPathRating` renders `Trucker Path Rating NaN`

**Where:** same file, the Step 2 rating display.

**Symptom:** the literal string `NaN` on screen instead of a value or `—`.
Cosmetic — nothing throws and no stored number is wrong.

**Why it was deferred:** same evidence as #1. The base build always writes
`"truckerPathRating":""`, and a base-written record loaded into the current
build renders `—` correctly. Only hand-edited storage reaches it.

**Fix when picked up:** apply the same `isNum()` guard used by
`trackerRowHtml()` and `trackerStatsHtml()`, degrading to `—`.

---

## 3. GS Performance Metrics charts never render

**Where:** `index.html` — `renderGSMetrics()` calls `mkchart('mss-c1')` …
`mkchart('mss-c4')`, but the canvases in the markup are `gs-c1` … `gs-c4`.
`mkchart()` silently no-ops on an unknown id, so all four panels stay blank with
no console error.

**Why it was deferred:** predates all of this work — confirmed present in
`git show 5ddf34d:index.html`. Unrelated to the Bus Dev Potential Gallons tool.

**Fix when picked up:** align the ids. Decide which pair is canonical before
editing, since either the four `mkchart()` calls or the four canvas ids change.

---

## 4. Unterminated HTML comment renders stray `═══ -->`

**Where:** `index.html`, near line 2199.

**Symptom:** literal `═══ -->` text visible in the rendered dashboard.

**Why it was deferred:** pre-existing and cosmetic.

---

## 5. Dashboard Overview territory map is unreachable through the UI

**Where:** `index.html` — the panel holding the territory map has no visible tab
button, and neither map auto-renders from nav in a data-less environment. Both
render correctly when their function is called directly, so this is a missing
entry point, not a broken map.

**Why it was deferred:** proven pre-existing by serving `8e22110` side-by-side
with identical behaviour. Out of scope for the extraction work.

---

## 6. Dashboard MASTER LOCK defaults to locked

**Where:** `index.html`. PIN `1234`. Noted only because it makes automated
probes of the dashboard read as empty until unlocked — expected behaviour, not a
defect. Recorded so the next person debugging a blank dashboard does not lose
time to it.
