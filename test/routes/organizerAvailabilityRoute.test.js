'use strict';

// Integration tests for /events/:id/calendar/availability CRUD.

const test = require('node:test');
const assert = require('node:assert/strict');

const stubs = require('./_organizerCalendarStubs');

const fx = stubs.buildFixtures();
stubs.installStubs(fx);

const calendarItemService = require('../../src/services/calendarItemService');
const PALETTE = calendarItemService.COLOR_PALETTE;
const SHAPES = calendarItemService.SHAPE_SET;

function buildApp() { return stubs.freshApp(); }

function seedItem(extra = {}) {
  const id = fx.nextItemId();
  fx.items.set(id, {
    id, calendar_config_id: 1, event_id: 42,
    name: extra.name || 'Item',
    capacity: 1, color: PALETTE[0], shape: SHAPES[0],
    sort_order: 0, status: 'active',
    created_at: new Date(), updated_at: new Date(),
  });
  return id;
}

function seedRule(extra = {}) {
  const id = fx.nextRuleId();
  fx.rules.set(id, {
    id, calendar_config_id: 1,
    rule_type: extra.rule_type || 'one_time',
    target_scope: extra.target_scope || 'all',
    active: extra.active !== false,
    blocked_date: extra.blocked_date || '2026-06-15',
    recurrence_pattern: extra.recurrence_pattern || null,
    recurrence_detail: extra.recurrence_detail || {},
    recurrence_start_date: extra.recurrence_start_date || null,
    recurrence_end_date: extra.recurrence_end_date || null,
    reason: extra.reason || null,
    created_at: new Date(), updated_at: new Date(),
  });
  return id;
}

test('GET /events/:id/calendar/availability renders the index page', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  seedRule({ blocked_date: '2026-06-15', reason: 'Holiday' });
  const res = await stubs.request(buildApp(), { path: '/events/42/calendar/availability' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Availability/);
});

test('GET /events/:id/calendar/availability/new renders the create form', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  seedItem({ name: 'Item A' });
  const res = await stubs.request(buildApp(), { path: '/events/42/calendar/availability/new' });
  assert.equal(res.status, 200);
  assert.match(res.body, /name="rule_type"/);
  assert.match(res.body, /name="target_scope"/);
});

test('POST /events/:id/calendar/availability creates a one_time / all rule', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/availability',
    body: {
      rule_type: 'one_time',
      target_scope: 'all',
      blocked_date: '2026-06-15',
      reason: 'Closed for holiday',
      active: 'on',
    },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/events/42/calendar/availability');
  assert.equal(fx.rules.size, 1);
  const row = Array.from(fx.rules.values())[0];
  assert.equal(row.rule_type, 'one_time');
  assert.equal(row.target_scope, 'all');
  assert.equal(row.blocked_date, '2026-06-15');
  assert.equal(row.reason, 'Closed for holiday');
  assert.equal(fx.ruleTargets.length, 0);
});

test('POST /events/:id/calendar/availability persists targets when target_scope=selected', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  fx.items.clear();
  const a = seedItem({ name: 'A' });
  const b = seedItem({ name: 'B' });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/availability',
    body: {
      rule_type: 'one_time', target_scope: 'selected',
      blocked_date: '2026-06-15',
      target_item_ids: [String(a), String(b)],
    },
  });
  assert.equal(res.status, 302);
  assert.equal(fx.rules.size, 1);
  assert.equal(fx.ruleTargets.length, 2);
  const targets = fx.ruleTargets.map((t) => Number(t.item_id)).sort();
  assert.deepEqual(targets, [a, b].sort());
});

test('POST /events/:id/calendar/availability creates a weekly recurring rule', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/availability',
    body: {
      rule_type: 'recurring', target_scope: 'all',
      recurrence_pattern: 'weekly',
      weekdays: ['1', '3', '5'],
      reason: 'Closed weekday mornings',
    },
  });
  assert.equal(res.status, 302);
  const row = Array.from(fx.rules.values())[0];
  assert.equal(row.rule_type, 'recurring');
  assert.equal(row.recurrence_pattern, 'weekly');
  assert.deepEqual(row.recurrence_detail, { weekdays: [1, 3, 5] });
});

test('POST /events/:id/calendar/availability re-renders with errors when invalid', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/availability',
    body: { rule_type: 'one_time', target_scope: 'all' }, // missing blocked_date
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /Blocked date is required/);
  assert.equal(fx.rules.size, 0);
});

test('GET /events/:id/calendar/availability/:ruleId/edit renders the form', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  const ruleId = seedRule({ reason: 'Holiday' });
  const res = await stubs.request(buildApp(), { path: `/events/42/calendar/availability/${ruleId}/edit` });
  assert.equal(res.status, 200);
  assert.match(res.body, /name="rule_type"/);
  assert.match(res.body, /Holiday/);
});

test('POST /events/:id/calendar/availability/:ruleId updates the rule and resets targets', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  fx.items.clear();
  const a = seedItem({ name: 'A' });
  const b = seedItem({ name: 'B' });
  const ruleId = seedRule({ target_scope: 'selected' });
  fx.ruleTargets.push({ rule_id: ruleId, item_id: a });

  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/availability/${ruleId}`,
    body: {
      rule_type: 'one_time', target_scope: 'selected',
      blocked_date: '2026-06-20',
      target_item_ids: [String(b)],
      reason: 'Updated',
    },
  });
  assert.equal(res.status, 302);
  const updated = fx.rules.get(ruleId);
  assert.equal(updated.blocked_date, '2026-06-20');
  assert.equal(updated.reason, 'Updated');
  const targets = fx.ruleTargets.filter((t) => Number(t.rule_id) === Number(ruleId));
  assert.equal(targets.length, 1);
  assert.equal(Number(targets[0].item_id), b);
});

test('POST /events/:id/calendar/availability/:ruleId/archive deactivates the rule', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  const ruleId = seedRule();
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/availability/${ruleId}/archive`,
  });
  assert.equal(res.status, 302);
  assert.equal(fx.rules.get(ruleId).active, false);
});

test('archive returns 404 when the rule belongs to another config', async () => {
  fx.rules.clear(); fx.ruleTargets.length = 0;
  const id = fx.nextRuleId();
  fx.rules.set(id, {
    id, calendar_config_id: 999,
    rule_type: 'one_time', target_scope: 'all', active: true,
    blocked_date: '2026-06-15',
    recurrence_pattern: null, recurrence_detail: {},
    recurrence_start_date: null, recurrence_end_date: null,
    reason: null,
    created_at: new Date(), updated_at: new Date(),
  });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/availability/${id}/archive`,
  });
  assert.equal(res.status, 404);
});
