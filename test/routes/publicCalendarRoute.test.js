'use strict';

// Integration tests for the public calendar route family.
//   GET  /:code/calendar
//   POST /:code/calendar/selections   (add/remove/clear/replace)
//   GET  /:code/calendar/signup
//   POST /:code/calendar/submit
//   GET  /:code/calendar/confirmation/:ref
//
// Stubbed at the model + pool boundary via _publicCalendarStubs. We use a
// cookie-aware client so pending selections persist across requests within a
// single test.

const test = require('node:test');
const assert = require('node:assert/strict');

const stubs = require('./_publicCalendarStubs');

const fx = stubs.buildFixtures();
stubs.installStubs(fx);

function seedItem(attrs = {}) {
  const id = fx.nextItemId++;
  const item = {
    id,
    event_id: 42,
    calendar_config_id: 1,
    name: attrs.name || `Item ${id}`,
    capacity: attrs.capacity ?? 4,
    color: attrs.color || '#3366ff',
    shape: attrs.shape || 'circle',
    sort_order: attrs.sort_order ?? 0,
    status: attrs.status || 'active',
  };
  fx.items.set(id, item);
  return item;
}

function buildApp() { return stubs.freshApp(); }

test('GET /:code/calendar renders the grid with item names and window dates', async () => {
  fx.items.clear();
  seedItem({ name: 'Pancakes' });
  seedItem({ name: 'Eggs' });
  const client = stubs.makeClient(buildApp());
  const res = await client.request({ path: '/cal26/calendar' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Public Calendar/);
  assert.match(res.body, /Pancakes/);
  assert.match(res.body, /Eggs/);
  assert.match(res.body, /2026-06-01/);
  assert.match(res.body, /2026-06-07/);
});

test('GET /:code/calendar shows empty-state when no items configured', async () => {
  fx.items.clear();
  const client = stubs.makeClient(buildApp());
  const res = await client.request({ path: '/cal26/calendar' });
  assert.equal(res.status, 200);
  assert.match(res.body, /No items are available/);
});

test('POST /:code/calendar/selections add then remove updates pending cart', async () => {
  fx.items.clear();
  const item = seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());

  // Add
  let res = await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'add', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/cal26/calendar');

  // The next GET should show the pending selection somewhere in the body.
  res = await client.request({ path: '/cal26/calendar' });
  assert.equal(res.status, 200);
  assert.match(res.body, /2026-06-03/);

  // Remove
  res = await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'remove', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  assert.equal(res.status, 302);
});

test('POST /:code/calendar/selections clear empties the cart', async () => {
  fx.items.clear();
  const item = seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());

  await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'add', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  const cleared = await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: { action: 'clear' },
  });
  assert.equal(cleared.status, 302);
});

test('GET /:code/calendar/signup redirects when no pending selections', async () => {
  fx.items.clear();
  seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());
  const res = await client.request({ path: '/cal26/calendar/signup' });
  // Empty cart → bounce back to the calendar page.
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/cal26/calendar');
});

test('GET /:code/calendar/signup renders the registrant form after a selection', async () => {
  fx.items.clear();
  const item = seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());

  await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'add', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  const res = await client.request({ path: '/cal26/calendar/signup' });
  assert.equal(res.status, 200);
  assert.match(res.body, /Sign up/);
  assert.match(res.body, /name="name"/);
});

test('POST /:code/calendar/submit happy path creates a booking and redirects to the confirmation page', async () => {
  fx.items.clear();
  fx.bookings.clear();
  fx.selections.length = 0;
  fx.tokenIndex.clear();
  fx.refIndex.clear();
  const item = seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());

  await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'add', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  const submitRes = await client.request({
    method: 'POST', path: '/cal26/calendar/submit',
    body: { name: 'Ada Lovelace' },
  });
  assert.equal(submitRes.status, 302);
  assert.match(submitRes.headers.location, /^\/cal26\/calendar\/confirmation\//);
  assert.equal(fx.bookings.size, 1);
  const booking = Array.from(fx.bookings.values())[0];
  assert.equal(booking.event_id, 42);
  assert.deepEqual(booking.registrant, { name: 'Ada Lovelace' });
  assert.equal(booking.status, 'active');

  // Follow the confirmation page.
  const confirmRes = await client.request({ path: submitRes.headers.location });
  assert.equal(confirmRes.status, 200);
  assert.match(confirmRes.body, /You're signed up|signed up/i);
  assert.match(confirmRes.body, /Ada Lovelace/);
  assert.match(confirmRes.body, /Pancakes/);
});

test('POST /:code/calendar/submit re-renders the signup with an error when name is missing', async () => {
  fx.items.clear();
  fx.bookings.clear();
  const item = seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());

  await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'add', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  const res = await client.request({
    method: 'POST', path: '/cal26/calendar/submit',
    body: {},
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /Name is required/);
  assert.equal(fx.bookings.size, 0);
});

test('POST /:code/calendar/submit surfaces CAPACITY_FULL as a 409 with humanized message', async () => {
  fx.items.clear();
  fx.bookings.clear();
  fx.selections.length = 0;
  fx.countsByItemDate.clear();
  const item = seedItem({ name: 'Pancakes', capacity: 1 });
  fx.countsByItemDate.set(`${item.id}:2026-06-03`, 1); // already full
  const client = stubs.makeClient(buildApp());

  await client.request({
    method: 'POST', path: '/cal26/calendar/selections',
    body: {
      action: 'add', itemId: String(item.id),
      selectedDate: '2026-06-03', selectionType: 'date_only',
    },
  });
  const res = await client.request({
    method: 'POST', path: '/cal26/calendar/submit',
    body: { name: 'Ada Lovelace' },
  });
  assert.equal(res.status, 409);
  assert.match(res.body, /just filled up|filled up/i);
  assert.equal(fx.bookings.size, 0);
});

test('POST /:code/calendar/submit with empty cart bounces back to /:code/calendar', async () => {
  fx.items.clear();
  seedItem({ name: 'Pancakes' });
  const client = stubs.makeClient(buildApp());
  const res = await client.request({
    method: 'POST', path: '/cal26/calendar/submit',
    body: { name: 'Ada' },
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/cal26/calendar');
});

test('GET /:code/calendar/confirmation/:ref renders 404 for unknown ref', async () => {
  const client = stubs.makeClient(buildApp());
  const res = await client.request({ path: '/cal26/calendar/confirmation/bogus-ref-string-1234' });
  assert.equal(res.status, 404);
});
