# Google Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each signed-in CRM user sees their own Google Calendar on the Calendar tab, and meetings scheduled from a lead are created and deleted in that user's Google Calendar.

**Architecture:** A new unit-tested ES5 module `roadysGcal.js` owns every pure decision — the event body sent to Google, the overlay mapping, the identity check and the cross-user ownership guard. `CRM.html` owns the OAuth popup, the `fetch` calls and the rendering. Google-originated events are drawn read-only and stored nowhere; CRM-originated meetings are rows in `crm_scheduled_calls` that gain a Google event id.

**Tech Stack:** Vanilla browser JS, no build step; Google Identity Services (`accounts.google.com/gsi/client`); Google Calendar API v3; `@supabase/supabase-js@2`; `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-07-google-calendar-sync-design.md`

## Global Constraints

- **The access token is never persisted.** Not `localStorage`, not `sessionStorage`, not a cookie, not Supabase. It lives in a module-scope variable and dies with the tab.
- **No refresh tokens.** This phase stores none and requests none.
- **Google-originated events are never written to any table.** They are held in memory for the visible month and discarded.
- **Write to Google only when `RoadysGcal.mayWriteGoogle(record, sessionEmail).ok` is true.** A stored event id is meaningless outside the calendar that holds it.
- **Supabase first, Google second.** The row is saved before the Google call. A Google failure leaves a valid CRM record with a null event id; the reverse order would risk an event in somebody's calendar with no CRM record behind it.
- **ES5 in `roadysGcal.js`** — `var`/`function`, no `let`/`const`/arrow functions/`async`/template literals. Test files may use modern syntax. `CRM.html`'s inline script uses modern browser JS; follow the surrounding code there.
- **`node --test *.test.js` starts at 312 passing** and must never go down. No existing test may be edited or weakened.
- **When Google is not connected, every existing behaviour is unchanged.** Scheduling, cancelling, the calendar, notifications and the `crm-emails` reminders all work exactly as they do today.
- **Do not touch** `supabase/functions/crm-emails/`, its cron reminders, or `renderCRMNotifications()`.
- **Client ID** (public by design, goes in source): `283676450290-vvb11o6g0mdkecd03k587m0v73sg810c.apps.googleusercontent.com`
- **Scopes:** `https://www.googleapis.com/auth/calendar.events openid https://www.googleapis.com/auth/userinfo.email` — never the broader `.../auth/calendar`.
- **Grants differ between the two tables and neither needs changing:** `crm_scheduled_calls` has all four verbs for `anon, authenticated`; `crm_leads` has only `select, insert, update` for `authenticated`, with `REVOKE ALL FROM anon` and **no DELETE grant**. Clearing a follow-up event clears the *column*, never the row.
- Branch off `main` before the first commit. The user runs `git push` and runs the SQL.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `roadysGcal.js` | Pure decisions: event bodies, overlay mapping, identity check, ownership guard | Create |
| `roadysGcal.test.js` | Unit tests for all five exported functions | Create |
| `sql/2026-10-07-google-calendar-columns.sql` | Five nullable columns across two tables | Create |
| `CRM.html` | OAuth connect, fetch, overlay rendering, push on schedule/cancel, follow-up toggle | Modify |

Seven tasks. Task 1 is the tested foundation Tasks 4–6 read through. Task 2 is SQL the user runs before Task 5 can store anything.

---

## Task 1: `roadysGcal.js` — the tested module

**Files:**
- Create: `roadysGcal.js`
- Create: `roadysGcal.test.js`
- Modify: `CRM.html` (one `<script>` tag)

**Interfaces:**
- Consumes: nothing. Self-contained, no DOM, no `fetch`.
- Produces, all read by later tasks:
  - `RoadysGcal.identityMatches(a, b)` → `boolean`
  - `RoadysGcal.mayWriteGoogle(record, sessionEmail)` → `{ ok, reason, owner }`
  - `RoadysGcal.eventBodyForCall(lead, call, baseUrl)` → Google event object
  - `RoadysGcal.eventBodyForFollowUp(lead, baseUrl)` → Google all-day event object
  - `RoadysGcal.overlayEventsFrom(listResponse, suppressIds)` → `[{ id, title, dateKey, timeText, isAllDay }]`

- [ ] **Step 1: Write the failing tests**

Create `roadysGcal.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RoadysGcal } = require('./roadysGcal.js');

const BASE = 'https://jasonvega1974.github.io/roadys-command-center';

function lead(over) {
  return Object.assign({
    id: 'CRM-001', company: 'Acme Truck Stop', contact: 'Jane Doe',
    phone: '208-555-1234', street: '123 Main St', city: 'Boise', state: 'ID',
    followUp: '2026-10-15'
  }, over || {});
}
function call(over) {
  return Object.assign({
    id: 'call_1', callType: 'Discovery call', note: 'Bring the gallon report',
    scheduledAt: '2026-10-15T19:30:00.000Z'
  }, over || {});
}

// ── identityMatches ─────────────────────────────────────────────────────

test('identity matches ignoring case and surrounding whitespace', () => {
  assert.equal(RoadysGcal.identityMatches('Jason@Roadyscorp.com', ' jason@roadyscorp.com '), true);
});

test('different accounts do not match', () => {
  assert.equal(RoadysGcal.identityMatches('jason@roadyscorp.com', 'jason@gmail.com'), false);
});

test('a missing or non-string side never matches', () => {
  // Returning true here would connect a session to whatever account the popup
  // happened to return, which is the whole failure this check exists to stop.
  assert.equal(RoadysGcal.identityMatches('', 'jason@roadyscorp.com'), false);
  assert.equal(RoadysGcal.identityMatches(null, null), false);
  assert.equal(RoadysGcal.identityMatches(undefined, 'x@y.com'), false);
  assert.equal(RoadysGcal.identityMatches(42, 42), false);
});

// ── mayWriteGoogle ──────────────────────────────────────────────────────

test('may write when the stored event belongs to this session', () => {
  const r = RoadysGcal.mayWriteGoogle(
    { googleEventId: 'evt1', googleCalendarEmail: 'jason@roadyscorp.com' },
    'jason@roadyscorp.com');
  assert.equal(r.ok, true);
});

test('refuses to touch an event in another user\'s calendar, and names the owner', () => {
  // An event id only means something inside the calendar holding it. Deleting
  // it from the wrong account is a 404 at best and a wrong deletion at worst.
  const r = RoadysGcal.mayWriteGoogle(
    { googleEventId: 'evt1', googleCalendarEmail: 'robert@roadyscorp.com' },
    'jason@roadyscorp.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'other-owner');
  assert.equal(r.owner, 'robert@roadyscorp.com');
});

test('refuses an event id with no recorded owner', () => {
  const r = RoadysGcal.mayWriteGoogle({ googleEventId: 'evt1' }, 'jason@roadyscorp.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown-owner');
});

test('reports no-event when nothing has been synced yet', () => {
  const r = RoadysGcal.mayWriteGoogle({}, 'jason@roadyscorp.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-event');
});

test('refuses when there is no session email at all', () => {
  const r = RoadysGcal.mayWriteGoogle(
    { googleEventId: 'evt1', googleCalendarEmail: 'jason@roadyscorp.com' }, '');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-session');
});

test('survives a null record rather than throwing', () => {
  assert.equal(RoadysGcal.mayWriteGoogle(null, 'jason@roadyscorp.com').ok, false);
});

// ── eventBodyForCall ────────────────────────────────────────────────────

test('a meeting event carries the company, type, contact, note and a lead link', () => {
  const b = RoadysGcal.eventBodyForCall(lead(), call(), BASE);
  assert.equal(b.summary, 'Acme Truck Stop — Discovery call');
  assert.match(b.description, /Jane Doe/);
  assert.match(b.description, /208-555-1234/);
  assert.match(b.description, /Bring the gallon report/);
  assert.match(b.description, /CRM\.html\?lead=CRM-001/);
  assert.equal(b.location, '123 Main St, Boise, ID');
});

test('the meeting runs 30 minutes from the scheduled time', () => {
  const b = RoadysGcal.eventBodyForCall(lead(), call(), BASE);
  assert.equal(b.start.dateTime, '2026-10-15T19:30:00.000Z');
  assert.equal(b.end.dateTime, '2026-10-15T20:00:00.000Z');
});

test('missing contact, phone, note and address omit their lines instead of printing undefined', () => {
  // These go into an event a prospect may see on a shared invite; "Contact:
  // undefined" is worse than no contact line.
  const b = RoadysGcal.eventBodyForCall(
    lead({ contact: '', phone: '', street: '', city: '', state: '' }),
    call({ note: '' }), BASE);
  assert.doesNotMatch(b.description, /undefined|null/);
  assert.doesNotMatch(b.description, /Contact:/);
  assert.doesNotMatch(b.description, /Phone:/);
  assert.equal(b.location, undefined);
});

test('a lead id with characters needing escaping is encoded into the link', () => {
  const b = RoadysGcal.eventBodyForCall(lead({ id: 'CRM 7&8' }), call(), BASE);
  assert.match(b.description, /lead=CRM%207%268/);
});

test('an unparseable scheduled time yields no event body rather than an Invalid Date', () => {
  assert.equal(RoadysGcal.eventBodyForCall(lead(), call({ scheduledAt: 'nope' }), BASE), null);
});

// ── eventBodyForFollowUp ────────────────────────────────────────────────

test('a follow-up is an all-day event whose end is the NEXT day', () => {
  // Google treats an all-day end date as exclusive. Using the same date for
  // both makes the event vanish from the calendar entirely.
  const b = RoadysGcal.eventBodyForFollowUp(lead({ followUp: '2026-10-15' }), BASE);
  assert.equal(b.summary, 'Follow up: Acme Truck Stop');
  assert.deepEqual(b.start, { date: '2026-10-15' });
  assert.deepEqual(b.end, { date: '2026-10-16' });
});

test('the exclusive end rolls over a month and a year boundary', () => {
  assert.deepEqual(RoadysGcal.eventBodyForFollowUp(lead({ followUp: '2026-10-31' }), BASE).end,
    { date: '2026-11-01' });
  assert.deepEqual(RoadysGcal.eventBodyForFollowUp(lead({ followUp: '2026-12-31' }), BASE).end,
    { date: '2027-01-01' });
});

test('a lead with no follow-up date yields no event body', () => {
  assert.equal(RoadysGcal.eventBodyForFollowUp(lead({ followUp: '' }), BASE), null);
});

// ── overlayEventsFrom ───────────────────────────────────────────────────

test('maps Google items to calendar entries', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g1', summary: 'Dentist', start: { dateTime: '2026-10-15T19:30:00.000Z' } }
  ]}, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'g1');
  assert.equal(out[0].title, 'Dentist');
  assert.equal(out[0].isAllDay, false);
});

test('an all-day Google date is used verbatim, with no timezone arithmetic', () => {
  // Constructing a Date from "2026-10-15" parses it as UTC midnight, which in
  // any negative-offset timezone renders as the 14th. The date string must
  // pass straight through.
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g2', summary: 'Conference', start: { date: '2026-10-15' } }
  ]}, []);
  assert.equal(out[0].dateKey, '2026-10-15');
  assert.equal(out[0].isAllDay, true);
  assert.equal(out[0].timeText, '');
});

test('a timed event buckets on its LOCAL date, matching the calendar grid', () => {
  // renderCRMCalendar builds its grid from local date parts, so a UTC slice
  // would drop a late-evening event onto the wrong day west of UTC.
  const iso = '2026-10-15T19:30:00.000Z';
  const d = new Date(iso);
  const expected = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g3', summary: 'Call', start: { dateTime: iso } }
  ]}, []);
  assert.equal(out[0].dateKey, expected);
});

test('events the CRM itself created are suppressed so they do not appear twice', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'mine', summary: 'CRM meeting', start: { dateTime: '2026-10-15T19:30:00.000Z' } },
    { id: 'theirs', summary: 'Dentist',    start: { dateTime: '2026-10-16T19:30:00.000Z' } }
  ]}, ['mine']);
  assert.deepEqual(out.map(e => e.id), ['theirs']);
});

test('cancelled and malformed items are skipped rather than thrown on', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'c', status: 'cancelled', start: { date: '2026-10-15' } },
    { id: 'n', summary: 'No start' },
    null,
    { id: 'ok', summary: 'Good', start: { date: '2026-10-15' } }
  ]}, []);
  assert.deepEqual(out.map(e => e.id), ['ok']);
});

test('an event with no summary gets a readable placeholder, not an empty chip', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g4', start: { date: '2026-10-15' } }
  ]}, []);
  assert.equal(out[0].title, '(no title)');
});

test('a missing or junk response yields an empty list', () => {
  assert.deepEqual(RoadysGcal.overlayEventsFrom(null, []), []);
  assert.deepEqual(RoadysGcal.overlayEventsFrom({}, []), []);
  assert.deepEqual(RoadysGcal.overlayEventsFrom({ items: 'nope' }, []), []);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test roadysGcal.test.js`
Expected: FAIL — `Cannot find module './roadysGcal.js'`.

- [ ] **Step 3: Implement the module**

Create `roadysGcal.js`, matching the UMD wrapper `roadysBD.js` and `bdpgSteps.js` use:

```js
(function (root) {
  'use strict';

  // Pure decisions for the Google Calendar integration: what an event body
  // says, how a Google event maps onto the CRM calendar grid, whether this
  // session is allowed to touch a given stored event, and whether the Google
  // account matches the signed-in one.
  //
  // No DOM and no fetch, so `node --test` can reach all of it. CRM.html owns
  // the OAuth popup, the network calls and the rendering.

  // A meeting runs half an hour unless somebody later makes it configurable.
  var DEFAULT_MEETING_MINUTES = 30;

  function str(v) { return typeof v === 'string' ? v : ''; }
  function trimLower(v) { return str(v).trim().toLowerCase(); }

  // Both sides must be real, non-empty strings. Returning true for a missing
  // side would bind a session to whatever account the popup returned, which
  // is exactly the failure this guards.
  function identityMatches(a, b) {
    var x = trimLower(a), y = trimLower(b);
    return !!x && !!y && x === y;
  }

  // A Google event id is only meaningful inside the calendar that holds it.
  // Writing to one from another account is a 404 at best, and at worst
  // touches an unrelated event.
  function mayWriteGoogle(record, sessionEmail) {
    var r = record || {};
    if (!trimLower(sessionEmail)) return { ok: false, reason: 'no-session', owner: '' };
    if (!str(r.googleEventId)) return { ok: false, reason: 'no-event', owner: '' };
    var owner = str(r.googleCalendarEmail);
    if (!owner) return { ok: false, reason: 'unknown-owner', owner: '' };
    if (!identityMatches(owner, sessionEmail)) {
      return { ok: false, reason: 'other-owner', owner: owner };
    }
    return { ok: true, reason: 'ok', owner: owner };
  }

  function leadLink(baseUrl, leadId) {
    return str(baseUrl).replace(/\/+$/, '') + '/CRM.html?lead=' + encodeURIComponent(str(leadId));
  }

  // Only the lines that have content. "Contact: undefined" on an event a
  // prospect may see is worse than no contact line at all.
  function describe(lead, extraNote, baseUrl) {
    var l = lead || {}, lines = [];
    if (str(l.contact)) lines.push('Contact: ' + l.contact);
    if (str(l.phone))   lines.push('Phone: ' + l.phone);
    if (str(extraNote)) lines.push('', extraNote);
    lines.push('', 'CRM lead: ' + leadLink(baseUrl, l.id));
    return lines.join('\n');
  }

  function locationOf(lead) {
    var l = lead || {};
    var parts = [];
    if (str(l.street)) parts.push(l.street);
    var cityState = [str(l.city), str(l.state)].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    // undefined, not '', so the key is omitted from the JSON body entirely.
    return parts.length ? parts.join(', ') : undefined;
  }

  function eventBodyForCall(lead, call, baseUrl) {
    var c = call || {};
    var startMs = Date.parse(str(c.scheduledAt));
    if (!isFinite(startMs)) return null;
    var endMs = startMs + DEFAULT_MEETING_MINUTES * 60000;
    return {
      summary: str((lead || {}).company) + ' — ' + str(c.callType),
      description: describe(lead, str(c.note), baseUrl),
      location: locationOf(lead),
      start: { dateTime: new Date(startMs).toISOString() },
      end:   { dateTime: new Date(endMs).toISOString() }
    };
  }

  // Google treats an all-day `end.date` as EXCLUSIVE. Using the same date for
  // start and end produces a zero-length event that never appears.
  function nextDay(ymd) {
    var p = str(ymd).split('-');
    if (p.length !== 3) return '';
    var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    if (!isFinite(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function eventBodyForFollowUp(lead, baseUrl) {
    var l = lead || {};
    var day = str(l.followUp);
    var end = nextDay(day);
    if (!day || !end) return null;
    return {
      summary: 'Follow up: ' + str(l.company),
      description: describe(l, '', baseUrl),
      location: locationOf(l),
      start: { date: day },
      end:   { date: end }
    };
  }

  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

  // Local date parts, not a UTC slice: renderCRMCalendar builds its grid from
  // local dates, so a 7pm event would otherwise land on the wrong day in any
  // negative-offset timezone.
  function localDateKey(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function localTimeText(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(m) + ' ' + ampm;
  }

  function overlayEventsFrom(listResponse, suppressIds) {
    var res = listResponse || {};
    if (!res.items || Object.prototype.toString.call(res.items) !== '[object Array]') return [];
    var skip = {};
    (suppressIds || []).forEach(function (id) { if (id) skip[id] = true; });

    var out = [];
    res.items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      if (it.status === 'cancelled') return;
      if (it.id && skip[it.id]) return;
      var start = it.start || {};
      if (str(start.date)) {
        // Verbatim. Parsing it would reinterpret it as UTC midnight.
        out.push({
          id: str(it.id), title: str(it.summary) || '(no title)',
          dateKey: start.date, timeText: '', isAllDay: true
        });
        return;
      }
      if (str(start.dateTime)) {
        var key = localDateKey(start.dateTime);
        if (!key) return;
        out.push({
          id: str(it.id), title: str(it.summary) || '(no title)',
          dateKey: key, timeText: localTimeText(start.dateTime), isAllDay: false
        });
      }
    });
    return out;
  }

  var RoadysGcal = {
    DEFAULT_MEETING_MINUTES: DEFAULT_MEETING_MINUTES,
    identityMatches: identityMatches,
    mayWriteGoogle: mayWriteGoogle,
    eventBodyForCall: eventBodyForCall,
    eventBodyForFollowUp: eventBodyForFollowUp,
    overlayEventsFrom: overlayEventsFrom
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RoadysGcal: RoadysGcal };
  } else {
    root.RoadysGcal = RoadysGcal;
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test roadysGcal.test.js`
Expected: PASS. Report the count you actually see rather than a predicted one.

- [ ] **Step 5: Load the module in the page**

In `CRM.html`, add a script tag beside the existing `roadysBD.js` one, carrying the same version query string its neighbour uses:

```html
<script src="roadysGcal.js?v=2026-10-07"></script>
```

Read the neighbouring tag first and match its relative path exactly — `CRM.html` sits at the repo root, so there is no `../` prefix.

- [ ] **Step 6: Run the whole suite and report the real numbers**

Run: `node --test *.test.js`
Baseline is 312. Report the exact totals you observe; do not adjust a test to reach a figure.

- [ ] **Step 7: Commit**

```bash
git add roadysGcal.js roadysGcal.test.js CRM.html
git commit -m "feat(crm): tested pure module for Google Calendar event mapping"
```

---

## Task 2: SQL migration

**Files:**
- Create: `sql/2026-10-07-google-calendar-columns.sql`

**Interfaces:**
- Produces: five nullable columns Tasks 5 and 6 read and write.

**The user runs this**, as with every migration in this repo. Nothing in Tasks 5–6 works until it has been applied, and both must degrade without throwing if it has not.

- [ ] **Step 1: Write the migration**

```sql
-- Google Calendar sync: per-record event ids, each stored with the account
-- that owns it.
--
-- The owner column is not redundant. A Google event id is only meaningful
-- inside the calendar holding it, so without knowing whose calendar that is,
-- a second user opening the same lead would issue a DELETE against an id in
-- somebody else's account.
--
-- No RLS or grant changes. Both tables already grant at the table level, and
-- a table-level grant covers columns added later. Note the two are NOT
-- granted alike: crm_scheduled_calls allows all four verbs to anon and
-- authenticated, while crm_leads allows only select/insert/update to
-- authenticated with anon revoked and no DELETE grant at all.
BEGIN;

ALTER TABLE public.crm_scheduled_calls
  ADD COLUMN IF NOT EXISTS google_event_id       text,
  ADD COLUMN IF NOT EXISTS google_calendar_email text,
  ADD COLUMN IF NOT EXISTS google_synced_at      timestamptz;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS google_followup_event_id text,
  ADD COLUMN IF NOT EXISTS google_followup_email    text;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema='public'
--    and ((table_name='crm_scheduled_calls' and column_name like 'google%')
--      or (table_name='crm_leads' and column_name like 'google%'))
--  order by table_name, column_name;
-- -- expect 5 rows, every one is_nullable = YES
```

- [ ] **Step 2: Commit**

```bash
git add sql/2026-10-07-google-calendar-columns.sql
git commit -m "feat(sql): Google Calendar event id columns with their owning account"
```

- [ ] **Step 3: Report**

State in your report that the migration is **not applied** and that Tasks 5 and 6 must tolerate its absence. Do not attempt to run it.

---

## Task 3: OAuth connect and identity verification

**Files:**
- Modify: `CRM.html` — a new section of `crm*` helpers, plus a Connect control in the Calendar panel toolbar (`:911-918`)

**Interfaces:**
- Consumes: `RoadysGcal.identityMatches`, `RoadysBD.auth.email()`.
- Produces, read by Tasks 4–6:
  - `crmGcalToken()` → `Promise<string>` — a valid access token, requesting one if needed
  - `crmGcalConnected()` → `boolean`
  - `crmGcalEmail()` → the connected Google account, or `''`
  - `crmGcalFetch(path, opts)` → `Promise<Response-ish>` with one 401 retry
  - `crmGcalConfigured()` → `boolean`

- [ ] **Step 1: Add the constants**

Near the other CRM constants:

```js
// Public by design. A browser OAuth client has no usable secret; this id is
// meant to be world-readable, and what actually constrains it is the
// Authorized JavaScript origins list on the client itself — a copy pasted
// into another site gets origin_mismatch and nothing more.
const CRM_GCAL_CLIENT_ID = '283676450290-vvb11o6g0mdkecd03k587m0v73sg810c.apps.googleusercontent.com';
// calendar.events is read+write on EVENTS only. It cannot create, delete or
// share calendars. The broader .../auth/calendar is deliberately not asked for.
const CRM_GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar.events openid https://www.googleapis.com/auth/userinfo.email';
const CRM_GCAL_API = 'https://www.googleapis.com/calendar/v3';
```

- [ ] **Step 2: Add the token layer**

```js
// The access token lives here and nowhere else. Never localStorage, never a
// cookie, never Supabase — it dies with the tab, which is the whole security
// model of a browser OAuth client.
let crmGcalAccessToken = '';
let crmGcalAccountEmail = '';
let crmGcalGisReady = null;

function crmGcalConfigured(){ return !!CRM_GCAL_CLIENT_ID && CRM_GCAL_CLIENT_ID.indexOf('.apps.googleusercontent.com') > 0; }
function crmGcalConnected(){ return !!crmGcalAccessToken && !!crmGcalAccountEmail; }
function crmGcalEmail(){ return crmGcalAccountEmail; }

// Loads the Google Identity script only. No popup happens here — that must
// come from a click, or the popup blocker eats it.
function crmGcalLoadGis(){
  if(crmGcalGisReady) return crmGcalGisReady;
  crmGcalGisReady = new Promise((res,rej)=>{
    if(window.google && google.accounts && google.accounts.oauth2) return res();
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client'; s.async=true; s.defer=true;
    s.onload=()=>res();
    s.onerror=()=>{ crmGcalGisReady=null; rej(new Error('Could not load Google sign-in — are you online?')); };
    document.head.appendChild(s);
  });
  return crmGcalGisReady;
}

// `prompt:''` attempts a silent grant; Google falls back to the consent
// screen by itself on first use. login_hint pre-selects the work account.
function crmGcalRequestToken(interactive){
  return new Promise((res,rej)=>{
    const client=google.accounts.oauth2.initTokenClient({
      client_id: CRM_GCAL_CLIENT_ID,
      scope: CRM_GCAL_SCOPES,
      callback: r => r && r.access_token ? res(r.access_token)
                   : rej(new Error((r && (r.error_description||r.error)) || 'Google sign-in was cancelled')),
      error_callback: e => rej(new Error((e && (e.message||e.type)) || 'Google sign-in was cancelled'))
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '', login_hint: RoadysBD.auth.email() || '' });
  });
}
```

- [ ] **Step 3: Add the identity check and the connect flow**

```js
async function crmGcalWhoAmI(token){
  const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token}});
  if(!r.ok) throw new Error('Could not read the Google account ('+r.status+')');
  return (await r.json()).email || '';
}

// Called from the Connect button. Refusing a mismatch is the point: the
// feature promises each user sees only their own calendar, and silently
// syncing company leads into a personal Gmail calendar is the failure that
// promise exists to prevent.
async function crmGcalConnect(){
  if(!crmGcalConfigured()){ alert('Google Calendar is not configured yet.'); return; }
  const session=RoadysBD.auth.email()||'';
  if(!session){ toast('Sign in to the CRM first','terr'); return; }
  try{
    await crmGcalLoadGis();
    const token=await crmGcalRequestToken(true);
    const granted=await crmGcalWhoAmI(token);
    if(!RoadysGcal.identityMatches(session, granted)){
      crmGcalAccessToken=''; crmGcalAccountEmail='';
      alert('That Google account ('+(granted||'unknown')+') is not the account you are signed into the CRM with ('+session+').\n\n'+
            'Connect the matching Google account, or sign into the CRM as the other user.');
      return;
    }
    crmGcalAccessToken=token; crmGcalAccountEmail=granted;
    toast('Google Calendar connected','tok');
    crmGcalRenderStatus(); renderCRMCalendar();
  }catch(e){ toast(e.message||'Google sign-in failed','terr'); }
}

function crmGcalDisconnect(){
  crmGcalAccessToken=''; crmGcalAccountEmail='';
  crmGcalRenderStatus(); renderCRMCalendar();
  toast('Google Calendar disconnected','tok');
}

// A valid token, refreshed silently if the current one has aged out.
async function crmGcalToken(){
  if(crmGcalAccessToken) return crmGcalAccessToken;
  await crmGcalLoadGis();
  const t=await crmGcalRequestToken(false);
  const granted=await crmGcalWhoAmI(t);
  if(!RoadysGcal.identityMatches(RoadysBD.auth.email()||'', granted)) throw new Error('Google account no longer matches this session');
  crmGcalAccessToken=t; crmGcalAccountEmail=granted;
  return t;
}

// One retry on 401 — the token expires about hourly and a long session will
// hit it. A second 401 is a real problem (revoked grant) and surfaces.
async function crmGcalFetch(path, opts){
  const go=async()=>{
    const t=await crmGcalToken();
    return fetch(CRM_GCAL_API+path, Object.assign({}, opts, {
      headers: Object.assign({ Authorization:'Bearer '+t, 'Content-Type':'application/json' }, (opts&&opts.headers)||{})
    }));
  };
  let r=await go();
  if(r.status===401){ crmGcalAccessToken=''; r=await go(); }
  return r;
}
```

- [ ] **Step 4: Add the Connect control**

In the Calendar panel toolbar (`CRM.html:911-918`, the flex row holding Prev / title / Next / Today / owner filter), add before the closing `</div>`:

```html
<span id="crm-gcal-status"></span>
```

and render it from:

```js
function crmGcalRenderStatus(){
  const host=document.getElementById('crm-gcal-status'); if(!host) return;
  if(!crmGcalConfigured()){ host.innerHTML='<span style="font-size:.72em;color:var(--muted)">Google Calendar not configured</span>'; return; }
  host.innerHTML = crmGcalConnected()
    ? '<span style="font-size:.72em;color:var(--green)">📅 '+crmEsc(crmGcalEmail())+'</span>'+
      '<button class="btn" style="margin-left:8px;font-size:.72em" onclick="crmGcalDisconnect()">Disconnect</button>'
    : '<button class="btn" style="font-size:.72em" onclick="crmGcalConnect()">📅 Connect Google Calendar</button>';
}
```

Call `crmGcalRenderStatus()` at the end of `renderCRMCalendar()`.

- [ ] **Step 5: Verify**

- Extract the inline `<script>` to a temp file and run `node --check`. State how you extracted it and what it printed.
- `node --test *.test.js` — unchanged from Task 1's total.
- Serve the repo on **port 8745** (the registered origin — any other port fails with `origin_mismatch`), open `CRM.html`, and confirm the Calendar tab shows a **Connect Google Calendar** button and that nothing throws on load while disconnected.
- You have no Google credentials, so **do not attempt the consent popup**. Report the connect flow as verified-by-reading plus the disconnected-state DOM check, and say so plainly.

- [ ] **Step 6: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): Google Calendar connect with session-identity verification"
```

---

## Task 4: Pull — the read-only overlay

**Files:**
- Modify: `CRM.html` — `renderCRMCalendar()` (`:2797`), `crmCalNav()` (`:2786`)

**Interfaces:**
- Consumes: `crmGcalFetch`, `crmGcalConnected`, `RoadysGcal.overlayEventsFrom`.
- Produces: `CRM_GCAL_EVENTS` (array for the visible month), `crmGcalLoadMonth()`.

- [ ] **Step 1: Add the month fetch**

```js
// Google events for the visible month only. Held in memory and discarded on
// navigation — they are never written to Supabase.
let CRM_GCAL_EVENTS = [];
let crmGcalLoadSeq = 0;

async function crmGcalLoadMonth(){
  if(!crmGcalConnected()){ CRM_GCAL_EVENTS=[]; return; }
  const seq = ++crmGcalLoadSeq;
  const from=new Date(crmCalYear, crmCalMonth, 1);
  const to  =new Date(crmCalYear, crmCalMonth+1, 1);
  const qs='?timeMin='+encodeURIComponent(from.toISOString())+
           '&timeMax='+encodeURIComponent(to.toISOString())+
           '&singleEvents=true&orderBy=startTime&maxResults=250';
  try{
    const r=await crmGcalFetch('/calendars/primary/events'+qs, {method:'GET'});
    if(!r.ok) throw new Error('Google Calendar returned '+r.status);
    const json=await r.json();
    // Events the CRM created are already drawn from CRM_CALLS; without this
    // suppression every scheduled meeting would appear twice.
    const mine=(CRM_CALLS||[]).map(c=>c.googleEventId).filter(Boolean);
    // A stale response from a month the user has already navigated away from
    // must not overwrite the current one.
    if(seq!==crmGcalLoadSeq) return;
    CRM_GCAL_EVENTS=RoadysGcal.overlayEventsFrom(json, mine);
  }catch(e){
    if(seq!==crmGcalLoadSeq) return;
    console.warn('gcal month load', e);
    CRM_GCAL_EVENTS=[];
    const host=document.getElementById('crm-gcal-status');
    if(host) host.innerHTML='<span style="font-size:.72em;color:var(--yellow)">Google events unavailable</span>';
  }
}
```

- [ ] **Step 2: Draw them on the grid**

In `renderCRMCalendar()`, after the `CRM_CALLS` loop that fills `evMap`, add a third source. Google entries are pushed as objects carrying a `gcal` marker so the existing render loop can tell them apart:

```js
  CRM_GCAL_EVENTS.forEach(ev=>{
    const prefix=crmCalYear+'-'+String(crmCalMonth+1).padStart(2,'0');
    if(ev.dateKey.indexOf(prefix)!==0) return;
    if(!evMap[ev.dateKey]) evMap[ev.dateKey]=[];
    evMap[ev.dateKey].push({gcal:true, title:ev.title, timeText:ev.timeText});
  });
```

and in the per-day `evs.forEach(item=>{...})` render, add a branch **first**, before the existing `item.stage` test:

```js
      if(item.gcal){
        html+='<div title="Google Calendar" style="font-size:.6em;background:rgba(148,163,184,.12);color:var(--muted);'+
          'border:1px solid rgba(148,163,184,.25);border-radius:3px;padding:1px 4px;margin-bottom:2px;'+
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+
          (item.timeText? crmEsc(item.timeText)+' ' : '')+crmEsc(item.title)+'</div>';
        return;
      }
```

Muted and with no click handler: these are somebody's personal calendar, not CRM records.

- [ ] **Step 3: Load on render and on month change**

`renderCRMCalendar()` is synchronous and called from many places, so it must not become `async`. Instead, kick the fetch and re-render when it lands:

```js
// At the end of renderCRMCalendar(), after crmGcalRenderStatus():
  if(crmGcalConnected() && !crmGcalMonthPending){
    crmGcalMonthPending=true;
    crmGcalLoadMonth().then(()=>{ crmGcalMonthPending=false; renderCRMCalendar(); });
  }
```

with `let crmGcalMonthPending=false;` beside `CRM_GCAL_EVENTS`. The flag is what stops the re-render from looping forever.

In `crmCalNav()` and `crmCalToday()`, clear `CRM_GCAL_EVENTS=[]` before re-rendering so the previous month's events do not flash on the new grid.

- [ ] **Step 4: Verify**

- Parse check and `node --test *.test.js` (unchanged).
- Serve on port 8745 and confirm, while **disconnected**: the calendar renders CRM follow-ups and scheduled calls exactly as before, `CRM_GCAL_EVENTS` is empty, and no Google request is made (check the network panel).
- Seed `CRM_GCAL_EVENTS` by hand in the console with two fixtures — one all-day, one timed, both inside the visible month — call `renderCRMCalendar()`, and confirm both appear muted on the right days with no click handler.
- **State plainly in your report that the hand-seeded fixtures bypass `crmGcalLoadMonth`,** and that the live fetch path is therefore unverified without credentials. A previous phase in this repo shipped a feature as dead code because its fixtures bypassed the function that produces the state; say which half you proved.

- [ ] **Step 5: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): read-only Google event overlay on the calendar grid"
```

---

## Task 5: Push — scheduled calls to Google

**Files:**
- Modify: `CRM.html` — `crmScheduleCall()` (`:2450`), `crmCancelCall()` (`:2472`), `crmSaveCallToSupabase()` (`:1200`), the calls loader (`:1196`)

**Interfaces:**
- Consumes: `crmGcalFetch`, `crmGcalConnected`, `RoadysGcal.eventBodyForCall`, `RoadysGcal.mayWriteGoogle`.

- [ ] **Step 1: Carry the new columns through the mapping**

The calls loader maps snake_case to camelCase; add the three columns at `:1196`:

```js
    CRM_CALLS=(data||[]).map(r=>({id:r.id,leadId:r.lead_id,company:r.company,owner:r.owner,callType:r.call_type,
      scheduledAt:r.scheduled_at,status:r.status,note:r.note,source:r.source,
      googleEventId:r.google_event_id||'', googleCalendarEmail:r.google_calendar_email||''}));
```

and in `crmSaveCallToSupabase()` at `:1200`:

```js
    const row={id:c.id,lead_id:c.leadId,company:c.company,owner:c.owner,call_type:c.callType,
      scheduled_at:c.scheduledAt,status:c.status,note:c.note,source:c.source,
      google_event_id:c.googleEventId||null, google_calendar_email:c.googleCalendarEmail||null,
      google_synced_at:c.googleEventId?new Date().toISOString():null};
```

**If the migration has not been applied** these three keys make the upsert fail. Catch that specific case and retry once without them, so the feature degrades to "no Google sync" rather than breaking scheduling outright:

```js
  }catch(e){
    if(String(e&&e.message||'').indexOf('google_')>=0){
      try{ const sb=getRoadysSB(); const bare=Object.assign({},row);
        delete bare.google_event_id; delete bare.google_calendar_email; delete bare.google_synced_at;
        const {error}=await sb.from('crm_scheduled_calls').upsert(bare,{onConflict:'id'}); if(error) throw error;
        console.warn('gcal columns missing — run sql/2026-10-07-google-calendar-columns.sql'); return;
      }catch(e2){ /* fall through to the existing toast */ }
    }
    console.warn('call save',e); toast('Call saved locally (cloud sync failed)','terr');
  }
```

- [ ] **Step 2: Create the Google event when a call is scheduled**

`crmScheduleCall()` is synchronous. Keep it that way and append the Google work after the existing Supabase save, so a Google failure cannot block the CRM record:

```js
  // Supabase first, Google second: a failed Google call leaves a valid CRM
  // record with no event id, which the next schedule can retry. The reverse
  // order would risk an event in somebody's calendar with no record behind it.
  crmGcalPushCall(c, lead);
```

and the helper:

```js
async function crmGcalPushCall(c, lead){
  if(!crmGcalConnected()) return;
  const body=RoadysGcal.eventBodyForCall(lead, c, location.origin + location.pathname.replace(/\/[^/]*$/, ''));
  if(!body) return;
  try{
    const r=await crmGcalFetch('/calendars/primary/events',{method:'POST',body:JSON.stringify(body)});
    if(!r.ok) throw new Error('Google returned '+r.status);
    const ev=await r.json();
    c.googleEventId=ev.id||''; c.googleCalendarEmail=crmGcalEmail();
    crmCallsSaveLocal(); crmSaveCallToSupabase(c);
    renderCRMCalendar();
  }catch(e){ console.warn('gcal create',e); toast('Meeting saved, but not added to Google Calendar','twarn'); }
}
```

- [ ] **Step 3: Delete the Google event when a call is cancelled**

In `crmCancelCall()`, after the existing `crmSaveCallToSupabase(c)`:

```js
  crmGcalDeleteCall(c);
```

```js
async function crmGcalDeleteCall(c){
  const guard=RoadysGcal.mayWriteGoogle(c, crmGcalEmail());
  if(!guard.ok){
    // Not an error. The commonest case is simply that nothing was ever
    // synced; the next is that the event lives in a colleague's calendar,
    // which this browser has no way to reach.
    if(guard.reason==='other-owner') toast('Cancelled in the CRM. The Google event is in '+guard.owner+"'s calendar and was left alone.",'twarn');
    return;
  }
  try{
    const r=await crmGcalFetch('/calendars/primary/events/'+encodeURIComponent(c.googleEventId),{method:'DELETE'});
    // 410 Gone means the user already deleted it in Google. That is success.
    if(!r.ok && r.status!==410 && r.status!==404) throw new Error('Google returned '+r.status);
    c.googleEventId=''; c.googleCalendarEmail='';
    crmCallsSaveLocal(); crmSaveCallToSupabase(c); renderCRMCalendar();
  }catch(e){ console.warn('gcal delete',e); toast('Cancelled in the CRM, but the Google event may remain','twarn'); }
}
```

- [ ] **Step 4: Verify**

- Parse check and `node --test *.test.js` (unchanged).
- Serve on 8745 and confirm, while **disconnected**: scheduling a call and cancelling it behave exactly as before, with no Google request attempted and no toast about Google.
- In the console, exercise `RoadysGcal.mayWriteGoogle` against a call object carrying another user's email and confirm it refuses with `other-owner`.
- **The live create/delete path needs Google credentials you do not have. Report it as unverified**, and name which parts you did prove.

- [ ] **Step 5: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): scheduled calls create and delete their Google event"
```

---

## Task 6: Follow-up dates, behind a toggle

**Files:**
- Modify: `CRM.html` — the Calendar panel toolbar, `crmSaveLeadToSupabase()`, the lead save path

**Interfaces:**
- Consumes: `RoadysGcal.eventBodyForFollowUp`, `RoadysGcal.mayWriteGoogle`, `crmGcalFetch`.

Syncing every follow-up date is calendar noise the rep should opt into, not something forced on by default — that's what the toggle is for. `crmMarkDone()` is the one place a follow-up date changes without passing through the lead form (it rewrites `followUp` and saves locally only); the sync is wired to the form save path only, and the toggle is the control that keeps that noise opt-in.

- [ ] **Step 1: Add the toggle**

```js
// Default OFF. A local display preference, not shared state, so it is not in
// Supabase. Opt-in because syncing every follow-up date to the calendar is
// noise—one entry per lead adds up. crmMarkDone() updates followUp without
// syncing, so the CRM and Google may disagree until the lead is next saved.
const CRM_GCAL_FOLLOWUP_KEY='roadys_crm_gcal_followups';
function crmGcalFollowUpsOn(){ try{ return localStorage.getItem(CRM_GCAL_FOLLOWUP_KEY)==='1'; }catch(e){ return false; } }
function crmGcalSetFollowUps(on){ try{ localStorage.setItem(CRM_GCAL_FOLLOWUP_KEY, on?'1':'0'); }catch(e){} crmGcalRenderStatus(); }
```

Render it inside `crmGcalRenderStatus()`'s connected branch, appended after the Disconnect button:

```js
      '<label style="font-size:.72em;color:var(--muted);margin-left:10px;cursor:pointer">'+
        '<input type="checkbox" '+(crmGcalFollowUpsOn()?'checked':'')+' onchange="crmGcalSetFollowUps(this.checked)"> sync follow-up dates'+
      '</label>'
```

- [ ] **Step 2: Carry the lead columns**

Add to the `CRM_LEADS` mapping in `crmLoadFromSupabase()`:

```js
        googleFollowupEventId: r.google_followup_event_id||'',
        googleFollowupEmail:   r.google_followup_email||'',
```

and to the row built in `crmSaveLeadToSupabase()`:

```js
      google_followup_event_id: l.googleFollowupEventId||null,
      google_followup_email:    l.googleFollowupEmail||null,
```

- [ ] **Step 3: Push the follow-up event**

Called from the lead save path, after the Supabase write:

```js
async function crmGcalSyncFollowUp(l){
  if(!crmGcalConnected() || !crmGcalFollowUpsOn()) return;
  const rec={googleEventId:l.googleFollowupEventId, googleCalendarEmail:l.googleFollowupEmail};
  const guard=RoadysGcal.mayWriteGoogle(rec, crmGcalEmail());
  const base=location.origin + location.pathname.replace(/\/[^/]*$/, '');
  try{
    // Cleared follow-up: remove the event if this session owns it.
    if(!l.followUp){
      if(guard.ok){
        await crmGcalFetch('/calendars/primary/events/'+encodeURIComponent(rec.googleEventId),{method:'DELETE'});
        l.googleFollowupEventId=''; l.googleFollowupEmail=''; crmSaveLeadToSupabase(l);
      }
      return;
    }
    const body=RoadysGcal.eventBodyForFollowUp(l, base);
    if(!body) return;
    if(guard.ok){
      const r=await crmGcalFetch('/calendars/primary/events/'+encodeURIComponent(rec.googleEventId),
                                 {method:'PATCH',body:JSON.stringify(body)});
      if(r.ok) return;
      // 404/410: the user deleted it in Google. Fall through and make a new one.
      if(r.status!==404 && r.status!==410) throw new Error('Google returned '+r.status);
    }else if(guard.reason==='other-owner'){
      return;   // somebody else's calendar — leave it alone, silently
    }
    const c=await crmGcalFetch('/calendars/primary/events',{method:'POST',body:JSON.stringify(body)});
    if(!c.ok) throw new Error('Google returned '+c.status);
    const ev=await c.json();
    l.googleFollowupEventId=ev.id||''; l.googleFollowupEmail=crmGcalEmail();
    crmSaveLeadToSupabase(l);
  }catch(e){ console.warn('gcal followup',e); }
}
```

Call it from wherever a lead save completes, guarded so it never blocks the save.

- [ ] **Step 4: Verify**

- Parse check and `node --test *.test.js` (unchanged).
- Serve on 8745. With the toggle **off** (the default), confirm saving a lead with a follow-up date makes no Google request.
- Confirm the toggle persists across a reload and appears only while connected.
- **The live push needs credentials you do not have. Report it unverified** and name what you did prove.

- [ ] **Step 5: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): optional follow-up date sync, default off"
```

---

## Task 7: End-to-end verification

**Files:** none modified. Produces evidence; a fix only if it finds a regression.

- [ ] **Step 1: Prove the disconnected path is untouched**

Serve on 8745, never connect, and confirm every one of these behaves exactly as on `main`: the Calendar tab renders follow-ups and scheduled calls; scheduling a call from a lead works; cancelling works; the notification mirror updates; the Lead Table, Kanban, CSV export and analytics are unaffected. Capture the network panel showing **zero** requests to `googleapis.com`.

- [ ] **Step 2: Prove the module is wired**

In the console on the served page, confirm `RoadysGcal` is defined and that `RoadysGcal.mayWriteGoogle({googleEventId:'x',googleCalendarEmail:'a@b.com'},'c@d.com')` returns `other-owner`. This proves the script tag resolves and the guard is reachable from the page, not just from `node --test`.

- [ ] **Step 3: Confirm nothing else regressed**

`node --test *.test.js` at the branch total, the inline script parses, and `git diff --stat main -- supabase/` is **empty** — `crm-emails` is out of scope and must be untouched.

- [ ] **Step 4: Write the handover**

The live OAuth, pull and push paths cannot be verified without a Google account on the Workspace domain. Write a short checklist the user can run after merging, naming each thing to click and what should happen:

1. Calendar tab → **Connect Google Calendar** → consent → the chip shows your @roadyscorp.com address.
2. Connecting with a non-matching Google account → refused, with both addresses named.
3. A Google event in the current month appears muted on the grid and is not clickable.
4. Schedule a call on a lead → it appears in Google Calendar with the company, contact, phone and a working link back to the lead.
5. Cancel it → the Google event disappears.
6. Have a second user cancel the same meeting → the CRM cancels and says the Google event belongs to the first user's calendar.
7. Toggle **sync follow-up dates** on, set a follow-up → an all-day event appears on the right day.

- [ ] **Step 5: Report**

State each check and its actual result. Anything you could not run, say so plainly rather than implying coverage.

---

## Self-Review

**Spec coverage.** §0.1 reading (Google events stored nowhere; calls gain an id) → Tasks 4 and 5. §0.2 browser-only, edge-function door open → Task 2's columns, no refresh token anywhere. §0.3 read-only overlay → Task 4, muted and unclickable. §0.4 identity verified → Task 3 Step 3. §1 OAuth and the public client ID → Task 3 Steps 1-2. §2 identity binding via `login_hint` + `userinfo` → Task 3. §3 pull with suppression and non-fatal failure → Task 4. §4.1 create/delete for calls → Task 5. §4.2 follow-up toggle default off → Task 6. §4.3 cross-user ownership guard → `mayWriteGoogle`, Task 1, enforced in Tasks 5 and 6. §5 schema → Task 2. §6 module boundary and testing → Task 1. §7 limitations → carried into Task 7's handover checklist.

**Placeholder scan.** No TBD/TODO. Every code step carries its code. Three steps ask the implementer to locate an anchor before editing (the calls loader, the lead mapping, the lead save path) — each is a stated verification with a report-back, not an unspecified edit.

**Type consistency.** `RoadysGcal`'s five functions keep the same signatures in Tasks 1, 4, 5 and 6. Records passed to `mayWriteGoogle` use `googleEventId` / `googleCalendarEmail` in both the call shape (Task 5) and the synthesised follow-up shape (Task 6). `crmGcalFetch(path, opts)` takes a path relative to `CRM_GCAL_API` at every call site. `overlayEventsFrom` returns `dateKey`, which Task 4 matches against the same `YYYY-MM` prefix the existing two sources use.

**Known limits, stated rather than hidden.** No implementer on this plan has Google credentials, so the live OAuth, pull and push paths are verified by reading plus disconnected-state DOM checks only. Tasks 4, 5 and 6 each require their report to name which half was proved, and Task 7 Step 4 turns the unverifiable half into a checklist the user runs. `CRM.html` has no automated coverage and this plan adds none to it — `roadysGcal.js` is the response.
