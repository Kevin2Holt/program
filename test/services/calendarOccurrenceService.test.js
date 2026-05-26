'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const svc = require('../../src/services/calendarOccurrenceService');

test('intervalsOverlap detects strict overlap', () => {
  assert.equal(svc.intervalsOverlap(60, 120, 90, 150), true);
});

test('intervalsOverlap treats touching boundaries as non-overlapping', () => {
  assert.equal(svc.intervalsOverlap(60, 120, 120, 180), false);
});

test('intervalsOverlap returns false for fully disjoint windows', () => {
  assert.equal(svc.intervalsOverlap(60, 90, 120, 180), false);
});

test('occurrenceMinuteWindow uses end_time when present', () => {
  const w = svc.occurrenceMinuteWindow({ start_time: '09:00', end_time: '10:30' });
  assert.deepEqual(w, { startMin: 540, endMin: 630 });
});

test('occurrenceMinuteWindow falls back to duration_minutes', () => {
  const w = svc.occurrenceMinuteWindow({ start_time: '09:00:00', duration_minutes: 45 });
  assert.deepEqual(w, { startMin: 540, endMin: 585 });
});

test('detectSameDayOverlap finds overlapping pair within one date', () => {
  const occs = [
    { id: 1, service_date: '2026-06-01', start_time: '09:00', end_time: '10:00' },
    { id: 2, service_date: '2026-06-01', start_time: '09:30', end_time: '10:30' },
  ];
  const result = svc.detectSameDayOverlap(occs);
  assert.equal(result.conflict, true);
  assert.ok(result.pair);
});

test('detectSameDayOverlap ignores conflicts across different dates', () => {
  const occs = [
    { id: 1, service_date: '2026-06-01', start_time: '09:00', end_time: '10:00' },
    { id: 2, service_date: '2026-06-02', start_time: '09:30', end_time: '10:30' },
  ];
  const result = svc.detectSameDayOverlap(occs);
  assert.equal(result.conflict, false);
});

test('detectSameDayOverlap handles empty input', () => {
  assert.deepEqual(svc.detectSameDayOverlap([]), { conflict: false, pair: null });
});
