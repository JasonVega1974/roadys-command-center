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

  // ── Supabase client ──────────────────────────────────────────────────
  // Same project and anon key every other page in this repo uses. The key is
  // public (this repo is published to GitHub Pages) — it identifies the
  // project, it does not authorize anything. RLS on bd_value_profiles
  // requires a real session, so the key alone opens nothing.
  var SB_URL  = 'https://yyhnnalsqzyghjqtfisy.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG5uYWxzcXp5Z2hqcXRmaXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDE4NzksImV4cCI6MjA4OTQxNzg3OX0.misOc3tEQD0GBOsjNkv6Im8wUmlfXhiX97DflpgaqAc';

  var _client = null;
  var _session = null;

  function client() {
    if (!_client && typeof window !== 'undefined' && window.supabase) {
      _client = window.supabase.createClient(SB_URL, SB_ANON);
    }
    return _client;
  }

  function errText(e) {
    if (!e) return '';
    return e.message || e.error_description || 'Unknown error';
  }

  function init() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (res) {
      _session = (res && res.data && res.data.session) || null;
      // Keep _session fresh across token refreshes and sign-out in another
      // tab, so email() and the RLS-bearing client never disagree.
      c.auth.onAuthStateChange(function (_evt, s) { _session = s || null; });
      return _session;
    }).catch(function () { return null; });
  }

  function session() { return _session; }
  function email() {
    return (_session && _session.user && _session.user.email) || '';
  }

  function signIn(e, pw) {
    var c = client();
    if (!c) return Promise.resolve({ ok: false, error: 'Supabase unavailable' });
    return c.auth.signInWithPassword({ email: e, password: pw })
      .then(function (res) {
        if (res.error) return { ok: false, error: errText(res.error) };
        _session = res.data.session;
        return { ok: true, error: '' };
      })
      .catch(function (err) { return { ok: false, error: errText(err) }; });
  }

  function signOut() {
    var c = client();
    _session = null;
    if (!c) return Promise.resolve();
    return c.auth.signOut().catch(function () {});
  }

  // ── Profiles ─────────────────────────────────────────────────────────
  var TABLE = 'bd_value_profiles';

  function q() {
    var c = client();
    return c ? c.from(TABLE) : null;
  }

  function forLead(id) {
    var t = q();
    if (!t || !id) return Promise.resolve(null);
    return t.select('*').eq('lead_id', id).eq('status', 'final')
      .is('deleted_at', null).limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        return fromRow(res.data[0]);
      })
      .catch(function () { return null; });
  }

  // One round trip for a whole board rather than one per card — the Kanban
  // can hold hundreds of leads and a request each would be unusable.
  function forLeads(ids) {
    var t = q();
    var out = {};
    if (!t || !ids || !ids.length) return Promise.resolve(out);
    return t.select('*').in('lead_id', ids).eq('status', 'final')
      .is('deleted_at', null)
      .then(function (res) {
        if (res.error || !res.data) return out;
        res.data.forEach(function (r) { out[r.lead_id] = fromRow(r); });
        return out;
      })
      .catch(function () { return out; });
  }

  // leadId null means "my own unlinked draft", which is keyed by author —
  // see the partial unique index in sql/2026-10-05-bd-value-profiles.sql.
  function draftFor(id) {
    var t = q();
    if (!t) return Promise.resolve(null);
    var sel = t.select('*').eq('status', 'draft').is('deleted_at', null);
    sel = id ? sel.eq('lead_id', id) : sel.is('lead_id', null).eq('author', email());
    return sel.limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        return fromRow(res.data[0]);
      })
      .catch(function () { return null; });
  }

  function save(p, st) {
    var t = q();
    if (!t) return Promise.resolve({ ok: false, error: 'Supabase unavailable', profile: null });
    var row = toRow(p);
    row.status = st;
    if (!row.author) row.author = email();
    if (!row.id) row.id = 'bdp_' + Date.now();
    return t.upsert(row, { onConflict: 'id' }).select()
      .then(function (res) {
        if (res.error) return { ok: false, error: errText(res.error), profile: null };
        var saved = (res.data && res.data.length) ? fromRow(res.data[0]) : fromRow(row);
        return { ok: true, error: '', profile: saved };
      })
      .catch(function (err) {
        return { ok: false, error: errText(err), profile: null };
      });
  }

  function saveDraft(p) { return save(p, 'draft'); }
  function saveFinal(p) { return save(p, 'final'); }

  function softDelete(id) {
    var t = q();
    if (!t || !id) return Promise.resolve({ ok: false, error: 'Supabase unavailable' });
    return t.update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(function (res) {
        return res.error ? { ok: false, error: errText(res.error) } : { ok: true, error: '' };
      })
      .catch(function (err) { return { ok: false, error: errText(err) }; });
  }

  var RoadysBD = {
    map:  { toRow: toRow, fromRow: fromRow },
    auth: { client: client, init: init, session: session, email: email,
            signIn: signIn, signOut: signOut },
    profiles: { forLead: forLead, forLeads: forLeads, draftFor: draftFor,
                saveDraft: saveDraft, saveFinal: saveFinal,
                softDelete: softDelete }
  };
  return { RoadysBD: RoadysBD };
}));
