# Phase 9 — Site Review Integration

**Status:** Spec
**Date:** 2026-05-04
**File scope:** `gs-command-center.html` (new tab + button + card + Membership extension); `site-visit.html` (new Fleet Cards section + URL-param prefill); reuses existing shared `localStorage['roadys_site_visits']` key.

---

## Goal

Wire the existing standalone `site-visit.html` review form into `gs-command-center.html` so a GS can launch a stop-aware review with **most fields pre-filled from data we already have** (member info, gallon report, rack info, aggregator discounts, rewards YTD, vendor enrollments). Add a **Fleet Cards Accepted** checklist persisted on the stop record (`stopdata[stopId].acceptsFleetCards`) so it auto-pre-fills the review and shows on the Stop Detail Page Membership card.

This is a **feature ADD** (not a migration). It runs parallel to the 8.x Supabase migration track — data lands in `localStorage['roadys_site_visits']` (network-shared, same pattern as `roadys_fuel` / `roadys_vp_enroll`) and migrates to Supabase when 8.5 lands.

---

## Non-Goals

- **Rebuilding `site-visit.html`.** It already has all four sections from the PDF (Fuel Gallon, Administrative, Rewards, Vendor Program), Save / Load / Delete / Print, and ~1361 lines of working form. We add a Fleet Cards section and a prefill mechanism — not a rewrite.
- **Inlining the form into `gs-command-center.html`.** Would add ~1300 lines; standalone file with cross-tab `localStorage` is cleaner.
- **iframe embedding.** `postMessage` + iframe sizing get messy. Open in a new tab.
- **Per-section save / autosave / draft conflict resolution.** Save remains a single button; the form is short enough that loss-of-unsaved-changes is the same risk it has today.
- **Email / Slack / shared link export.** v1 is local-only (Print remains, that's it). Same pattern as existing exports.
- **Deleting / editing a saved review from `gs-command-center.html`.** Edits happen in `site-visit.html`. The new tab + card show a list and link out.
- **Migrating existing `roadys_site_visits` data.** Saved visits without a `stopId` keep working — they just don't show on the Stop Detail Page card. New visits saved post-9 get tagged.
- **Phase 8.x Supabase migration of any of this.** That's 8.5+. v1 is localStorage.

---

## Architecture

### File structure

- **Modify:** `gs-command-center.html` — new tab, new button, new card, Membership card extension, prefill payload writer.
- **Modify:** `site-visit.html` — new Fleet Cards Accepted section near Merchant Console; prefill-on-boot reader for URL `?stop=` + transient `localStorage['roadys_sitevisit_prefill']` key; saved visits get a `stopId` field.
- **No new files.**

### Data layer

Three localStorage keys involved — two existing, one new transient:

| Key | Owner | Purpose | Shape |
|---|---|---|---|
| `roadys_site_visits` (existing) | `site-visit.html` writes; both apps read | Network-shared archive of every saved review | `{ [visitId]: { id, member, date, data, saved, stopId? } }` — `stopId` is new in Phase 9 |
| `gs_cmd_<gs>_stopdata` (existing) | `gs-command-center.html` | Per-GS stop records — extended with `acceptsFleetCards` | `{ [stopId]: { …, acceptsFleetCards: { fuelman: true, comdata: false, … } } }` |
| `roadys_sitevisit_prefill` (new transient) | `gs-command-center.html` writes; `site-visit.html` reads + deletes | Hand-off payload for one-shot prefill | See "Prefill payload" below |

The transient key gets cleared by `site-visit.html` immediately after applying it, so back-to-back reviews don't cross-contaminate.

### Prefill payload

```js
{
  stopId:       'R03650',                                    // also passed as URL ?stop= for fallback
  reviewId:     'visit-1746345600000' | null,                // null = new review; non-null = open existing
  fields: {
    'hdr-member': 'R03650: 115 Truck Stop',
    'hdr-id':     'R03650',
    'hdr-date':   '2026-05-04',
    'hdr-with':   'Mike (Owner)',
    'hdr-by':     'Logan Resinkin',
    'hdr-addr':   '14547 22 1/2 Mile Road, Marshall, MI 49068 · (269) 781-9616',
    'rack-city':  'Detroit',
    'rack-freight': '0.0675',
    'rack-fed':     '0.2440',
    'rack-state':   '0.2880',
    'rack-env':     '',
    'rack-load':    ''
    // …gallon report, rewards, etc.
  },
  aggregatorDiscounts: [
    { name:'Fuelman',  retailMinus:'-0.05', costPlus:'',     betterOf:'' },
    { name:'Mudflap',  retailMinus:'',      costPlus:'0.10', betterOf:'' }
    // matched against AGGREGATORS list in site-visit.html by name
  ],
  currentVendors: ['Sysco','Entegra','Coca-Cola / CCNA'],     // matched against CURRENT_VENDORS in site-visit.html
  fleetCards: { fuelman: true, comdata: true, efs: false, … } // matched against FLEET_CARDS list (new — see below)
}
```

`fields` is a flat ID → value map so `site-visit.html` can blast through it with `document.getElementById(id).value = val` per entry. The repeating sections (`aggregatorDiscounts`, `currentVendors`, `fleetCards`) need targeted population logic since their inputs are dynamically built.

### Pre-fill logic (gs-command-center.html → payload)

| Site-visit field | Source |
|---|---|
| `hdr-member` | `<stop.id>: <stop.name>` |
| `hdr-id` | `stop.id` |
| `hdr-date` | today (`new Date().toISOString().slice(0,10)`) |
| `hdr-with` | `stopdata[stopId].siteMgrName` |
| `hdr-by` | `currentUser.full_name` |
| `hdr-addr` | `<street>, <city>, <state> <zip> · <phone>` |
| Gallon Report 3-/2-/1-month lookback + avg | `loadFuelGD()[stopId][priorMonth(N)].gallons` for N=1..3; avg = sum/3 |
| `rack-city` / `rack-freight` / `rack-fed` / `rack-state` / `rack-env` / `rack-load` | `loadFuelGD()[stopId][currentMonth].rack` fields |
| `aggregatorDiscounts[]` | `loadFuelGD()[stopId][currentMonth].aggregators[].{name, retail_minus, cost_plus}` — name-match against site-visit's `AGGREGATORS` list; unmatched names get logged + skipped |
| Rewards Add Points YTD (2025) | `stopdata[stopId].rewardsYtdAdds` |
| Rewards Redeemed Points YTD (2025) | `stopdata[stopId].rewardsYtdRedeems` |
| Redemption Rate (2025) | `(redeems/adds)*100` if both > 0 |
| `currentVendors[]` | `loadVendorEnrolls()[stopId]` truthy keys → name-match against `CURRENT_VENDORS` |
| `fleetCards{}` | `stopdata[stopId].acceptsFleetCards` |

Anything not in this table is **manual entry** — Merchant Console (WEX creds), Fleet Discounts (R-/C+/Better-of), Restrooms / Showers / Signage checklists, Pictures & Social Media, Administrative checks, Online Reviews, Amenities, Marketing details, Fraud Alerts, Vendor "Interested" flags, Swag, Wrap Up.

### Fleet Cards data model

New per-stop checklist persisted in `stopdata[stopId].acceptsFleetCards`:

```js
acceptsFleetCards: {
  fuelman:      true,    // back-compat: synced bidirectionally with the existing acceptsFuelman boolean
  rcheck:       true,    // back-compat: synced with acceptsRcheck
  comdata:      false,
  efs:          false,
  tchek:        false,
  fleet_one:    false,
  wex:          false,
  voyager:      false,
  mudflap:      false,
  atob:         false,
  pilot_fj:     false,
  ta_petro:     false,
  shell_fleet:  false
}
```

Master list in `gs-command-center.html`:

```js
const FLEET_CARDS = [
  { id: 'fuelman',     label: 'Fuelman' },
  { id: 'rcheck',      label: 'R-Check' },
  { id: 'comdata',     label: 'Comdata' },
  { id: 'efs',         label: 'EFS / WEX EFS' },
  { id: 'tchek',       label: 'T-Chek (TCH)' },
  { id: 'fleet_one',   label: 'Fleet One' },
  { id: 'wex',         label: 'WEX' },
  { id: 'voyager',     label: 'Voyager' },
  { id: 'mudflap',     label: 'Mudflap' },
  { id: 'atob',        label: 'AtoB' },
  { id: 'pilot_fj',    label: 'Pilot / Flying J Fleet' },
  { id: 'ta_petro',    label: 'TA / Petro UltraONE' },
  { id: 'shell_fleet', label: 'Shell Fleet' }
];
```

The same list literal lives in `site-visit.html` (for the new Fleet Cards section). To avoid drift: a bridge constant in `gs-command-center.html` writes the canonical list into `localStorage['roadys_fleet_cards']` on first render; `site-visit.html` reads that key, falls back to its own inline copy if absent. Pattern matches how vendors are bridged today (`roadys_vp_vendors`).

#### Back-compat with existing `acceptsFuelman` / `acceptsRcheck` booleans

The existing two booleans on `stopdata` stay in place. The new `acceptsFleetCards.fuelman` / `acceptsFleetCards.rcheck` are kept in sync:
- Reading: if `acceptsFleetCards` is missing, derive `{fuelman: rec.acceptsFuelman, rcheck: rec.acceptsRcheck}` lazily.
- Writing: when a Fleet Cards checkbox toggles, update the new map AND the legacy boolean (for the two cards that have one).

Existing UI on the Membership card that reads `rec.acceptsFuelman` / `rec.acceptsRcheck` keeps working unchanged.

### Renderer integration

#### Stop Detail Page header — new button

Inside `pageHeaderHTML(stopId)` `.sd-actions`, between Email and Schedule Visit:

```
📋 Copy · 📧 Email · 📅 Schedule Visit · 📋 Site Review · 🖨 Print Report · 📊 Export CSV
```

Click → `startSiteReview(stopId)` → builds payload → `localStorage.setItem('roadys_sitevisit_prefill', JSON.stringify(payload))` → `window.open('site-visit.html?stop=' + stopId, '_blank', 'noopener')`.

In Manager All-GS mode the button stays visible (managers can launch reviews on any stop from the rollup).

#### Stop Detail Page left column — new card

`pagePastReviewsHTML(stopId)` between the existing Visits card and Notes card. Lists past saved reviews tagged with this `stopId` (newest first). Each row shows `<date> · saved <ago>` and a `Open →` button that opens `site-visit.html?reviewId=<id>` in a new tab. Empty state: "No site reviews on file. Click 📋 Site Review on the header to start one."

#### New top-level tab — Site Reviews

```
📊 Dashboard · 🗺️ Territory · 📋 CRM / Tasks · 📅 Calendar · 💰 Rates & Fees · 🧮 Calculator · 🔥 Fuel Intro · 🚨 Critical · 📋 Site Reviews
```

Panel renders a list of every saved review in `roadys_site_visits`:

- **GS mode**: filtered to reviews whose `stopId` belongs to a stop in this GS's territory + reviews with no `stopId` (legacy).
- **All-GS mode**: shows everything; row gets a `[GS]` tag derived from the stop's state via `MANAGER_MAP`.

Search box on member name / stop ID. Sortable table (date / member / stop / saved-at). Each row has `Open →` which opens `site-visit.html?reviewId=<id>` in a new tab.

#### Stop Detail Page Membership card — extension

The existing Membership card already shows `Fuelman ✓` / `R-Check ✓` chips when those booleans are true. Extend to render every entry in `acceptsFleetCards` as a chip strip. Click a chip on the page → toggles the value in `stopdata[stopId].acceptsFleetCards`, syncs back to `acceptsFuelman` / `acceptsRcheck` if applicable, persists via `saveData()`, re-renders the card. Manager All-GS mode: chips read-only (existing pattern).

### `site-visit.html` changes

1. **New Fleet Cards Accepted section** in the Fuel Gallon Review tab, immediately below the Merchant Console section. Layout: 2-column grid of checkboxes labeled with `FLEET_CARDS[].label`. Field IDs: `fleet-card-<id>`. Wired to `markDirty()` like every other input.

2. **Prefill on boot** in the existing `(function init(){…})()`:
   ```js
   const params = new URLSearchParams(location.search);
   const reviewId = params.get('reviewId');
   const stopId   = params.get('stop');
   const prefill  = JSON.parse(localStorage.getItem('roadys_sitevisit_prefill') || 'null');
   localStorage.removeItem('roadys_sitevisit_prefill');  // single-use

   if(reviewId)       loadVisit(reviewId);
   else if(prefill)   applyPrefill(prefill);   // new helper
   else if(stopId)    document.getElementById('hdr-id').value = stopId; // minimal fallback
   ```

3. **`applyPrefill(payload)` helper** — flat `fields` map → `getElementById(k).value = v`, plus targeted writers for `aggregatorDiscounts` (match on `AGGREGATORS` name → fill `agg-<slug>-r/c/better`), `currentVendors` (yes/no toggles), `fleetCards`.

4. **`saveVisit()` mutation** — include `stopId: payload?.stopId || existing` on the saved record so the Stop Detail Page card and the Site Reviews tab can scope correctly.

---

## UI Mockups (text)

### Stop Detail Page — new card

```
┌─ 📋 Past Site Reviews (3) ─────────────────────────┐
│  2026-04-12 · saved 22d ago    [ Open → ]          │
│  2026-01-08 · saved 4mo ago    [ Open → ]          │
│  2025-09-22 · saved 8mo ago    [ Open → ]          │
└────────────────────────────────────────────────────┘
```

### Membership card extension

```
…existing fields (Membership Cost, Site Manager, Email, Phone, PFF
checkbox)…

Fleet Cards Accepted:
[Fuelman ✓] [R-Check ✓] [Comdata] [EFS / WEX EFS ✓] [T-Chek] [Fleet One]
[WEX ✓] [Voyager] [Mudflap ✓] [AtoB] [Pilot / FJ Fleet] [TA / Petro] [Shell]
```

(Click a chip → toggle the boolean → save → re-render. Active chips have a colored background.)

### Site Reviews tab

```
🔍 [search member name / stop ID]                    📋 Start New Review

┌─────────────────────────────────────────────────────┐
│ Date        Member               Stop      Saved     │
├─────────────────────────────────────────────────────┤
│ 2026-04-12  115 Truck Stop      R03650    22d ago    [Open]
│ 2026-04-08  Akal Travel Plaza   R01188    1mo ago    [Open]  [GS: Maria]
│ 2026-03-22  Big Daddy's          R00255    1.5mo ago [Open]
│ …
└─────────────────────────────────────────────────────┘
```

Click `📋 Start New Review` → opens `site-visit.html` blank with today's date.

---

## Cross-cutting concerns

- **`window.open` blocked by popup blocker** — first-click should always succeed since the click is a direct user gesture. If it ever fails, fall back to `window.location.href` after a 500ms timeout (can ship without this; uncommon edge).
- **Two tabs open at once for the same review** — `site-visit.html` doesn't lock, so two tabs editing the same review can clobber each other. Acceptable for v1 — same risk it has today.
- **Manager All-GS mode + writes** — Stop Detail Page chips for fleet cards stay read-only in All-GS mode (mirrors Notes / Visits pattern). The Site Review button stays enabled (Manager can launch a review on any stop).
- **Per-GS namespace impact** — `acceptsFleetCards` lives in `gs_cmd_<gs>_stopdata` like every other stop field. Reviews live in the network-shared `roadys_site_visits` (no GS scoping at the storage layer; the UI applies it).
- **Print stylesheet** — `site-visit.html` already has its own print logic. The new Fleet Cards section gets a CSS rule that prints inline.
- **Vendor name mapping** — `CURRENT_VENDORS` in `site-visit.html` doesn't perfectly match our `VP_VENDORS` IDs (e.g. it has 'Coca-Cola / CCNA'; ours is `V00033 → Coca-Cola CCNA`). Pre-fill applies a fuzzy-name map; unmatched vendors get logged in the console and skipped.
- **Aggregator name mapping** — `AGGREGATORS` in `site-visit.html` is a flat list of 20 names. Matched against `GD[stopId][m].aggregators[].name` by case-insensitive substring (e.g. `'Mudflap' → 'Mudflap (Tablet/Visa)'`). Unmatched logged + skipped.

---

## Smoke Test

After implementation, hard-reload `gs-command-center.html`:

1. **Header button** — open any stop's Stop Detail Page → header shows `📋 Site Review` between Email and Print → click → new tab opens to `site-visit.html?stop=<id>`.
2. **Pre-fill** — in the new tab, verify Member name + ID + address + manager + reviewer + date are populated; gallon report shows last 3 months from `roadys_fuel`; rack info populated; aggregator discounts populated for any aggregators tracked at that stop; rewards YTD adds/redeems populated; current vendor checkmarks set for vendors enrolled in `roadys_vp_enroll`.
3. **Fleet Cards section** — new section visible in `site-visit.html` under Merchant Console. Default-checked items match the stop's `acceptsFleetCards`.
4. **Save** — fill in a few manual fields → Save → toast "Visit saved." Close tab. Reopen Stop Detail Page → Past Site Reviews card now shows 1 entry → click `Open →` → loads the saved review.
5. **Site Reviews tab** — click new top-level tab → list shows the saved review → search works → click row → opens it.
6. **Membership card chips** — Stop Detail Page Membership card shows fleet card chips. Click a chip (e.g. Comdata) → toggles → persists → reload → still toggled.
7. **Sync with legacy booleans** — toggle Fuelman chip → existing `acceptsFuelman` boolean follows → toggle the existing checkbox → chip follows.
8. **Manager All-GS mode** — log in as Manager All-GS → Site Reviews tab shows every review with `[GS]` tag → Membership chips read-only → Site Review button still works.
9. **Legacy reviews** — saved reviews from before Phase 9 (no `stopId`) appear in the All-GS list with no GS tag and don't show on any Stop Detail Page card.
10. **Print** — open a saved review → click Print → preview shows all sections inline incl. the new Fleet Cards section.
11. **Phase 4-8 regression** — drawer, Stop Detail Page existing cards, Calendar, CRM, Calculator, Manager Editor, Phase 7 visits, Phase 8.1 auth all unaffected.

---

## File Footprint Estimate

- **`gs-command-center.html`** — `FLEET_CARDS` constant (~16 lines); fleet-cards bridge writer (~5 lines); `startSiteReview` + payload builders (~80 lines); `pagePastReviewsHTML` (~30 lines); new tab panel + `renderSiteReviews` (~80 lines); Membership card extension (~30 lines); header button (~1 line); per-GS / All-GS scoping (~20 lines). **~260 lines added.**
- **`site-visit.html`** — Fleet Cards section markup (~25 lines); `applyPrefill` helper (~50 lines); init-time prefill detection (~10 lines); save mutation (~3 lines). **~90 lines added.**
- **No new files.**

**Estimated total addition:** ~350 lines across 2 files.

---

## Open Questions

None outstanding — all four design decisions accepted on the user's go-ahead:
1. Entry points: header button + new tab + Stop Detail Page card.
2. Pre-fill scope: header / gallon / rack / aggregators / rewards / vendors / fleet cards (manual entry for everything else).
3. Fleet card list: 13 networks (Fuelman, R-Check, Comdata, EFS, T-Chek, Fleet One, WEX, Voyager, Mudflap, AtoB, Pilot/FJ, TA/Petro, Shell).
4. Persistence: localStorage for v1; migrates with the 8.x track.

---

## References

- Spec for Phase 7 (Schedule Visit): [2026-05-04-phase-7-schedule-next-visit.md](2026-05-04-phase-7-schedule-next-visit.md) — adjacent (visits ≠ reviews; the Past Site Reviews card sits next to the Upcoming Visits card on the Stop Detail Page).
- Spec for Phase 8.1 (Auth): [2026-05-04-phase-8-1-auth-and-users.md](2026-05-04-phase-8-1-auth-and-users.md) — `currentUser.full_name` for the reviewer field.
- Existing standalone form: `site-visit.html` (1361 lines, 4 tabs covering Fuel Gallon / Administrative / Rewards / Vendor Program; matches the PDF Site Review Master Template 2025).
- PDF source: `Updated Copy of Site Review Master Template 2025.xlsx` — drives the field structure of the existing form.
- Plan: TBD — produced after this spec is approved.
