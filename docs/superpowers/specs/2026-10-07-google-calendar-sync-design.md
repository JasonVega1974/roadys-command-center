# Google Calendar Sync — Design

**Date:** 2026-10-07
**Status:** Awaiting review
**Surface:** `CRM.html` (Calendar tab, lead detail modal), new module `roadysGcal.js`

## Goal

Each signed-in CRM user sees their own Google Calendar alongside CRM
follow-ups and scheduled calls, and meetings scheduled from a lead appear in
that user's Google Calendar — created, updated and deleted from the CRM.

---

## §0 Decisions

### §0.1 One contradiction in the brief, and how it is read

The brief says both *"Google Calendar events stay separate from
`crm_scheduled_calls` (don't merge the tables)"* and *"extend it — add a
`google_event_id` column to `crm_scheduled_calls`"*.

**Reading, which makes both true:**

- **Google-originated events are never written to `crm_scheduled_calls`,
  or to any table.** They are a read-only overlay, held in memory for the
  month being viewed and discarded. That is the "stay separate".
- **CRM-originated meetings are scheduled calls** that gain a
  `google_event_id`, so an edit or cancel in the CRM round-trips to Google.

If this reading is wrong the design changes materially, so it is stated first.

### §0.2 Browser-only now, edge function left open

OAuth runs entirely in the browser via Google Identity Services. The storage
added here (`google_event_id`, `google_calendar_email`, `google_synced_at`) is
chosen so a Supabase Edge Function holding refresh tokens could later take
over unattended reconciliation without reshaping a single column.

Nothing in this phase stores a Google refresh token.

### §0.3 Google events are a read-only overlay

Pulled for the visible month, drawn in a muted style distinct from CRM items,
not clickable into a lead, never persisted, never edited from the CRM.

This removes conflict resolution from the design entirely. A personal
appointment cannot be rewritten by a CRM action because the CRM never writes
to an event it did not create.

### §0.4 Identity is verified, not assumed

The Google account is checked against the Supabase session email and a
mismatch is refused. The premise of the feature is that each user sees only
their own calendar; silently syncing company leads into somebody's personal
Gmail calendar is the failure worth preventing.

---

## §1 OAuth, and the honest answer about "credentials"

The brief asks to *"plan how credentials are stored safely (not in the HTML
source)."* The honest answer is that **there is no credential to hide.**

A browser OAuth client is a **public client**. It has a client ID and *no
usable secret* — Google does not issue one for this client type, and the
client ID is designed to be world-readable. Putting it in the page source is
correct, not a leak.

What actually protects the integration is:

1. **Authorized JavaScript origins** on the OAuth client. Only pages served
   from a listed origin may use that client ID. A copy of the ID pasted into
   someone else's site gets `origin_mismatch` and nothing else.
2. **The user consent screen.** Nothing is read or written until the signed-in
   Google user grants the scope, per browser, per session.
3. **Scope minimisation** — see below.

So the client ID goes in a named constant near the top of `CRM.html`,
following the `GDRIVE_CLIENT_ID` precedent already in
`gs-travel-planner.html`, with a comment stating it is deliberately public.

**Scope:** `https://www.googleapis.com/auth/calendar.events` plus `openid
email`. `calendar.events` grants read and write on events only — it cannot
create, delete or share calendars. The broader `.../auth/calendar` is not
requested. `email` is requested solely to perform the §0.4 identity check.

**Token lifecycle:** `google.accounts.oauth2.initTokenClient` returns an
access token valid about an hour. It is held in a module-scope variable and
**never written to `localStorage`, `sessionStorage`, a cookie, or Supabase.**
It dies with the tab. On a `401` the client requests a fresh token once and
retries the call; a second `401` surfaces as "reconnect to Google".

**First connect must be a user gesture.** The consent popup is opened from a
"Connect Google Calendar" button click. Opening it during page load gets it
eaten by the popup blocker.

---

## §2 Identity binding

```
Supabase session email ──login_hint──> Google consent
                      <──userinfo────── granted account email
                                │
                        equal?  ├─ yes → connected
                                └─ no  → refuse, disconnect, explain
```

`RoadysBD.auth.email()` supplies the session email. It is passed as
`login_hint` so Google pre-selects the right account, then the granted token
is checked against `https://www.googleapis.com/oauth2/v3/userinfo`. On a
mismatch the token is dropped and the UI says which account was offered and
which was expected.

`crm_owner_emails` already maps a `CRM_OWNERS` display name to an email. It is
the bridge used to decide whether a given scheduled call "belongs" to the
signed-in user — see §4.3.

---

## §3 Pull — Google events onto the Calendar tab

`renderCRMCalendar()` already merges two sources into one `evMap`: lead
`followUp` dates and `CRM_CALLS`. Google events become a third, with no change
to how the first two work.

```
GET /calendar/v3/calendars/primary/events
    ?timeMin=<first day of month>&timeMax=<last day of month>
    &singleEvents=true&orderBy=startTime&maxResults=250
```

- Fetched for the visible month, refetched when the month changes, debounced.
- Rendered muted and without a click target — they do not open a lead.
- An event the CRM itself created (its id matches a stored `google_event_id`)
  is **suppressed from the overlay**, because the underlying scheduled call is
  already drawn. Without this every CRM meeting appears twice.
- Failure is non-fatal: the calendar renders its CRM sources and shows a small
  "Google events unavailable" note. A calendar that hides CRM follow-ups
  because Google timed out would be worse than one missing the overlay.

---

## §4 Push — CRM to Google

### §4.1 Scheduled calls / meetings

The existing flow is `crmScheduleCall()` → insert row → `crmCancelCall()` →
status `cancelled`. There is no reschedule path today, so the Google side needs
only create and delete.

| CRM action | Google |
|---|---|
| Schedule a call/meeting | `POST .../events` → store the returned id |
| Cancel | `DELETE .../events/{id}` → clear the stored id |

Event body:

- **summary** — `<company> — <call type>`
- **description** — contact name and phone, the note, and a deep link back to
  the lead (`<APP_BASE>/CRM.html?lead=<id>`), which the CRM already honours via
  `crmDeepLink()`
- **location** — the lead's street/city/state when present
- **start / end** — `scheduled_at`, plus a default 30-minute duration

Google is written **after** the Supabase row succeeds. If Google then fails,
the row stands with a null `google_event_id` and the UI says the meeting was
saved but not added to the calendar. The reverse order would risk an event in
somebody's calendar with no CRM record behind it.

### §4.2 Follow-up dates

The brief asks that setting a follow-up date create an event. Done naively
this is noisy: syncing every follow-up date is calendar clutter the rep
should opt into, not something forced on by default. `crmMarkDone()` is the
one place a follow-up date changes without passing through the lead form
(it rewrites `followUp` and saves locally only, via `crmSave()`), so an
unconditional push would also need to reach that path to stay honest about
every follow-up — rather than add that, the sync is wired to the form save
only and the toggle lets the rep decide whether the noise is worth it.

**Design:** a per-user toggle, *"Sync my follow-up dates to Google"*, default
**off**, held in `localStorage` under `roadys_crm_gcal_followups` — a local
display preference, not shared state, and so deliberately not in Supabase.
While on, a follow-up write creates, moves or
deletes a single all-day event per lead, tracked by
`crm_leads.google_followup_event_id`. While off, nothing is pushed and the
column is left alone.

This honours the requirement while leaving the rep in control of whether their
calendar fills with one entry per lead.

### §4.3 The multi-user problem the brief does not mention

A `google_event_id` is only meaningful inside the calendar that holds it. If
Jason schedules a meeting and Robert later cancels it, Robert's CRM would
`DELETE` an id that lives in *Jason's* calendar and get a `404` — or worse,
collide with an unrelated id.

**Therefore every stored Google id is stored with the account that owns it**
(`google_calendar_email`). The CRM attempts a Google write only when that value
equals the current session email. Otherwise it updates Supabase and tells the
user the Google event belongs to someone else's calendar and was left alone.

This is also precisely the hook an edge function with refresh tokens would need
later to do the cross-user cleanup the browser cannot.

---

## §5 Schema

One migration, following the repo's `sql/YYYY-MM-DD-<slug>.sql` convention and
the CLAUDE.md new-column rules.

```sql
alter table public.crm_scheduled_calls
  add column if not exists google_event_id       text,
  add column if not exists google_calendar_email text,
  add column if not exists google_synced_at      timestamptz;

alter table public.crm_leads
  add column if not exists google_followup_event_id text,
  add column if not exists google_followup_email    text;
```

No new table, no RLS change, no new grants — but the two tables are **not**
granted alike, and the difference matters:

- `crm_scheduled_calls` — `select, insert, update, delete` to **`anon` and
  `authenticated`** (`sql/2026-07-14-crm-scheduled-calls.sql:27`).
- `crm_leads` — `select, insert, update` to **`authenticated` only**, with
  `REVOKE ALL ... FROM anon` and no `DELETE` grant at all
  (`sql/2026-10-05-crm-leads-require-auth.sql:35-36`).

Neither needs a grant change, because a table-level grant covers columns added
later. The asymmetry is recorded so nobody adds a `DELETE` path against
`crm_leads` on the assumption it is granted like its neighbour: clearing a
follow-up event clears the **column**, never the row.

---

## §6 Module boundary and testing

Pure decisions move into a new UMD module, `roadysGcal.js`, tested under
`node --test` — the pattern `roadysBD.js` and `bdpgSteps.js` already follow in
this repo, and the answer to `CRM.html` having no automated coverage.

`roadysGcal.js` owns, with no DOM and no `fetch`:

- `eventBodyForCall(lead, call, baseUrl)` → the Google event object
- `eventBodyForFollowUp(lead, baseUrl)` → the all-day event object
- `overlayEventsFrom(googleListResponse, suppressIds)` → calendar-view entries,
  with CRM-created events filtered out
- `mayWriteGoogle(record, sessionEmail)` → the §4.3 ownership rule
- `identityMatches(sessionEmail, grantedEmail)` → the §0.4 check, case- and
  whitespace-insensitive

`CRM.html` keeps the OAuth popup, the `fetch` calls and the rendering.

Tests cover at minimum: a lead with missing contact/phone/address still
produces a valid event body; the deep link is correctly encoded; an event
belonging to another user's calendar is refused; `identityMatches` is not
fooled by case or trailing whitespace; and the overlay suppresses ids the CRM
created.

---

## §7 Limitations of this approach — stated, not discovered later

1. **Nothing syncs while the tab is closed.** A browser OAuth client receives
   no refresh token, so there is no unattended process. Pull happens on load
   and on month change; push happens on user action.
2. **No Google push notifications.** Webhook channels require an HTTPS endpoint
   to receive them. Polling on load and month-change is the substitute.
3. **The access token expires in about an hour.** Long sessions hit a silent
   re-auth; if the user has revoked access it becomes a visible reconnect.
4. **Consent must start from a click**, or the popup blocker eats it.
5. **Origins are allow-listed.** The GitHub Pages origin must be registered on
   the OAuth client, and local development needs its own entry
   (`http://127.0.0.1:<port>`) or it will fail with `origin_mismatch`.
6. **Events are invisible across users by design.** Jason cannot see the
   Google event Robert created; only the Supabase row is shared. "Who
   scheduled this" lives in Supabase, never in Google.
7. **A revoked grant fails every call** until the user reconnects. The UI must
   say that rather than silently showing an empty calendar.
8. **This is a per-browser connection.** Signing into the CRM on a second
   machine means consenting again there.

---

## §8 Out of scope

- Refresh tokens, background sync, and Google push webhooks (§0.2 keeps the
  door open; this phase does not walk through it)
- Importing Google events as CRM records, and any conflict resolution
- Editing or rescheduling an existing scheduled call — the CRM has no such
  path today, and adding one is its own change
- Shared or team calendars; calendar creation or sharing
- Attendee invitations and RSVP tracking — `crm-emails` already sends
  availability and template mail, and duplicating invitations in Google would
  put two systems in charge of the same message
- Any change to `crm-emails`, its cron reminders, or the existing call
  notification mirror
