'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RoadysBD } = require('./roadysBD.js');

test('toRow converts camelCase to the column names the table uses', () => {
  const row = RoadysBD.map.toRow({
    id: 'bdp_1', leadId: 'CRM-123456', status: 'final',
    prospectName: "Dysart's", city: 'Hermon', stateCode: 'ME',
    locationType: 'Truck Stop', region: 'Northeast',
    profile: 'Medium truck stop', roadway: 'Interstate',
    inputs: { pricingLevel: 0 }, results: { finalGallons: 11153 },
    officialSubtotal: 11153, finalGallons: 11153,
    recommendation: 'Good fit', regionPctStamp: '6.3',
    baselineStamp: '10492', author: 'robert@example.com'
  });
  assert.equal(row.lead_id, 'CRM-123456');
  assert.equal(row.prospect_name, "Dysart's");
  assert.equal(row.state_code, 'ME');
  assert.equal(row.location_type, 'Truck Stop');
  assert.equal(row.official_subtotal, 11153);
  assert.equal(row.final_gallons, 11153);
  assert.equal(row.region_pct_stamp, '6.3');
  assert.equal(row.baseline_stamp, '10492');
  // camelCase keys must not survive into the row
  assert.equal(row.leadId, undefined);
  assert.equal(row.finalGallons, undefined);
});

test('fromRow is the exact inverse of toRow', () => {
  const profile = {
    id: 'bdp_2', leadId: null, status: 'draft',
    prospectName: 'Vega Travel Plaza', city: 'Idaho Falls', stateCode: 'ID',
    locationType: 'Truck Stop', region: 'Northwest',
    profile: 'Large truck stop', roadway: 'Interstate',
    inputs: { amenityLevel: 'Average' }, results: {},
    officialSubtotal: null, finalGallons: null,
    recommendation: '', regionPctStamp: '', baselineStamp: '',
    author: 'angel@example.com'
  };
  const back = RoadysBD.map.fromRow(RoadysBD.map.toRow(profile));
  Object.keys(profile).forEach(k => assert.deepEqual(back[k], profile[k], k));
});

test('fromRow coerces a missing or wrong-typed column to a safe default', () => {
  // A hand-edited row must not reach the DOM as undefined or [object Object].
  const back = RoadysBD.map.fromRow({ id: 'bdp_3', prospect_name: { x: 1 } });
  assert.equal(back.prospectName, '');
  assert.equal(back.status, 'draft');
  assert.equal(back.leadId, null);
  assert.equal(back.finalGallons, null);
  assert.deepEqual(back.inputs, {});
  assert.equal(back.updatedAt, '');
});

test('updatedAt reads through from the row but is never written back', () => {
  // The trigger owns updated_at. It is readable because the calculator and
  // the CRM both show "last edited by X at Y" on a shared draft — but it must
  // never ride out in toRow, or a client clock would overwrite the server's.
  const back = RoadysBD.map.fromRow({ id: 'bdp_4', updated_at: '2026-10-05T19:30:00.000Z' });
  assert.equal(back.updatedAt, '2026-10-05T19:30:00.000Z');
  assert.equal(RoadysBD.map.toRow({ updatedAt: '2026-10-05T19:30:00.000Z' }).updated_at, undefined);
});

test('toRow never emits a status the CHECK constraint would reject', () => {
  assert.equal(RoadysBD.map.toRow({ status: 'nonsense' }).status, 'draft');
  assert.equal(RoadysBD.map.toRow({ status: 'final' }).status, 'final');
});

test('the module loads headless and every network call degrades to a null result', async () => {
  // No window, so client() is null. Nothing may throw — CRM.html and the
  // calculator both call these before a session exists.
  assert.equal(RoadysBD.auth.client(), null);
  assert.equal(RoadysBD.auth.session(), null);
  assert.equal(RoadysBD.auth.email(), '');
  assert.equal(await RoadysBD.profiles.forLead('CRM-1'), null);
  assert.deepEqual(await RoadysBD.profiles.forLeads(['CRM-1']), {});
  assert.equal(await RoadysBD.profiles.draftFor(null), null);
  assert.equal((await RoadysBD.profiles.saveDraft({})).ok, false);
  assert.equal((await RoadysBD.auth.signIn('a@b.c', 'x')).ok, false);
});

test('minted profile ids do not collide within the same millisecond', () => {
  // Date.now() alone repeats inside one tick, and a repeated id would make
  // upsert(onConflict:'id') overwrite a different prospect's profile.
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(RoadysBD.testing.mintId());
  assert.equal(ids.size, 500);
});

test('the sign-out cache list covers every gated page\'s Supabase mirror', () => {
  // If a page behind the gate caches a Supabase table under a key missing
  // here, that data stays readable after sign-out on a shared device.
  const keys = RoadysBD.auth.CACHE_KEYS;
  ['roadys_crm_v2','roadys_crm_calls','roadys_crm_notes_v1','roadys_crm_tmpl_v2',
   'truckStopPortal_v4','roadys_sd_tickets','roadysBDPGDraft']
    .forEach(k => assert.ok(keys.includes(k), 'missing cache key: ' + k));
});

test('the sign-out cache list does not clear preferences or authoritative local data', () => {
  // Clearing a display preference is merely rude; clearing roadysBDPGProfiles
  // would destroy the rep's only copy of their saved prospects, which are not
  // yet stored anywhere else.
  const keys = RoadysBD.auth.CACHE_KEYS;
  ['roadys_theme','roadysBDPGTheme','roadysBDPGRegionOverride',
   'roadys_crm_rules_v2','roadysBDPGProfiles']
    .forEach(k => assert.ok(!keys.includes(k), 'must not clear: ' + k));
});

// ── leadParamsFrom ──────────────────────────────────────────────────────
// Parses the query string the CRM's "Value Prop →" button builds. Parsing is
// the step that can silently mangle a company name or a state code, so it
// lives in the module where node --test can reach it rather than inline in
// an 8,000-line HTML file.

const LP = RoadysBD.leadParamsFrom;

test('leadParamsFrom reads every field the CRM button sends', () => {
  const p = LP("?lead=CRM-001&name=Dysart%27s%20Truck%20Stop&city=Hermon&state=ME&street=530%20Coldbrook%20Rd");
  assert.deepEqual(p, {
    leadId: 'CRM-001',
    name: "Dysart's Truck Stop",
    city: 'Hermon',
    state: 'ME',
    street: '530 Coldbrook Rd'
  });
});

test('a leading ? is optional', () => {
  assert.deepEqual(LP('lead=CRM-9'), LP('?lead=CRM-9'));
});

test('absent fields are null, not empty string', () => {
  // null means "the CRM did not send this"; '' would be indistinguishable
  // from "the lead has an empty city", and the prefill treats them
  // differently -- it fills from the former and skips the latter.
  const p = LP('?lead=CRM-2');
  assert.equal(p.leadId, 'CRM-2');
  assert.equal(p.name, null);
  assert.equal(p.city, null);
  assert.equal(p.state, null);
  assert.equal(p.street, null);
});

test('an empty query string yields all nulls rather than throwing', () => {
  assert.deepEqual(LP(''), { leadId: null, name: null, city: null, state: null, street: null });
  assert.deepEqual(LP('?'), { leadId: null, name: null, city: null, state: null, street: null });
});

test('a present-but-blank parameter is null, not an empty string', () => {
  const p = LP('?lead=CRM-3&name=&city=%20%20');
  assert.equal(p.name, null);
  assert.equal(p.city, null, 'whitespace-only is blank');
});

test('state is upper-cased and clamped to two characters', () => {
  assert.equal(LP('?state=me').state, 'ME');
  assert.equal(LP('?state=Maine').state, 'MA', 'sliced to the first two, matching onStateInput');
  assert.equal(LP('?state=m').state, 'M', 'a single character is left alone for the rep to finish');
});

test('values are trimmed', () => {
  assert.equal(LP('?name=%20%20Dysart%27s%20%20').name, "Dysart's");
});

test('unknown parameters are ignored', () => {
  const p = LP('?lead=CRM-4&call=1&utm_source=email&name=Acme');
  assert.deepEqual(Object.keys(p).sort(), ['city','leadId','name','state','street']);
  assert.equal(p.name, 'Acme');
});

test('a non-string argument degrades to all nulls instead of throwing', () => {
  // This is read straight off location.search, but a hand-edited call site
  // must not take the page down.
  [null, undefined, 42, {}, []].forEach(v => {
    assert.deepEqual(LP(v), { leadId: null, name: null, city: null, state: null, street: null });
  });
});

test('markup in a parameter survives as literal text for escHtml to handle', () => {
  // The parser does not escape -- the renderer does. What it must NOT do is
  // mangle the value so the renderer escapes something different from what
  // arrived.
  assert.equal(LP('?name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E').name, '<img src=x onerror=alert(1)>');
});

// ── profiles.summary ────────────────────────────────────────────────────

test('summary of no profile reports has:false and blanks, never null', () => {
  // The CRM renders this straight into a card; a null here would be a
  // TypeError on every unprofiled lead, which is most of the board.
  const s = RoadysBD.profiles.summary(null);
  assert.equal(s.has, false);
  assert.equal(s.isDraft, false);
  assert.equal(s.gallons, null);
  assert.equal(s.gallonsText, '—');
  assert.equal(s.recommendation, '');
  assert.equal(s.region, '');
});

test('summary of a final profile carries every field the CRM renders', () => {
  const s = RoadysBD.profiles.summary({
    status: 'final', finalGallons: 11153, recommendation: 'Good fit',
    region: 'Northeast', profile: 'Medium truck stop', roadway: 'Interstate',
    updatedAt: '2026-10-06T19:30:00.000Z',
    inputs: { pricingLevel: 0.025, truckerPathRating: 4.5, amenityLevel: 'Average' }
  });
  assert.equal(s.has, true);
  assert.equal(s.isDraft, false);
  assert.equal(s.gallons, 11153);
  assert.equal(s.gallonsText, '11,153');
  assert.equal(s.recommendation, 'Good fit');
  assert.equal(s.pricingPct, 0.025);
  assert.equal(s.pricingText, '+2.5%');
  assert.equal(s.truckerPath, '4.5');
  assert.equal(s.amenityLevel, 'Average');
  assert.equal(s.region, 'Northeast');
  assert.equal(s.profileType, 'Medium truck stop · Interstate');
  assert.equal(s.savedAt, '2026-10-06');
});

test('a draft is flagged as a draft', () => {
  const s = RoadysBD.profiles.summary({ status: 'draft', finalGallons: 9000 });
  assert.equal(s.has, true);
  assert.equal(s.isDraft, true);
});

// ── profiles.summary: statusText ────────────────────────────────────────
// Collapses the has/isDraft pair into the one word CRM.html renders, so the
// three call sites that used to hand-derive 'draft'/'final'/'' inline (the
// sort extractor, the Lead Table status cell, and the CSV export) read it
// instead of re-deriving it.

test('statusText is empty when there is no profile', () => {
  assert.equal(RoadysBD.profiles.summary(null).statusText, '');
});

test("statusText is 'draft' for a draft profile", () => {
  assert.equal(RoadysBD.profiles.summary({ status: 'draft' }).statusText, 'draft');
});

test("statusText is 'final' for a final profile", () => {
  assert.equal(RoadysBD.profiles.summary({ status: 'final' }).statusText, 'final');
});

test('a profile with no generated gallons shows a dash, not zero', () => {
  // A profile saved before Generate ran has null gallons. Rendering "0" would
  // assert a figure the calculator never produced.
  const s = RoadysBD.profiles.summary({ status: 'final', finalGallons: null });
  assert.equal(s.gallons, null);
  assert.equal(s.gallonsText, '—');
});

test('pricing of exactly zero renders as 0.0%, not as missing', () => {
  // 0 is the default posture and the single most common value; a truthiness
  // check would blank it on most profiles.
  const s = RoadysBD.profiles.summary({ status: 'final', inputs: { pricingLevel: 0 } });
  assert.equal(s.pricingPct, 0);
  assert.equal(s.pricingText, '0.0%');
});

test('summary survives a hand-edited row without leaking junk into the DOM', () => {
  const s = RoadysBD.profiles.summary({
    status: 'nonsense', finalGallons: 'lots', region: { x: 1 },
    profile: ['a'], inputs: 'not-an-object', updatedAt: 42
  });
  assert.equal(s.isDraft, true);          // unknown status degrades to draft
  assert.equal(s.gallons, null);
  assert.equal(s.region, '');
  assert.equal(s.profileType, '');
  assert.equal(s.pricingPct, null);
  assert.equal(s.savedAt, '');
});

// ── profiles.gallonsFor ─────────────────────────────────────────────────

test('gallonsFor prefers the profile figure and says so', () => {
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, { status: 'final', finalGallons: 11153 });
  assert.deepEqual(r, { gallons: 11153, source: 'profile' });
});

test('gallonsFor falls back to the hand-entered estimate', () => {
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, null);
  assert.deepEqual(r, { gallons: 5000, source: 'estimate' });
});

test('gallonsFor reports none when neither exists, without inventing a zero', () => {
  // source:'none' lets the caller exclude the lead from an average rather
  // than drag it down with a zero it never measured.
  const r = RoadysBD.profiles.gallonsFor({}, null);
  assert.deepEqual(r, { gallons: 0, source: 'none' });
});

test('a draft profile does NOT override the hand-entered estimate', () => {
  // A draft is in-progress work. Letting it displace estGallons would make
  // the leaderboard swing on a half-typed figure.
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, { status: 'draft', finalGallons: 99999 });
  assert.deepEqual(r, { gallons: 5000, source: 'estimate' });
});

test('a final profile with null gallons falls back rather than counting zero', () => {
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, { status: 'final', finalGallons: null });
  assert.deepEqual(r, { gallons: 5000, source: 'estimate' });
});

// ── profiles.pickFinalOverDraft ─────────────────────────────────────────
// forLeads() widened from .eq('status','final') to .in('status', [...]) so a
// lead whose only profile is a draft stops being invisible. A lead can hold
// one draft AND one final at once (the two partial unique indexes in
// sql/2026-10-05-bd-value-profiles.sql allow exactly that), so something has
// to decide which one wins when both come back in the same query -- and it
// must not be "whichever happened to arrive first in res.data".

test('pickFinalOverDraft: only a final row for a lead', () => {
  const out = RoadysBD.profiles.pickFinalOverDraft([
    { id: 'bdp_1', lead_id: 'CRM-1', status: 'final', final_gallons: 11153 }
  ]);
  assert.equal(out['CRM-1'].status, 'final');
  assert.equal(out['CRM-1'].finalGallons, 11153);
});

test('pickFinalOverDraft: only a draft row for a lead', () => {
  const out = RoadysBD.profiles.pickFinalOverDraft([
    { id: 'bdp_2', lead_id: 'CRM-2', status: 'draft', final_gallons: 4000 }
  ]);
  assert.equal(out['CRM-2'].status, 'draft');
  assert.equal(out['CRM-2'].finalGallons, 4000);
});

test('pickFinalOverDraft: both present, final wins even when the draft arrives FIRST', () => {
  // This is the case a naive "last one wins" / "first one wins" reduction
  // gets wrong -- query/array order must not decide the outcome.
  const out = RoadysBD.profiles.pickFinalOverDraft([
    { id: 'bdp_draft', lead_id: 'CRM-3', status: 'draft', final_gallons: 500 },
    { id: 'bdp_final', lead_id: 'CRM-3', status: 'final', final_gallons: 20000 }
  ]);
  assert.equal(out['CRM-3'].status, 'final');
  assert.equal(out['CRM-3'].id, 'bdp_final');
  assert.equal(out['CRM-3'].finalGallons, 20000);
});

test('pickFinalOverDraft: both present, final still wins when it arrives first', () => {
  const out = RoadysBD.profiles.pickFinalOverDraft([
    { id: 'bdp_final', lead_id: 'CRM-4', status: 'final', final_gallons: 20000 },
    { id: 'bdp_draft', lead_id: 'CRM-4', status: 'draft', final_gallons: 500 }
  ]);
  assert.equal(out['CRM-4'].status, 'final');
  assert.equal(out['CRM-4'].id, 'bdp_final');
});

test('pickFinalOverDraft: neither -- an empty row set yields an empty map', () => {
  assert.deepEqual(RoadysBD.profiles.pickFinalOverDraft([]), {});
  assert.deepEqual(RoadysBD.profiles.pickFinalOverDraft(null), {});
});

test('pickFinalOverDraft: rows with no lead_id are skipped rather than keyed under "undefined"', () => {
  const out = RoadysBD.profiles.pickFinalOverDraft([
    { id: 'bdp_5', lead_id: null, status: 'draft', author: 'rep@example.com' }
  ]);
  assert.deepEqual(out, {});
});

test('pickFinalOverDraft keeps rows for different leads independent', () => {
  const out = RoadysBD.profiles.pickFinalOverDraft([
    { id: 'bdp_a', lead_id: 'CRM-A', status: 'draft' },
    { id: 'bdp_b', lead_id: 'CRM-B', status: 'final' }
  ]);
  assert.equal(out['CRM-A'].status, 'draft');
  assert.equal(out['CRM-B'].status, 'final');
});
