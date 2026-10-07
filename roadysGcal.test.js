'use strict';

// Pinned so the local-vs-UTC date tests below are host-independent. Without
// this, a UTC-offset-zero machine makes a UTC-slicing implementation
// indistinguishable from a correct one.
process.env.TZ = 'America/Denver';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RoadysGcal } = require('./roadysGcal.js');

const BASE = 'https://jasonvega1974.github.io/roadys-command-center';

function lead(over) {
  return Object.assign({
    id: 'CRM-001', company: 'Acme Truck Stop', contact: 'Jane Doe',
    phone: '208-555-1234', street: '123 Main St', city: 'Boise', state: 'ID',
    followUp: '2026-10-15'
  }, over || {});
}
function call(over) {
  return Object.assign({
    id: 'call_1', callType: 'Discovery call', note: 'Bring the gallon report',
    scheduledAt: '2026-10-15T19:30:00.000Z'
  }, over || {});
}

// ── identityMatches ─────────────────────────────────────────────────────

test('identity matches ignoring case and surrounding whitespace', () => {
  assert.equal(RoadysGcal.identityMatches('Jason@Roadyscorp.com', ' jason@roadyscorp.com '), true);
});

test('different accounts do not match', () => {
  assert.equal(RoadysGcal.identityMatches('jason@roadyscorp.com', 'jason@gmail.com'), false);
});

test('a missing or non-string side never matches', () => {
  // Returning true here would connect a session to whatever account the popup
  // happened to return, which is the whole failure this check exists to stop.
  assert.equal(RoadysGcal.identityMatches('', 'jason@roadyscorp.com'), false);
  assert.equal(RoadysGcal.identityMatches(null, null), false);
  assert.equal(RoadysGcal.identityMatches(undefined, 'x@y.com'), false);
  assert.equal(RoadysGcal.identityMatches(42, 42), false);
});

// ── mayWriteGoogle ──────────────────────────────────────────────────────

test('may write when the stored event belongs to this session', () => {
  const r = RoadysGcal.mayWriteGoogle(
    { googleEventId: 'evt1', googleCalendarEmail: 'jason@roadyscorp.com' },
    'jason@roadyscorp.com');
  assert.equal(r.ok, true);
});

test('refuses to touch an event in another user\'s calendar, and names the owner', () => {
  // An event id only means something inside the calendar holding it. Deleting
  // it from the wrong account is a 404 at best and a wrong deletion at worst.
  const r = RoadysGcal.mayWriteGoogle(
    { googleEventId: 'evt1', googleCalendarEmail: 'robert@roadyscorp.com' },
    'jason@roadyscorp.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'other-owner');
  assert.equal(r.owner, 'robert@roadyscorp.com');
});

test('refuses an event id with no recorded owner', () => {
  const r = RoadysGcal.mayWriteGoogle({ googleEventId: 'evt1' }, 'jason@roadyscorp.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown-owner');
});

test('reports no-event when nothing has been synced yet', () => {
  const r = RoadysGcal.mayWriteGoogle({}, 'jason@roadyscorp.com');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-event');
});

test('refuses when there is no session email at all', () => {
  const r = RoadysGcal.mayWriteGoogle(
    { googleEventId: 'evt1', googleCalendarEmail: 'jason@roadyscorp.com' }, '');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-session');
});

test('survives a null record rather than throwing', () => {
  assert.equal(RoadysGcal.mayWriteGoogle(null, 'jason@roadyscorp.com').ok, false);
});

// ── eventBodyForCall ────────────────────────────────────────────────────

test('a meeting event carries the company, type, contact, note and a lead link', () => {
  const b = RoadysGcal.eventBodyForCall(lead(), call(), BASE);
  assert.equal(b.summary, 'Acme Truck Stop — Discovery call');
  assert.match(b.description, /Jane Doe/);
  assert.match(b.description, /208-555-1234/);
  assert.match(b.description, /Bring the gallon report/);
  assert.match(b.description, /CRM\.html\?lead=CRM-001/);
  assert.equal(b.location, '123 Main St, Boise, ID');
});

test('the meeting runs 30 minutes from the scheduled time', () => {
  const b = RoadysGcal.eventBodyForCall(lead(), call(), BASE);
  assert.equal(b.start.dateTime, '2026-10-15T19:30:00.000Z');
  assert.equal(b.end.dateTime, '2026-10-15T20:00:00.000Z');
});

test('missing contact, phone, note and address omit their lines instead of printing undefined', () => {
  // These go into an event a prospect may see on a shared invite; "Contact:
  // undefined" is worse than no contact line.
  const b = RoadysGcal.eventBodyForCall(
    lead({ contact: '', phone: '', street: '', city: '', state: '' }),
    call({ note: '' }), BASE);
  assert.doesNotMatch(b.description, /undefined|null/);
  assert.doesNotMatch(b.description, /Contact:/);
  assert.doesNotMatch(b.description, /Phone:/);
  assert.equal(b.location, undefined);
});

test('a lead id with characters needing escaping is encoded into the link', () => {
  const b = RoadysGcal.eventBodyForCall(lead({ id: 'CRM 7&8' }), call(), BASE);
  assert.match(b.description, /lead=CRM%207%268/);
});

test('an unparseable scheduled time yields no event body rather than an Invalid Date', () => {
  assert.equal(RoadysGcal.eventBodyForCall(lead(), call({ scheduledAt: 'nope' }), BASE), null);
});

// ── eventBodyForFollowUp ────────────────────────────────────────────────

test('a follow-up is an all-day event whose end is the NEXT day', () => {
  // Google treats an all-day end date as exclusive. Using the same date for
  // both makes the event vanish from the calendar entirely.
  const b = RoadysGcal.eventBodyForFollowUp(lead({ followUp: '2026-10-15' }), BASE);
  assert.equal(b.summary, 'Follow up: Acme Truck Stop');
  assert.deepEqual(b.start, { date: '2026-10-15' });
  assert.deepEqual(b.end, { date: '2026-10-16' });
});

test('the exclusive end rolls over a month and a year boundary', () => {
  assert.deepEqual(RoadysGcal.eventBodyForFollowUp(lead({ followUp: '2026-10-31' }), BASE).end,
    { date: '2026-11-01' });
  assert.deepEqual(RoadysGcal.eventBodyForFollowUp(lead({ followUp: '2026-12-31' }), BASE).end,
    { date: '2027-01-01' });
});

test('a lead with no follow-up date yields no event body', () => {
  assert.equal(RoadysGcal.eventBodyForFollowUp(lead({ followUp: '' }), BASE), null);
});

// ── overlayEventsFrom ───────────────────────────────────────────────────

test('maps Google items to calendar entries', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g1', summary: 'Dentist', start: { dateTime: '2026-10-15T19:30:00.000Z' } }
  ]}, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'g1');
  assert.equal(out[0].title, 'Dentist');
  assert.equal(out[0].isAllDay, false);
});

test('an all-day Google date is used verbatim, with no timezone arithmetic', () => {
  // Constructing a Date from "2026-10-15" parses it as UTC midnight, which in
  // any negative-offset timezone renders as the 14th. The date string must
  // pass straight through.
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g2', summary: 'Conference', start: { date: '2026-10-15' } }
  ]}, []);
  assert.equal(out[0].dateKey, '2026-10-15');
  assert.equal(out[0].isAllDay, true);
  assert.equal(out[0].timeText, '');
});

test('a timed event buckets on its LOCAL date, matching the calendar grid', () => {
  // 02:30Z is 20:30 the PREVIOUS day in America/Denver, which the file pins
  // at the top. renderCRMCalendar builds its grid from local date parts, so
  // a UTC slice would drop this event onto the wrong day. Hard-coding the
  // expectation is what makes a UTC-slicing implementation fail here on any
  // host, rather than only on one whose offset happens to be non-zero.
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g3', summary: 'Call', start: { dateTime: '2026-10-15T02:30:00.000Z' } }
  ]}, []);
  assert.equal(out[0].dateKey, '2026-10-14');
  assert.equal(out[0].timeText, '8:30 PM');
});

test('events the CRM itself created are suppressed so they do not appear twice', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'mine', summary: 'CRM meeting', start: { dateTime: '2026-10-15T19:30:00.000Z' } },
    { id: 'theirs', summary: 'Dentist',    start: { dateTime: '2026-10-16T19:30:00.000Z' } }
  ]}, ['mine']);
  assert.deepEqual(out.map(e => e.id), ['theirs']);
});

test('cancelled and malformed items are skipped rather than thrown on', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'c', status: 'cancelled', start: { date: '2026-10-15' } },
    { id: 'n', summary: 'No start' },
    null,
    { id: 'ok', summary: 'Good', start: { date: '2026-10-15' } }
  ]}, []);
  assert.deepEqual(out.map(e => e.id), ['ok']);
});

test('an event with no summary gets a readable placeholder, not an empty chip', () => {
  const out = RoadysGcal.overlayEventsFrom({ items: [
    { id: 'g4', start: { date: '2026-10-15' } }
  ]}, []);
  assert.equal(out[0].title, '(no title)');
});

test('a missing or junk response yields an empty list', () => {
  assert.deepEqual(RoadysGcal.overlayEventsFrom(null, []), []);
  assert.deepEqual(RoadysGcal.overlayEventsFrom({}, []), []);
  assert.deepEqual(RoadysGcal.overlayEventsFrom({ items: 'nope' }, []), []);
});
