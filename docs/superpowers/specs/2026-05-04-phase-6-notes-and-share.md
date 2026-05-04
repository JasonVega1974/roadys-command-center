# Phase 6 — Notes Panel + Share Results

**Status:** Spec
**Date:** 2026-05-04
**File scope:** `gs-command-center.html` only.

---

## Goal

Two independent additions to the existing Stop Detail Page (Phase 4) and slide-in drawer (Phases 1-3):

1. A **threaded Notes panel** for free-form running commentary on each stop, separate from the structured Activity Log. Append-only entries with timestamp + author + body. Renders in both the drawer and the Stop Detail Page.
2. **Share Results** actions in the Stop Detail Page header — `📋 Copy` and `📧 Email` buttons that produce a tight plain-text snapshot of the current stop's KPIs, ROI, and last contact, suitable for clipboard paste or email body.

Both build on existing data + helpers — no new schema, no new persistence keys.

---

## Non-Goals

- **Edit / delete notes.** Append-only by design — full audit trail, no rewrites. Manager can clear localStorage as the escape hatch.
- **@mentions, tags, search.** None for v1. Notes are flat plain-text entries.
- **Cross-stop notes view ("all my notes").** Future enhancement.
- **Slack / Teams / SMS share targets.** No reliable cross-platform standard for these.
- **Hosted snapshot URLs / share-via-link.** Requires backend. Out of scope.
- **PDF generation library.** The existing Print button + browser "Save as PDF" already covers this.
- **Backend / multi-device sync** of notes — separate Auth migration sub-project.
- **Per-note attachments / file uploads.**
- **Per-note ownership ACLs.** Manager already has full read access via topbar GS switcher; append-only avoids ACL complexity.
- **Phase 7 (Schedule Next Visit + .ics + Calendar URL)** remains separate.

---

## Architecture

### File structure
All edits go to `gs-command-center.html`. No new files.

### Data layer
Reuses the existing `gs_cmd_<gs>_stopdata` schema. `loadStopRecord(stopId)` already initializes `notes: []` (and `visits: []` reserved for Phase 7).

Each Phase 6 note entry is shape:
```js
{
  id: 'note_<timestamp>',
  date: ISO_STRING,        // new Date().toISOString()
  author: 'GS Name',       // getActiveGS() in GS mode, 'Manager' in All-GS
  body: 'free-form text'   // trimmed
}
```

Append-only — entries are pushed to the front of the array (newest first).

Persistence routes through the existing `saveData()` (the same call used by Activity Log, CRM tasks, etc.). No new localStorage key. No schema version bump.

### New helpers
- **`notesEntriesHTML(stopId)`** — pure renderer; outputs the list of notes (newest first) + a compose row (textarea + Save button). Used by both surfaces. Compose row is hidden in Manager All-GS mode.
- **`pageNotesHTML(stopId)`** — thin Stop Detail Page wrapper; returns `<div class="drawer-card">…</div>` containing the result of `notesEntriesHTML`.
- **`addNoteFromInput(stopId)`** — reads the input, prepends a new entry, persists, re-renders.
- **`buildShareSummary(stopId)`** — pure function returning the plain-text snapshot string. Single source of truth shared by Copy + Email so both produce byte-identical output.
- **`copyShareSummary(stopId)`** — copies the summary to clipboard via `navigator.clipboard.writeText`, with `document.execCommand('copy')` fallback for older browsers / non-HTTPS contexts.
- **`emailShareSummary(stopId)`** — opens `mailto:?subject=…&body=…` with the summary as the URL-encoded body. No recipient pre-fill.

### Renderer integration
- **Drawer** (`openSiteDrawer`): new `<div class="drawer-section"><h4>📝 Notes (N)</h4>…</div>` placed directly after the Activity Log section. The section wraps a call to `notesEntriesHTML(stopId)`.
- **Stop Detail Page** (`renderStopDetailPage`): new `${pageNotesHTML(stopId)}` slot in the LEFT column, right after `pageActivityLogHTML`. Order becomes: Location → Membership → Rewards → Value Prop → Rack → Activity Log → **Notes**.
- **Header bar** (`pageHeaderHTML`): two new buttons — `📋 Copy` and `📧 Email` — added to the existing `.sd-actions` div, placed before the existing Print + Export CSV buttons. Final order: `Copy · Email · Print Report · Export CSV`.

### Manager mode (PIN 9999)
- **All-GS rollup** (no specific GS picked): notes display read-only across whichever stop's GS namespace they live in. Compose row (textarea + Save button) hidden. Copy + Email always available.
- **Specific GS picked** from the topbar selector: full read/write access — same as a regular GS PIN.

---

## Notes Panel UI

### Layout
Same in drawer and Stop Detail Page (modulo wrapper class):

```
┌─ 📝 Notes (12) ────────────────────────────┐
│ ┌────────────────────────────────────────┐ │
│ │ Add a note for this stop...            │ │
│ │                                        │ │
│ │                                  [3 lines] │
│ └────────────────────────────────────────┘ │
│                              [💾 Save Note] │
│ ── ──────────────────────────────────────── │
│  2026-05-04 09:42  Garrick                 │
│  Owner just renewed for 12 months. Pricing │
│  locked through 2027.                      │
│ ── ──────────────────────────────────────── │
│  ...
└────────────────────────────────────────────┘
```

### Compose row (top)
- `<textarea>` 3 rows tall, full width, placeholder "Add a note for this stop…".
- `id="notes-input-<stopId>"` so drawer + page panels don't collide on the same DOM.
- 💾 Save Note button → `addNoteFromInput(stopId)`. Disabled when textarea is empty/whitespace.
- Manager All-GS mode: textarea + button hidden entirely.

### Entries list (below)
- Newest first.
- Each entry: timestamp (`YYYY-MM-DD HH:MM`) · author name · body.
- Body uses `white-space: pre-wrap` so line breaks in the source text reflow naturally.
- Border-top separator between entries.
- After 10 entries, the rest are hidden behind a `[+ Show all <N> notes]` toggle, mirroring the Vendor Opportunity top-10 pattern from Phase 3.1.
- Empty state: muted "No notes yet. Use the box above to start." text.

### Save flow
1. Read trimmed textarea value. If empty → toast "Empty note" and return.
2. Push `{ id: 'note_'+Date.now(), date: new Date().toISOString(), author: getActiveGS() || 'Manager', body: trimmedText }` to the front of `stopdata[stopId].notes`.
3. Call `saveData()`.
4. Clear the textarea.
5. Re-render: drawer side calls `openSiteDrawer(stopId)`, page side calls `renderStopDetailPage(stopId)`. Same pattern as Activity Log save.
6. Toast "Note added".

### CSS additions (small block)
- `.notes-entry` — `padding: 8px 0; border-top: 1px solid var(--border); font-size: .82em;`
- `.notes-entry-meta` — `font-size: .68em; color: var(--muted);`
- `.notes-entry-body` — `margin-top: 4px; white-space: pre-wrap; line-height: 1.4;`
- `.notes-empty` — muted/italic empty state.
- `.notes-input` — textarea styling matching existing `.fg textarea` look.

### Print
Notes print by default. The existing `@media print` block already targets `#p-stop-detail` and the left column reflows naturally.

---

## Share Results (Copy + Email)

### Header bar buttons
Final order in `.sd-actions` (left to right):
```
[📋 Copy]  [📧 Email]  [🖨 Print Report]  [📊 Export CSV]
```
Both Copy and Email use the standard `btn` class — no special color treatment.

### `buildShareSummary(stopId)` output

```
115 Truck Stop (R03650) — Marshall, MI
GS: Garrick · Apr 2026

Gallons: 324,580 MTD · 1.29M YTD (▲ 4.2% MoM)
Revenue (est): $184,011 MTD
Profit (est):  $22,498 MTD
ROI net:       $925/mo current · $5,745/mo potential

Aggregators: 5 · Fleets: 7
Vendor programs: 4 enrolled · 6 missed (top 10)
Last contact: 3d ago — call with Mike (membership renewal)

— Sent from GS Command Center
```

### Field sources (all functions/data exist today)
- Stop name, ID, city, state — `MEMBERS.find(m => m.id === stopId)`
- GS — `MANAGER_MAP[stop.state] || 'Unassigned'`
- Month label — `currentMonthKey()` formatted (e.g., "Apr 2026")
- Gallons MTD/YTD + MoM% — `stopTotalGallons`, `ytdGallonsForStop`, `priorMonthKey`
- Revenue / profit — `estRevenueGS`, `estProfitGS`
- ROI net — `computeStopROI(stopId)` returns `{ netCurrent, netPotential }`
- Aggregators / fleets — `loadFuelGD()[stopId][m].aggregators/fleets` lengths
- Vendor enrolled — `loadVendorEnrolls()[stopId]` count of `true` values
- Vendor missed (top 10) — `vendorOpportunityForStop(stopId).slice(0, 10).length`
- Last contact — `getLastContact(stopId)` returns `{date, subject, type}`. Render as `<N>d ago — <type> with subject` or `no contact logged` if `null`.

Number formatting reuses the same helpers as the KPI hero: `fmtN`, `fmt$`, `fmt$k` (for thousand-suffix amounts).

### `copyShareSummary(stopId)`
```js
const text = buildShareSummary(stopId);
navigator.clipboard.writeText(text).then(
  () => toast('Summary copied to clipboard'),
  () => copyShareSummaryFallback(text)
);
```

Fallback path:
```js
function copyShareSummaryFallback(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('Summary copied to clipboard'); }
  catch(e){ toast('Copy failed — select and copy manually'); }
  document.body.removeChild(ta);
}
```

### `emailShareSummary(stopId)`
```js
const stop = MEMBERS.find(m => m.id === stopId);
const month = formatMonthLabel(currentMonthKey());
const subject = `${stop.name} — ${month} snapshot`;
const body = buildShareSummary(stopId);
const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
window.location.href = url;
```

`formatMonthLabel(m)` is a tiny new helper — `pageRevProfitHTML` and `pageHistoryTableHTML` currently inline the same `['Jan','Feb',…][mo-1] + ' ' + y` pattern. Extract it once and reuse:
```js
function formatMonthLabel(monthKey){
  const [y, mo] = monthKey.split('-').map(Number);
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1] + ' ' + y;
}
```
Existing inline call sites stay (no refactor) — Phase 6 only uses the helper for `buildShareSummary` and `emailShareSummary`.

No recipient pre-fill — the user fills `To:` themselves. Auto-filling `siteMgrEmail` would be wrong half the time (most "share" intents are internal, not to the stop manager).

---

## Cross-Cutting Concerns

- **Live re-render on save.** Save calls re-render the originating surface (drawer or page). Other tabs read live `stopdata` lazily on next visit; no proactive cross-tab refresh.
- **Print stylesheet.** Phase 6 adds no new print rules. The Notes card inherits `#p-stop-detail` rules. The `.sd-actions` div (Copy/Email/Print/Export) is already hidden in `@media print`.
- **Drawer 🗗 Full Page button.** Unchanged. Drawer Notes section and Page Notes card are independent renderers; clicking 🗗 opens the page, which re-renders its own copy.
- **Stop Detail Page header re-render.** Saving a note re-renders the Notes card only (via `renderStopDetailPage(stopId)`). The header doesn't change between renders.
- **Mobile / desktop parity.** `mailto:` triggers the OS-default mail app on both. `navigator.clipboard.writeText` works on all modern browsers in HTTPS or `localhost` contexts; the `execCommand` fallback covers older browsers and non-HTTPS pages.

---

## Smoke Test

After Phase 6 implementation, hard-reload `gs-command-center.html`:

1. **Drawer Notes section** — open a stop's drawer; 📝 Notes section visible after Activity Log. Empty state shown.
2. **Save a note** — type text → click 💾 Save Note → entry appears at top, textarea clears, toast "Note added".
3. **Persistence** — refresh page → log back in → reopen drawer → note still there.
4. **Show-all toggle** — add 11 notes → entries 1–10 visible, entries 11+ collapsed behind `+ Show all <N> notes`. Click → all visible.
5. **Page Notes card** — drawer's 🗗 Full Page → Stop Detail Page → Notes card in left column shows the same notes as the drawer.
6. **Copy** — click `📋 Copy` in header → toast confirms → paste into a text editor → verify content matches the spec format.
7. **Email** — click `📧 Email` → mail app opens with subject `<Stop Name> — <Month YYYY> snapshot` and body matching the share summary.
8. **Manager mode (PIN 9999, All-GS)** — open same stop → Notes section shows entries; compose row (textarea + Save) hidden. Copy + Email still work.
9. **Manager mode picks specific GS** — full read/write returns; can add notes normally.
10. **Print preview** — from Stop Detail Page click 🖨 Print Report → Notes card prints inline with other left-column cards. Copy/Email/Print/Export buttons hidden in print output.

---

## File Footprint Estimate

- **CSS additions** — ~25 lines (`.notes-entry`, `.notes-entry-meta`, `.notes-entry-body`, `.notes-empty`, `.notes-input`).
- **`notesEntriesHTML`, `pageNotesHTML`, `addNoteFromInput`** — ~80 lines.
- **`buildShareSummary`, `copyShareSummary`, `copyShareSummaryFallback`, `emailShareSummary`** — ~80 lines.
- **Drawer integration** — 1 new section in `openSiteDrawer` (~5 lines).
- **Page integration** — 1 new slot in `renderStopDetailPage` left column (~1 line).
- **Header buttons** — 2 new buttons in `pageHeaderHTML` (~2 lines).

**Estimated total addition:** ~200 lines.

---

## Open Questions

None outstanding — all four design sections approved.

## References

- Spec for Phase 4 (Stop Detail Page): [2026-05-01-phase-4-stop-detail-page.md](2026-05-01-phase-4-stop-detail-page.md) — source of `pageHeaderHTML`, `pageActivityLogHTML`, `renderStopDetailPage`.
- Spec for Phase 5 (GS Management): [2026-05-01-phase-5-gs-management.md](2026-05-01-phase-5-gs-management.md) — adjacent (no overlap).
- Plan: TBD — produced by `superpowers:writing-plans` skill after this spec is approved.
