# Admin card hide/show — schema and containment plan

> **Status: awaiting owner approval of the schema before implementation.**
> Decisions recorded in
> `.superpowers/sdd/2026-10-28-membership-growth-model/QUEUED-card-hide-decisions.md`.

**Goal:** an admin can hide any card in the Membership Growth Model; hidden
means hidden for every signed-in viewer; hides are reversible from one place.

**Tech:** no new dependencies. Supabase (existing anon-key client plus the
`mgm_is_admin()` gate), one new table, plain DOM.

## Global Constraints

- The repo is PUBLIC and the anon key is in committed HTML, so `anon` is the
  public internet. `anon` holds nothing on the new table.
- Never commit a P&L actual. No new typed-entry field in the browser for P&L
  data.
- Database-level enforcement via `mgm_is_admin()`, never a UI gate alone.
- One quantity, one field. No paired state that must agree by convention.
- Any change on the disclosure/leak-guard surface goes through the scoped
  review gate regardless of size. Verify at the committed HEAD (SR-12).

---

## 1. Two conflicts in the brief, resolved

**(a) "Same RLS shape as `mgm_pnl_actuals`" vs "readable by any signed-in
user".** These cannot both hold. `mgm_pnl_actuals_read` is
`USING (public.mgm_is_admin())` — admin-only — precisely because that table
holds the income statement (`sql/2026-10-28-mgm-scenarios.sql`).

**Resolution:** take the *structure* from that file (single row,
revoke-then-grant, no DELETE policy, `updated_at` trigger with pinned
`search_path`) and the *read policy* from `mgm_admins` / `mgm_scenarios`
(`USING (auth.uid() IS NOT NULL)`). That matches the stated requirement —
hidden is hidden for everyone — and the stated reasoning that this is a tidying
feature, not a permissions feature. A card layout is not the income statement;
it needs no admin-only read.

**(b) The card count.** The brief says 45. Measured in the tree today it is
**60**. Derivation in section 5, because the count *is* the allowlist and the
allowlist *is* the containment.

---

## 2. Where the state lives — the central decision

### In the database

One row, `id = 'v1'`, enforced by a CHECK so a second row cannot exist.

| column | type | purpose |
|---|---|---|
| `id` | `text` PK, `CHECK (id = 'v1')` | single-row enforcement |
| `hidden_sections` | `jsonb` NOT NULL DEFAULT `'{}'` | `{"<card-id>": true}` |
| `updated_by` | `text` NOT NULL DEFAULT `''` | audit only, never read back |
| `updated_at` | `timestamptz` | the optimistic-concurrency token |

### In memory — `MGM.uiPrefs`, NOT `MGM.state`

**This is the recommendation, and it is the whole containment argument.**

`MGM.cloudSave` (`membership-growth-model/index.html:4672`) writes
`state: rec.state` to `mgm_scenarios`, which **any signed-in user can read**.
`exportJSON` (`:3389`) serialises the same object to a file. Scenario rows
carry it too. So:

> **Anything inside `MGM.state` crosses the publish boundary.**

Putting `hiddenSections` in `MGM.state` would add a new field to all three
outbound routes and then rely on a sanitiser to keep it harmless. Keeping it in
`MGM.uiPrefs` — read from and written to `mgm_ui_prefs` only — leaves the
scenario payload **byte-identical to today**.

The answer to "does this introduce a new path that could carry or resurrect
gated P&L data" is therefore **no such path exists**, rather than *the new path
is guarded*. Verified against the code, not assumed:

| property | in `MGM.state` | in `MGM.uiPrefs` |
|---|---|---|
| bytes added to `mgm_scenarios` / `exportJSON` | yes, a new field | **none** |
| `mergeState` retain-unknown applies | **yes** — see below | no, never merged |
| sanitiser call sites required | 4 merge paths + write | 1 read + 1 write |
| `residueVerdict` must learn a new field | yes | **no** |
| `resetAll` silently unhides every card | **yes**, as a side effect | no |
| needs `hiddenSections: {}` in the committed config | yes, to make reset work | no |

**The `mergeState` hazard, measured.** `mergeState` (`membershipModel.js:365`)
recurses wherever *both* sides are plain objects, and inside that recursion its
second loop does `unknown.push(p); dst[k] = src[k]` — it retains unknown keys
**with their values verbatim, at any depth**. `hiddenSections` is a plain
object, so a saved `{"<unknown-key>": "<any string>"}` is merged in and kept.
That is the C1 copy-residue shape one level down. Four entry paths reach it:

| path | site |
|---|---|
| page load from `localStorage` | `index.html:473` |
| `importJSON` | `index.html:3444` |
| `scenarioLoad` | `index.html:5124` |
| `pullScenarios` | `index.html:5235` |

Off-state, that hazard is *absent* rather than *compensated for*. This is the
same reasoning that put the rewards rate and its basis in one field: prefer the
design where the failure cannot be expressed over the design that guards it.

### One quantity, one field

`hiddenSections` is ONE map. No `hiddenBy`, no separate visibility flag, no
per-admin attribution column. If attribution is ever wanted it goes **inside**
the value (`{"<card-id>": {at, by}}`, truthiness being the hide), never beside
it — so nothing can restore one half independently. `updated_by` on the row is
a write-only audit field the UI never reads; it describes the ROW, not a card,
so there is no per-card quantity for it to desync from.

---

## 3. The sanitiser — a value-space argument

- Keys checked against the frozen allowlist **on read and on write**. An
  unknown key is **DROPPED, not retained** — deliberately the opposite of
  `mergeState`, whose retain-unknown behaviour is exactly what let the `copy`
  residue survive a feature revert.
- Values coerced `!!v` on write; a falsey key is **deleted** rather than stored
  as `false`, so the map holds only hides and cannot accumulate dead keys.
- Non-object, `null`, or array input yields `{}`. Fails closed.

Resulting value space: `true` under a known id, and nothing else
representable. No interpolated text can land in a field whose only legal value
is `true` under a fixed key — which is the structural difference from `copy`,
whose value space was "any string".

---

## 4. Concurrency — retry the delta, not the snapshot

Read-modify-write with an optimistic token, per the brief:

1. read the row, keep `updated_at` as `seen`
2. apply **my delta** to that snapshot (`cardId → true`, or delete)
3. `update(...).eq('updated_at', seen).select()`
4. an empty returned array means another admin wrote first: re-read, re-apply
   **the same delta** to the new snapshot, retry. Bounded retries, then
   surface an error rather than looping.

**The delta is what makes merge-and-retry correct.** Retrying with my whole
*map* would re-clobber the other admin's hide, because the retry would
reinstate the stale snapshot I started from. Retrying with my *delta* ("hide
`cost-inputs`") converges and both admins' hides survive. A lost hide is cheap
to recover by re-hiding, which is why this merges rather than aborting like
`tpVaultMutateWraps`, where a lost write destroys someone's only way in.

**Noted limitation:** `updated_at` as a version token relies on two commits not
sharing a `now()` microsecond. Real but negligible here, and the failure mode is
one lost hide, not corruption. A monotonic `version bigint` bumped by the
trigger would be collision-free — flagged rather than silently substituted,
since the brief specified the `updated_at` pattern already used in this repo.

---

## 5. The allowlist — 60 ids, derived

Cards are **rendered from JS template strings** into 13 empty
`<section class="panel">` elements, so `data-card` attributes go in the
renderers, not in static markup.

| step | count |
|---|--:|
| `class="card"` elements in source | 47 |
| less the About tab's `card()` template (`:3631`) | −1 |
| plus its 8 call sites, each a real card | +8 |
| less the `tabNotes()` template (`:5359`) | −1 |
| plus its 12 call sites, one per tab except Report | +12 |
| less 2 error cards, 1 dead placeholder, `#reportSheet`, the edit-only card | −5 |
| **ids to mint** | **60** |

`tabNotes` is the reason an index- or slug-based scheme breaks: it is ONE
template rendered on 12 tabs, so it needs **one id per tab** (`cost-notes`,
`gallons-notes`, …). A single shared id would hide the notes on all twelve at
once. Six headings are template expressions and four chart titles are
**editable labels**, so a heading-slug id would change when a label is renamed
— the `SV_SIGNAGE` trap from CLAUDE.md, arriving through labels instead of
indices.

Ids are **append-only and frozen once shipped**: a saved hide refers to an id,
so renaming one orphans a hide and reusing one applies a hide to the wrong
card.

| # | tab | `data-card` id | src line | what it is |
|--:|---|---|--:|---|
| 1 | starting | `starting-groups` | 880 | Locations by group |
| 2 | starting | `starting-pipeline-status` | 901 | Pipeline status |
| 3 | starting | `starting-billing` | 909 | Billing |
| 4 | starting | `starting-model-settings` | 937 | Model settings |
| 5 | starting | `starting-ptp-unresolved` | 946 | PTP - unresolved |
| 6 | starting | `starting-notes` | 952 | per-tab Notes & assumptions (shared template) |
| 7 | additions | `additions-basis` | 972 | Basis |
| 8 | additions | `additions-roll-forward` | 996 | Roll-forward |
| 9 | additions | `additions-source-mix` | 1020 | Source mix |
| 10 | additions | `additions-scenario-compare` | 1043 | Scenario comparison (via renderCompare) |
| 11 | additions | `additions-notes` | 1045 | per-tab Notes & assumptions (shared template) |
| 12 | losses | `losses-assumption` | 1106 | Assumption |
| 13 | losses | `losses-decomposition` | 1129 | Historical decomposition (dynamic heading) |
| 14 | losses | `losses-structural-overrides` | 1155 | Structural overrides by projection year |
| 15 | losses | `losses-notes` | 1166 | per-tab Notes & assumptions (shared template) |
| 16 | pipeline | `pipeline-funnel-table` | 1218 | Funnel by stage |
| 17 | pipeline | `pipeline-horizon` | 1259 | Horizon |
| 18 | pipeline | `pipeline-load-by-owner` | 1279 | Load by owner |
| 19 | pipeline | `pipeline-by-source` | 1289 | By source |
| 20 | pipeline | `pipeline-funnel-chart` | 1301 | funnel chart (editable chart title) |
| 21 | pipeline | `pipeline-notes` | 1309 | per-tab Notes & assumptions (shared template) |
| 22 | participation | `participation-rates-ramp` | 1399 | Rates and ramp |
| 23 | participation | `participation-members-by-year` | 1419 | Participating members by year |
| 24 | participation | `participation-notes` | 1428 | per-tab Notes & assumptions (shared template) |
| 25 | gallons | `gallons-production-by-group` | 1482 | Production by group |
| 26 | gallons | `gallons-pipeline-inbound` | 1522 | Pipeline inbound |
| 27 | gallons | `gallons-region-variance` | 1536 | Region variance |
| 28 | gallons | `gallons-feed-revenue` | 1550 | Feed the revenue model |
| 29 | gallons | `gallons-notes` | 1558 | per-tab Notes & assumptions (shared template) |
| 30 | revpermember | `revpermember-drivers` | 1596 | Drivers |
| 31 | revpermember | `revpermember-reconciliation` | 1679 | Reconciliation |
| 32 | revpermember | `revpermember-revenue-by-year` | 1736 | Revenue by year |
| 33 | revpermember | `revpermember-revenue-chart` | 1750 | revenue chart (editable chart title) |
| 34 | revpermember | `revpermember-notes` | 1753 | per-tab Notes & assumptions (shared template) |
| 35 | cost | `cost-inputs` | 1789 | Inputs |
| 36 | cost | `cost-by-year` | 1812 | By year |
| 37 | cost | `cost-notes` | 1848 | per-tab Notes & assumptions (shared template) |
| 38 | staffing | `staffing-roster` | 1880 | Roster |
| 39 | staffing | `staffing-crm-not-on-roster` | 1927 | In the CRM but not on the roster |
| 40 | staffing | `staffing-notes` | 1935 | per-tab Notes & assumptions (shared template) |
| 41 | cashflow | `cashflow-cash-bridge` | 2017 | Cash bridge |
| 42 | cashflow | `cashflow-assumptions` | 2044 | Assumptions |
| 43 | cashflow | `cashflow-valuation` | 2157 | Valuation |
| 44 | cashflow | `cashflow-notes` | 2240 | per-tab Notes & assumptions (shared template) |
| 45 | historical | `historical-signups-losses` | 2346 | Annual signups and losses |
| 46 | historical | `historical-derived-attrition` | 2375 | Derived attrition |
| 47 | historical | `historical-monthly-signups` | 2403 | Monthly signups (dynamic heading) |
| 48 | historical | `historical-history-chart` | 2448 | history chart (editable chart title) |
| 49 | historical | `historical-monthly-chart` | 2452 | monthly chart (editable chart title) |
| 50 | historical | `historical-notes` | 2468 | per-tab Notes & assumptions (shared template) |
| 51 | report | `report-report-fields` | 2641 | Report fields |
| 52 | about | `about-what-this-is` | 3640 | About: what this is |
| 53 | about | `about-where-numbers-come-from` | 3654 | About: where numbers come from |
| 54 | about | `about-walkthrough` | 3728 | About: walkthrough |
| 55 | about | `about-who-can-edit` | 3836 | About: who can edit |
| 56 | about | `about-judgement-calls` | 3879 | About: judgement calls |
| 57 | about | `about-refreshing-data` | 3936 | About: refreshing data |
| 58 | about | `about-known-limitations` | 3953 | About: known limitations |
| 59 | about | `about-questions` | 4038 | About: questions |
| 60 | about | `about-notes` | 4044 | per-tab Notes & assumptions (shared template) |

**Total: 60 ids across 13 tabs.**

Per tab: starting 6, additions 5, losses 4, pipeline 6, participation 3, gallons 5, revpermember 5, cost 3, staffing 3, cashflow 4, historical 6, report 1, about 9

### Deliberately NOT given an id

| src line | why |
|--:|---|
| 442 | fatal engine-load error card - replaces document.body; hiding it would suppress a fatal error |
| 830 | per-tab render-error card - the only thing shown when a tab throws |
| 848 | dead code: all 13 tabs have an explicit renderer, so the placeholder never fires |
| 2674 | #reportSheet IS the report - hiding it empties the Report tab |
| 3631 | template, not a card - its 8 call sites are the cards |
| 5359 | template, not a card - its 12 call sites are the cards |
| 5367 | edit-mode-only "Tab names" card - already conditional; an id nothing would use |
