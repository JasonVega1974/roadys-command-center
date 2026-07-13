# CRM Independent Truck Stop Prospect Research — Design

**Date:** 2026-07-13
**Status:** Approved

## Problem

The Business Development CRM tab in `index.html` (Kanban pipeline + Leads
table, both driven by the single `CRM_LEADS` array) currently only holds 8
fabricated example leads (`crmSampleData()`, `index.html:12503`). The user
wants this replaced with real independent truck stop prospects — non-chain
(not Pilot, Love's, TA/Petro, Flying J) and not already part of the Roady's
network — researched across all 48 contiguous states, each with as much
verifiable contact/location detail as can be found.

## Scope decomposition

1. **Schema/UI phase** — extend the CRM lead data model so it can hold
   address, highway/exit, and lanes-of-travel info that doesn't exist today.
2. **Research/populate phase** — run real web research per state, dedupe
   against existing members and chains, and replace the example data.

Phase 1 must land first since phase 2's data needs fields to go into.

## Data accuracy policy (hard constraint)

This data feeds a real business-development tool. No field is ever
fabricated to fill a gap:

- Company name, city, and state must come from an actual source found via
  search.
- Phone/email/contact name are included **only** when confidently sourced;
  otherwise left blank with a note that it's unverified — never guessed.
- Each record's `notes` field documents what's confirmed vs. not, so a
  human doing outreach knows what still needs verification.
- "DOT info" was dropped from scope — DOT numbers apply to motor carriers,
  not truck stops, and don't cleanly apply here (confirmed with user).

## 1. Schema / UI additions

New fields on the CRM lead object (mirrors the existing `MEMBERS` array
field-naming convention — `street`/`city`/`zip`/`exit` rather than one
blob `address` field, for consistency with the rest of the app):

- `street`, `city`, `zip`
- `exit` — highway/exit info (e.g. `"Exit 82 / I-10"`)
- `lanes` — free-text primary lanes/corridor (e.g. `"I-40 E-W corridor"`)

New `CRM_SOURCES` entry: `'Market Research'` — labels these leads honestly
as sourced from research rather than referral/cold-call/trade-show/etc.

Touch points in `index.html`:
- Lead object shape (wherever a lead literal is constructed/read)
- `crmBuildForm` — add form inputs for the five new fields
- Kanban card rendering (`renderCRMKanban`) — surface city/state/exit
  compactly on the card
- Leads table rendering (`renderCRMTable`) — add columns or a detail
  expansion for the new fields
- Lead detail modal — show full street/city/zip/exit/lanes
- `crmSaveLeadToSupabase` / `crmLoadFromSupabase` — map the five new
  columns (snake_case in Supabase: `street`, `city`, `zip`, `exit`,
  `lanes`)

### Migration

`sql/2026-07-13-crm-leads-location-fields.sql` — adds the five columns to
the existing `crm_leads` table via `ALTER TABLE ... ADD COLUMN`, wrapped in
`BEGIN; … COMMIT;` per project convention. No RLS/GRANT changes needed —
`crm_leads` already has RLS and grants from the 2026-05-27 migration batch.
Includes a commented verification query at the bottom per convention.

## 2. Removing example data

`crmSampleData()` contents are fully replaced by the real researched
records (function name/shape stays the same — only the data changes).

The Supabase `crm_leads` table is currently empty (confirmed with user), so
the hardcoded JS array remains the shared source of truth across every
browser — same seed pattern already used elsewhere in this app for
fuel/membership data (`FUEL_APR_2026_DATA`, `COMPANY_MEMBERSHIP_DATA`,
etc.). No Supabase insert/seed script is needed; once someone edits a lead
through the UI, the existing `crmSaveLeadToSupabase` upsert path takes over
for that record as it already does today.

## 3. Exclusion list

Before researching, extract all 369 entries from the `MEMBERS` array
(`index.html:2779`) — every `group` (`Roady's`, `Roady's Lite`, `PTP`) — as
a do-not-include list matched on company/name + city + state. Additionally
hard-exclude national chains by name: Pilot, Flying J, Love's, TA, Petro.

## 4. Research execution

8 background research agents (Agent tool, `run_in_background`), each
covering roughly 6 states. Each agent:

- Does real web search for independent (non-chain, non-Roady's/PTP) truck
  stops in its assigned states.
- Is given the exclusion list (member names/cities/states + chain names)
  relevant to its states.
- Returns structured records: `company`, `street`, `city`, `state`, `zip`,
  `phone`, `contact` (if found), `email` (if found), `exit`, `lanes`, and a
  short sourcing note per record.
- Is explicitly instructed never to invent a phone/email/contact — omit
  and flag instead.
- Is told to log which states (or parts of states) turned up thin/no
  results rather than silently under-filling, so coverage gaps are visible
  in the final report.

## 5. Synthesis

After all agents return:

1. Flatten all records, dedupe within and across agents (name + city +
   state fuzzy match).
2. Re-check against the full exclusion list (belt-and-suspenders on top of
   each agent's per-region list).
3. Assign sequential `CRM-###` ids continuing from where the old sample
   data left off conceptually (start at `CRM-001` since old samples are
   fully replaced).
4. Set defaults on every record: `stage:'Prospect'`, `priority:'Medium'`,
   `owner:''`, `source:'Market Research'`, `estGallons:0`, `dealValue:0`,
   `followUp:''`, `created:'2026-07-13'`, `activity:[]`.
5. Write final array into `index.html`, replacing `crmSampleData()`'s
   contents.

## 6. Verification

- Open `index.html` in a browser; confirm the CRM tab renders correctly —
  Kanban Prospect column and Leads table both show the new records with
  the new fields visible.
- Spot-check a sample of records against their cited sources.
- Report final coverage: total records, per-state breakdown, and any state
  with few/no qualifying results.

## Out of scope

- DOT info field (dropped — doesn't apply to truck stops).
- Estimated gallons / deal value (not publicly knowable; left at 0).
- Owner assignment (left blank for manual triage).
- Any Supabase data seeding beyond the schema migration (table is empty;
  JS array is the seed).
