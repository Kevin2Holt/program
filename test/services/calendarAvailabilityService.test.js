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

/* ------------------------------------------------------------------ */
/* parseAndValidateRuleForm                                            */
/* ------------------------------------------------------------------ */

test('parseAndValidateRuleForm: valid one_time / all rule', () => {
  const { patch, errors, targetItemIds } = svc.parseAndValidateRuleForm({
    rule_type: 'one_time',
    target_scope: 'all',
    blocked_date: '2026-06-15',
    reason: 'Holiday',
  });
  assert.deepEqual(errors, []);
  assert.equal(patch.rule_type, 'one_time');
  assert.equal(patch.target_scope, 'all');
  assert.equal(patch.blocked_date, '2026-06-15');
  assert.equal(patch.reason, 'Holiday');
  assert.equal(patch.recurrence_pattern, null);
  assert.deepEqual(targetItemIds, []);
  assert.equal(patch.active, true);
});

test('parseAndValidateRuleForm: one_time requires blocked_date', () => {
  const { errors } = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'all',
  });
  assert.ok(errors.some((e) => e.field === 'blocked_date'));
});

test('parseAndValidateRuleForm: weekly recurring rule requires at least one weekday', () => {
  const { errors } = svc.parseAndValidateRuleForm({
    rule_type: 'recurring',
    target_scope: 'all',
    recurrence_pattern: 'weekly',
  });
  assert.ok(errors.some((e) => e.field === 'weekdays'));
});

test('parseAndValidateRuleForm: weekly recurring rule normalizes weekdays', () => {
  const { patch, errors } = svc.parseAndValidateRuleForm({
    rule_type: 'recurring',
    target_scope: 'all',
    recurrence_pattern: 'weekly',
    weekdays: ['1', '5', '1'],
  });
  assert.deepEqual(errors, []);
  assert.equal(patch.recurrence_pattern, 'weekly');
  assert.deepEqual(patch.recurrence_detail, { weekdays: [1, 5] });
  assert.equal(patch.blocked_date, null);
});

test('parseAndValidateRuleForm: monthly_by_date requires a valid day_of_month', () => {
  const a = svc.parseAndValidateRuleForm({
    rule_type: 'recurring', target_scope: 'all',
    recurrence_pattern: 'monthly_by_date',
  });
  assert.ok(a.errors.some((e) => e.field === 'day_of_month'));

  const b = svc.parseAndValidateRuleForm({
    rule_type: 'recurring', target_scope: 'all',
    recurrence_pattern: 'monthly_by_date',
    day_of_month: '32',
  });
  assert.ok(b.errors.some((e) => e.field === 'day_of_month'));

  const c = svc.parseAndValidateRuleForm({
    rule_type: 'recurring', target_scope: 'all',
    recurrence_pattern: 'monthly_by_date',
    day_of_month: '15',
  });
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.patch.recurrence_detail, { day_of_month: 15 });
});

test('parseAndValidateRuleForm: monthly_by_weekday requires both week and weekday', () => {
  const ok = svc.parseAndValidateRuleForm({
    rule_type: 'recurring', target_scope: 'all',
    recurrence_pattern: 'monthly_by_weekday',
    week_of_month: '2', weekday_of_month: '3',
  });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.patch.recurrence_detail, { week_of_month: 2, weekday: 3 });

  const bad = svc.parseAndValidateRuleForm({
    rule_type: 'recurring', target_scope: 'all',
    recurrence_pattern: 'monthly_by_weekday',
    week_of_month: '6', weekday_of_month: '9',
  });
  const fields = bad.errors.map((e) => e.field);
  assert.ok(fields.includes('week_of_month'));
  assert.ok(fields.includes('weekday_of_month'));
});

test('parseAndValidateRuleForm: target_scope=single requires exactly one item id', () => {
  const zero = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'single', blocked_date: '2026-06-15',
  });
  assert.ok(zero.errors.some((e) => e.field === 'target_item_ids'));

  const many = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'single', blocked_date: '2026-06-15',
    target_item_ids: ['1', '2'],
  });
  assert.ok(many.errors.some((e) => e.field === 'target_item_ids'));

  const ok = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'single', blocked_date: '2026-06-15',
    target_item_ids: ['7'],
  });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.targetItemIds, [7]);
});

test('parseAndValidateRuleForm: target_scope=selected requires at least one item', () => {
  const empty = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'selected', blocked_date: '2026-06-15',
  });
  assert.ok(empty.errors.some((e) => e.field === 'target_item_ids'));

  const ok = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'selected', blocked_date: '2026-06-15',
    target_item_ids: ['3', '5'],
  });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.targetItemIds, [3, 5]);
});

test('parseAndValidateRuleForm: rejects unknown rule_type and target_scope', () => {
  const { errors } = svc.parseAndValidateRuleForm({
    rule_type: 'random', target_scope: 'nobody',
  });
  const fields = errors.map((e) => e.field);
  assert.ok(fields.includes('rule_type'));
  assert.ok(fields.includes('target_scope'));
});

test('parseAndValidateRuleForm: rejects recurrence_end_date before recurrence_start_date', () => {
  const { errors } = svc.parseAndValidateRuleForm({
    rule_type: 'recurring', target_scope: 'all',
    recurrence_pattern: 'weekly', weekdays: ['2'],
    recurrence_start_date: '2026-06-30',
    recurrence_end_date: '2026-06-01',
  });
  assert.ok(errors.some((e) => e.field === 'recurrence_end_date'));
});

test('parseAndValidateRuleForm: rejects reason longer than 200 chars', () => {
  const { errors } = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'all', blocked_date: '2026-06-15',
    reason: 'x'.repeat(201),
  });
  assert.ok(errors.some((e) => e.field === 'reason'));
});

test('parseAndValidateRuleForm: defaults active=true and honors explicit off', () => {
  const on = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'all', blocked_date: '2026-06-15',
  });
  assert.equal(on.patch.active, true);

  const off = svc.parseAndValidateRuleForm({
    rule_type: 'one_time', target_scope: 'all', blocked_date: '2026-06-15',
    active: '',
  });
  assert.equal(off.patch.active, false);
});
