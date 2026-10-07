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
