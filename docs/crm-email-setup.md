# CRM Email Automation — Deployment Runbook

This is the step-by-step guide for turning on **Phase B** of the CRM
scheduler: automated call reminder emails and the prospect self-booking
flow. Phase A (Qualified stage, in-modal scheduler, glowing Notifications
card, `CRM.html`) already ships client-side with no external setup.

Source design: `docs/superpowers/specs/2026-07-14-crm-scheduler-notifications-email-design.md`
(Section 6 "Setup checklist", Section 7 "Testing plan", Section 7a
"Decisions & open items"). All open questions in that spec are resolved —
this runbook has no decisions left to make, just steps to run.

---

## What ships automatically vs. what needs you

| | |
|---|---|
| **Already done (in the repo, no action needed)** | `CRM.html`, `call-booking.html`, the Qualified pipeline stage, the in-modal scheduler, the glowing dashboard Notifications card, and the edge function source `supabase/functions/crm-emails/index.ts` are all committed and working. `sql/2026-07-14-crm-scheduled-calls.sql` (Phase A tables) has very likely already been run — see Step 1. |
| **Needs you — one-time setup** | A Resend account + verified `roadys.com` sending domain, running two more SQL migrations, deploying the edge function in the Supabase Dashboard, setting 4 function secrets, enabling `pg_cron`/`pg_net`, and running the cron migration with your project's values filled in. |
| **Needs you — ongoing** | Nothing. Once set up, reminders and the booking flow run unattended. `crm_owner_emails` only needs updating again if an owner's email changes or a new owner is added. |

Do the steps in order — later steps depend on earlier ones (the edge
function needs the Resend key from Step 3; the cron job needs the edge
function deployed in Step 5 and the secret set in Step 6).

---

## Step 1 — Run `sql/2026-07-14-crm-scheduled-calls.sql`

This creates `crm_scheduled_calls` (the calls table that powers the
in-modal scheduler and the dashboard Notifications card) and
`crm_owner_emails` (the owner → email/timezone lookup Phase B's emails
use).

1. Open the Supabase Dashboard → SQL Editor.
2. Paste the full contents of `sql/2026-07-14-crm-scheduled-calls.sql` and run it.

**If you already ran this file when Phase A shipped**, this step is a
no-op — skip it. The migration uses `create table if not exists` and
`on conflict (owner) do nothing`, so re-running it is harmless either way
if you're not sure.

## Step 2 — Fill in real owner emails, and fix the seeded timezone

The migration in Step 1 seeds three placeholder rows in
`crm_owner_emails`: `Robert Watson`, `Angel Long`, `Logan`, each with a
`...@REPLACE.me` placeholder address. Replace them with real addresses:

```sql
update crm_owner_emails set email = '<real address>' where owner = 'Robert Watson';
update crm_owner_emails set email = '<real address>' where owner = 'Angel Long';
update crm_owner_emails set email = '<real address>' where owner = 'Logan';
```

Also run this, regardless of whether the addresses above are new or
already correct:

```sql
update crm_owner_emails set timezone = 'America/Denver';
```

**Why:** the design spec originally seeded `timezone` with a default of
`'America/Chicago'`. That default was corrected in the spec to
`'America/Denver'` (both CRM owners are Mountain time) — but the
migration file that already ran (or that you just ran in Step 1) still
creates the column with the old `America/Chicago` default, so any rows
inserted by it carry the stale value. The `update` above fixes the data
without needing a schema change.

Note this column is **currently inert** — the edge function displays
times using a hardcoded `America/Denver` constant, not this column — but
it's still worth correcting so the stored data is accurate for future
multi-timezone support.

Verify:

```sql
select owner, email, timezone from crm_owner_emails;
```

You should see three rows with real (non-`REPLACE.me`) addresses and
`timezone = 'America/Denver'`.

## Step 3 — Create a Resend account and verify `roadys.com`

1. Sign up for a free account at [resend.com](https://resend.com).
2. Add `roadys.com` as a sending domain and follow Resend's instructions
   to add the SPF and DKIM DNS records it shows you (DNS access for
   `roadys.com` is confirmed available). Domain verification typically
   takes a few minutes to a few hours depending on DNS propagation.
3. Wait until Resend shows the domain as **Verified** before moving on —
   sending from an unverified domain will fail or get spam-filtered.
4. Copy the **API key** from the Resend dashboard. You'll paste it into a
   Supabase secret in Step 6. Store it somewhere safe in the meantime
   (a password manager, not a plain text file you'll forget about).

## Step 4 — Run `sql/2026-07-14-crm-booking.sql`

This creates `crm_booking_offers` (the server-only table backing the
prospect self-booking links) plus three RPCs: `resolve_booking_offer`,
`submit_booking_choice`, `list_open_offers`.

1. Open the Supabase Dashboard → SQL Editor.
2. Paste the full contents of `sql/2026-07-14-crm-booking.sql` and run it.

Unlike Step 1, this table intentionally has **no** direct
anon/authenticated grants — it's reached only through the SECURITY
DEFINER RPCs and the service-role edge function, mirroring the existing
`truck-stop-optin.html` pattern. This is expected; don't add table
grants here.

## Step 5 — Create and deploy the `crm-emails` Edge Function

1. Supabase Dashboard → **Edge Functions** → Create a new function named
   `crm-emails`.
2. Open `supabase/functions/crm-emails/index.ts` in this repo, copy its
   full contents, and paste them into the Dashboard's function editor
   (replacing any placeholder starter code).
3. Click **Deploy**.

## Step 6 — Set the function secrets

In the `crm-emails` function's **Secrets** panel (Dashboard → Edge
Functions → `crm-emails` → Secrets), add all four of these:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | The API key you copied in Step 3. |
| `FROM_EMAIL` | `crm@roadys.com` — **must be set explicitly.** |
| `APP_BASE_URL` | `https://jasonvega1974.github.io/roadys-command-center` |
| `CRON_SECRET` | Any long random string you generate now (see below). |

**`FROM_EMAIL` is not optional — do not skip it.** The function code
falls back to `FROM = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev"`
if the secret is unset. `onboarding@resend.dev` is Resend's shared test
sender; it will not reliably deliver to prospects (and often lands in
spam or gets rejected outright for anyone but the Resend account owner's
own address). If reminder or booking emails aren't showing up later,
check this secret first.

**Generating `CRON_SECRET`:** any sufficiently long random string works —
it's just a shared secret between the cron job and the function so
random people on the internet can't trigger your reminder emails. Use a
password generator, or if you have a terminal handy:

```bash
openssl rand -hex 32
```

Save the value you generate — you'll paste the exact same string into the
cron SQL in Step 7.

## Step 7 — Enable `pg_cron` + `pg_net`, then run the cron migration

1. Supabase Dashboard → **Database** → **Extensions** → enable `pg_cron`
   and `pg_net` (if not already enabled).
2. Open `sql/2026-07-14-crm-cron.sql`. It schedules two jobs that POST to
   the `crm-emails` function:
   - `crm-reminder-1h` — every 15 minutes, triggers `reminder_1h`.
   - `crm-reminder-dod` — daily at 13:00 UTC, triggers `reminder_dod`
     (= 07:00 Mountain in summer / 06:00 Mountain in winter — this is a
     documented, accepted DST caveat; the digest itself computes "today"
     correctly regardless of exactly when it fires).
3. Before running it, **find and replace two placeholders** that appear
   twice each in the file:
   - `<PROJECT_REF>` → your Supabase project ref (Dashboard → Project
     Settings → API → the ref shown in your project URL, e.g.
     `abcdefghijklmno`).
   - `<CRON_SECRET>` → the exact same string you set as the `CRON_SECRET`
     function secret in Step 6. If these don't match character-for-character,
     every reminder will fail with a 401.
4. Paste the edited file into the SQL Editor and run it.
5. Verify the jobs were created:
   ```sql
   select * from cron.job;
   ```
   You should see `crm-reminder-1h` and `crm-reminder-dod` listed.

## Step 8 — Test end to end

Run through these checks in order. They correspond to the B2/B3/B4 cases
in the design spec's Section 7 testing plan.

**Reminder email (B2/B3):**

- [ ] In the CRM, schedule a test call ~45 minutes from now against a
      real lead (or a scratch lead you don't mind deleting after).
- [ ] Manually trigger the 1-hour reminder without waiting for cron, by
      POSTing to the function directly:
      ```bash
      curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/crm-emails' \
        -H 'Content-Type: application/json' \
        -H 'x-cron-secret: <CRON_SECRET>' \
        -d '{"action":"reminder_1h"}'
      ```
      (swap in your real project ref and cron secret).
- [ ] Confirm the owner's inbox receives an email titled
      `CRM Call Reminder — <Company>`.
- [ ] Confirm `crm_scheduled_calls.reminder_1h_sent` flipped to `true`
      for that call (`select reminder_1h_sent from crm_scheduled_calls where id = '<call id>';`).
- [ ] POST the same request again and confirm no second email is sent
      (idempotency via the `reminder_1h_sent` flag).

**Prospect self-booking (B4):**

- [ ] In the CRM, open a Qualified lead and use **"Send availability"** to
      offer 3–5 time slots to a test prospect email address you control.
- [ ] Confirm the prospect email arrives with a working
      `call-booking.html?token=...` link.
- [ ] Open the link, pick one of the offered slots.
- [ ] Confirm:
  - a new row appears in `crm_scheduled_calls` with `source = 'prospect'`,
  - the prospect receives a confirmation email,
  - the owner receives a "new booking" notification email.
- [ ] Re-open the same `call-booking.html?token=...` link and confirm it
      now shows an "already booked" state instead of the slot picker.

If all of the above pass, Phase B is fully live.

---

## Troubleshooting: reminder emails not arriving

If test emails from Step 8 (or later, real production reminders) don't
show up, check these in order:

1. **Is the Resend domain verified?** Dashboard → Resend → Domains →
   `roadys.com` should show **Verified**, not **Pending**. Unverified
   domains silently fail or get filtered.
2. **Is `FROM_EMAIL` actually set as a secret** — not left to the code's
   default? Check Supabase Dashboard → Edge Functions → `crm-emails` →
   Secrets. If `FROM_EMAIL` is missing, the function silently falls back
   to `onboarding@resend.dev`, which won't deliver reliably to prospects
   or owners other than the Resend account holder.
3. **Does the cron job's secret match the function's secret exactly?**
   Compare the `<CRON_SECRET>` value baked into
   `sql/2026-07-14-crm-cron.sql` (as run in Step 7) against the
   `CRON_SECRET` value set in the function's Secrets panel (Step 6). A
   mismatch produces a silent `401 unauthorized` from the function — the
   cron job "runs" but the request is rejected before any email is sent.
   You can check recent cron activity with:
   ```sql
   select * from cron.job_run_details order by start_time desc limit 20;
   ```
4. **Does `crm_owner_emails` have a real address for the relevant
   owner?** If the owner's row still has a `...@REPLACE.me` placeholder
   (or no row at all), `ownerEmail()` in the edge function either sends
   to a bogus address or returns `null` and the function silently skips
   that call/digest. Re-check with:
   ```sql
   select owner, email from crm_owner_emails;
   ```
