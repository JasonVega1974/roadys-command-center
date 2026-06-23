# Truck Stop Opt-In Portal — Design Spec

Date: 2026-06-23
Status: Approved (design); pending spec review

## 1. Purpose

A standalone, truck-stop-facing web page (emailed as a personalized link) that lets
a Roady's truck stop review each fuel aggregator, model their per-gallon profit, and
agree to (or decline) opt-in with a chosen discount. Submissions write directly into
the same Supabase data the Aggregator Launch Planner reads, so the planner updates
automatically. Non-responders default to the recommended discount.

## 2. Access model — token-based

- New page: **`truck-stop-optin.html`** (repo root, static; own Supabase client using the
  existing project + anon key, copied verbatim from `gs-command-center.html`).
- Opened via a **personalized, unguessable link**: `…/truck-stop-optin.html?t=<token>`.
- `t` is resolved server-side via a `SECURITY DEFINER` function (see §6) that returns the
  stop's safe fields by token. **The raw LID is never the gate** (guessable; ~250 links go
  to external inboxes; submissions go live with no review).
- **Fallback:** if `t` is missing/invalid, show a "find your stop" path — the stop types
  their **Store # (LID) + name**; we match (case-insensitive, trimmed) and proceed. (This
  path resolves via the same token-protected function path; see §6 note.)
- The planner's Location Opt-In tab gets a **"Copy opt-in link"** action per row that builds
  `…/truck-stop-optin.html?t=<token>` (token fetched per-row via a `SECURITY DEFINER`
  function — never a bulk token read).

## 3. The form page

### 3.1 Header
- "Roady's Aggregator Opt-In — **<Stop Name>** (<City, ST · LID>)".
- A **firm statement**, visually prominent:
  > "If you do not respond, you will be automatically enrolled at the **recommended discount**
  > for each aggregator below."

### 3.2 Calculator inputs (top, applies to all cards)
- **Your fuel cost ($/gal)** and **Your retail / pump price ($/gal)**.
- Spread = retail − cost (shown). Drives every card's profit math live.

### 3.3 One card per enabled aggregator (`show_on_form = true`)
Each card shows:
- **Name**, a **brief description** (from `agp_descriptions.body`, trimmed to ~2 lines),
  and **# fleets** (from the aggregator's `carriers` field).
- **Profit / gal — the hero element**: large, bold (e.g., **`28¢ / gal`**). It is the most
  visually dominant thing on the card, louder than the discount controls.
- **Discount controls** (smaller, beneath the profit): **type** (Cost + / Retail −) and
  **value (¢)**, defaulting to the aggregator's recommended discount.
- **Recommended line**, re-anchored to the currently-selected type (see §3.5).
- **Agree / Decline** choice (default neither; must pick to submit, or leave to accept the
  firm-statement default — see §4).

### 3.4 Profit math
- **Cost + X** → profit = **X ¢/gal**.
- **Retail − Y** → profit = **(retail − cost) − Y ¢/gal**.
- If cost/retail are blank: Cost+ profit still shows (= X); Retail− profit shows
  "enter cost & retail".

### 3.5 Recommendation re-anchoring (flagged decision)
The recommended discount is stored in the aggregator's native unit (e.g., Retail−12). On
the card it is **displayed in the unit the stop currently has selected**, converted using
their cost/retail:
- Retail−Y ⇄ Cost+X are equal when `X = (retail − cost) − Y`.
- So Retail−12 at a 40¢ spread displays as "Cost + 28" when the stop is in Cost+ mode; the
  **recommended profit is identical (28¢)** because the rates are equivalent.
- Never show mismatched units side-by-side. If cost/retail aren't entered, show the native
  unit with a "enter cost & retail to compare in this unit" hint.

## 4. Submit → cloud write-back

On **Submit**, for each enabled aggregator, upsert `agp_optins (aggregator_id, location_id)`:
- **status** = `Yes` (Agree) / `No` (Decline). If the stop left a card untouched, write the
  recommended default with status `No Response` (honoring the firm statement).
- **discount_type** + **retail_minus** / **cost_plus** = the stop's chosen values (or
  recommended if untouched).
- `updated_at = now()`.

Then stamp **`agp_locations.responded_at = now()`** for this stop (via column-restricted
`UPDATE`). A confirmation screen thanks the stop and summarizes their choices.

The planner reads these on its next load/sync — no manual step.

## 5. Planner integration (`aggregator-planner.html`)

- **Aggregator Workspace:** a **"Show on opt-in form"** toggle per aggregator, bound to
  `agp_aggregators.show_on_form`. CloudTrucks defaults off.
- **Location Opt-In tab:**
  - A **Responded** indicator per stop: ✓ + date if `responded_at` is set; otherwise
    **"No response."** (Sortable like the other columns.)
  - A **"Copy opt-in link"** row action → copies `…?t=<token>` (token via `get_optin_token`).
- Non-responders stay "No Response"; the recommended discount is already the planner's
  per-aggregator default, so nothing else is needed for the firm-statement behavior.
- **Planner read change:** `agp_locations` is now read with an **explicit column list**
  (excluding `optin_token`) instead of `select('*')`, because the token column is no longer
  anon-selectable (§6). `rowToLoc`/`locToRow` gain `responded_at` (read-only from the
  planner's perspective; written only by the form).

## 6. Data model, migration & security

### 6.1 New columns
- `agp_aggregators.show_on_form boolean default false`
- `agp_locations.responded_at timestamptz`
- `agp_locations.optin_token text` — random, url-safe, 32 chars (192-bit), **unique, NOT
  NULL, backfilled** for every existing stop; default-generated for new stops so clients
  never set it.

### 6.2 Security model
- RLS stays **enabled**; policies stay permissive (`using (true)`) as elsewhere.
- **Token is never bulk-readable by anon.** `SELECT` on `agp_locations` is re-granted
  **per-column, excluding `optin_token`**. `INSERT`/`UPDATE` are likewise column-scoped to
  exclude `optin_token`, so clients can neither read nor overwrite tokens.
- **Two `SECURITY DEFINER` functions** (both `set search_path = public, pg_temp`):
  - `resolve_optin_token(p_token text)` → returns the stop's safe fields (id, name, city,
    state, code, gs, responded_at) for a given token. Never returns the token. `EXECUTE` to
    anon. This is the form's resolve path.
  - `get_optin_token(p_loc_id text)` → returns the token for ONE location id (the planner's
    copy-link). `EXECUTE` to anon. Per-id, **not** bulk.
- **Residual risk (flagged):** the planner and the public form share the *same public anon
  key*, so `get_optin_token` is callable by anyone who has both the anon key (in page source)
  and a location id (location ids derive from store codes). That allows per-id token lookup,
  though not a bulk dump. True admin/public isolation requires authenticating the planner
  (Supabase Auth) — proposed as a **follow-up**, out of scope here. The literal requirement
  ("no bulk token read") is met.
- **Fallback identification note:** the "Store # + name" fallback also needs to resolve a
  token without bulk read. It uses a `SECURITY DEFINER` `resolve_optin_by_code(p_code text,
  p_name text)` that matches a single stop and returns the same safe fields (no token). This
  keeps the fallback from exposing the token table.

### 6.3 Migration SQL (review before applying — see message)
Lives in `supabase/agp_optin_portal.sql`. Full text is shown to the user for review and is
idempotent (`add column if not exists`, `create or replace`, `create unique index if not
exists`). No table is dropped or recreated.

## 7. Out of scope (now)
- Outbound email/Slack notifications on submit (static site; needs an Edge Function).
- Login/auth for the planner (the follow-up that would harden token access).
- Editing a submission after the fact from the stop side (they can re-open their link and
  resubmit; latest wins).

## 8. Testing
- **Headless** (node, mocked Supabase client) like the planner's existing tests:
  - Profit math: Cost+X → X; Retail−Y → (retail−cost)−Y; blank-input handling.
  - Re-anchoring: Retail−12 ⇄ Cost+ conversion at a given spread yields equal profit.
  - Token resolve happy-path + invalid token → fallback; fallback by code+name.
  - Submit writes the right `agp_optins` rows (Agree/Decline/untouched→No Response +
    recommended) and stamps `responded_at`.
  - Planner: `show_on_form` toggle drives card visibility; responded indicator reflects
    `responded_at`; copy-link builds `?t=<token>`; explicit-column read still assembles state.
- **SQL**: a verification query block at the bottom of the migration (commented).
- `node --check` on both pages.

## 9. Files touched
- New: `truck-stop-optin.html`, `supabase/agp_optin_portal.sql`.
- Edit: `aggregator-planner.html` (toggle, responded column, copy-link, explicit-column
  read, `responded_at` mapping), `index.html` (nav tab/link if desired), `supabase/agp_schema.sql`
  (document the 3 new columns + functions).
