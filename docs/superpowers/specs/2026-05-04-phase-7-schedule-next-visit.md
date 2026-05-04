# Phase 7 — Schedule Next Visit (.ics + Google Calendar)

**Status:** Spec
**Date:** 2026-05-04
**File scope:** `gs-command-center.html` only.

---

## Goal

Let a GS schedule an **in-person stop visit** from the Stop Detail Page or the slide-in drawer, persist it in the existing `stopdata[stopId].visits[]` slot, and export it to the GS's calendar of choice via:

1. **Downloadable `.ics`** file (RFC 5545 VCALENDAR/VEVENT) — works with Google Calendar, Outlook, Apple Calendar, Thunderbird, etc.
2. **Google Calendar URL** (`https://calendar.google.com/calendar/render?action=TEMPLATE&...`) — opens a pre-filled new-event form in a new tab.

The local Calendar tab gains an "Upcoming Visits" card alongside the existing "Upcoming Scheduled Calls" card, and visit days get a second dot color in the month grid.

This is purely client-side. No backend, no OAuth, no two-way Google sync.

---

## Non-Goals

- **Two-way sync** with Google Calendar / Outlook / iCloud. Requires OAuth + backend; deferred to the post-Phase-7 Auth migration.
- **Sending invites to attendees** (`ATTENDEE` field). Most field visits don't need RSVPs; users handle invites manually outside the app. Keeps `.ics` and Google URL trivial.
- **Recurring visits** (`RRULE`). Date math is messy and the use case is rare. Users can create multiple individual visits.
- **Reminders / pop-up alarms** (`VALARM`). Google's defaults handle this; explicit alarms can land later if asked for.
- **Edit visit in place.** v1 supports Create + Cancel (delete) only — same simplicity stance as Phase 6 Notes. Edit-via-cancel-then-re-add is acceptable because re-export to Google / `.ics` is one click on the new entry.
- **Visit completion / outcome tracking.** When a visit happens, the GS logs it via the existing Activity Log (`addLog`), not via Phase 7. v1 visits are forward-looking only.
- **Cross-tab Slack / Teams / SMS share** of the visit. Out of scope (same reasoning as Phase 6 share targets).
- **Phase 6 features** (Notes panel, Share Results) are unchanged.

---

## Architecture

### File structure
All edits go to `gs-command-center.html`. No new files.

### Data layer
Reuses the existing `stopdata` schema. `loadStopRecord(stopId)` already initializes `visits: []`, so no schema bump.

Each Phase 7 visit entry:
```js
{
  id: 'visit_<timestamp>',
  date: 'YYYY-MM-DD',          // local date (no timezone)
  time: 'HH:MM' | null,        // 24h local time; null when allDay=true
  durationMin: 60,             // ignored when allDay=true
  allDay: false,
  purpose: 'free-form text',   // trimmed
  contactName: 'optional',     // trimmed
  location: 'optional',        // pre-filled from stop street/city/state, editable
  author: 'GS Name',           // getActiveGS() — same convention as Notes
  created: ISO_STRING
}
```

Persistence routes through the existing `saveData()` (same call used by Notes, CRM tasks, Activity Log). No new localStorage key.

### New helpers

#### Visit CRUD
- **`scheduleVisit(stopId)`** — opens the Visit modal; pre-fills date (today + 7 days), time (`10:00`), duration (`60`), location (from `MEMBERS` record).
- **`saveVisit()`** — reads modal fields, validates date, pushes to `stopdata[stopId].visits`, calls `saveData()`, closes modal, re-renders the originating surface.
- **`cancelVisit(stopId, visitId)`** — confirm dialog → splice from array → `saveData()` → re-render.

#### Export helpers (pure functions — no DOM, no side effects, easily testable)
- **`buildIcsForVisit(stop, visit)`** → string with `\r\n` line endings, RFC 5545 compliant.
- **`buildGoogleCalUrlForVisit(stop, visit)`** → fully URL-encoded `https://calendar.google.com/calendar/render?...` URL.
- **`downloadIcs(stop, visit)`** — wraps `buildIcsForVisit` in a `Blob`, triggers an `<a download>` click, revokes the URL.
- **`openGoogleCalendar(stop, visit)`** — `window.open(buildGoogleCalUrlForVisit(...), '_blank')`.

#### Datetime utilities
- **`visitToUtcRange(visit)`** → `{ startUtc, endUtc, isAllDay }`.
  - Timed: parses `date + time` as **local time** (matches what the GS typed) → converts to UTC via `Date` math → returns ISO-style strings without colons/dashes (`20260511T140000Z`).
  - All-day: returns `YYYYMMDD` for `startUtc`, and `YYYYMMDD` for the **next day** as `endUtc` (RFC 5545 + Google convention require exclusive-end for all-day).
- **`escapeIcsText(s)`** — RFC 5545 §3.3.11: backslash → `\\`, semicolon → `\;`, comma → `\,`, newlines → `\n`. Carriage returns get stripped.

### Renderer integration

#### Stop Detail Page header (`pageHeaderHTML`)
Add a **`📅 Schedule Visit`** button between `📧 Email` and `🖨 Print Report`. Final order:

```
📋 Copy · 📧 Email · 📅 Schedule Visit · 🖨 Print Report · 📊 Export CSV
```

In Manager All-GS mode the button stays visible and clickable but Save in the modal is disabled (same gating as Notes compose row). Reason: a Manager browsing the rollup might still want to .ics-export an existing visit, but creating new ones requires picking a GS so we know which namespace to write into.

Actually — simpler stance: in All-GS mode hide the "Schedule Visit" button entirely, same as Notes compose. The user can pick a GS in the topbar to create. Existing visits remain visible (read-only) in the Upcoming Visits card.

#### Stop Detail Page body
New card **`pageVisitsHTML(stopId)`** in the LEFT column, slotted between `pageActivityLogHTML(stopId)` and `pageNotesHTML(stopId)`. Final left-column order:

```
Location → Membership → Rewards → Value Prop → Rack → Activity Log → Visits → Notes
```

#### Drawer (`openSiteDrawer`)
New `<div class="drawer-section"><h4>📅 Upcoming Visits (N)</h4>…</div>` placed directly after the Activity Log section and before the Notes section. Wraps `visitsListHTML(stopId, {surface:'drawer'})`.

#### Drawer Activity Log header
Existing `📅 Schedule` button on the Activity Log header schedules a **call** (`scheduleCall`). It stays — calls and visits are different concepts. The new visits card has its own `+ Schedule Visit` button. The two buttons sit on different cards, so users won't conflate them.

#### Calendar tab (`renderCalendar`)
Two changes:
1. The month grid currently shows a single dot per day for scheduled calls. Add a second dot for visit days (`var(--purple)`). Use the existing `.cal-dot` pattern with a new class `dot-visit`.
2. After the existing "📞 Upcoming Scheduled Calls" card, append a new "📍 Upcoming Visits" card listing all future visits across all stops in the current GS namespace, sorted by datetime ascending. Each row shows: `<date> <time> · <stop name> · <purpose>` with two action chips: `🗓 Google` and `⬇️ .ics`. Clicking the row opens the stop drawer (same pattern as the Calls list).

In Manager All-GS mode the Calendar tab walks every namespace via `forEachGS` to build the visits list (mirrors the Master Dashboard's recent-activity rollup pattern). The `+ Schedule Visit` action is hidden in All-GS mode; existing visits stay viewable + re-exportable.

---

## Visit Modal UI

### New modal `visit-modal`
Reuses the standard `.overlay` + `.modal` styling (same as the Schedule Call and Add Log modals).

```
┌─ 📅 Schedule Visit ────────────────────────────────┐
│                                                    │
│ ▼ Date            ▼ Time         □ All-day visit   │
│ [2026-05-11   ]   [10:00     ]                     │
│                                                    │
│ ▼ Duration (min)                                   │
│ [60       ]                                        │
│                                                    │
│ ▼ Location (auto-filled from stop)                 │
│ [14547 22 1/2 Mile Road, Marshall, MI 49068]       │
│                                                    │
│ ▼ Purpose                                          │
│ [Quarterly check-in + Aggregator review        ]   │
│                                                    │
│ ▼ Contact on-site (optional)                       │
│ [Mike (Owner)              ]                       │
│                                                    │
│         [Cancel]  [💾 Save Visit]                  │
└────────────────────────────────────────────────────┘
```

### Field defaults / behavior
- **Date** — defaults to today + 7 days (`new Date()` + 7 days). `<input type="date">`.
- **Time** — defaults to `10:00`. Hidden + reset to `null` when "All-day visit" is checked.
- **Duration (min)** — defaults to `60`. Hidden when "All-day visit" is checked.
- **All-day visit** — checkbox; toggling re-renders the time/duration rows.
- **Location** — pre-filled with `stop.street + ', ' + stop.city + ', ' + stop.state + ' ' + stop.zip` (trimmed, comma-separated). Editable. Used directly in the `LOCATION` `.ics` field and `&location=` Google URL param.
- **Purpose** — required (toast + return if empty).
- **Contact on-site** — optional. Surfaces in the visit list and gets appended to `DESCRIPTION` / `&details=` as a "Contact: <name>" line.

### Save flow
1. Validate: date and purpose required. If missing → toast and return.
2. Build the `visit` object.
3. Push to `stopdata[stopId].visits` (newest is appended; the list view sorts by datetime so order doesn't matter).
4. `saveData()`.
5. Close modal.
6. Re-render originating surface — drawer, Stop Detail Page, or Calendar (see below).
7. Toast `Visit scheduled for <date> <time>`.

The Save flow does **not** auto-open Google Calendar or auto-download the `.ics`. Both are explicit per-row actions in the visit list (next section). Reason: many GSs may want both, neither (just want a local reminder), or only one — tying export to Save makes the modal a kludge of checkboxes and fights the principle of "Save just persists."

### Re-render dispatch
The button that opens the modal records its surface in a closure scope (`_visitOriginSurface`). On Save we re-render whichever rendered the originating surface — drawer (`openSiteDrawer`), page (`renderStopDetailPage`), or calendar (`renderCalendar`).

---

## Visits List Card

### Layout (drawer + page versions share `visitsListHTML(stopId, opts)`)

```
┌─ 📅 Upcoming Visits (3) ─────────────────────────┐
│ [+ Schedule Visit]                               │
│ ┌──────────────────────────────────────────────┐ │
│ │ 2026-05-11 · 10:00 · 60 min                  │ │
│ │ Quarterly check-in + Aggregator review       │ │
│ │ Contact: Mike (Owner)                        │ │
│ │ 📍 14547 22 1/2 Mile Road, Marshall, MI      │ │
│ │ [🗓 Google] [⬇️ .ics] [✕ Cancel]             │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ 2026-06-15 · All day                         │ │
│ │ Annual on-site audit                         │ │
│ │ ...                                          │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Sort order
Future visits ascending (soonest first). Past visits hidden by default; if any exist, show a `+ Show <N> past visits` toggle at the bottom mirroring the Phase 6 Notes "Show all" pattern. Past visits stay forever — they're a historical record. Manager clears localStorage as the escape hatch.

### Past-visit hint
For each past visit, show a muted "→ Log this in Activity Log" link that calls `addLog(stopId)` pre-filling the subject with `Visit on <date> — <purpose>`. v1 does **not** auto-create the Activity Log entry; the GS confirms the visit happened as part of writing it up.

### Empty state
"No upcoming visits. Click + Schedule Visit to plan one." (muted, italic).

### Per-visit actions
- **🗓 Google** — `openGoogleCalendar(stop, visit)` → opens a new tab with a pre-filled Google Calendar form. The user clicks Save in Google.
- **⬇️ .ics** — `downloadIcs(stop, visit)` → downloads `<stopId>-<visit-date>.ics`.
- **✕ Cancel** — confirm dialog "Cancel this visit?" → removes from `visits[]`, persists, re-renders.

### Manager All-GS mode
- `+ Schedule Visit` button hidden.
- `🗓 Google` and `⬇️ .ics` chips remain (read-only re-export is fine).
- `✕ Cancel` hidden (no destructive writes from the rollup view).

---

## ICS File Format

### Output template
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Roady's GS Command Center//Phase 7//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:visit-<visitId>@gs-cmd-center.local
DTSTAMP:<now in UTC, YYYYMMDDTHHMMSSZ>
DTSTART:<startUtc>
DTEND:<endUtc>
SUMMARY:<escaped: "Visit: <stop name>">
LOCATION:<escaped: visit.location>
DESCRIPTION:<escaped: visit.purpose + "\n\nContact: <name>" + "\n\nGenerated by Roady's GS Command Center">
END:VEVENT
END:VCALENDAR
```

All lines `\r\n` terminated. Lines longer than 75 octets get folded per RFC 5545 §3.1 (continuation lines start with a single space).

### All-day variant
For all-day visits, replace `DTSTART`/`DTEND` with the value-type-prefixed form:
```
DTSTART;VALUE=DATE:20260511
DTEND;VALUE=DATE:20260512
```

### Filename
`<stopId>-<visit-date>.ics` — e.g. `R03650-2026-05-11.ics`. Sanitized: any `/` or `\` from a stopId stripped (defensive — current stop IDs are alphanumeric).

### Character escaping
Per RFC 5545 §3.3.11 (TEXT):
- `\` → `\\`
- `;` → `\;`
- `,` → `\,`
- `\n` (literal newline) → `\n`
- `\r` stripped before escaping.

Implemented as a single `escapeIcsText(s)` helper.

---

## Google Calendar URL Format

### Template
```
https://calendar.google.com/calendar/render
  ?action=TEMPLATE
  &text=<encodeURIComponent("Visit: " + stopName)>
  &dates=<startUtcCompact>/<endUtcCompact>
  &details=<encodeURIComponent(purpose + "\n\nContact: " + contact + "\n\nGenerated by Roady's GS Command Center")>
  &location=<encodeURIComponent(location)>
  &trp=false
```

Where:
- Timed: `startUtcCompact` = `20260511T140000Z`, `endUtcCompact` = `startUtcCompact + duration`.
- All-day: `startUtcCompact` = `20260511`, `endUtcCompact` = `20260512` (exclusive end day).
- `trp=false` — "Show me as: Available" default, since most field visits don't block the GS's calendar visually.

`window.open(url, '_blank', 'noopener')` — `noopener` so a slow-loading Google tab can't reach back into our window via `window.opener`.

---

## CSS additions (small block)

- `.visit-card` — bordered box for each visit row, mirrors `.notes-entry`.
- `.visit-meta` — small timestamp + duration line, `font-size: .68em; color: var(--muted);`.
- `.visit-body` — purpose + contact lines.
- `.visit-actions` — flex row of action chips, gap 4px.
- `.cal-dot.dot-visit` — `background: var(--purple)`.
- `.visit-input-row` — flex row for the modal's date/time/all-day combo (so toggling all-day cleanly hides time + duration).

Total CSS additions ~25 lines.

---

## Cross-cutting concerns

- **Time zones.** All math uses the GS's local browser timezone via `new Date(date + 'T' + time)`. We convert to UTC at export time so the .ics / Google URL is unambiguous. If a GS travels across timezones the visit "moves" to the new local time — same behavior as a typical calendar app. The `.ics` `TZID` parameter is intentionally not used; UTC-only keeps the export portable across all calendar apps without us shipping a TZID database.
- **Print stylesheet.** The new Visits card on the Stop Detail Page inherits existing `#p-stop-detail` print rules. Action chips are inside the card and will print; that's fine for a printed report. The modal's `.overlay` is already hidden in `@media print`.
- **Drawer ↔ Page consistency.** Saving a visit from the drawer re-renders the drawer. Saving from the Stop Detail Page re-renders the page. Saving from the Calendar tab re-renders the calendar. The other surfaces show the new visit on next visit (no proactive cross-surface refresh — same pattern as Notes).
- **Empty `MEMBERS` lookup.** If the stop is somehow missing from `MEMBERS` when a user clicks `🗓 Google` / `⬇️ .ics` (data deletion edge case), fall back to `stopId` as the SUMMARY name and skip the LOCATION pre-fill. Toast a warning. Don't crash.
- **Browser support.** `URL.createObjectURL` + Blob download works on all modern browsers. `navigator.clipboard` not used. `window.open` with `noopener` works in every browser since 2018.
- **Accessibility.** Modal uses native `<input type="date">` and `<input type="time">` — keyboard + screen-reader friendly. Action chips are real `<button>` elements with `aria-label`s.

---

## Smoke Test

After Phase 7 implementation, hard-reload `gs-command-center.html`:

1. **Drawer Visits section** — open a stop's drawer; 📅 Upcoming Visits section visible after Activity Log and before Notes. Empty state shown.
2. **Schedule a visit** — click `+ Schedule Visit` → modal opens with date pre-filled (today + 7 days), time `10:00`, duration `60`, location pre-filled. Type a purpose → Save → toast → entry appears at top of list, sorted soonest first.
3. **Persistence** — refresh page → log back in → reopen drawer → visit still there.
4. **All-day toggle** — re-open modal → check All-day → time + duration rows hide → save → list shows "All day" instead of `HH:MM · 60 min`.
5. **`.ics` download** — click `⬇️ .ics` on a visit → file downloads with name `<stopId>-<date>.ics` → open in a text editor → verify lines `BEGIN:VCALENDAR`, correct `DTSTART`/`DTEND`, escaped `SUMMARY` and `DESCRIPTION`, `END:VCALENDAR`.
6. **`.ics` import** — drag the downloaded file into Google Calendar / Outlook → event imports cleanly with the right title, time, location, description.
7. **Google Calendar URL** — click `🗓 Google` → new tab opens to `calendar.google.com/calendar/render?action=TEMPLATE&...` with title, dates, location, details all pre-filled. User clicks Google's Save → event appears in Google.
8. **Cancel a visit** — click `✕ Cancel` → confirm dialog → entry disappears from list and from localStorage.
9. **Stop Detail Page Visits card** — drawer's 🗗 Full Page → Stop Detail Page → Visits card in left column shows the same visits as the drawer.
10. **Stop Detail Page header** — `📅 Schedule Visit` button visible between Email and Print → opens same modal → save flows back to the page.
11. **Calendar tab — month grid dots** — month grid shows a purple dot on visit days, cyan dot on call days, both dots if the day has both.
12. **Calendar tab — Upcoming Visits card** — appears below "Upcoming Scheduled Calls" → lists all future visits across all stops in this GS → sorted soonest first → row click opens the stop drawer → `🗓 Google` / `⬇️ .ics` chips work from this card too.
13. **Manager mode (PIN 9999, All-GS)** — open same stop → Visits section visible; `+ Schedule Visit` button hidden, `✕ Cancel` chips hidden. `🗓 Google` and `⬇️ .ics` still work (read-only re-export). Calendar tab walks every namespace; All-GS user sees every visit; Schedule button hidden there too.
14. **Manager picks specific GS** — full read/write returns; can schedule visits normally.
15. **Print preview** — from Stop Detail Page click 🖨 Print Report → Visits card prints inline with other left-column cards. Modal overlay hidden in print output (already inherited from existing `@media print`).
16. **RFC 5545 line folding** — schedule a visit with a very long purpose (200+ chars). Open the .ics in a text editor — verify lines longer than 75 octets are folded with leading-space continuation per spec.
17. **Special-character escaping** — schedule a visit with a purpose containing semicolons, commas, backslashes, and newlines. Open the .ics — those chars are escaped per RFC 5545. Open the Google URL — those chars are URL-encoded.

---

## File Footprint Estimate

- **CSS additions** — ~25 lines.
- **Visit modal HTML** — ~30 lines (new `<div class="overlay" id="visit-modal">…`).
- **Visit CRUD (`scheduleVisit`, `saveVisit`, `cancelVisit`)** — ~70 lines.
- **`buildIcsForVisit`, `buildGoogleCalUrlForVisit`, `downloadIcs`, `openGoogleCalendar`, `visitToUtcRange`, `escapeIcsText`** — ~120 lines.
- **`visitsListHTML`, `pageVisitsHTML`** — ~80 lines.
- **Drawer integration** — 1 new section (~5 lines).
- **Page integration** — 1 new slot in `renderStopDetailPage` left column (~1 line).
- **Page header button** — 1 new button (~1 line).
- **Calendar tab integration** — month-grid dot logic + new "Upcoming Visits" card (~30 lines).

**Estimated total addition:** ~360 lines.

---

## Open Questions

1. **Past-visit `→ Log this in Activity Log` link** — pre-fills the subject; should it pre-fill notes too with the original purpose, or leave notes blank? **Proposal:** pre-fill notes with `Original purpose: <purpose>` so the GS just appends what actually happened. (Decision pending sign-off.)
2. **Calendar tab "Upcoming Visits" cap** — currently the spec lists all upcoming visits. The Scheduled Calls card caps at 20 (`upcoming.slice(0,20)`). Match that cap for consistency? **Proposal:** yes, cap at 20 — extreme volumes are unlikely but consistency matters more than completeness here.
3. **Visit `created` author display** — should the visit list show "by <author>" alongside the date, like Notes does? **Proposal:** no — visits are forward-looking and the author is who scheduled it, which is rarely interesting to the viewer. Notes show author because they're contextual observations. Skip the field on display, keep it in storage for audit.

If all three proposals are accepted as-is, no spec change; the plan can proceed.

---

## References

- Spec for Phase 6 (Notes + Share): [2026-05-04-phase-6-notes-and-share.md](2026-05-04-phase-6-notes-and-share.md) — source of `notesEntriesHTML` pattern (this spec mirrors it).
- Spec for Phase 4 (Stop Detail Page): [2026-05-01-phase-4-stop-detail-page.md](2026-05-01-phase-4-stop-detail-page.md) — source of `pageHeaderHTML`, `renderStopDetailPage` left/right column layout.
- RFC 5545 — Internet Calendaring and Scheduling Core Object Specification (iCalendar). https://datatracker.ietf.org/doc/html/rfc5545
- Google Calendar URL parameters reference (community-documented). https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/main/services/google.md
- Plan: TBD — produced by `superpowers:writing-plans` skill after this spec is approved.
