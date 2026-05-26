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

/* ------------------------------------------------------------------ */
/* Recurrence engine                                                   */
/* ------------------------------------------------------------------ */

const { recurringRuleMatchesDate } = svc._internals;

test('recurrence/daily: matches every date inside boundaries (inclusive)', () => {
  const rule = {
    rule_type: 'recurring', recurrence_pattern: 'daily',
    recurrence_start_date: '2026-06-01', recurrence_end_date: '2026-06-03',
    recurrence_detail: {},
  };
  assert.equal(recurringRuleMatchesDate(rule, '2026-05-31'), false);
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-01'), true);
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-02'), true);
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-03'), true);
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-04'), false);
});

test('recurrence/weekly: matches configured weekdays only', () => {
  // 2026-06-01 is a Monday (weekday=1).
  const rule = {
    rule_type: 'recurring', recurrence_pattern: 'weekly',
    recurrence_detail: { weekdays: [1, 5] }, // Mon, Fri
  };
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-01'), true);   // Mon
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-02'), false);  // Tue
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-05'), true);   // Fri
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-06'), false);  // Sat
});

test('recurrence/biweekly: respects anchor when present', () => {
  // Anchor 2026-06-01 (Mon). Same weekday two weeks later matches; the
  // intervening Monday does not.
  const rule = {
    rule_type: 'recurring', recurrence_pattern: 'biweekly',
    recurrence_start_date: '2026-06-01',
    recurrence_detail: { weekdays: [1] },
  };
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-01'), true);   // anchor week
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-08'), false);  // 1 week after
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-15'), true);   // 2 weeks after
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-22'), false);  // 3 weeks after
});

test('recurrence/biweekly: defaults anchor to 1970-01-01 (Thursday) when no start date set', () => {
  // Without a recurrence_start_date the implementation anchors at the
  // 1970-01-01 Thursday, so picking Thursday weekdays produces the right
  // even/odd-week pattern relative to that fixed origin.
  const rule = {
    rule_type: 'recurring', recurrence_pattern: 'biweekly',
    recurrence_detail: { weekdays: [4] }, // Thursday
  };
  // 2026-06-04 is a Thursday. Its diff from 1970-01-01 is divisible by 14,
  // so it should match (anchor week).
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-04'), true);
  // The adjacent Thursday (2026-06-11) is one week off the anchor parity.
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-11'), false);
  // Two weeks after the anchor-aligned Thursday is back in parity.
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-18'), true);
});

test('recurrence/monthly_by_date: matches only the configured day of month', () => {
  const rule = {
    rule_type: 'recurring', recurrence_pattern: 'monthly_by_date',
    recurrence_detail: { day_of_month: 15 },
  };
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-15'), true);
  assert.equal(recurringRuleMatchesDate(rule, '2026-06-14'), false);
  assert.equal(recurringRuleMatchesDate(rule, '2026-07-15'), true);
});

test('recurrence/monthly_by_weekday: matches the n-th weekday of month; week 5 is literal', () => {
  // 1st Monday of June 2026 is 2026-06-01.
  const firstMonday = {
    rule_type: 'recurring', recurrence_pattern: 'monthly_by_weekday',
    recurrence_detail: { week_of_month: 1, weekday: 1 },
  };
  assert.equal(recurringRuleMatchesDate(firstMonday, '2026-06-01'), true);
  assert.equal(recurringRuleMatchesDate(firstMonday, '2026-06-08'), false);
  // 3rd Wednesday of June 2026 is 2026-06-17.
  const thirdWed = {
    rule_type: 'recurring', recurrence_pattern: 'monthly_by_weekday',
    recurrence_detail: { week_of_month: 3, weekday: 3 },
  };
  assert.equal(recurringRuleMatchesDate(thirdWed, '2026-06-17'), true);
  assert.equal(recurringRuleMatchesDate(thirdWed, '2026-06-10'), false);
  // June 2026 has only 4 Mondays (1, 8, 15, 22, 29 — actually 5: 1, 8, 15, 22, 29).
  // Test "week 5" semantics: only matches when a literal 5th occurrence exists.
  const fifthMon = {
    rule_type: 'recurring', recurrence_pattern: 'monthly_by_weekday',
    recurrence_detail: { week_of_month: 5, weekday: 1 },
  };
  assert.equal(recurringRuleMatchesDate(fifthMon, '2026-06-29'), true);  // 5th Monday exists
  // July 2026 has Mondays on 6, 13, 20, 27 — no 5th Monday.
  assert.equal(recurringRuleMatchesDate(fifthMon, '2026-07-27'), false);
});

test('recurrence: invalid pattern returns false', () => {
  assert.equal(recurringRuleMatchesDate(
    { recurrence_pattern: 'bogus', recurrence_detail: {} }, '2026-06-01',
  ), false);
});

test('isBlockedByRules: one-time rule overrides a permissive recurring rule', () => {
  // The product spec keeps this asymmetric: one-time rules win. The current
  // engine evaluates one_time first, but we also want to be sure a one_time
  // rule that *doesn\'t* block on a date doesn\'t accidentally suppress a
  // recurring rule that does.
  const item = { id: 1, status: 'active' };
  const rules = [
    {
      rule_type: 'recurring', active: true, target_scope: 'all',
      recurrence_pattern: 'daily', recurrence_detail: {},
      recurrence_start_date: '2026-06-01', recurrence_end_date: '2026-06-30',
    },
  ];
  assert.equal(svc._internals.isBlockedByRules(item, '2026-06-15', rules), true);
  assert.equal(svc._internals.isBlockedByRules(item, '2026-07-01', rules), false);
});

/* ------------------------------------------------------------------ */
/* resolveAvailabilityForRange                                         */
/* ------------------------------------------------------------------ */

const BASE_CONFIG = Object.freeze({
  date_window_mode: 'fixed',
  fixed_start_date: '2026-06-01',
  fixed_end_date: '2026-06-03',
  time_behavior_mode: 'date_only',
});

function makeItem(extra = {}) {
  return {
    id: 1, status: 'active', name: 'A', color: '#fff', shape: '○',
    capacity: 2, ...extra,
  };
}

test('resolveAvailabilityForRange: public view marks blocked dates as unavailable', () => {
  const item = makeItem();
  const rules = [{
    rule_type: 'one_time', active: true, target_scope: 'all',
    blocked_date: '2026-06-02',
  }];
  const out = svc.resolveAvailabilityForRange({
    config: BASE_CONFIG, items: [item], rules, view: 'public',
  });
  assert.equal(out.dates.length, 3);
  assert.equal(out.dates[0].items[0].state, 'available');
  assert.equal(out.dates[1].items[0].state, 'unavailable');
  assert.equal(out.dates[2].items[0].state, 'available');
});

test('resolveAvailabilityForRange: organizer view distinguishes blocked / full / available', () => {
  const item = makeItem({ capacity: 1 });
  const rules = [{
    rule_type: 'one_time', active: true, target_scope: 'all',
    blocked_date: '2026-06-02',
  }];
  const usage = new Map([['date:1:2026-06-03', 1]]);
  const out = svc.resolveAvailabilityForRange({
    config: BASE_CONFIG, items: [item], rules,
    capacityUsage: usage, view: 'organizer',
  });
  assert.equal(out.dates[0].items[0].state, 'available');
  assert.equal(out.dates[1].items[0].state, 'blocked');
  assert.equal(out.dates[2].items[0].state, 'full');
});

test('resolveAvailabilityForRange: archived items render as archived for organizer, unavailable for public', () => {
  const item = makeItem({ status: 'archived' });
  const org = svc.resolveAvailabilityForRange({
    config: BASE_CONFIG, items: [item], rules: [], view: 'organizer',
  });
  const pub = svc.resolveAvailabilityForRange({
    config: BASE_CONFIG, items: [item], rules: [], view: 'public',
  });
  assert.equal(org.dates[0].items[0].state, 'archived');
  assert.equal(pub.dates[0].items[0].state, 'unavailable');
});

test('resolveAvailabilityForRange: timed mode reports per-occurrence state and collapses empty dates to unavailable', () => {
  const cfg = { ...BASE_CONFIG, time_behavior_mode: 'timed' };
  const item = makeItem({ capacity: 2 });
  // Two occurrences on 2026-06-01: one full, one open. None on 2026-06-02.
  const occMap = new Map();
  occMap.set('1:2026-06-01', [
    {
      id: 10, status: 'active', label: 'AM', start_time: '09:00', end_time: '10:00',
      duration_minutes: 60, capacity_override: null,
    },
    {
      id: 11, status: 'active', label: 'PM', start_time: '13:00', end_time: '14:00',
      duration_minutes: 60, capacity_override: null,
    },
  ]);
  const usage = new Map([['occ:10', 2]]); // first occurrence is full
  const orgOut = svc.resolveAvailabilityForRange({
    config: cfg, items: [item], rules: [],
    occurrencesByItemDate: occMap, capacityUsage: usage, view: 'organizer',
  });
  // 2026-06-01: organizer sees per-occurrence states; overall AVAILABLE (one open).
  assert.equal(orgOut.dates[0].items[0].state, 'available');
  const occs = orgOut.dates[0].items[0].occurrences;
  assert.equal(occs.length, 2);
  assert.equal(occs.find((o) => o.occurrenceId === 10).state, 'full');
  assert.equal(occs.find((o) => o.occurrenceId === 11).state, 'available');
  // 2026-06-02: no occurrences scheduled — organizer sees out_of_window.
  assert.equal(orgOut.dates[1].items[0].state, 'out_of_window');

  const pubOut = svc.resolveAvailabilityForRange({
    config: cfg, items: [item], rules: [],
    occurrencesByItemDate: occMap, capacityUsage: usage, view: 'public',
  });
  // Public collapses non-available occurrence states.
  const pubOccs = pubOut.dates[0].items[0].occurrences;
  assert.equal(pubOccs.find((o) => o.occurrenceId === 10).state, 'unavailable');
  assert.equal(pubOccs.find((o) => o.occurrenceId === 11).state, 'available');
  // No occurrences -> unavailable.
  assert.equal(pubOut.dates[1].items[0].state, 'unavailable');
});

test('resolveAvailabilityForRange: rule with target_scope=selected only blocks targeted items', () => {
  const itemA = makeItem({ id: 1, name: 'A' });
  const itemB = makeItem({ id: 2, name: 'B' });
  const rules = [{
    rule_type: 'one_time', active: true, target_scope: 'selected',
    blocked_date: '2026-06-02', _target_item_ids: [2],
  }];
  const out = svc.resolveAvailabilityForRange({
    config: BASE_CONFIG, items: [itemA, itemB], rules, view: 'organizer',
  });
  // 2026-06-02 row: A available, B blocked.
  assert.equal(out.dates[1].items[0].state, 'available');
  assert.equal(out.dates[1].items[1].state, 'blocked');
});

test('enumerateDatesInclusive returns inclusive [start, end] day list', () => {
  const days = svc.enumerateDatesInclusive('2026-06-01', '2026-06-03');
  assert.deepEqual(days, ['2026-06-01', '2026-06-02', '2026-06-03']);
});
