# CRM × Bus Dev Potential Gallons — Supabase Integration

Connect `CRM.html` and `bus-dev-potential-gallons/index.html` so Business
Development works one flow: a lead is researched, a value profile is built
against it, and both live in Supabase where Robert, Angel and the admin see
the same data from any browser.

Delivered in three phases. This document specifies all three; only Phase 1
has an implementation plan at the time of writing.

---

## 0. Rulings that shape everything below

These were settled before design and are not open in implementation. Each one
overrides a reading of the original brief, so they are recorded with the
reason rather than just the outcome.

### 0.1 "Contacted" already exists and already means something else

`CRM.html:1158` already ships the stage, directly after Qualified:

```js
const CRM_STAGES = ['Prospect','Qualified','Contacted','Meeting Scheduled',
                    'Proposal Sent','Negotiation','Closed Won','Closed Lost',
                    'Not Qualified'];
```

It has a colour, a Kanban column, and a position in `crmAdvanceStage()`'s walk.
**No stage is added by this work.**

It also already means "we reached out", which is not what "has a value profile"
means — a profile is frequently pre-contact research. Saving a profile from a
lead therefore **asks** rather than moves:

> Saved value profile for *Dysart's Truck Stop*.
> This lead is at **Prospect**. Move it to **Contacted**?

OK moves the lead and writes the usual `type:'stage'` activity entry. Cancel
attaches the profile and leaves the stage untouched. A lead already at Meeting
Scheduled or later is never prompted and never moved.

A silent auto-move was rejected: it would push uncontacted leads into
Contacted, and that column feeds the Kanban, the leaderboard, the auto-scheduler
and the other owner's view. The board must not assert contact that did not happen.

### 0.2 Amenities have no per-amenity percentages, and will not be given any

The six amenities do not carry individual weights. They feed one rule
(`busDevGallonsCalculator.js:128`, `suggestAmenityLevel()`) that returns one of
three levels, and only the level carries a percentage:

```js
AMENITY_LEVELS = ['Very limited', 'Average', 'Good / full service'];
AMENITY_ADJUST = { 'Very limited': -0.05, 'Average': 0.00, 'Good / full service': 0.02 };
```

Showers / Food / Scale / Parking are **core** — all four are required to reach
Average. DEF / Laundry are **tiebreakers** — core plus either reaches Good.

Inventing six percentages that sum to the band would be a formula change: two
sites with identical amenities today would receive different gallons, parity
with the official Roady's Prospective Member Gallons Calculator would break,
and every stored profile's `baselineStamp` would describe arithmetic that no
longer exists.

So the redesigned step shows each amenity's **role in the rule**, not a fake
percentage, and one real combined figure at the foot of the section:

```
#4 AMENITIES                        +2.0%
─────────────────────────────────────────
Showers    [ 4-9        v]   core ✓
Food       [ fast food  v]   core ✓
Scale      [ yes        v]   core ✓
Parking    [ 51-100     v]   core ✓
DEF        [ yes        v]   tiebreak ✓
Laundry    [ no         v]   tiebreak —
─────────────────────────────────────────
All 4 core + DEF → Good / full service
Combined amenities adjustment    +2.0%
```

Dropdown options are the real per-amenity scales from
`BDPG_CONFIG.AMENITY_DETAIL_OPTIONS`, not a uniform 1–5, because a uniform
scale would discard distinctions the rule reads:

| amenity  | options                                          |
|----------|--------------------------------------------------|
| showers  | none · 1-3 · 4-9 · 10+                           |
| food     | none · grab-and-go · fast food · full restaurant |
| scale    | yes · no                                         |
| parking  | none · 1-15 · 16-50 · 51-100 · 100+              |
| def      | yes · no                                         |
| laundry  | yes · no                                         |

### 0.3 The membership recommendation did not exist and is derived, not entered

`grep -i recommend` over the tool returns nothing. It is new. It is computed
from `finalGallons` against the network's own quartiles, so every boundary
traces to data rather than to judgement.

Source: `network-locations.json`, `avgGalMo` across the 190 locations that
report gallons — p25 = 1,480 · median = 6,059 · p75 = 17,455 · p90 = 38,868.

| finalGallons    | recommendation  | network basis        |
|-----------------|-----------------|----------------------|
| ≥ 17,500        | Strong fit      | ≥ p75 (17,455)       |
| 6,000 – 17,499  | Good fit        | ≥ median (6,059)     |
| 1,500 – 5,999   | Marginal        | ≥ p25 (1,480)        |
| < 1,500         | Below threshold | bottom quartile      |

Because it is derived, it is recomputable for profiles saved before it
existed, and it is stored on the row so the CRM never has to load the
calculator to render a card.

### 0.4 The anon key is public, so RLS is authenticated-only

`ROADYS_SB_ANON` is inline at `CRM.html:1080` in a repo published to GitHub
Pages. Anyone who views source holds it. `crm_leads` currently pairs that with
permissive RLS and `GRANT … TO anon`, so **today any stranger can read, edit
and delete every lead** — that is true before this work begins.

Both tables move to `auth.uid() IS NOT NULL`, with `anon` granted nothing.

**The allowlist is the user list itself.** Sign-ups are disabled in the
Supabase dashboard (Authentication → Providers → Email → *Enable sign ups* off)
and the three accounts are created there by hand. No email list appears in
code, because any list in a public bundle is advisory rather than enforcing.

### 0.5 The draft layer already exists and is rewritten, not replaced

Draft autosave and "Save to Prospects" shipped on `main` in merge `3304ebf`.
They are localStorage-only, 2000 ms, and "Prospects" means the tool's own
tracker table rather than CRM leads.

Phase 1 re-points that layer at Supabase at 800 ms with localStorage as the
offline mirror — the pattern `CRM.html` already uses for leads. The existing
behaviour that is **kept**, because it is built and verified:

- restore-on-load before the first render, with `savedSig = ''` so a restored
  draft still counts as unsaved work (`restoreDraft()`)
- corrupt/hostile draft hardening in `readDraft()` — non-objects, arrays,
  wrong-typed fields, prototype-polluting `locationType`, markup in a field
- quota/private-mode failure reported on the indicator instead of a false
  "Draft saved"
- flush on `pagehide`, and on Save
- the `Clear draft` confirm that also empties the card

---

## 1. Shared module: `roadysBD.js`

Both apps need the same session, the same profile shape and the same
recommendation bands. The repo's current habit is each page redeclaring
`getRoadysSB()`; three copies of this logic would drift.

One new UMD file at the repo root, loaded by `CRM.html`, the calculator and
`implementation.html`, matching how `busDevGallonsConfig.js` /
`busDevGallonsCalculator.js` / `bdpgStats.js` are already shared. No DOM
access, so it stays unit-testable under `node --test`.

```
RoadysBD.auth
  .client()                  → the one Supabase client (lazily created)
  .session()                 → current session or null
  .signIn(email, password)   → {ok, error}
  .signOut()
  .init()                    → restores a stored session, resolves it or null

(An earlier draft of this section listed `requireSession(onReady)`. It was not
built: rendering a login gate needs the DOM, and this module is deliberately
DOM-free so it stays unit-testable under `node --test`. The gate therefore
lives in each page as `bdShowLoginGate`, three byte-identical copies. That
duplication is a real cost and §1's own argument against drift applies to it;
a DOM-guarded `requireSession` in the module would be the better answer and is
left to Phase 2.)

RoadysBD.profiles
  .forLead(leadId)           → the lead's final profile, or null
  .forLeads([ids])           → Map(leadId → profile), one round trip
  .draftFor(leadId|null)     → the open draft, or null
  .saveDraft(profile)        → upsert status='draft'
  .saveFinal(profile)        → upsert status='final'
  .softDelete(id)

RoadysBD.map
  .toRow(profile)            → camelCase → snake_case
  .fromRow(row)              → snake_case → camelCase
```

`toRow`/`fromRow` exist so the column mapping lives in exactly one place. The
existing `crmLoadFromSupabase()` / `crmSaveLeadToSupabase()` pair in `CRM.html`
is the cautionary example: the same 20-field mapping is written out twice, in
opposite directions, 80 lines apart.

The recommendation bands go in **`bdpgStats.js`** rather than `roadysBD.js` —
it is already the tested rules module, already loaded by the calculator, and
gains `BDPG_STATS.recommendation(finalGallons)` plus unit tests alongside the
existing 242. `CRM.html` adds `<script src="bdpgStats.js">`; the module is
clean UMD with zero DOM dependencies, verified safe to load there.

---

## 2. Data model

### 2.1 `bd_value_profiles`

One row per profile. Drafts and finals share the table, separated by `status`.

The full breakdown lives in `inputs` / `results` jsonb. The fields the CRM
renders and aggregates are **promoted to real columns**, so the lead card, the
Lead Table, the CSV export and the leaderboard never parse jsonb and
`SUM(final_gallons)` works directly.

A partial unique index enforces **one final profile per lead**, so a card never
has two numbers to choose between. "Update profile" rewrites that row in place.
No version history is kept — it was not requested, and it keeps the card
unambiguous.

Drafts get the same treatment for the same reason — one draft per lead, plus
one unlinked draft per author. See §2.4, which sets out all three indexes and
the concurrency posture behind them.

`lead_id` is `ON DELETE SET NULL`, not `CASCADE`: a vanishing lead must orphan
a profile, never destroy it.

### 2.2 `crm_leads`

No new columns. The existing model already carries everything the brief listed:

```
id (text PK, 'CRM-<6 digits>') · company · contact · phone · email
street · city · state · zip · exit · lanes
stage · priority · owner · source · locations
estGallons · dealValue · followUp · notes · activity (jsonb)
created_at · updated_at · deleted_at
```

Added: an index on `stage`, and a real `updated_at` trigger. `updated_at` is
currently set by `CRM.html` on each upsert, so a row written by any other path
keeps a stale value.

### 2.3 Migrations

Per repo convention (CLAUDE.md), both live in `sql/` as
`YYYY-MM-DD-<slug>.sql`, wrapped in `BEGIN; … COMMIT;` with a commented
verification block at the foot.

- **`sql/2026-10-05-bd-value-profiles.sql`** — the new table, indexes,
  trigger, authenticated-only RLS, grants, plus the `crm_leads` stage index
  and `updated_at` trigger. Breaks nothing; applied at the start of Phase 1.
- **`sql/2026-10-05-crm-leads-require-auth.sql`** — swaps `crm_leads` from
  anon to authenticated. **Held** until the login is confirmed working on
  `CRM.html`, `implementation.html` and the calculator in a second browser.

Splitting them means there is never a window where profiles are locked and the
lead data beside them is not.

### 2.4 Session, cache, and who owns a draft

Three things the phases depend on that would otherwise be decided ad hoc:

**The cache is not a bypass.** `localStorage` holds leads (`roadys_crm_v2`)
and drafts so the apps survive a dropped connection *within* a session. It is
never rendered without one. Sign-out clears both keys, and a page opened
signed-out shows the login gate rather than the last user's cached pipeline —
otherwise locking the table in Migration B would move the data behind auth
while a stale copy of it stayed readable on disk.

**Drafts are shared, last-write-wins.** The goal is that any user on any
browser sees the same work, so a draft is not private to its author. One draft
per lead, extending the same partial-unique treatment finals get:

```sql
CREATE UNIQUE INDEX bd_value_profiles_one_draft_per_lead
  ON public.bd_value_profiles (lead_id)
  WHERE status = 'draft' AND deleted_at IS NULL AND lead_id IS NOT NULL;
```

A draft not yet linked to a lead has `lead_id IS NULL` and cannot be
constrained that way, so those are keyed per author — Robert's unlinked draft
and Angel's never collide:

```sql
CREATE UNIQUE INDEX bd_value_profiles_one_unlinked_draft_per_author
  ON public.bd_value_profiles (author)
  WHERE status = 'draft' AND deleted_at IS NULL AND lead_id IS NULL;
```

Concurrent edits resolve last-write-wins, the posture `CRM.html` already takes
for leads. `author` and `updated_at` are surfaced wherever a draft is shown, so
a second editor can see whose work they are about to overwrite. No locking:
this is a two-person team, and a lock nobody can release is worse than a name
and a timestamp.

Blast radius of the second migration, measured rather than assumed:

| page                  | live `.from('crm_leads')` | effect |
|-----------------------|---------------------------|--------|
| `CRM.html`            | 5 | needs the login |
| `implementation.html` | 3 | needs the login |
| `index.html`          | 0 | unaffected — its 15 references are display text in the schema-blueprint panel |
| `truck-stop-optin.html`, `call-booking.html` | 0 | prospect-facing, stay anonymous |

---

## 3. Phase 1 — Supabase foundation

1. Apply `sql/2026-10-05-bd-value-profiles.sql`.
2. `roadysBD.js` — auth, profile CRUD, row mapping.
3. `BDPG_STATS.recommendation()` in `bdpgStats.js`, with tests.
4. Login gate on `CRM.html`, the calculator, and `implementation.html`.
   Replaces nothing: the existing `SETTINGS.pin` soft-lock on `CRM.html` is a
   localStorage comparison in client JS and is not security; it stays as the
   accident guard it already is, behind the real session.
5. Draft autosave re-pointed at `bd_value_profiles`, 800 ms debounce,
   localStorage mirror, all behaviour from §0.5 preserved.
6. "Save to Prospects" → writes a final profile and links it to a lead, by one
   of two routes:
   - **Attach to an existing lead**, chosen from a search box over company,
     city and state.
   - **Create a new lead**, which starts at **Prospect** and is seeded from the
     profile's prospect name, city and state. (NOT location type: `crm_leads`
     has no column for it and §2.2 adds none. The profile keeps it.) It reuses
     `crmSaveLead()`'s existing duplicate-company confirm
     (`crmNormCompany()`), so building a profile for a company already in the
     pipeline warns instead of silently creating a second card.

   Either route then applies the §0.1 stage prompt. A lead created here is at
   Prospect, so the prompt always fires for the new-lead route — that is
   intended: it is the one click that says "and I have now contacted them."
7. Fix `implementation.html:7916` — the hard `DELETE` on `crm_leads` becomes
   the same `deleted_at` soft delete `CRM.html` uses, so a lead deleted there
   is recoverable from the existing Deleted Leads modal.
8. Apply `sql/2026-10-05-crm-leads-require-auth.sql` **on confirmation only**.

## 4. Phase 2 — CRM surfaces

- Lead card: projected gallons, recommendation, Discount Pricing Strategy %,
  Trucker Path rating, amenities level, region, profile type. Drafts carry a
  distinct badge so an in-progress profile is never mistaken for a final one.
- Lead detail gains a **Value Profile** section: full breakdown, **Open in
  Potential Gallons** (deep link `bus-dev-potential-gallons/?lead=<id>`),
  **Update profile**, or **Build value profile** when none exists — the latter
  opening the tool pre-filled with the lead's name, city, state and location
  type.
- Lead Table columns and CSV export gain the key profile fields.
- Analytics "Gallons by owner" and the leaderboard read `final_gallons` from
  the linked profile when present, falling back to the hand-entered
  `estGallons` when not. Both currently read `estGallons` alone.

### 4.1 Retire `crmWhoAmI()` in favour of the session email

Phase 1 introduces a real session while `CRM.html`'s `crmWhoAmI()` keeps its
own answer to the same question — a `localStorage` key (`CRM_WHOAMI_KEY`) set
from a "👤 Who are you?" dropdown over `CRM_OWNERS`. Two notions of identity
in one app is one too many: they can disagree, and the one that is merely
*claimed* is the one that writes to the activity log.

Phase 2 removes it. The session email becomes the single identity:

- `crmWhoAmI()` returns `RoadysBD.auth.email()`; the dropdown and
  `crmSetWhoAmI()` are deleted along with the `CRM_WHOAMI_KEY` read/write.
- Call sites to update: the activity entries written by `crmSaveLead()`,
  `crmMoveToStage()`, `crmLogActivity()` and `crmSendTemplateEmail()`.
- `CRM_OWNERS` **stays**. It is a different list doing a different job — the
  assignable owners on a lead and the owner filters on the Kanban, the Lead
  Table and analytics. A lead can be assigned to Angel by Robert, so "who owns
  this" and "who am I" must remain separable.
- Historical activity entries keep whatever `by` value they were written with.
  They are an audit trail; rewriting them to match today's identity scheme
  would falsify it.

Deferred to Phase 2 rather than done in Phase 1 because every one of those
call sites is CRM display code, and Phase 1 deliberately touches `CRM.html`
only to add the gate.

## 5. Phase 3 — Calculator redesign

Numbered single-criterion steps, each with its contribution on the right:

```
#1 Profile / roadway / lanes    baseline gal/mo
#2 Region                       ±%
#3 Trucker Path rating          ±%     (star slider unchanged)
#4 Amenities                    ±%     (§0.2)
#5 Restroom / shower condition  ±%
#6 Roady's Rewards              ±%
#7 Discount Pricing Strategy    ±%
→ results: official subtotal · Roady's adjustment · total projected gallons
           · membership recommendation
```

Rename `Discount / Aggregator Posture` → **Discount Pricing Strategy** across
~8 user-visible strings: the label (`index.html:5409`), the slider aria-label
(`:5337`), the export packet line (`:6362`), the Prospects table header
(`:7422`), and the pitch/summary prose (`:6129`, `:6446`). Internal variable
names (`pricingLevel`, `PRICING_*`) stay as they are.

Dark design language, typography and the map are unchanged. **The formula is
unchanged**: every multiplier in `busDevGallonsCalculator.js` is untouched and
all 242 existing tests must still pass.

---

## 6. Constraints

- No formula change. `node --test *.test.js` must stay at 242 passing, plus
  whatever the recommendation bands add.
- No existing CRM feature regresses: Kanban drag-and-drop, calendar,
  auto-scheduler, email templates, notes, scheduled calls, CSV import/export,
  deleted-lead restore, analytics, the `?lead=&call=` deep link, the 90-second
  background refresh.
- Supabase is the source of truth; localStorage is an offline cache only —
  the posture `CRM.html` already takes for leads.
- Every new table follows the CLAUDE.md checklist: RLS enabled *with* explicit
  policies, grants stated, `search_path` pinned on every trigger function.

## 7. Test checklist

Run after Phase 1, two browsers, second browser signed in as a different user.

**Steps 2, 7 and 8 are Phase 2 deliverables and WILL FAIL after Phase 1** --
they need the CRM-side lead card, the deep-link pre-fill and the Lead Table /
CSV / leaderboard columns, none of which Phase 1 builds. They are listed here
because they belong to the finished feature, not because Phase 1 should pass
them. **The real Phase 1 gate is steps 1, 3, 4, 5, 6, 9 and 10.**

1. Sign in on `CRM.html`; confirm sign-out and that a signed-out tab is
   refused rather than shown stale cached leads.
2. Open the calculator from a lead — fields pre-fill from the lead.
3. Type one field; within ~1 s the indicator reads *Saving draft…*, then
   *Draft saved*. Reload: the draft restores.
4. Reopen the same lead in browser 2 — the draft is there, labelled as a draft.
5. Generate, then **Save to Prospects** against a **new** prospect: a lead is
   created in Prospect, the stage prompt appears, the profile is linked.
6. Repeat against an **existing** lead found by search: the profile attaches,
   the prompt offers Contacted, Cancel leaves the stage alone.
7. Browser 2: the lead shows in **Contacted** with gallons, recommendation and
   the profile summary on the card.
8. Lead Table and CSV carry the profile fields; the leaderboard uses profile
   gallons.
9. Delete a lead from `implementation.html`; confirm it appears in CRM's
   Deleted Leads modal and restores — the hard-delete fix.
10. Only after 1–9 pass: apply Migration B, then re-run 1, 7 and 9 to confirm
    all three pages still work with `crm_leads` locked.
