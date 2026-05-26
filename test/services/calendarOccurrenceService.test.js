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

/* ------------------------------------------------------------------ */
/* parseAndValidateForm                                                */
/* ------------------------------------------------------------------ */

test('parseAndValidateForm: valid create payload with end_time returns clean patch', () => {
  const { patch, errors } = svc.parseAndValidateForm({
    item_id: '7',
    service_date: '2026-06-15',
    start_time: '09:00',
    end_time: '10:30',
    capacity_override: '4',
    label: 'Morning slot',
  });
  assert.deepEqual(errors, []);
  assert.equal(patch.item_id, 7);
  assert.equal(patch.service_date, '2026-06-15');
  assert.equal(patch.start_time, '09:00');
  assert.equal(patch.end_time, '10:30');
  assert.equal(patch.duration_minutes, null);
  assert.equal(patch.capacity_override, 4);
  assert.equal(patch.label, 'Morning slot');
});

test('parseAndValidateForm: valid create payload with duration_minutes returns clean patch', () => {
  const { patch, errors } = svc.parseAndValidateForm({
    item_id: '7',
    service_date: '2026-06-15',
    start_time: '09:00',
    duration_minutes: '45',
  });
  assert.deepEqual(errors, []);
  assert.equal(patch.duration_minutes, 45);
  assert.equal(patch.end_time, null);
  assert.equal(patch.capacity_override, null);
  assert.equal(patch.label, null);
});

test('parseAndValidateForm: edit mode ignores item_id', () => {
  const { patch, errors } = svc.parseAndValidateForm(
    {
      service_date: '2026-06-15',
      start_time: '09:00',
      end_time: '10:00',
    },
    { isCreate: false },
  );
  assert.deepEqual(errors, []);
  assert.ok(!Object.prototype.hasOwnProperty.call(patch, 'item_id'));
});

test('parseAndValidateForm: requires item_id on create', () => {
  const { errors } = svc.parseAndValidateForm({
    service_date: '2026-06-15',
    start_time: '09:00',
    end_time: '10:00',
  });
  assert.ok(errors.some((e) => e.field === 'item_id'));
});

test('parseAndValidateForm: service_date must be a valid ISO date', () => {
  const a = svc.parseAndValidateForm({
    item_id: '1', service_date: '', start_time: '09:00', end_time: '10:00',
  });
  assert.ok(a.errors.some((e) => e.field === 'service_date'));

  const b = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-13-40', start_time: '09:00', end_time: '10:00',
  });
  assert.ok(b.errors.some((e) => e.field === 'service_date'));
});

test('parseAndValidateForm: rejects when both end_time and duration_minutes provided', () => {
  const { errors } = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15',
    start_time: '09:00', end_time: '10:00', duration_minutes: '30',
  });
  assert.ok(errors.some((e) => e.field === 'end_time' && /either/i.test(e.message)));
});

test('parseAndValidateForm: rejects when neither end_time nor duration_minutes provided', () => {
  const { errors } = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15', start_time: '09:00',
  });
  assert.ok(errors.some((e) => e.field === 'end_time'));
});

test('parseAndValidateForm: rejects end_time <= start_time', () => {
  const { errors } = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15', start_time: '10:00', end_time: '09:30',
  });
  assert.ok(errors.some((e) => e.field === 'end_time' && /after start/i.test(e.message)));
});

test('parseAndValidateForm: rejects intervals longer than 24 hours', () => {
  const { errors } = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15', start_time: '00:00', duration_minutes: String(svc.MAX_DURATION + 1),
  });
  assert.ok(errors.some((e) => e.field === 'duration_minutes'));
});

test('parseAndValidateForm: capacity_override must be a positive integer when provided', () => {
  const a = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15', start_time: '09:00', end_time: '10:00',
    capacity_override: '0',
  });
  assert.ok(a.errors.some((e) => e.field === 'capacity_override'));

  const b = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15', start_time: '09:00', end_time: '10:00',
    capacity_override: '3.5',
  });
  assert.ok(b.errors.some((e) => e.field === 'capacity_override'));
});

test('parseAndValidateForm: rejects label longer than 200 chars', () => {
  const { errors } = svc.parseAndValidateForm({
    item_id: '1', service_date: '2026-06-15', start_time: '09:00', end_time: '10:00',
    label: 'x'.repeat(201),
  });
  assert.ok(errors.some((e) => e.field === 'label'));
});
