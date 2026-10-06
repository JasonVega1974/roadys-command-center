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
