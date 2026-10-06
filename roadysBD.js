/* roadysBD.js — shared Supabase layer for the Business Development tools.
 *
 * Loaded by CRM.html, bus-dev-potential-gallons/index.html and
 * implementation.html. UMD with no DOM access, so the mapping below is
 * unit-testable under `node --test` exactly like busDevGallonsCalculator.js
 * and bdpgStats.js.
 *
 * Why the mapping lives in one place: CRM.html already writes the same
 * 20-field crm_leads mapping twice, in opposite directions, 80 lines apart
 * (crmLoadFromSupabase / crmSaveLeadToSupabase). One drifted field there is a
 * silent data loss. This module is the one definition for profiles.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadysBD = factory().RoadysBD;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var STATUSES = ['draft', 'final'];

  // The guard set, matching the discipline the BDPG tool already uses:
  // str() for text, num() for stored numbers, obj() for jsonb. A hand-edited
  // or half-written row must degrade to a safe default rather than reach the
  // DOM as "undefined" or "[object Object]".
  function str(v) { return typeof v === 'string' ? v : ''; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }
  function status(v) {
    return STATUSES.indexOf(v) !== -1 ? v : 'draft';
  }
  // lead_id is nullable by design (an unlinked draft), so '' must become null
  // rather than an empty string the FK would reject.
  function leadId(v) { return (typeof v === 'string' && v) ? v : null; }

  function toRow(p) {
    p = p || {};
    return {
      id:                str(p.id),
      lead_id:           leadId(p.leadId),
      status:            status(p.status),
      prospect_name:     str(p.prospectName),
      city:              str(p.city),
      state_code:        str(p.stateCode),
      location_type:     str(p.locationType),
      region:            str(p.region),
      profile:           str(p.profile),
      roadway:           str(p.roadway),
      inputs:            obj(p.inputs),
      results:           obj(p.results),
      official_subtotal: num(p.officialSubtotal),
      final_gallons:     num(p.finalGallons),
      recommendation:    str(p.recommendation),
      region_pct_stamp:  str(p.regionPctStamp),
      baseline_stamp:    str(p.baselineStamp),
      author:            str(p.author)
    };
  }

  function fromRow(r) {
    r = r || {};
    return {
      id:               str(r.id),
      leadId:           leadId(r.lead_id),
      status:           status(r.status),
      prospectName:     str(r.prospect_name),
      city:             str(r.city),
      stateCode:        str(r.state_code),
      locationType:     str(r.location_type),
      region:           str(r.region),
      profile:          str(r.profile),
      roadway:          str(r.roadway),
      inputs:           obj(r.inputs),
      results:          obj(r.results),
      officialSubtotal: num(r.official_subtotal),
      finalGallons:     num(r.final_gallons),
      recommendation:   str(r.recommendation),
      regionPctStamp:   str(r.region_pct_stamp),
      baselineStamp:    str(r.baseline_stamp),
      author:           str(r.author),
      // Read-only passthrough, deliberately absent from toRow(): the database
      // trigger owns updated_at, and a client clock must never overwrite it.
      // Readable because a shared draft shows "last edited by X at Y" in both
      // the calculator and the CRM.
      updatedAt:        str(r.updated_at)
    };
  }

  var RoadysBD = { map: { toRow: toRow, fromRow: fromRow } };
  return { RoadysBD: RoadysBD };
}));
