'use strict';

// Integration tests for /events/:id/calendar/occurrences CRUD.

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
    id,
    calendar_config_id: 1,
    event_id: 42,
    name: extra.name || 'Item',
    capacity: extra.capacity ?? 4,
    color: extra.color || PALETTE[0],
    shape: extra.shape || SHAPES[0],
    sort_order: extra.sort_order ?? 0,
    status: extra.status || 'active',
    created_at: new Date(), updated_at: new Date(),
  });
  return id;
}

function seedOccurrence(itemId, extra = {}) {
  const id = fx.nextOccurrenceId();
  fx.occurrences.set(id, {
    id,
    item_id: itemId,
    service_date: extra.service_date || '2026-06-10',
    start_time: extra.start_time || '09:00',
    end_time: extra.end_time || '10:00',
    duration_minutes: extra.duration_minutes ?? null,
    label: extra.label || null,
    capacity_override: extra.capacity_override ?? null,
    status: extra.status || 'active',
    created_at: new Date(), updated_at: new Date(),
  });
  return id;
}

test('GET /events/:id/calendar/occurrences renders the list page', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem({ name: 'Cooking class' });
  seedOccurrence(itemId, { label: 'Sourdough session' });
  const res = await stubs.request(buildApp(), { path: '/events/42/calendar/occurrences' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Occurrences/);
  assert.match(res.body, /Cooking class/);
});

test('GET /events/:id/calendar/occurrences/new renders the create form', async () => {
  fx.items.clear(); fx.occurrences.clear();
  seedItem({ name: 'Cooking class' });
  const res = await stubs.request(buildApp(), { path: '/events/42/calendar/occurrences/new' });
  assert.equal(res.status, 200);
  assert.match(res.body, /name="item_id"/);
  assert.match(res.body, /name="service_date"/);
  assert.match(res.body, /name="start_time"/);
});

test('POST /events/:id/calendar/occurrences creates a new occurrence', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem({ name: 'Class' });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/occurrences',
    body: {
      item_id: String(itemId),
      service_date: '2026-06-15',
      start_time: '10:00', end_time: '11:00',
      label: 'AM session',
    },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/events/42/calendar/occurrences');
  assert.equal(fx.occurrences.size, 1);
  const row = Array.from(fx.occurrences.values())[0];
  assert.equal(row.item_id, itemId);
  assert.equal(row.start_time, '10:00');
  assert.equal(row.end_time, '11:00');
  assert.equal(row.label, 'AM session');
});

test('POST /events/:id/calendar/occurrences re-renders with field errors when invalid', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem();
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/occurrences',
    body: {
      item_id: String(itemId),
      service_date: '2026-06-15',
      start_time: '10:00', end_time: '09:00', // end before start
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /End time must be after start time/);
  assert.equal(fx.occurrences.size, 0);
});

test('POST /events/:id/calendar/occurrences rejects dates outside the configured window', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem();
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/occurrences',
    body: {
      item_id: String(itemId),
      service_date: '2026-07-15', // window ends 2026-06-30
      start_time: '10:00', end_time: '11:00',
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /outside the configured calendar window/);
});

test('POST /events/:id/calendar/occurrences rejects overlapping same-item same-day occurrences', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem();
  seedOccurrence(itemId, { service_date: '2026-06-15', start_time: '10:00', end_time: '11:00' });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/occurrences',
    body: {
      item_id: String(itemId),
      service_date: '2026-06-15',
      start_time: '10:30', end_time: '11:30',
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /Overlaps an existing occurrence/);
});

test('POST /events/:id/calendar/occurrences/:occurrenceId updates an existing occurrence', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem();
  const occId = seedOccurrence(itemId, { service_date: '2026-06-15', start_time: '09:00', end_time: '10:00' });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/occurrences/${occId}`,
    body: {
      service_date: '2026-06-16',
      start_time: '14:00', end_time: '15:00',
      label: 'Afternoon',
    },
  });
  assert.equal(res.status, 302);
  const updated = fx.occurrences.get(occId);
  assert.equal(updated.service_date, '2026-06-16');
  assert.equal(updated.start_time, '14:00');
  assert.equal(updated.label, 'Afternoon');
});

test('POST /events/:id/calendar/occurrences/:occurrenceId/archive deactivates the occurrence', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const itemId = seedItem();
  const occId = seedOccurrence(itemId);
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/occurrences/${occId}/archive`,
  });
  assert.equal(res.status, 302);
  assert.equal(fx.occurrences.get(occId).status, 'archived');
});

test('archive returns 404 when the occurrence does not belong to the event', async () => {
  fx.items.clear(); fx.occurrences.clear();
  const otherItem = fx.nextItemId();
  fx.items.set(otherItem, {
    id: otherItem, calendar_config_id: 9, event_id: 99,
    name: 'Other', capacity: 1, color: PALETTE[0], shape: SHAPES[0], sort_order: 0, status: 'active',
    created_at: new Date(), updated_at: new Date(),
  });
  const occId = seedOccurrence(otherItem);
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/occurrences/${occId}/archive`,
  });
  assert.equal(res.status, 404);
});
