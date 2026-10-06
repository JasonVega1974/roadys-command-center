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
  var _authListenerBound = false;

  // Every localStorage key that mirrors a Supabase table rendered by a page
  // behind the sign-in gate. Sign-out must clear all of them: the gate exists
  // so the next person on a shared device cannot read the previous user's
  // work, and a cache left behind is a hole in exactly that lock.
  //
  // One list here rather than one per page. The three pages cache different
  // tables, so per-page lists would have to differ — and three lists that
  // must differ are three lists that will drift. removeItem on a key a page
  // never used is a no-op, so the union is safe everywhere.
  //
  // Deliberately NOT included:
  //   roadys_theme / roadysBDPGTheme   display preference, not data
  //   roadysBDPGRegionOverride         admin config, not user or lead data
  //   roadys_crm_rules_v2              scheduler config, not lead data
  //   roadysBDPGProfiles               the calculator's saved prospects are
  //                                    still LOCAL-ONLY and authoritative --
  //                                    clearing them would destroy a rep's
  //                                    only copy. It joins this list once
  //                                    Supabase owns profiles.
  var CACHE_KEYS = [
    'roadys_crm_v2',        // crm_leads
    'roadys_crm_calls',     // crm_scheduled_calls
    'roadys_crm_notes_v1',  // crm_lead_notes
    'roadys_crm_tmpl_v2',   // crm_email_templates
    'truckStopPortal_v4',   // impl_sites  (IMPL_STORAGE_KEY)
    'roadys_sd_tickets',    // sd_tickets
    'roadysBDPGDraft'       // bd_value_profiles, draft
  ];

  function clearCaches() {
    for (var i = 0; i < CACHE_KEYS.length; i++) {
      try { localStorage.removeItem(CACHE_KEYS[i]); } catch (e) {}
    }
  }

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
      if (!_authListenerBound) {
        _authListenerBound = true;
        // Keep _session fresh across token refreshes and sign-out in another
        // tab. Bound once: _client is memoized, so re-entering init() would
        // otherwise stack a listener per call.
        c.auth.onAuthStateChange(function (evt, s) {
          _session = s || null;
          // A session can end without anyone pressing Sign out -- another tab
          // signed out, or the token expired. The caches must go then too, for
          // the same reason signOut() clears them.
          if (evt === 'SIGNED_OUT') clearCaches();
        });
      }
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
    clearCaches();
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

  // A lead can legitimately hold one draft AND one final row at once -- see
  // the one_final_per_lead and one_draft_per_lead partial unique indexes in
  // sql/2026-10-05-bd-value-profiles.sql. When both are present the final
  // must win: it is the completed work, and showing a draft badge over a
  // finished profile would understate it. Pure and independent of row
  // arrival order, so it is testable without a network call and without
  // depending on query ordering to get the right answer.
  function pickFinalOverDraft(rows) {
    var best = {};
    (rows || []).forEach(function (r) {
      var lid = r && r.lead_id;
      if (!lid) return;
      var prev = best[lid];
      if (!prev || (prev.status !== 'final' && r.status === 'final')) {
        best[lid] = r;
      }
    });
    var out = {};
    Object.keys(best).forEach(function (lid) { out[lid] = fromRow(best[lid]); });
    return out;
  }

  // One round trip for a whole board rather than one per card — the Kanban
  // can hold hundreds of leads and a request each would be unusable. Returns
  // both drafts and finals (precedence resolved by pickFinalOverDraft) so a
  // lead whose only profile is a draft still shows up as one.
  function forLeads(ids) {
    var t = q();
    var out = {};
    if (!t || !ids || !ids.length) return Promise.resolve(out);
    return t.select('*').in('lead_id', ids).in('status', STATUSES)
      .is('deleted_at', null)
      .then(function (res) {
        if (res.error || !res.data) return out;
        return pickFinalOverDraft(res.data);
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

  function mintId() {
    return 'bdp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  // A new profile whose (lead_id, status) slot is already held by another
  // owner's row. That slot is unique BY DESIGN -- one draft per lead, one
  // final per lead, shared between owners, last-write-wins -- so minting a
  // second id can never land, and retrying only mints another one. Adopt the
  // existing row's id and write into it, which is what last-write-wins means.
  //
  // Keyed on exactly the columns the partial unique indexes are keyed on, so
  // this can only ever find the row that caused the violation -- never some
  // other prospect's profile.
  function adoptExistingId(row, st) {
    var t = q();
    if (!t) return Promise.resolve(null);
    var sel = t.select('id').eq('status', st).is('deleted_at', null);
    sel = row.lead_id
      ? sel.eq('lead_id', row.lead_id)
      : sel.is('lead_id', null).eq('author', row.author);
    return sel.limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        return res.data[0].id;
      })
      .catch(function () { return null; });
  }

  function save(p, st) {
    var t = q();
    if (!t) return Promise.resolve({ ok: false, error: 'Supabase unavailable', profile: null });
    var row = toRow(p);
    row.status = st;
    // Writing a draft IS undeleting it. Without this, an upsert into a row
    // another tab soft-deleted lands the new content in a row that every
    // active-draft query filters out (.is('deleted_at', null)) -- the save
    // reports success and the work is invisible from then on.
    row.deleted_at = null;
    if (!row.author) row.author = email();
    if (!row.id) row.id = mintId();
    return t.upsert(row, { onConflict: 'id' }).select()
      .then(function (res) {
        // 23505 = unique_violation. The only unique constraints on this table
        // besides the primary key are the three partial indexes on
        // (lead_id) / (author), so this means the SLOT is taken -- not the id.
        if (res.error && res.error.code === '23505') {
          return adoptExistingId(row, st).then(function (existingId) {
            if (!existingId) {
              return { ok: false, error: errText(res.error), profile: null };
            }
            row.id = existingId;
            return t.upsert(row, { onConflict: 'id' }).select()
              .then(function (res2) {
                if (res2.error) return { ok: false, error: errText(res2.error), profile: null };
                var saved2 = (res2.data && res2.data.length) ? fromRow(res2.data[0]) : fromRow(row);
                return { ok: true, error: '', profile: saved2 };
              });
          });
        }
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

  // Parses the query string the CRM's "Value Prop" button builds. Always
  // returns the same five keys. A field the CRM did not send is null, which
  // the prefill treats differently from a field it sent as blank: null means
  // "no value supplied", '' would be indistinguishable from "this lead has no
  // city", and only the former should be filled from elsewhere.
  //
  // Lives here rather than inline in the calculator because parsing is the
  // step that can silently mangle a company name or a state code, and this is
  // where node --test can reach it.
  function leadParamsFrom(search) {
    var out = { leadId: null, name: null, city: null, state: null, street: null };
    if (typeof search !== 'string') return out;
    var qs;
    try {
      qs = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
    } catch (e) { return out; }

    function take(k) {
      var v = qs.get(k);
      if (typeof v !== 'string') return null;
      v = v.trim();
      return v ? v : null;
    }

    out.leadId = take('lead');
    out.name   = take('name');
    out.city   = take('city');
    out.street = take('street');

    var st = take('state');
    // Upper-cased and clamped to two characters, exactly as onStateInput()
    // normalises a typed code -- so arriving by link and arriving by keystroke
    // put the same value in the same field.
    out.state = st ? st.toUpperCase().slice(0, 2) : null;
    return out;
  }

  // ── Display helpers ──────────────────────────────────────────────────
  //
  // Everything the CRM renders ABOUT a profile is decided here rather than
  // inline in CRM.html, so it can be unit-tested. Phase 1 shipped four
  // blocking defects in untested rendering glue; this is the seam that
  // stops that repeating.

  function fmtInt(n) {
    return Math.round(n).toLocaleString();
  }

  // Always returns an object, never null. The CRM renders this directly into
  // a Kanban card, and most leads have no profile — a null here would throw
  // on the common case.
  function summary(p) {
    var out = {
      has: false, isDraft: false, gallons: null, gallonsText: '—',
      recommendation: '', pricingPct: null, pricingText: '',
      truckerPath: '', amenityLevel: '', region: '',
      profileType: '', savedAt: ''
    };
    if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
    out.has = true;
    // Anything that is not the literal 'final' is treated as a draft: an
    // unknown status must never be rendered as a finished profile.
    out.isDraft = str(p.status) !== 'final';
    out.gallons = num(p.finalGallons);
    if (out.gallons !== null) out.gallonsText = fmtInt(out.gallons);
    out.recommendation = str(p.recommendation);
    out.region = str(p.region);

    var prof = str(p.profile), road = str(p.roadway);
    out.profileType = (prof && road) ? (prof + ' · ' + road) : (prof || '');

    var i = obj(p.inputs);
    // num(), not truthiness: 0 is the default pricing posture and the most
    // common value on the board.
    out.pricingPct = num(i.pricingLevel);
    if (out.pricingPct !== null) {
      // '>' not '>=': toFixed already carries a minus sign for negatives, and
      // a '+' on zero would assert an increase that is not there — 0 is the
      // default pricing posture on most profiles.
      out.pricingText = (out.pricingPct > 0 ? '+' : '') + (out.pricingPct * 100).toFixed(1) + '%';
    }
    // The rating is a number in state but can round-trip through jsonb as a
    // string; both render the same and neither is arithmetic here.
    var tp = i.truckerPathRating;
    out.truckerPath = (typeof tp === 'number' && isFinite(tp)) ? String(tp) : str(tp);
    out.amenityLevel = str(i.amenityLevel);

    // Sliced from the ISO string rather than Date-converted, matching the
    // calculator's own tracker: no "Invalid Date" for a junk value, and no
    // UTC-stored/local-rendered day shift.
    var u = str(p.updatedAt);
    out.savedAt = u.length >= 10 ? u.slice(0, 10) : '';
    return out;
  }

  // Which gallons figure represents this lead, and where it came from.
  //
  // A DRAFT never displaces the hand-entered estimate: a draft is in-progress
  // work, and letting a half-typed figure move the leaderboard would make the
  // pipeline total swing while somebody is still typing.
  //
  // source:'none' rather than a silent 0, so a caller can exclude the lead
  // from an average instead of dragging it down with a figure nobody measured.
  function gallonsFor(lead, p) {
    var s = summary(p);
    if (s.has && !s.isDraft && s.gallons !== null) {
      return { gallons: s.gallons, source: 'profile' };
    }
    var est = num(lead && lead.estGallons);
    if (est !== null && est > 0) return { gallons: est, source: 'estimate' };
    return { gallons: 0, source: 'none' };
  }

  var RoadysBD = {
    leadParamsFrom: leadParamsFrom,
    map:  { toRow: toRow, fromRow: fromRow },
    auth: { client: client, init: init, session: session, email: email,
            signIn: signIn, signOut: signOut,
            clearCaches: clearCaches, CACHE_KEYS: CACHE_KEYS },
    profiles: { forLead: forLead, forLeads: forLeads, draftFor: draftFor,
                saveDraft: saveDraft, saveFinal: saveFinal,
                softDelete: softDelete,
                summary: summary, gallonsFor: gallonsFor,
                pickFinalOverDraft: pickFinalOverDraft },
    testing: { mintId: mintId }
  };
  return { RoadysBD: RoadysBD };
}));
