# Live state/publish, table rows, scenario-UI hide, non-admin header lockdown

> Builds on `docs/superpowers/plans/2026-10-30-mgm-hide-tiles-notes-columns.md`
> (tiles/notes/columns, #64, independently reviewed already — commits up to
> `730afe9`). This plan covers the four commits after it.

## 1. Table rows — the fourth hide type, 76 ids

Same mechanism as columns (same `mgm_ui_prefs` row, same `hiddenSections`
map, same sanitizer, same `MGM.hideSection`/`restoreSection`, same restore
panel) but simpler: a row IS one element, so `display:none` on the `<tr>` is
the whole mechanism — no position-based cell lookup the way columns need.

**Rows are structurally different from columns.** A column's identity comes
from a fixed schema (the header). Most of these tables generate ROWS from a
**mutable, admin-editable array** — add/remove/reorder already exists via
`MGM.addRow`/`removeRow`/`moveRow`. Found exactly 4 such arrays by grepping
every `MGM.rowTools(...)` call site, the shared helper behind every row's
▲▼✕ controls: `groups`, `sources`, `staffing.reps`, `history`. Any table
backed by one of these — or derived from one, like `losses-decomposition`
and `historical-derived-attrition`, both reading from `history` — has no
stable row identity and is excluded, same reasoning already applied to
`additions-source-mix`'s dynamic year columns. Also excluded: every
`HORIZON_YEARS`-bound table (same 1–10 admin-editable issue as the excluded
year columns) and every table driven by live external data this tool does
not control (CRM owner/source breakdowns, `region_variance.json`).

What's left splits into two groups, **76 rows total**:

- **Group A (54)** — rows inside the 29 column-bearing tables, keyed by a
  genuinely fixed identity: `MM.CRM_STAGES` (9), `progs` (3), `STREAM_KEYS`
  (7 × 2 tables), 2 hand-written valuation rows, and the About tab's 3
  fully-literal reference tables (6 + 13 + 7).
- **Group B (22)** — the "settings" tables that had no header row and so
  were excluded entirely from columns, but whose rows are literal and
  stable: `starting-pipeline-status`, `starting-billing`, `additions-basis`,
  `losses-assumption`, `pipeline-horizon`, `cost-inputs`,
  `cashflow-assumptions`. Ids are keyed off each row's own `data-k` path.

**Three exclusions, approved before minting:**
- Summary/total rows (5 tables had one) — hiding an aggregate in isolation
  either misleads or is redundant with hiding the whole card.
- Two single-real-row tables (`gallons-pipeline-inbound`, the reconciliation
  benchmark table) — hiding the only row is identical to hiding the
  (already hideable) card.
- `starting-model-settings`' 4 rows (Data as of / Current year / As-of
  month / Projection years) — facts about what the model represents, not
  clutter; the row-level analogue of the already-excluded leftmost identity
  columns.

**Shared fix, not duplicated**: the input-aware "does this cell have a real
value" check (`.value` over `.textContent`, needed because a form control's
`textContent` is always empty regardless of its value) was factored out of
`staleHiddenColumns` into `MGM.cellHasValue(cell)`, used by both
`staleHiddenColumns` and the new `MGM.staleHiddenRows`. A fix proven
necessary once should not need re-discovering for rows.

`MGM.hiddenSectionType` gains a fifth bucket, `row` (the `-row-` marker,
which cannot collide with `-col-`'s marker in the same id). The restore
panel's existing tab-then-type grouping picks it up for free.

Total allowlist after this commit: 287 (211 + 76), bijection verified
programmatically against the live markup, zero drift.

## 2. Scenario UI — hidden behind one reversible flag

Scenario-based sharing is being replaced by live state/publish (below). The
scenario UI surface turned out to be exactly four pieces, found by grepping
every `onclick` that calls a scenario function — there is no dedicated
scenarios tab or panel:

1. Header's "Save scenario…" button — static markup, gated with
   `style="display:none"` plus a boot-time snippet that un-hides it.
2. `authBar`'s cloud button (Sync/Refresh) — gated inline where it's built.
3. `#scenarioBar`, the "Scenario: X" banner — gated at the top of
   `MGM.renderScenarioBar()`.
4. The `additions-scenario-compare` card — gated by having
   `MGM.renderCompare()` return `''` immediately. This card is already one
   of the 287 admin-hideable ids, but that system is admin-*togglable*,
   the wrong tool here: the owner wants it gone for admins too. Returning
   `''` means the card's own `data-card` attribute never reaches the DOM,
   so the two mechanisms never fight each other.

One flag, `SCENARIOS_UI_ENABLED`, gates all four. Reversibility verified for
real: flipped to `true`, reloaded, confirmed all four pieces returned
(including the comparison card), flipped back, reloaded again.

## 3. Non-admin header lockdown

A non-admin's header now shows exactly Sign In, Theme (relabeled
`☀️/🌙 Light/Dark`), and Print. New CSS class `.mgm-adminonly`, deliberately
**not** `.mgm-editonly`: that class also requires edit *mode* toggled on,
right for inline per-row/per-card editing affordances but wrong for header
buttons — an admin should see Reset/Presets/Email draft regardless of
whether Edit happens to be on, same as before this change.

Confirmed before hiding each button that nothing a non-admin currently
relies on is lost: Edit/Reset/presets do nothing for a non-admin regardless
(write-gated server-side); Generate Report is a pure shortcut (`doPrint()`
navigates to Report itself, and the tab rail still reaches it). Email draft
was flagged explicitly since no write is involved there — owner confirmed
hiding it, reversible quickly if needed.

## 4. Live state / publish — replaces scenario-based sharing

`mgm_live_state` (`sql/2026-10-30-mgm-live-state.sql`): single row, same
structure as `mgm_ui_prefs` — read any signed-in user, write admin-only, no
DELETE, `search_path` pinned trigger, full verification block. Holds the
**full model state**, not just a UI preference.

**Concurrency is conflict detection, not the hiddenSections delta-retry
pattern — a deliberate, documented departure.** `hiddenSections`' retry
works because its delta ("toggle one key") is trivially re-appliable
against any fresh snapshot. A full state tree has admin-mutable *arrays*
(`groups`, `sources`, `history`, `staffing.reps`) where even the shape can
differ between two edits — a real delta there needs a 3-way merge, a much
harder problem than this feature needs for a two-admin team. So Publish
compares against `MGM._liveStateSeenAt` — the token from when *this
session* last synced with the published truth — and **refuses outright on
a mismatch**, never merges, never silently overwrites.

**Boot behavior, the owner's explicit decision**: never auto-load the
published row over an admin's local state on a normal reload.
- Non-admin: always resolves to the published truth (no unsaved work of
  theirs to protect — every write is refused server-side anyway).
- Admin, existing local state: untouched. The concurrency token is still
  captured silently (so a later Publish has a real baseline even on a
  device that never explicitly pulled) — *captured, not applied* is the
  distinction that keeps this safe.
- Admin, genuinely fresh device (no prior `localStorage` for this tool at
  all): bootstraps from the published state instead of the shipped
  defaults, since there's nothing local to protect.
- Explicit `MGM.pullLiveState()` is the one place local work is discarded,
  and only after a `confirm()` naming exactly that cost.

**Containment**: Publish runs the identical discipline as `MGM.cloudSave`
and `MGM.exportJSON` — `MM.stripResidue` then `MM.residueVerdict` on the
*outbound payload itself*, never trusting a strip ran upstream. This is a
new, *larger* outbound surface (the whole state, not one scenario or one
export) than either of those, so it gets the same scrutiny, not less. Not
new exposure in kind: `mgm_scenarios` already stores full-state snapshots
and is already readable by any signed-in user — Publish doesn't widen what
is exposed, only how it's delivered.

## Verification

No engine changes across all four commits — `MM.sanitizeHiddenSections` is
already generic, `MM.stripResidue`/`residueVerdict` are reused unmodified.
126/126 throughout, reconfirmed at the committed HEAD after every commit
(SR-12).

Manually verified in a browser, this project's only test surface for page
JS:
- Rows: hide/restore end to end on a Group-A and a Group-B row; restore
  panel's "Table rows" sub-group; staleness nudge both directions,
  including confirming a typed `"0"` correctly counts as real data per
  this project's absence-vs-deliberate-zero convention.
- Scenario UI: all four pieces confirmed gone, then confirmed they come
  back when the flag is flipped (not just designed to, verified live).
- Header lockdown: non-admin sees exactly 3 items; admin sees the full
  set; `.mgm-adminonly` and `.mgm-editonly` confirmed to coexist without
  conflict.
- Live state/publish: happy-path publish; conflict detection refusing a
  concurrent publish without clobbering it, confirmed the server row is
  untouched; a refused publish's retry (without pulling) still correctly
  refuses rather than silently advancing; Pull correctly discards local
  work only after an explicit confirm; containment refusing on a genuine
  strip failure (reproduced with a non-configurable property) *before*
  the confirm prompt even appears, server confirmed untouched; the normal
  strip-succeeds case publishing cleanly with no false refusal; all three
  boot paths (fresh device bootstraps, existing local state survives
  untouched while the token still updates, non-admin always gets
  published).
