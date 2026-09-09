# GS Travel Profiles — Design Spec

**Date:** 2026-09-08
**File:** `gs-travel-planner.html`
**Author:** Jason Vega + Claude
**Status:** Approved design — pending spec review, then implementation plan (`writing-plans`).

---

## 1. Goal

Give each Growth Strategist a **travel profile** — home airport, preferred hotel,
airline and tier, PreCheck/Global Entry status, loyalty account numbers, and free
notes. When the master user schedules site visits for someone else, selecting that
GS from the existing dropdown pre-populates the trip with their travel details.

Delivered in two phases:

- **Phase 1 — non-sensitive profiles.** New `gs_travel_profiles` table, a
  Travel Profiles tab, home-airport prefill, a read-only profile card in the
  planner, and hotel-brand bias. No cryptography.
- **Phase 2 — encrypted vault.** Loyalty account numbers and Known Traveler
  Numbers, encrypted client-side using envelope encryption, with a recovery code
  and support for more than one passphrase holder.

Phase 1 ships and is useful on its own. Phase 2 does not change Phase 1's schema
beyond adding one nullable column and one new table.

---

## 2. Current state (verified)

- `gs-travel-planner.html` is ~3,100 lines and **uses no Supabase at all**. It is
  entirely `localStorage`-backed. Phase 1 introduces the page's first cloud call.
- Two views toggled by `.viewTab` buttons with `data-view` (line 388–390),
  switched by `svSetView(v)` (line 3054). Print CSS at line 170 hides `#viewVisit`.
- The GS dropdown `#gsName` (line 401) is a **hardcoded list of six names** plus
  `__other`. `curGS()` (line 1767) resolves the free-text case.
- `AIRPORTS` entries are `["BOI","Boise Airport, ID",43.5644,-116.2228]`, so a
  home airport can be stored as an IATA code alone and resolved to coordinates
  locally — no geocoding required.
- `findHotels()` already special-cases Best Western via regex; brand bias extends
  that existing hook rather than adding a new one.
- Trips are saved per-GS at `gsp2:trip:<gs>:<name>` and stay local. **This spec
  does not move trips to the cloud.**
- The established cloud pattern is `ensureSupabaseLib()` (CDN `@supabase/supabase-js@2`)
  + `getRoadysSB()` + graceful fallback, from `gs-command-center.html:2768–2785`.
- `gs_managers` was considered as a host for these fields and **rejected**: its
  rows are machine-derived from the REGIONS config in `syncToCloud()` and upserted
  with `onConflict: 'name'`, and the SQL notes that sync path is currently
  inactive. Hand-entered profile data does not belong in a machine-derived table.

### Security baseline (verified, and it constrains the design)

The Supabase anon key is embedded in HTML served publicly from GitHub Pages, and
the project's RLS convention is `for select using (true)` with grants to `anon`.
**Anything written to a standard table here is readable by anyone on the internet
who views source.** This is acceptable for truck-stop addresses. It is not
acceptable for Known Traveler Numbers or frequent-flyer accounts, which is the
entire reason Phase 2 exists as a separate, encrypted design.

---

## 3. Decisions made during design

| Decision | Choice | Why |
|---|---|---|
| Sensitive data storage | Encrypted in the cloud | Local-only had no real backup story; a manual export button is not a backup |
| Who edits profiles | Master maintains all | Matches the stated workflow: master books travel for the team |
| Host table | New `gs_travel_profiles` | Avoids mixing hand-entered data into machine-derived `gs_managers` |
| Editor location | Third tab in the planner | Feature stays in one file, in the page where travel is planned |
| Key derivation | Envelope (DEK + wraps) | Direct key derivation made rotation require full re-encryption and made a second holder impossible |
| Crypto placement | Separate `<script>` block, same file | No page in this repo loads local `.js`; a DOM-free block stays testable without breaking single-file deploy |
| Per-GS day/visit defaults | **Out of scope** | Explicitly declined during design; YAGNI |

---

## 4. Phase 1 — non-sensitive profiles

### 4.1 Schema

```sql
create table public.gs_travel_profiles (
  gs_name         text primary key,   -- matches #gsName / gs_managers.name convention
  home_airport    text,               -- IATA only ("BOI"); coords resolved from AIRPORTS
  hotel_brand     text,
  hotel_notes     text,
  airline         text,
  airline_tier    text,
  has_precheck    boolean default false,
  has_globalentry boolean default false,
  notes           text,               -- absorbs "anything else that may assist"
  sec             jsonb,              -- Phase 2 ciphertext envelope; null until then
  updated_at      timestamptz default now()
);
```

`sec` is created in Phase 1 but left null and unread, so Phase 2 needs no
migration against a populated table.

Per the CLAUDE.md new-table checklist, the same migration **must** include:

- `alter table ... enable row level security;`
- explicit `select` / `insert` / `update` / `delete` policies
- `grant select, insert, update, delete ... to anon, authenticated;`
- an `updated_at` trigger function with `set search_path = public, pg_temp`

**A DELETE policy is NOT included** (revised 2026-09-09,
`sql/2026-09-09-drop-gs-travel-profiles-delete-policy.sql`). It shipped in the
original migration on the reasoning that removing a departed person is a real
requirement, but that requirement is rare and the anon key is public, so the
policy let anyone on the internet delete every profile with one PostgREST call.
Removals are now done by a human in the SQL Editor. TRUNCATE is revoked
alongside it, since RLS does not gate TRUNCATE and it would otherwise remain a
deletion primitive. SELECT / INSERT / UPDATE are untouched.

Migration file: `sql/2026-09-08-gs-travel-profiles.sql`, wrapped in
`begin; … commit;` with a commented verification query at the bottom.

### 4.2 Travel Profiles tab

A third `.viewTab` (`data-view="profiles"`, container `#viewProfiles`) beside
Route Planner and Site Visit, reusing `svSetView()`. It must be added to the
print-hide rule at line 170 so it never appears in a printed packet.

Contents: a person selector driven by the roster in §4.4 (never free text), the
non-sensitive fields above, a Save button, and a "last updated" line. Phase 2 adds a locked
sensitive block below these; Phase 1 leaves that space empty.

### 4.3 Planner integration

On `#gsName` change in Route Planner:

1. **Home airport.** If the trip's start point is **empty**, fill it from the
   profile's IATA code via `AIRPORTS`. If an origin is already set, do **not**
   overwrite it — render a one-click chip ("Use Burt's home airport (BOI)")
   instead. Silently replacing an origin would destroy planned work.
2. **Profile card.** Read-only summary panel: hotel, airline + tier, PreCheck /
   Global Entry, notes. **Screen-only — it must not appear in the printed trip
   packet.** `buildPrint()` does not read the profile, and the card's container
   is added to the print-hide rule at line 170. A packet is handed to third
   parties at truck stops; it should not carry a person's PreCheck status or
   travel preferences.
3. **Hotel bias.** Extend the existing Best Western branch in `findHotels()` to
   flag the selected GS's `hotel_brand` at each overnight stop.

### 4.4 Roster and identity

The roster is **not** the hardcoded six. The people who need travel profiles are
broader than the official GS titles — nine at time of writing — and only six
appear anywhere in this codebase (`REGIONS` and `GS_PINS` in
`gs-command-center.html`). The remaining names are **not** hardcoded anywhere and
must not be invented here; they are added through the UI.

**Source of truth:** the distinct `gs_name` values in `gs_travel_profiles`.

**Bootstrap.** That table is empty on day one, so the roster is the union of:

1. distinct `gs_name` from the cloud table (authoritative once populated),
2. the six names currently in `#gsName`, as a starting convenience only,
3. any GS names found in local `gsp2:trip:<gs>:…` keys, so an existing planner
   user never loses their own name from the list.

Entries from 2 and 3 are display-only until a profile is saved for them.

**Adding a person is an explicit action, never free text.** The `__other`
free-text path is removed. In its place, a `+ Add person…` item opens a small
confirm step that:

- trims and collapses whitespace, and rejects an empty or 1-character name;
- compares case-insensitively and ignoring punctuation against the existing
  roster, and on a near-match offers the existing entry instead of creating a
  second row ("Did you mean **Steph Leslie**?");
- only then creates the profile row.

This closes the orphan-row hole: a typo can no longer silently create
`gs_travel_profiles` rows or divergent trip keys.

**Storage and matching.** `gs_name` stores the canonical display name with its
original casing; all comparison and de-duplication is case-insensitive. Existing
trip keys already lowercase the name (`tripKey()`), so this stays compatible.

**Offline safety — this is a regression risk, not a nicety.** `#gsName` also
determines trip ownership, and trips are local. If the roster were purely
cloud-derived and Supabase were unreachable, the dropdown could render empty and
block trip saving, which works offline today. The dropdown therefore **must never
be empty**: on any cloud failure it falls back to sources 2 and 3 above. A
profile failure must not cost a user the ability to save a trip.

### 4.5 Failure behaviour

Every cloud call falls back to a `gsp2:profile:<gs>` localStorage mirror, written
on each successful fetch. If Supabase is unreachable, the CDN is blocked, or RLS
rejects the call, the planner degrades to exactly today's behaviour — an empty
profile and no prefill. **Route planning must never be blocked by a profile
failure.** This mirrors the fallback discipline in `gs-command-center.html`.

### 4.6 Phase 1 testing

- Save → reload → values persist (cloud), and a second browser sees them.
- With Supabase blocked, the planner still builds a route; the profile card is
  absent, not broken.
- Prefill fills an empty origin; with an origin already set it offers the chip
  and leaves the origin untouched.
- Hotel bias flags the configured brand at an overnight stop.
- **Anon read/write verified against real RLS + grants**, not just locally — the
  403 trap documented in CLAUDE.md is the specific failure this catches.
- Roster derives from cloud `gs_name` values once populated, and a newly added
  person appears without a code change.
- **With Supabase blocked, the GS dropdown is still populated and a trip still
  saves.** This is the regression guard for §4.4.
- Adding a near-duplicate name ("steph leslie") offers the existing entry rather
  than creating a second row.
- The profile card is absent from the printed packet (print preview / `buildPrint`
  output contains no profile fields).

---

## 5. Phase 2 — encrypted vault

> **Amended 2026-09-09 (as built).** Three things in this section were changed
> during implementation and the sections below have been corrected in place, so
> §5 now matches the shipped code. The amendments:
>
> 1. **PBKDF2 iterations are 600,000, not 310,000** (§5.2), and the count
>    travels *per wrap* rather than being a global constant, so old wraps keep
>    working when the constant is raised. Measured on the target hardware: an
>    honest unlock costs **~87 ms**; a wrong secret against a 2-wrap vault
>    rejects in a few hundred ms; the hostile worst case (a poisoned array at
>    the clamped 2M ceiling) measured **364 ms**. `VAULT_KDF_ITER_MIN`/`_MAX`
>    (100k / 2M) clamp whatever a wrap claims, and may only ever be widened.
> 2. **No `verifier` field** (§5.2). AES-KW is authenticated, so a wrong secret
>    makes `unwrapKey` throw rather than yield a bogus key. A stored verifier
>    would add an oracle and buy nothing, so `wraps` entries are
>    `{label, salt, iter, wrapped}` — no `iv`, no `ct`, no verifier.
> 3. **`sec`-preservation is verified, not assumed** (§5.6). Rotation and
>    holder changes re-wrap the DEK only; the `gs_travel_profiles.sec`
>    ciphertext is byte-identical before and after, and still decrypts. Saving
>    a profile with the vault locked leaves any existing `sec` untouched
>    instead of nulling it.

### 5.1 Threat model, stated plainly

The ciphertext **is publicly readable**, because the anon key is public and there
is no auth. Encryption converts the exposure from "plaintext KTNs on the open
internet" into "an offline brute-force target". **Passphrase strength is the only
defence.** A minimum of 12 characters is enforced in the UI and the reason is
stated there.

Hiding the column behind a `SECURITY DEFINER` RPC (as `crm_booking_offers` does)
was considered and rejected: anon can call the RPC too, so it is obscurity, not
protection. Genuine access control requires the authenticated gate that was
declined during design; that remains the honest upgrade path and should be
revisited if this data ever grows beyond a handful of staff.

### 5.2 Envelope encryption

- A random 256-bit AES-GCM **data key (DEK)** is generated once at vault setup.
  All profile secrets are encrypted under the DEK.
- The DEK is **wrapped** separately under each holder's key-encryption key (KEK),
  derived by PBKDF2-SHA256 at 600,000 iterations *(revised 2026-09-09 from
  310,000)* from that holder's passphrase, and additionally under a generated
  **recovery code**. The count is recorded on each wrap, so raising the
  constant never orphans an existing holder; it is clamped to
  100,000–2,000,000 on both wrap and unwrap.
- Wrapping is **AES-KW**, which is authenticated: a wrong secret makes
  `unwrapKey` throw instead of returning a bogus key. *(Revised 2026-09-09:
  this is why no `verifier` is stored — one would add a brute-force oracle
  and buy nothing.)*
- The wraps live in a single-row table:

```sql
create table public.gs_travel_vault (
  id         text primary key default 'v1',
  wraps      jsonb not null default '[]'::jsonb,  -- [{label, salt, iter, wrapped}]
  kdf        jsonb not null default '{"name":"PBKDF2","hash":"SHA-256","iterations":600000}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Same RLS + grants + pinned-`search_path` trigger requirements as above. No DELETE
policy: the vault row is never deleted from the browser.

*Revised 2026-09-09:* `updated_at` is load-bearing, not decoration. Rotation,
add-holder and remove-holder are all second writers to this one row, so every
change goes through a conditional update — read the row, compute the new wraps
from *that* snapshot, then
`.update({wraps}).eq('id','v1').eq('updated_at', seen).select()`. An empty
returned array means another holder changed access first; that aborts and is
reported, never retried. A lost write here would silently delete a holder's
only way in.

Per-profile secrets are stored in `gs_travel_profiles.sec` as
`{v:1, iv, ct}` — AES-GCM with a fresh 12-byte IV per save. Plaintext shape:
`{ktn, globalEntry, loyalty:[{program, number}]}`.

The passphrase and the derived keys live in module-scoped variables only. Never
`localStorage`, never `sessionStorage`, gone on reload. The AES key is created
with `extractable: false`.

### 5.3 Why envelope encryption (the flaw it fixes)

Deriving the profile key directly from the passphrase — the first design — meant
rotating the passphrase required re-encrypting every profile, and a second holder
was impossible. Wrapping a DEK fixes both: rotation re-wraps one small row, and
adding a holder appends one wrap.

| Scenario | Direct derivation | Envelope |
|---|---|---|
| Master forgets passphrase | Data gone | Unwrap with recovery code, set a new one |
| Master leaves, hands over | Works | Works |
| Master leaves, no handover | Data gone | Recovery code unwraps it |
| Rotate passphrase | Re-encrypt every profile | Re-wrap one row |
| Add a second admin | Impossible | Append a wrap |
| **All wraps lost** | Data gone | **Data gone** |

The last row is irreducible for client-side encryption without server-side
escrow — and escrow would let a third party decrypt the team's KTNs, defeating
the purpose. The residual risk is accepted because the true fallback is cheap:
six people each know their own numbers, so worst case is an hour of emails, not
lost business records.

### 5.4 Operational requirement — not a suggestion

> **The passphrase and the recovery code MUST be stored in the company password
> manager, with at least two people having access.**
>
> They must not live only in one person's head, and not only in one person's
> notes. The engineering design above removes every recovery failure mode except
> "all wraps lost" — and the only thing standing between the organisation and
> that case is this operational step. A single holder who leaves, forgets, or is
> unavailable reintroduces the exact data-loss scenario the envelope design was
> built to eliminate.

The vault setup screen states this requirement on-screen, and the recovery code is
displayed **once** with copy and print actions plus an explicit "I have stored
this in the password manager" confirmation before setup completes.

### 5.5 Code organisation

The crypto lives in its own `<script>` block, delimited by
`// ── VAULT_CRYPTO ──` / `// ── /VAULT_CRYPTO ──` sentinels matching the repo's
existing seed-block convention. It exposes a DOM-free API and touches no page
state:

*Revised 2026-09-09 — as shipped.* The block is DOM-free and storage-free, so
the caller passes `wraps` in and gets `wraps` back; persisting them is the
page's job, not the crypto's. There is no `vaultRotate`: rotation is
`vaultAddHolder` under an existing label, which drops that label's old wrap
before pushing the new one.

```
vaultAvailable() -> bool                  // secure context + WebCrypto
vaultCreate(passphrase) -> {wraps, recoveryCode}
vaultUnlock(secret, wraps) -> label|null  // throws VaultDataError on corrupt data
vaultIsUnlocked() / vaultLock()
vaultAddHolder(label, secret, wraps) -> wraps   // same label == rotate
vaultRemoveHolder(label, wraps) -> wraps        // throws on the last wrap
vaultEncrypt(obj, aad) -> envelope
vaultDecrypt(envelope, aad) -> obj
```

`aad` is required with no fallback: it binds a ciphertext to the record it
belongs to, so a world-writable table cannot be used to lift one person's
account numbers onto another person's row.

Because it is dependency-free and DOM-free, the block can be copy-pasted into a
standalone harness for testing, the same technique used to isolate `geocode()`
during the 2026-09-08 pin investigation.

### 5.6 Phase 2 testing

- Round trip: encrypt → decrypt → deep-equal to the original object.
- Wrong passphrase fails cleanly (AES-GCM auth tag) and **does not corrupt or
  overwrite** stored ciphertext.
- Recovery code unwraps the DEK after the passphrase is discarded.
- Rotation: old passphrase stops working, new one works, **profile rows are
  untouched** (compare `sec` values before and after). *Verified 2026-09-09:
  `ciphertextUntouched` and `stillDecrypts` both true after a rotation, and the
  recovery code still unwraps — that pair is the proof rotation re-wraps rather
  than re-encrypts. Saving a profile while the vault is locked also leaves an
  existing `sec` byte-identical rather than nulling it.*
- *Added 2026-09-09:* a concurrent change to `gs_travel_vault` (the conditional
  update matching zero rows) aborts without writing, says plainly that someone
  else changed vault access, and leaves the local wraps unchanged.
- *Added 2026-09-09:* removing a holder requires an explicit confirmation that
  names the holder and the number of wraps that will remain, warns prominently
  when exactly one would remain, and writes nothing if declined.
- Second holder: two different passphrases both unwrap the same DEK.
- **Server-side assertion: the row stored in Supabase contains ciphertext, not a
  readable KTN.** Fetch it back raw and confirm. This is the test that proves the
  feature's entire purpose.
- Setup cannot complete without the recovery-code confirmation.

---

## 6. Out of scope

- Per-GS day-start / day-end / visit-length defaults (declined during design).
- Moving trips to the cloud; trips stay in `localStorage`.
- Authenticated access to Supabase (the real fix for public readability).
- Editing profiles from `gs-command-center.html`.
- A GS editing their own profile — master maintains all of them in v1.
- Backfilling profiles for the six existing names; they start empty.

---

## 7. Known risks

1. **Public ciphertext.** Mitigated by a 12-character minimum and 310k PBKDF2
   iterations; not eliminated. Revisit if this data grows beyond a few staff.
2. **File size.** `gs-travel-planner.html` is already ~3,100 lines; this adds a
   tab, a sync layer and a crypto block. The sentinel-delimited crypto block
   limits the blast radius, but the file is getting heavy and may warrant a split
   later.
3. **Single-editor model.** Only the master maintains profiles, so a stale
   profile is invisible to the GS it describes.
4. **Roster bootstrap.** Three of the nine people are not recorded anywhere in
   this codebase and must be entered through the UI before they can be selected.
   No code change is needed, but the feature is not fully usable until the master
   adds them. (The `__other` free-text hole itself is closed by §4.4.)

---

## 8. Resolved during review (2026-09-08)

- **Profile card printing** — screen-only; excluded from the trip packet. See §4.3.
- **Roster** — derived from distinct cloud `gs_name` values, not the hardcoded
  six; the real list is broader than the official GS titles. Free-text `__other`
  is replaced by an explicit, validated add action. See §4.4.
