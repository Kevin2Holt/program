'use strict';

// Integration-style tests for /events/:id/calendar/items CRUD. Mirrors the
// pattern in organizerSetupRoute.test.js — real Express app, stubbed models +
// permissive auth.

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
    name: extra.name || 'Sample',
    capacity: extra.capacity ?? 4,
    color: extra.color || PALETTE[0],
    shape: extra.shape || SHAPES[0],
    sort_order: extra.sort_order ?? 0,
    status: extra.status || 'active',
    created_at: new Date(), updated_at: new Date(),
  });
  return id;
}

test('GET /events/:id/calendar/items renders the list page', async () => {
  fx.items.clear();
  seedItem({ name: 'Salmon' });
  const res = await stubs.request(buildApp(), { path: '/events/42/calendar/items' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Calendar items/);
  assert.match(res.body, /Salmon/);
});

test('GET /events/:id/calendar/items/new renders the create form', async () => {
  fx.items.clear();
  const res = await stubs.request(buildApp(), { path: '/events/42/calendar/items/new' });
  assert.equal(res.status, 200);
  assert.match(res.body, /name="name"/);
  assert.match(res.body, /name="capacity"/);
  assert.match(res.body, /name="color"/);
  assert.match(res.body, /name="shape"/);
});

test('POST /events/:id/calendar/items creates a new item', async () => {
  fx.items.clear();
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/items',
    body: {
      name: 'Lasagna', capacity: '6',
      color: PALETTE[1], shape: SHAPES[1], sort_order: '2',
    },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/events/42/calendar/items');
  const rows = Array.from(fx.items.values());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Lasagna');
  assert.equal(rows[0].capacity, 6);
  assert.equal(rows[0].status, 'active');
});

test('POST /events/:id/calendar/items re-renders with errors when invalid', async () => {
  fx.items.clear();
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: '/events/42/calendar/items',
    body: { name: '', capacity: '-1' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /Name is required/);
  assert.match(res.body, /Capacity must be a positive whole number/);
  assert.equal(fx.items.size, 0);
});

test('GET /events/:id/calendar/items/:itemId/edit renders the edit form with current values', async () => {
  fx.items.clear();
  const id = seedItem({ name: 'Sourdough', capacity: 3, color: PALETTE[2], shape: SHAPES[2] });
  const res = await stubs.request(buildApp(), { path: `/events/42/calendar/items/${id}/edit` });
  assert.equal(res.status, 200);
  assert.match(res.body, /Sourdough/);
  assert.match(res.body, /name="capacity"[^>]*value="3"/);
});

test('POST /events/:id/calendar/items/:itemId updates an existing item', async () => {
  fx.items.clear();
  const id = seedItem({ name: 'Sourdough', capacity: 3 });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/items/${id}`,
    body: {
      name: 'Country Loaf', capacity: '8',
      color: PALETTE[0], shape: SHAPES[0], sort_order: '0',
    },
  });
  assert.equal(res.status, 302);
  const updated = fx.items.get(id);
  assert.equal(updated.name, 'Country Loaf');
  assert.equal(updated.capacity, 8);
});

test('POST /events/:id/calendar/items/:itemId/archive marks the item archived without deleting it', async () => {
  fx.items.clear();
  const id = seedItem({ name: 'Soup' });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/items/${id}/archive`,
  });
  assert.equal(res.status, 302);
  const row = fx.items.get(id);
  assert.ok(row, 'archived items must remain in the store');
  assert.equal(row.status, 'archived');
});

test('POST /events/:id/calendar/items/:itemId/unarchive restores a previously archived item', async () => {
  fx.items.clear();
  const id = seedItem({ name: 'Soup', status: 'archived' });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/items/${id}/unarchive`,
  });
  assert.equal(res.status, 302);
  assert.equal(fx.items.get(id).status, 'active');
});

test('archive returns 404 when the item belongs to another event', async () => {
  fx.items.clear();
  const id = fx.nextItemId();
  fx.items.set(id, {
    id, calendar_config_id: 9, event_id: 99,
    name: 'Other', capacity: 1, color: PALETTE[0], shape: SHAPES[0], sort_order: 0, status: 'active',
    created_at: new Date(), updated_at: new Date(),
  });
  const res = await stubs.request(buildApp(), {
    method: 'POST', path: `/events/42/calendar/items/${id}/archive`,
  });
  assert.equal(res.status, 404);
});
