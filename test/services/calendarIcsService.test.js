'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ics = require('../../src/services/calendarIcsService');

function makeFixture(overrides = {}) {
  return {
    event: { id: 1, code: 'demo', name: 'Demo Event' },
    config: {
      event_time_zone: 'America/New_York',
      calendar_export_mode: 'combined',
      add_to_calendar_enabled: true,
    },
    booking: { id: 9, confirmation_ref: 'ref-abc-123' },
    selections: [
      { id: 100, item_name_snapshot: 'Lunch', selected_date: '2026-06-01' },
      { id: 101, item_name_snapshot: 'Dinner', selected_date: '2026-06-02' },
    ],
    ...overrides,
  };
}

test('buildIcs wraps output in VCALENDAR with PRODID and METHOD', () => {
  const text = ics.buildIcs(makeFixture());
  assert.match(text, /^BEGIN:VCALENDAR/);
  assert.match(text, /END:VCALENDAR\r\n$/);
  assert.match(text, /PRODID:.+/);
  assert.match(text, /METHOD:PUBLISH/);
  // CRLF line endings (RFC 5545).
  assert.ok(text.includes('\r\n'));
});

test('buildIcs combined mode emits a single VEVENT spanning the date range', () => {
  const text = ics.buildIcs(makeFixture());
  const veventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(veventCount, 1);
  // All-day event for date-only selections.
  assert.match(text, /DTSTART;VALUE=DATE:20260601/);
  // End date is exclusive (one day after the last selection).
  assert.match(text, /DTEND;VALUE=DATE:20260603/);
});

test('buildIcs separate mode emits one VEVENT per selection', () => {
  const text = ics.buildIcs(makeFixture({
    config: {
      event_time_zone: 'UTC',
      calendar_export_mode: 'separate',
      add_to_calendar_enabled: true,
    },
  }));
  const veventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(veventCount, 2);
  assert.match(text, /SUMMARY:Demo Event \\\u2014 Lunch|SUMMARY:Demo Event . Lunch/);
});

test('buildIcs timed selection emits DTSTART/DTEND with TZID and local datetime', () => {
  const text = ics.buildIcs(makeFixture({
    selections: [{
      id: 200,
      item_name_snapshot: 'Tour',
      selected_date: '2026-06-15',
      occurrence_label_snapshot: 'Morning',
      occurrence_start_snapshot: '09:30:00',
      occurrence_end_snapshot: '11:00:00',
    }],
    config: {
      event_time_zone: 'America/New_York',
      calendar_export_mode: 'separate',
    },
  }));
  assert.match(text, /DTSTART;TZID=America\/New_York:20260615T093000/);
  assert.match(text, /DTEND;TZID=America\/New_York:20260615T110000/);
});

test('buildIcs escapes commas, semicolons, and newlines in DESCRIPTION', () => {
  const { escapeText } = ics._internals;
  assert.equal(escapeText('a, b; c'), 'a\\, b\\; c');
  assert.equal(escapeText('line1\nline2'), 'line1\\nline2');
  assert.equal(escapeText('back\\slash'), 'back\\\\slash');
});

test('buildIcs throws on missing required input', () => {
  assert.throws(() => ics.buildIcs(null));
  assert.throws(() => ics.buildIcs({ event: {}, config: {}, booking: {} }));
});

test('addOneDay handles month and year boundaries (UTC)', () => {
  const { addOneDay } = ics._internals;
  assert.equal(addOneDay('2026-01-31'), '2026-02-01');
  assert.equal(addOneDay('2026-12-31'), '2027-01-01');
  assert.equal(addOneDay('2024-02-28'), '2024-02-29'); // leap year
});
