'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const bookingService = require('../../src/services/calendarBookingService');

test('normalizeSelections drops empty and malformed entries', () => {
  const out = bookingService.normalizeSelections([
    null,
    {},
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'unknown' },
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'occurrence' /* no occurrenceId */ },
  ]);
  assert.equal(out.length, 0);
});

test('normalizeSelections dedupes date-only selections per item/date', () => {
  const out = bookingService.normalizeSelections([
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'date_only' },
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'date_only' },
    { itemId: 1, selectedDate: '2026-06-02', selectionType: 'date_only' },
  ]);
  assert.equal(out.length, 2);
});

test('normalizeSelections dedupes occurrence selections per occurrenceId', () => {
  const out = bookingService.normalizeSelections([
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'occurrence', occurrenceId: 42 },
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'occurrence', occurrenceId: 42 },
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'occurrence', occurrenceId: 43 },
  ]);
  assert.equal(out.length, 2);
});

test('pending-selection helpers round-trip through a fake session', () => {
  const session = {};
  bookingService.setPendingSelections(session, 'cfg-1', [
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'date_only' },
  ]);
  const got = bookingService.getPendingSelections(session, 'cfg-1');
  assert.equal(got.length, 1);
  assert.equal(got[0].itemId, 1);
  bookingService.clearPendingSelections(session, 'cfg-1');
  assert.equal(bookingService.getPendingSelections(session, 'cfg-1').length, 0);
});

test('pending-selection bag is scoped per calendar_config_id', () => {
  const session = {};
  bookingService.setPendingSelections(session, 'cfg-1', [
    { itemId: 1, selectedDate: '2026-06-01', selectionType: 'date_only' },
  ]);
  bookingService.setPendingSelections(session, 'cfg-2', [
    { itemId: 7, selectedDate: '2026-06-02', selectionType: 'date_only' },
  ]);
  assert.equal(bookingService.getPendingSelections(session, 'cfg-1')[0].itemId, 1);
  assert.equal(bookingService.getPendingSelections(session, 'cfg-2')[0].itemId, 7);
});
