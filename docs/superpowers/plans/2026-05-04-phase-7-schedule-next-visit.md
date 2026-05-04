# GS Command Center Phase 7 — Schedule Next Visit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-person "Schedule Next Visit" feature to `gs-command-center.html`. Visits persist to the existing `gs_cmd_<gs>_stopdata[stopId].visits` array (already in schema). Per-visit actions: download an RFC 5545 `.ics` file or open a pre-filled Google Calendar template URL. Surfaces: drawer, Stop Detail Page (header button + left-column card), Calendar tab (purple visit dot in month grid + new "Upcoming Visits" card).

**Architecture:** Single-file edits to `gs-command-center.html`. Reuses existing `loadStopRecord`, `saveStopRecord`, `saveData`, `getActiveGS`, `isAllGSMode`, `forEachGS`, `MEMBERS`, `MANAGER_MAP`, `esc`, `toast`, `openModal`, `closeModal`, `currentMonthKey`. New helpers: `escapeIcsText`, `foldIcsLine`, `visitToUtcRange`, `padIcsDigits`, `scheduleVisit`, `saveVisit`, `cancelVisit`, `buildIcsForVisit`, `buildGoogleCalUrlForVisit`, `downloadIcs`, `openGoogleCalendar`, `visitsListHTML`, `pageVisitsHTML`. Mutates: `openSiteDrawer` (new section), `renderStopDetailPage` (new slot), `pageHeaderHTML` (new button), `renderCalendar` (purple dot logic + Upcoming Visits card).

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + manual browser smoke test (consolidated at Task 10).

**Spec:** [docs/superpowers/specs/2026-05-04-phase-7-schedule-next-visit.md](../specs/2026-05-04-phase-7-schedule-next-visit.md).

**Open-question decisions (per spec sign-off):**
1. Past-visit "log this" link: pre-fill Activity Log notes with `Original purpose: <purpose>` so GS just appends what happened.
2. Calendar tab "Upcoming Visits" capped at 20 (matches Calls card).
3. Visit list does NOT show "by <author>" — author retained in storage for audit only.

**Phase boundary:** Phase 8 / Auth migration is out of scope. Two-way Google sync, recurring visits, reminders, attendees, edit-in-place, completion tracking are all out of scope (see spec Non-Goals).

---

## File Structure

**Modify only:** `gs-command-center.html`

| Insertion point | What we add | Locator |
|---|---|---|
| `<style>` block | Phase 7 CSS rules (visit card, dot color, modal layout) | After last existing CSS rule, before `</style>` |
| Below the existing `<div class="overlay" id="sched-modal">…</div>` | New `<div class="overlay" id="visit-modal">…</div>` | `grep -n 'id="sched-modal"' gs-command-center.html` |
| Above `function scheduleCall` | Datetime + ICS utilities, visit CRUD, export helpers, list renderers | `grep -n "^function scheduleCall" gs-command-center.html` |
| Inside `openSiteDrawer` body | New `<div class="drawer-section"><h4>📅 Upcoming Visits…</h4>…</div>` between Activity Log and Notes sections | After Activity Log `</div>`, before Notes section |
| Inside `renderStopDetailPage` left column | New `${pageVisitsHTML(stopId)}` slot between `${pageActivityLogHTML(stopId)}` and `${pageNotesHTML(stopId)}` | Inside the LEFT `.sd-col` |
| `pageHeaderHTML` `.sd-actions` | New `📅 Schedule Visit` button between Email and Print | Inside `.sd-actions` div |
| `renderCalendar` body | Purple dot logic for visit days; new "📍 Upcoming Visits" card | After existing "Upcoming Scheduled Calls" card |

---

## Task 1: CSS additions

**Files:**
- Modify: `gs-command-center.html` (CSS block, immediately before `</style>`)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^</style>" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: a single match. New rules go on the line directly before `</style>`.

- [ ] **Step 2: Insert Phase 7 CSS rules immediately before `</style>`**

Use the Edit tool. `old_string` is the literal `</style>` line. `new_string` is the new CSS block followed by `</style>`:

```css
/* Phase 7 — Schedule Visit */
.visit-card{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-top:6px;font-size:.82em}
.visit-card.past{opacity:.65}
.visit-meta{font-size:.7em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.visit-body{margin-top:3px;line-height:1.4}
.visit-loc{font-size:.78em;color:var(--muted);margin-top:2px}
.visit-actions{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
.visit-actions .btn{font-size:.68em;padding:3px 8px}
.visit-empty{font-size:.78em;color:var(--muted);font-style:italic;padding:6px 0}
.visit-toggle{display:inline-block;cursor:pointer;color:var(--cyan);font-size:.78em;font-weight:700;padding:6px 0;margin-top:4px}
.visit-past-extra{display:none}
.visit-list.expanded .visit-past-extra{display:block}
.cal-day .cal-dot.dot-visit{background:var(--purple)}
.visit-modal-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}
.visit-modal-row .fg{flex:1;min-width:120px}
.visit-modal-row label.cb{display:flex;align-items:center;gap:6px;font-size:.78em;font-weight:600;color:var(--text);cursor:pointer;padding-bottom:7px}
</style>
```

- [ ] **Step 3: Verify CSS classes inserted**

```bash
grep -c "^\\.visit-card{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.visit-actions{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "dot-visit{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Each prints `1`.

- [ ] **Step 4: Syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT (Phase 7 uses a single batched commit at Task 10).

---

## Task 2: Visit modal HTML

**Files:**
- Modify: `gs-command-center.html` (insert new `<div class="overlay" id="visit-modal">…</div>` after the existing `sched-modal` block)

- [ ] **Step 1: Locate the existing schedule-call modal**

```bash
grep -n 'id="sched-modal"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read 18-20 lines to see the exact closing of the modal (look for the matching `</div>` that closes `<div class="overlay" id="sched-modal">` — there's a blank line + comment before the next `task-modal` overlay).

- [ ] **Step 2: Insert visit modal directly after the sched-modal closing `</div>`**

Use the Edit tool. The exact `old_string` is the closing `</div>` of the sched-modal plus the blank line and `<!-- ADD/EDIT TASK MODAL -->` comment that follows:

- `old_string`:
```
<!-- SCHEDULE CALL MODAL -->
<div class="overlay" id="sched-modal">
  <div class="modal">
    <h3>📅 Schedule Call</h3>
    <input type="hidden" id="sched-site-id">
    <div class="form-row">
      <div class="fg"><label>Date</label><input type="date" id="sched-date"></div>
      <div class="fg"><label>Time</label><input type="time" id="sched-time" value="09:00"></div>
    </div>
    <div class="fg" style="margin-bottom:10px"><label>Contact Name</label><input id="sched-contact" placeholder="Who to call..."></div>
    <div class="fg" style="margin-bottom:14px"><label>Purpose</label><textarea id="sched-purpose" rows="2" placeholder="Reason for call..."></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" onclick="closeModal('sched-modal')">Cancel</button>
      <button class="btn btn-green" onclick="saveSchedule()">Schedule</button>
    </div>
  </div>
</div>


<!-- ADD/EDIT TASK MODAL -->
```

- `new_string`:
```
<!-- SCHEDULE CALL MODAL -->
<div class="overlay" id="sched-modal">
  <div class="modal">
    <h3>📅 Schedule Call</h3>
    <input type="hidden" id="sched-site-id">
    <div class="form-row">
      <div class="fg"><label>Date</label><input type="date" id="sched-date"></div>
      <div class="fg"><label>Time</label><input type="time" id="sched-time" value="09:00"></div>
    </div>
    <div class="fg" style="margin-bottom:10px"><label>Contact Name</label><input id="sched-contact" placeholder="Who to call..."></div>
    <div class="fg" style="margin-bottom:14px"><label>Purpose</label><textarea id="sched-purpose" rows="2" placeholder="Reason for call..."></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" onclick="closeModal('sched-modal')">Cancel</button>
      <button class="btn btn-green" onclick="saveSchedule()">Schedule</button>
    </div>
  </div>
</div>

<!-- SCHEDULE VISIT MODAL (Phase 7) -->
<div class="overlay" id="visit-modal">
  <div class="modal">
    <h3>📅 Schedule Visit</h3>
    <input type="hidden" id="visit-site-id">
    <div class="visit-modal-row">
      <div class="fg"><label>Date</label><input type="date" id="visit-date"></div>
      <div class="fg" id="visit-time-wrap"><label>Time</label><input type="time" id="visit-time" value="10:00"></div>
      <div class="fg" id="visit-duration-wrap"><label>Duration (min)</label><input type="number" id="visit-duration" value="60" min="15" step="15"></div>
      <label class="cb"><input type="checkbox" id="visit-allday" onchange="toggleVisitAllDay(this.checked)"> All-day visit</label>
    </div>
    <div class="fg" style="margin-bottom:10px"><label>Location</label><input id="visit-location" placeholder="Auto-filled from stop"></div>
    <div class="fg" style="margin-bottom:10px"><label>Purpose</label><textarea id="visit-purpose" rows="2" placeholder="Reason for visit..."></textarea></div>
    <div class="fg" style="margin-bottom:14px"><label>Contact on-site (optional)</label><input id="visit-contact" placeholder="Who to meet..."></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" onclick="closeModal('visit-modal')">Cancel</button>
      <button class="btn btn-green" onclick="saveVisit()">💾 Save Visit</button>
    </div>
  </div>
</div>


<!-- ADD/EDIT TASK MODAL -->
```

- [ ] **Step 3: Verify**

```bash
grep -c 'id="visit-modal"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c 'id="visit-allday"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c 'onclick="saveVisit()"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 3: Datetime + ICS utilities

**Files:**
- Modify: `gs-command-center.html` (insert helpers above `function scheduleCall`)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^function scheduleCall" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: a single match. The new helpers go on the lines immediately above this function.

- [ ] **Step 2: Insert the datetime + ICS utility helpers**

Use the Edit tool:
- `old_string`: `function scheduleCall(siteId){`
- `new_string`:

```js
// ─── Phase 7: Schedule Visit — datetime + ICS utilities ───────────────
// Origin surface for Save dispatch: 'drawer' | 'page' | 'calendar'.
let _visitOriginSurface = 'drawer';

function padIcsDigits(d){
  const pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + pad(d.getUTCMonth()+1) + pad(d.getUTCDate())
    + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

function visitToUtcRange(visit){
  // Returns { startUtc, endUtc, isAllDay } in compact iCal-style strings.
  // Timed: '20260511T140000Z'. All-day: '20260511' (DTEND exclusive).
  if(visit.allDay){
    const [y, mo, da] = visit.date.split('-').map(Number);
    const start = new Date(y, mo-1, da);
    const end   = new Date(y, mo-1, da + 1);
    const fmtDateOnly = d => d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    return { startUtc: fmtDateOnly(start), endUtc: fmtDateOnly(end), isAllDay: true };
  }
  // Parse local 'YYYY-MM-DDTHH:MM' as a local Date — timezone offset is then
  // baked into the toUTC* methods automatically.
  const localStart = new Date(visit.date + 'T' + (visit.time||'10:00') + ':00');
  if(isNaN(localStart.getTime())) return { startUtc: '', endUtc: '', isAllDay: false };
  const dur = Math.max(15, parseInt(visit.durationMin||60, 10));
  const localEnd = new Date(localStart.getTime() + dur * 60000);
  return { startUtc: padIcsDigits(localStart), endUtc: padIcsDigits(localEnd), isAllDay: false };
}

function escapeIcsText(s){
  // RFC 5545 §3.3.11 TEXT escaping. Order matters: backslash first.
  return String(s == null ? '' : s)
    .replace(/\r/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldIcsLine(line){
  // RFC 5545 §3.1: lines longer than 75 octets MUST be folded with a
  // CRLF + leading single space (continuation marker). UTF-8 octet
  // counting matters — we approximate with a 75-char chunk for ASCII
  // and rely on the fact that our content rarely contains multibyte.
  if(line.length <= 75) return line;
  const parts = [];
  let i = 0;
  parts.push(line.slice(0, 75));
  i = 75;
  while(i < line.length){
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

function scheduleCall(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function padIcsDigits" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function visitToUtcRange" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function escapeIcsText" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function foldIcsLine" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^let _visitOriginSurface" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 4: Visit CRUD (`scheduleVisit`, `saveVisit`, `cancelVisit`, `toggleVisitAllDay`)

**Files:**
- Modify: `gs-command-center.html` (insert helpers above `function scheduleCall`, after the Task 3 utilities)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^function scheduleCall" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Still a single match. The new CRUD helpers go on the lines immediately above this function (after the Task 3 utility block).

- [ ] **Step 2: Insert the visit CRUD helpers**

Use the Edit tool:
- `old_string`: `function scheduleCall(siteId){`
- `new_string`:

```js
function scheduleVisit(siteId, surface){
  if(isAllGSMode()){ toast('Pick a specific GS to schedule a visit'); return; }
  _visitOriginSurface = surface || 'drawer';
  const stop = MEMBERS.find(m => m.id === siteId);
  document.getElementById('visit-site-id').value = siteId;
  // Default date: today + 7 days
  const d = new Date(); d.setDate(d.getDate() + 7);
  document.getElementById('visit-date').value = d.toISOString().slice(0,10);
  document.getElementById('visit-time').value = '10:00';
  document.getElementById('visit-duration').value = '60';
  document.getElementById('visit-allday').checked = false;
  toggleVisitAllDay(false);
  const loc = stop ? [stop.street, stop.city, stop.state, stop.zip].filter(x => x && String(x).trim()).join(', ') : '';
  document.getElementById('visit-location').value = loc;
  document.getElementById('visit-purpose').value = '';
  document.getElementById('visit-contact').value = '';
  openModal('visit-modal');
}

function toggleVisitAllDay(checked){
  const tw = document.getElementById('visit-time-wrap');
  const dw = document.getElementById('visit-duration-wrap');
  if(tw) tw.style.display = checked ? 'none' : '';
  if(dw) dw.style.display = checked ? 'none' : '';
}

function saveVisit(){
  if(isAllGSMode()){ toast('Pick a specific GS first'); return; }
  const siteId   = document.getElementById('visit-site-id').value;
  const date     = document.getElementById('visit-date').value;
  const time     = document.getElementById('visit-time').value;
  const duration = parseInt(document.getElementById('visit-duration').value, 10) || 60;
  const allDay   = document.getElementById('visit-allday').checked;
  const location = document.getElementById('visit-location').value.trim();
  const purpose  = document.getElementById('visit-purpose').value.trim();
  const contact  = document.getElementById('visit-contact').value.trim();
  if(!date){ toast('Date required'); return; }
  if(!purpose){ toast('Purpose required'); return; }
  const rec = loadStopRecord(siteId);
  if(!Array.isArray(rec.visits)) rec.visits = [];
  rec.visits.push({
    id: 'visit_' + Date.now(),
    date,
    time: allDay ? null : time,
    durationMin: allDay ? null : duration,
    allDay,
    purpose,
    contactName: contact,
    location,
    author: getActiveGS() || 'Manager',
    created: new Date().toISOString()
  });
  saveData();
  closeModal('visit-modal');
  toast('Visit scheduled for ' + date + (allDay ? '' : ' ' + time));
  // Re-render originating surface
  if(_visitOriginSurface === 'page' && typeof renderStopDetailPage === 'function') renderStopDetailPage(siteId);
  else if(_visitOriginSurface === 'calendar' && typeof renderCalendar === 'function') renderCalendar();
  else if(typeof openSiteDrawer === 'function') openSiteDrawer(siteId);
}

function cancelVisit(siteId, visitId, surface){
  if(isAllGSMode()){ toast('Pick a specific GS first'); return; }
  if(!confirm('Cancel this visit?')) return;
  const rec = loadStopRecord(siteId);
  if(!Array.isArray(rec.visits)) return;
  rec.visits = rec.visits.filter(v => v.id !== visitId);
  saveData();
  toast('Visit cancelled');
  if(surface === 'page' && typeof renderStopDetailPage === 'function') renderStopDetailPage(siteId);
  else if(surface === 'calendar' && typeof renderCalendar === 'function') renderCalendar();
  else if(typeof openSiteDrawer === 'function') openSiteDrawer(siteId);
}

function scheduleCall(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function scheduleVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function saveVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function cancelVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function toggleVisitAllDay" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 5: Export helpers (`buildIcsForVisit`, `buildGoogleCalUrlForVisit`, `downloadIcs`, `openGoogleCalendar`)

**Files:**
- Modify: `gs-command-center.html` (insert helpers above `function scheduleCall`, after the Task 4 CRUD)

- [ ] **Step 1: Locate the insertion point**

Same as Task 4 — directly above `function scheduleCall(siteId){`.

- [ ] **Step 2: Insert the export helpers**

Use Edit:
- `old_string`: `function scheduleCall(siteId){`
- `new_string`:

```js
function buildIcsForVisit(stop, visit){
  const range = visitToUtcRange(visit);
  if(!range.startUtc || !range.endUtc) return '';
  const stopName = stop ? stop.name : visit.location || 'Stop visit';
  const summary = 'Visit: ' + stopName;
  const descParts = [visit.purpose || ''];
  if(visit.contactName) descParts.push('', 'Contact: ' + visit.contactName);
  descParts.push('', 'Generated by Roady\'s GS Command Center');
  const description = descParts.join('\n');
  const dtstamp = padIcsDigits(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Roady\'s GS Command Center//Phase 7//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:visit-' + visit.id + '@gs-cmd-center.local',
    'DTSTAMP:' + dtstamp,
    range.isAllDay ? ('DTSTART;VALUE=DATE:' + range.startUtc) : ('DTSTART:' + range.startUtc),
    range.isAllDay ? ('DTEND;VALUE=DATE:' + range.endUtc)     : ('DTEND:' + range.endUtc),
    'SUMMARY:' + escapeIcsText(summary),
    'LOCATION:' + escapeIcsText(visit.location || ''),
    'DESCRIPTION:' + escapeIcsText(description),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

function buildGoogleCalUrlForVisit(stop, visit){
  const range = visitToUtcRange(visit);
  if(!range.startUtc || !range.endUtc) return '';
  const stopName = stop ? stop.name : visit.location || 'Stop visit';
  const text = 'Visit: ' + stopName;
  const detailParts = [visit.purpose || ''];
  if(visit.contactName) detailParts.push('', 'Contact: ' + visit.contactName);
  detailParts.push('', 'Generated by Roady\'s GS Command Center');
  const details = detailParts.join('\n');
  // Google's `dates=` param wants UTC compact: '20260511T140000Z/20260511T150000Z'
  // for timed events, or 'YYYYMMDD/YYYYMMDD' for all-day (exclusive end).
  const dates = range.startUtc + '/' + range.endUtc;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates,
    details,
    location: visit.location || '',
    trp: 'false'
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function downloadIcs(siteId, visitId){
  const stop = MEMBERS.find(m => m.id === siteId);
  const rec = loadStopRecord(siteId);
  const visit = (rec.visits || []).find(v => v.id === visitId);
  if(!visit){ toast('Visit not found'); return; }
  const ics = buildIcsForVisit(stop, visit);
  if(!ics){ toast('Invalid visit datetime'); return; }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // Defensive: strip filesystem-unsafe chars from the stop ID
  const safeId = (siteId || 'stop').replace(/[\/\\:*?"<>|]/g, '');
  a.href = url;
  a.download = safeId + '-' + visit.date + '.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
  toast('Downloaded ' + a.download);
}

function openGoogleCalendar(siteId, visitId){
  const stop = MEMBERS.find(m => m.id === siteId);
  const rec = loadStopRecord(siteId);
  const visit = (rec.visits || []).find(v => v.id === visitId);
  if(!visit){ toast('Visit not found'); return; }
  const url = buildGoogleCalUrlForVisit(stop, visit);
  if(!url){ toast('Invalid visit datetime'); return; }
  window.open(url, '_blank', 'noopener');
}

function scheduleCall(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function buildIcsForVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function buildGoogleCalUrlForVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function downloadIcs" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function openGoogleCalendar" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 6: List renderers (`visitsListHTML`, `pageVisitsHTML`)

**Files:**
- Modify: `gs-command-center.html` (insert helpers above `function scheduleCall`, after the Task 5 export helpers)

- [ ] **Step 1: Locate the insertion point**

Same as Task 5 — directly above `function scheduleCall(siteId){`.

- [ ] **Step 2: Insert the renderers**

Use Edit:
- `old_string`: `function scheduleCall(siteId){`
- `new_string`:

```js
function visitsListHTML(stopId, opts){
  // opts.surface = 'drawer' | 'page' — controls which Save dispatch the
  // schedule button uses. Manager All-GS mode hides the schedule button
  // and per-visit Cancel chips; Google + .ics actions stay available.
  const surface = (opts && opts.surface) || 'drawer';
  const allMode = isAllGSMode();
  const rec = loadStopRecord(stopId);
  const visits = Array.isArray(rec.visits) ? rec.visits.slice() : [];
  // Ascending by start datetime
  const sortKey = v => v.date + 'T' + (v.time || '00:00');
  visits.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  // Split future vs past — past = strictly before today's local midnight
  const todayKey = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  })();
  const future = visits.filter(v => v.date >= todayKey);
  const past   = visits.filter(v => v.date <  todayKey);

  const fmtRow = (v, isPast) => {
    const timeLine = v.allDay ? 'All day' : ((v.time || '—') + ' · ' + (v.durationMin || 60) + ' min');
    const actions = [];
    actions.push(`<button class="btn" onclick="openGoogleCalendar('${esc(stopId)}','${esc(v.id)}')">🗓 Google</button>`);
    actions.push(`<button class="btn" onclick="downloadIcs('${esc(stopId)}','${esc(v.id)}')">⬇️ .ics</button>`);
    if(!allMode && !isPast){
      actions.push(`<button class="btn btn-red" onclick="cancelVisit('${esc(stopId)}','${esc(v.id)}','${surface}')">✕ Cancel</button>`);
    }
    if(isPast){
      const subj = 'Visit on ' + v.date + ' — ' + (v.purpose || '');
      const noteSeed = 'Original purpose: ' + (v.purpose || '');
      actions.push(`<button class="btn" onclick="logPastVisit('${esc(stopId)}','${esc(subj)}','${esc(noteSeed)}')">📝 Log this</button>`);
    }
    return `<div class="visit-card${isPast ? ' past' : ''}">
      <div class="visit-meta">${esc(v.date)} · ${esc(timeLine)}</div>
      <div class="visit-body">${esc(v.purpose||'')}</div>
      ${v.contactName ? `<div class="visit-loc">Contact: ${esc(v.contactName)}</div>` : ''}
      ${v.location ? `<div class="visit-loc">📍 ${esc(v.location)}</div>` : ''}
      <div class="visit-actions">${actions.join('')}</div>
    </div>`;
  };

  let html = '';
  if(!allMode){
    html += `<div style="margin-bottom:8px"><button class="btn btn-cyan" onclick="scheduleVisit('${esc(stopId)}','${surface}')" style="font-size:.74em">+ Schedule Visit</button></div>`;
  }
  if(!future.length && !past.length){
    html += `<div class="visit-empty">No upcoming visits.${allMode ? '' : ' Click + Schedule Visit to plan one.'}</div>`;
  } else {
    if(future.length){
      html += `<div class="visit-list">${future.map(v => fmtRow(v, false)).join('')}</div>`;
    } else {
      html += `<div class="visit-empty">No upcoming visits.${allMode ? '' : ' Click + Schedule Visit to plan one.'}</div>`;
    }
    if(past.length){
      const pastHTML = past.slice().reverse().map(v => fmtRow(v, true)).join('');
      html += `<div class="visit-list" id="visit-past-list-${esc(stopId)}-${surface}">
        <div class="visit-toggle" onclick="togglePastVisits(this)" data-count="${past.length}">+ Show ${past.length} past visit${past.length===1?'':'s'}</div>
        <div class="visit-past-extra">${pastHTML}</div>
      </div>`;
    }
  }
  return html;
}

function togglePastVisits(btn){
  const list = btn.parentElement;
  if(!list) return;
  const expanded = list.classList.toggle('expanded');
  const count = btn.dataset.count || '0';
  btn.textContent = expanded ? '− Hide past visits' : ('+ Show ' + count + ' past visit' + (count==='1' ? '' : 's'));
}

function logPastVisit(stopId, subject, notesSeed){
  // Open the existing addLog modal with the subject + notes pre-filled.
  // The user reviews and clicks Save in the existing flow.
  if(typeof addLog === 'function') addLog(stopId);
  setTimeout(() => {
    const subjEl = document.getElementById('log-subject');
    const notesEl = document.getElementById('log-notes');
    if(subjEl) subjEl.value = subject;
    if(notesEl) notesEl.value = notesSeed;
  }, 0);
}

function pageVisitsHTML(stopId){
  const rec = loadStopRecord(stopId);
  const todayKey = (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  })();
  const upcoming = (rec.visits || []).filter(v => v.date >= todayKey).length;
  return `
    <div class="drawer-card">
      <div class="drawer-card-hd">📅 Upcoming Visits (${upcoming})</div>
      ${visitsListHTML(stopId, {surface:'page'})}
    </div>
  `;
}

function scheduleCall(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function visitsListHTML" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function pageVisitsHTML" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function togglePastVisits" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function logPastVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 7: Drawer integration — Visits section between Activity Log and Notes

**Files:**
- Modify: `gs-command-center.html` (`openSiteDrawer` body)

- [ ] **Step 1: Locate the Notes section in `openSiteDrawer`**

```bash
grep -n "📝 Notes (\${(loadStopRecord(siteId).notes" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match. Read 8-10 lines starting from the match to see the exact `<div class="drawer-section"><h4>📝 Notes…</h4>…</div>` block (it's immediately preceded by the Activity Log section's closing `</div>`).

- [ ] **Step 2: Insert the new Visits `<div class="drawer-section">` directly above the Notes section**

Use the Edit tool. The exact `old_string` is the Notes section opening as it currently exists (4-space indented inside the drawer template):

- `old_string`:
```
    <div class="drawer-section">
      <h4>📝 Notes (${(loadStopRecord(siteId).notes||[]).length})</h4>
      ${notesEntriesHTML(siteId, {surface:'drawer'})}
    </div>
```

- `new_string`:
```
    <div class="drawer-section">
      <h4>📅 Upcoming Visits (${(() => { const rec=loadStopRecord(siteId); const today=new Date(); const tk=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'); return (rec.visits||[]).filter(v=>v.date>=tk).length; })()})</h4>
      ${visitsListHTML(siteId, {surface:'drawer'})}
    </div>

    <div class="drawer-section">
      <h4>📝 Notes (${(loadStopRecord(siteId).notes||[]).length})</h4>
      ${notesEntriesHTML(siteId, {surface:'drawer'})}
    </div>
```

⚠️ Verify the new block uses the same 4-space indentation as the existing Notes block. The IIFE counts only future visits (matches the page header card label).

- [ ] **Step 3: Verify**

```bash
grep -c "📅 Upcoming Visits (\\${" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "visitsListHTML(siteId, {surface:'drawer'})" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 8: Stop Detail Page integration — left-column slot + header button

**Files:**
- Modify: `gs-command-center.html` (`renderStopDetailPage` left column + `pageHeaderHTML`)

- [ ] **Step 1: Locate the page left-column slot order**

```bash
grep -n "\\${pageNotesHTML(stopId)}" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match (inside `renderStopDetailPage`). Read 4-6 lines to see the surrounding pattern — `${pageActivityLogHTML(stopId)}` is on the line above.

- [ ] **Step 2: Insert `${pageVisitsHTML(stopId)}` between Activity Log and Notes**

Use the Edit tool:

- `old_string`:
```
        ${pageActivityLogHTML(stopId)}
        ${pageNotesHTML(stopId)}
```

- `new_string`:
```
        ${pageActivityLogHTML(stopId)}
        ${pageVisitsHTML(stopId)}
        ${pageNotesHTML(stopId)}
```

- [ ] **Step 3: Add `📅 Schedule Visit` button to `pageHeaderHTML` `.sd-actions` between Email and Print**

Use the Edit tool:

- `old_string`:
```
      <div class="sd-actions">
        <button class="btn" onclick="copyShareSummary('${esc(stopId)}')">📋 Copy</button>
        <button class="btn" onclick="emailShareSummary('${esc(stopId)}')">📧 Email</button>
        <button class="btn" onclick="printStopDetail()">🖨 Print Report</button>
        <button class="btn btn-green" onclick="exportStopDetailCSV('${esc(stopId)}')">📊 Export CSV</button>
      </div>
```

- `new_string`:
```
      <div class="sd-actions">
        <button class="btn" onclick="copyShareSummary('${esc(stopId)}')">📋 Copy</button>
        <button class="btn" onclick="emailShareSummary('${esc(stopId)}')">📧 Email</button>
        ${isAllGSMode() ? '' : `<button class="btn btn-cyan" onclick="scheduleVisit('${esc(stopId)}','page')">📅 Schedule Visit</button>`}
        <button class="btn" onclick="printStopDetail()">🖨 Print Report</button>
        <button class="btn btn-green" onclick="exportStopDetailCSV('${esc(stopId)}')">📊 Export CSV</button>
      </div>
```

- [ ] **Step 4: Verify**

```bash
grep -c "\\${pageVisitsHTML(stopId)}" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "scheduleVisit('\\${esc(stopId)}','page')" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1.

- [ ] **Step 5: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

- [ ] **Step 6: Browser smoke test (intermediate)**

Hard-reload `gs-command-center.html`, log in as a per-GS PIN. Click any stop → drawer → 📅 Upcoming Visits section visible between Activity Log and Notes. Click + Schedule Visit → modal opens with date pre-filled (today + 7 days), location pre-filled. Type a purpose → Save → toast → entry appears, drawer re-renders. Click 🗗 Full Page → Stop Detail Page → Visits card in left column with the same entry and a 📅 Schedule Visit button in the header. Click ⬇️ .ics → file downloads → open in editor → BEGIN:VCALENDAR / DTSTART / SUMMARY all present.

DO NOT COMMIT.

---

## Task 9: Calendar tab integration — purple visit dot + Upcoming Visits card

**Files:**
- Modify: `gs-command-center.html` (`renderCalendar`)

- [ ] **Step 1: Locate `renderCalendar`**

```bash
grep -n "^function renderCalendar" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read the full body (~50 lines) to see the dot loop and the Upcoming Calls card. The visits we surface here come from every stop in the current GS namespace; in All-GS mode we walk every namespace via `forEachGS`.

- [ ] **Step 2: Replace `renderCalendar` body with the visits-aware version**

Use the Edit tool. `old_string` is the entire current function body (`function renderCalendar(){ … }`). `new_string` is the same function with three additions: a `monthVisitDays` set built from `_collectAllVisits()`, a second `cal-dot dot-visit` span when a day has a visit, and a new "📍 Upcoming Visits" card below the Calls card.

The simplest implementation re-uses one helper that's already inline-friendly — define `_collectAllVisits()` at the top of the function so it stays scoped:

- `old_string`: the entire current body, beginning with `function renderCalendar(){` and ending with `}` immediately before the next `function` declaration. Read the exact lines first.

- `new_string`: same shape, with these three changes:

```js
function renderCalendar(){
  const now=new Date();
  const first=new Date(calYear,calMonth,1);
  const last=new Date(calYear,calMonth+1,0);
  const startDay=first.getDay();
  const daysInMonth=last.getDate();
  const monthName=first.toLocaleString('default',{month:'long',year:'numeric'});

  // Walk every stopdata namespace (or just the active one) to collect visits.
  // Returns array of { stopId, visit, gs }. Ascending by start datetime.
  function _collectAllVisits(){
    const out = [];
    const allMode = isAllGSMode();
    const collectFromNS = (key, gs) => {
      try {
        const sd = JSON.parse(localStorage.getItem(key) || '{}') || {};
        for(const [stopId, rec] of Object.entries(sd)){
          if(!rec || !Array.isArray(rec.visits)) continue;
          for(const v of rec.visits) out.push({ stopId, visit: v, gs });
        }
      } catch(e){}
    };
    if(allMode){
      forEachGS((gsName, ns) => collectFromNS(ns('stopdata'), gsName));
    } else {
      const active = getActiveGS();
      if(active) collectFromNS(LS_KEY + active + '_stopdata', active);
    }
    out.sort((a,b) => (a.visit.date + 'T' + (a.visit.time||'00:00')).localeCompare(b.visit.date + 'T' + (b.visit.time||'00:00')));
    return out;
  }

  const allVisits = _collectAllVisits();

  // Get events for this month
  const monthCalls=scheduledCalls.filter(c=>{const d=new Date(c.date);return d.getMonth()===calMonth&&d.getFullYear()===calYear;});
  const callDays=new Set(monthCalls.map(c=>new Date(c.date).getDate()));
  const monthVisits=allVisits.filter(x => {
    const [y, mo] = x.visit.date.split('-').map(Number);
    return (y === calYear) && (mo === calMonth + 1);
  });
  const visitDays=new Set(monthVisits.map(x => parseInt(x.visit.date.split('-')[2], 10)));

  let calHTML=`<div class="card"><div class="card-hd" style="justify-content:space-between">
    <span>📅 ${monthName}</span>
    <div style="display:flex;gap:6px">
      <button class="btn" onclick="calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar()">&lt;</button>
      <button class="btn" onclick="calMonth=new Date().getMonth();calYear=new Date().getFullYear();renderCalendar()">Today</button>
      <button class="btn" onclick="calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar()">&gt;</button>
    </div></div>
    <div class="cal-grid">
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>'<div class="cal-hd">'+d+'</div>').join('')}
  `;
  for(let i=0;i<startDay;i++)calHTML+='<div class="cal-day other"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const isToday=(d===now.getDate()&&calMonth===now.getMonth()&&calYear===now.getFullYear());
    const hasCall=callDays.has(d);
    const hasVisit=visitDays.has(d);
    let dots = '';
    if(hasCall) dots += '<span class="cal-dot dot-call"></span>';
    if(hasVisit) dots += '<span class="cal-dot dot-visit"></span>';
    calHTML+=`<div class="cal-day${isToday?' today':''}">${d}${dots}</div>`;
  }
  calHTML+='</div></div>';

  // Upcoming calls list
  const upcoming=scheduledCalls.filter(c=>new Date(c.date+'T'+c.time)>=new Date()).sort((a,b)=>new Date(a.date+'T'+a.time)-new Date(b.date+'T'+b.time));
  calHTML+=`<div class="card"><div class="card-hd">📞 Upcoming Scheduled Calls (${upcoming.length})</div>`;
  if(upcoming.length){
    calHTML+=upcoming.slice(0,20).map(c=>{
      const s=MEMBERS.find(m=>m.id===c.siteId);
      return `<div class="log-entry age-fresh" style="cursor:pointer" onclick="openSiteDrawer('${c.siteId}')">
        <span class="log-date">${c.date} ${c.time}</span>
        <span style="font-size:.78em;color:var(--cyan);margin-left:6px">${esc(s?.name||c.siteId)}</span>
        <div class="log-body">${c.contact?'<b>Contact:</b> '+esc(c.contact)+' · ':''}${esc(c.purpose||'')}</div>
      </div>`;
    }).join('');
  } else {
    calHTML+='<div style="padding:16px;text-align:center;color:var(--muted);font-size:.82em">No upcoming calls scheduled.</div>';
  }
  calHTML+='</div>';

  // Phase 7 — Upcoming visits card
  const todayKey = (() => {
    const dd = new Date();
    return dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
  })();
  const upcomingVisits = allVisits.filter(x => x.visit.date >= todayKey);
  const allMode = isAllGSMode();
  calHTML+=`<div class="card"><div class="card-hd">📍 Upcoming Visits (${upcomingVisits.length})</div>`;
  if(upcomingVisits.length){
    calHTML+=upcomingVisits.slice(0,20).map(x=>{
      const s=MEMBERS.find(m=>m.id===x.stopId);
      const tlbl = x.visit.allDay ? 'All day' : (x.visit.time + ' · ' + (x.visit.durationMin||60) + ' min');
      const gsTag = allMode ? `<span style="font-size:.7em;color:var(--muted);margin-left:6px">[${esc(x.gs)}]</span>` : '';
      return `<div class="log-entry age-fresh" style="cursor:pointer" onclick="openSiteDrawer('${esc(x.stopId)}')">
        <span class="log-date">${esc(x.visit.date)} ${esc(tlbl)}</span>
        <span style="font-size:.78em;color:var(--purple);margin-left:6px">${esc(s?.name||x.stopId)}</span>${gsTag}
        <div class="log-body">${esc(x.visit.purpose||'')}${x.visit.contactName?' · <b>Contact:</b> '+esc(x.visit.contactName):''}</div>
        <div class="visit-actions" style="margin-top:6px">
          <button class="btn" onclick="event.stopPropagation();openGoogleCalendar('${esc(x.stopId)}','${esc(x.visit.id)}')">🗓 Google</button>
          <button class="btn" onclick="event.stopPropagation();downloadIcs('${esc(x.stopId)}','${esc(x.visit.id)}')">⬇️ .ics</button>
          ${allMode ? '' : `<button class="btn btn-red" onclick="event.stopPropagation();cancelVisit('${esc(x.stopId)}','${esc(x.visit.id)}','calendar')">✕ Cancel</button>`}
        </div>
      </div>`;
    }).join('');
    if(upcomingVisits.length > 20){
      calHTML+=`<div style="font-size:.72em;color:var(--muted);text-align:center;padding:6px">Showing first 20 of ${upcomingVisits.length}</div>`;
    }
  } else {
    calHTML+='<div style="padding:16px;text-align:center;color:var(--muted);font-size:.82em">No upcoming visits scheduled.</div>';
  }
  calHTML+='</div>';

  document.getElementById('cal-content').innerHTML=calHTML;
}
```

- [ ] **Step 3: Verify**

```bash
grep -c "_collectAllVisits" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "📍 Upcoming Visits" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "dot-visit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 (function only used in renderCalendar), 1, 2 (CSS + HTML).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 10: Final smoke + commit + push

**Files:**
- (No code changes; verification + commit + push only.)

- [ ] **Step 1: Final overall syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 2: Diff stat**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" diff --stat gs-command-center.html
```

Expected: ~360 lines added.

- [ ] **Step 3: Browser smoke checklist**

Hard-reload `gs-command-center.html`.

- [ ] **Drawer Visits section** — open a stop's drawer; 📅 Upcoming Visits section visible between Activity Log and Notes. Empty state shown.
- [ ] **Schedule a visit (drawer)** — click + Schedule Visit → modal opens with date pre-filled (today + 7 days), time `10:00`, duration `60`, location pre-filled. Type a purpose → Save → toast → entry appears. Persists across reload.
- [ ] **All-day toggle** — re-open modal, check All-day → time + duration rows hide → Save → list shows "All day".
- [ ] **`.ics` download** — click ⬇️ .ics on a visit → file downloads `<stopId>-<date>.ics` → open in text editor → verify BEGIN:VCALENDAR, DTSTART, escaped SUMMARY/DESCRIPTION, END:VCALENDAR. Drag into Google Calendar / Outlook → event imports cleanly.
- [ ] **Google Calendar URL** — click 🗓 Google → new tab opens `calendar.google.com/calendar/render?action=TEMPLATE&...` with title, dates, location, details pre-filled.
- [ ] **Cancel a visit** — click ✕ Cancel → confirm → entry removed → toast.
- [ ] **Stop Detail Page Visits card** — drawer's 🗗 Full Page → page → Visits card in left column between Activity Log and Notes. Same entries.
- [ ] **Stop Detail Page header** — 📅 Schedule Visit button visible between Email and Print → opens same modal → save flows back to page.
- [ ] **Calendar tab — month grid dots** — month grid shows purple dot on visit days, cyan dot on call days, both dots if both.
- [ ] **Calendar tab — Upcoming Visits card** — appears below Upcoming Scheduled Calls → lists future visits sorted soonest first → 🗓 Google / ⬇️ .ics chips work → ✕ Cancel works → row click opens stop drawer.
- [ ] **Past visit "Log this"** — manually create a visit with date in the past (or wait a day) → visit appears under "Show <N> past visits" toggle → click 📝 Log this → addLog modal opens with subject + notes pre-filled → save → activity log entry created.
- [ ] **Manager mode (PIN 9999, All-GS)** — open same stop → Visits section visible; + Schedule Visit hidden; ✕ Cancel chips hidden. 🗓 Google / ⬇️ .ics still work. Calendar tab walks every namespace, shows visits across all GSs with a `[GS Name]` tag. Page header has no Schedule Visit button.
- [ ] **Manager picks specific GS** — full read/write returns; can schedule visits normally.
- [ ] **Print** — click 🖨 Print Report → preview shows Visits card inline. Modal overlay hidden.
- [ ] **RFC 5545 line folding** — schedule a visit with a 200+ char purpose. Open .ics → DESCRIPTION line is folded with leading-space continuation per spec.
- [ ] **Special-character escaping** — schedule a visit with semicolons, commas, backslashes, newlines in purpose. Open .ics → chars escaped per RFC 5545. Open Google URL → chars URL-encoded.
- [ ] **Phase 6 regression** — Notes panel, Copy, Email all still work.
- [ ] **Phase 4/5 regression** — KPI hero strip, charts, Map, Manager Editor, drill panel state highlight all still work.

- [ ] **Step 4: Commit Phase 7**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html "docs/superpowers/specs/2026-05-04-phase-7-schedule-next-visit.md" "docs/superpowers/plans/2026-05-04-phase-7-schedule-next-visit.md" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 7: Schedule Next Visit (.ics + Google Cal)

Schedule in-person stop visits from the drawer, Stop Detail Page, or
Calendar tab. Visits persist to existing gs_cmd_<gs>_stopdata[stopId].
visits[] (already in schema). Per-visit actions: download RFC 5545 .ics
or open pre-filled Google Calendar template URL.

- New helpers: visitToUtcRange, escapeIcsText, foldIcsLine, padIcsDigits,
  scheduleVisit, saveVisit, cancelVisit, toggleVisitAllDay, logPastVisit,
  buildIcsForVisit, buildGoogleCalUrlForVisit, downloadIcs,
  openGoogleCalendar, visitsListHTML, pageVisitsHTML, togglePastVisits.
- New visit-modal supports date, time, duration, all-day toggle,
  location (pre-filled from stop), purpose, on-site contact.
- Drawer: 📅 Upcoming Visits section between Activity Log and Notes.
- Stop Detail Page: pageVisitsHTML in left column between Activity Log
  and Notes; 📅 Schedule Visit button in header (Copy · Email · Visit
  · Print · CSV).
- Calendar tab: purple cal-dot on visit days alongside cyan call dot;
  new 📍 Upcoming Visits card below Calls card. In All-GS mode walks
  every namespace via forEachGS to surface every GS's visits.
- Manager All-GS: schedule + cancel hidden; .ics + Google re-export
  remain available (read-only).
- buildIcsForVisit emits proper VCALENDAR/VEVENT with UID, DTSTAMP,
  TEXT escaping per RFC 5545 §3.3.11, line folding per §3.1, all-day
  events use VALUE=DATE form with exclusive DTEND.
- buildGoogleCalUrlForVisit emits action=TEMPLATE URL with UTC compact
  date range, URL-encoded text/details/location, trp=false.
- Past visits collapsed behind "+ Show <N> past visits" toggle with a
  📝 Log this action that pre-fills the existing addLog modal with
  subject + notes seeded from the visit.

Spec: docs/superpowers/specs/2026-05-04-phase-7-schedule-next-visit.md
Plan: docs/superpowers/plans/2026-05-04-phase-7-schedule-next-visit.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" push origin gs-command-center-workstation
```

---

## Out-of-scope reminders

- **Two-way Google / Outlook sync** — needs OAuth + backend, post-Phase-7 Auth migration.
- **Recurring visits / RRULE** — out of scope.
- **Reminders / VALARM** — Google's defaults handle this; explicit alarms can land later.
- **Attendees / ATTENDEE** — users send invites manually outside the app.
- **Edit-in-place** — v1 supports Create + Cancel only; edit is cancel-then-readd.
- **Visit completion / outcome** — captured via existing addLog (Activity Log), not Phase 7. Past-visit "Log this" link bridges the two flows.
- **Slack / Teams / SMS share** — out of scope.
- **Phase 6 (Notes + Share)** unchanged.
