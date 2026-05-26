'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const svc = require('../../src/services/calendarAvailabilityService');

test('deriveDateWindow returns fixed range when configured', () => {
  const cfg = {
    date_window_mode: 'fixed',
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-30',
  };
  const w = svc.deriveDateWindow(cfg);
  assert.deepEqual(w, { start: '2026-06-01', end: '2026-06-30' });
});

test('deriveDateWindow returns null for an incomplete fixed config', () => {
  assert.equal(svc.deriveDateWindow({ date_window_mode: 'fixed' }), null);
});

test('deriveDateWindow handles rolling days correctly', () => {
  const cfg = {
    date_window_mode: 'rolling',
    rolling_window_unit: 'days',
    rolling_window_size: 7,
    event_time_zone: 'UTC',
  };
  const now = new Date('2026-06-01T12:00:00Z');
  const w = svc.deriveDateWindow(cfg, now);
  assert.equal(w.start, '2026-06-01');
  assert.equal(w.end, '2026-06-08');
});

test('isDateInWindow boundary inclusivity', () => {
  const w = { start: '2026-06-01', end: '2026-06-30' };
  assert.equal(svc.isDateInWindow('2026-06-01', w), true);
  assert.equal(svc.isDateInWindow('2026-06-30', w), true);
  assert.equal(svc.isDateInWindow('2026-05-31', w), false);
  assert.equal(svc.isDateInWindow('2026-07-01', w), false);
});

test('publicStateFromOrganizerState collapses blocked/full into unavailable', () => {
  assert.equal(svc.publicStateFromOrganizerState(svc.ORGANIZER_STATES.AVAILABLE), 'available');
  assert.equal(svc.publicStateFromOrganizerState(svc.ORGANIZER_STATES.FULL), 'unavailable');
  assert.equal(svc.publicStateFromOrganizerState(svc.ORGANIZER_STATES.BLOCKED), 'unavailable');
  assert.equal(svc.publicStateFromOrganizerState(svc.ORGANIZER_STATES.ARCHIVED), 'unavailable');
  assert.equal(svc.publicStateFromOrganizerState(svc.ORGANIZER_STATES.OUT_OF_WINDOW), 'unavailable');
});

test('isBlockedByRules matches a one-time rule that targets the item', () => {
  const item = { id: 1, status: 'active' };
  const rules = [{
    rule_type: 'one_time',
    active: true,
    blocked_date: '2026-06-15',
    target_scope: 'single',
    _target_item_ids: [1],
  }];
  assert.equal(svc._internals.isBlockedByRules(item, '2026-06-15', rules), true);
  assert.equal(svc._internals.isBlockedByRules(item, '2026-06-14', rules), false);
});

test('isBlockedByRules respects all-items target scope', () => {
  const item = { id: 1, status: 'active' };
  const rules = [{
    rule_type: 'one_time',
    active: true,
    blocked_date: '2026-06-15',
    target_scope: 'all',
  }];
  assert.equal(svc._internals.isBlockedByRules(item, '2026-06-15', rules), true);
});

test('isBlockedByRules ignores rules that do not target the item', () => {
  const item = { id: 1, status: 'active' };
  const rules = [{
    rule_type: 'one_time',
    active: true,
    blocked_date: '2026-06-15',
    target_scope: 'selected',
    _target_item_ids: [2, 3],
  }];
  assert.equal(svc._internals.isBlockedByRules(item, '2026-06-15', rules), false);
});
