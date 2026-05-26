'use strict';

// Verifies the calendar route surface is registered in the right order
// (specific calendar paths before the generic `/:code` route) and that all
// required public + organizer paths exist. We instantiate a fresh router
// directly so this test does not need a database or session store.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const publicCalendarRoutes = require('../../src/routes/publicCalendarRoutes');
const publicEventRoutes = require('../../src/routes/publicEventRoutes');
const organizerCalendarRoutes = require('../../src/routes/organizerCalendarRoutes');

function collectRoutes(router) {
  const out = [];
  for (const layer of router.stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method: method.toUpperCase(), path: layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      for (const sub of collectRoutes(layer.handle)) {
        out.push(sub);
      }
    } else if (layer.regexp && layer.handle && layer.handle.stack) {
      for (const sub of collectRoutes(layer.handle)) out.push(sub);
    }
  }
  return out;
}

test('public calendar router registers the required public paths', () => {
  const list = collectRoutes(publicCalendarRoutes);
  const paths = list.map((r) => `${r.method} ${r.path}`);
  assert.ok(paths.includes('GET /:code/calendar'), 'missing GET /:code/calendar');
  assert.ok(paths.includes('POST /:code/calendar/selections'));
  assert.ok(paths.includes('POST /:code/calendar/submit'));
  assert.ok(paths.includes('GET /:code/calendar/confirmation/:ref'));
});

test('public event router exposes the generic /:code route', () => {
  const list = collectRoutes(publicEventRoutes);
  const paths = list.map((r) => `${r.method} ${r.path}`);
  assert.ok(paths.includes('GET /:code'));
});

test('organizer calendar router registers all calendar admin paths', () => {
  const list = collectRoutes(organizerCalendarRoutes);
  const paths = list.map((r) => `${r.method} ${r.path}`);
  // Top level
  assert.ok(paths.includes('GET /:eventId/calendar'));
  assert.ok(paths.includes('GET /:eventId/calendar/setup'));
  assert.ok(paths.includes('POST /:eventId/calendar/setup'));
  // Items CRUD
  assert.ok(paths.includes('GET /:eventId/calendar/items'));
  assert.ok(paths.includes('GET /:eventId/calendar/items/new'));
  assert.ok(paths.includes('POST /:eventId/calendar/items'));
  assert.ok(paths.includes('GET /:eventId/calendar/items/:itemId/edit'));
  assert.ok(paths.includes('POST /:eventId/calendar/items/:itemId'));
  assert.ok(paths.includes('POST /:eventId/calendar/items/:itemId/archive'));
  assert.ok(paths.includes('POST /:eventId/calendar/items/:itemId/unarchive'));
  // Occurrences CRUD
  assert.ok(paths.includes('GET /:eventId/calendar/occurrences'));
  assert.ok(paths.includes('GET /:eventId/calendar/occurrences/new'));
  assert.ok(paths.includes('POST /:eventId/calendar/occurrences'));
  assert.ok(paths.includes('GET /:eventId/calendar/occurrences/:occurrenceId/edit'));
  assert.ok(paths.includes('POST /:eventId/calendar/occurrences/:occurrenceId'));
  assert.ok(paths.includes('POST /:eventId/calendar/occurrences/:occurrenceId/archive'));
  // Availability CRUD
  assert.ok(paths.includes('GET /:eventId/calendar/availability'));
  assert.ok(paths.includes('GET /:eventId/calendar/availability/new'));
  assert.ok(paths.includes('POST /:eventId/calendar/availability'));
  assert.ok(paths.includes('GET /:eventId/calendar/availability/:ruleId/edit'));
  assert.ok(paths.includes('POST /:eventId/calendar/availability/:ruleId'));
  assert.ok(paths.includes('POST /:eventId/calendar/availability/:ruleId/archive'));
  // Phase 4B.3+
  assert.ok(paths.includes('GET /:eventId/calendar/bookings'));
  assert.ok(paths.includes('GET /:eventId/calendar/export'));
});

test('mounting order: calendar paths win the route match over /:code', () => {
  // Build an Express app the same way src/routes/index.js does and probe
  // its internal layer order. The calendar router must appear before the
  // generic /:code router.
  const app = express();
  app.use(publicCalendarRoutes);
  app.use(publicEventRoutes);

  // Walk layers in order; collect the layer index for each named handler.
  const indices = { calendar: -1, generic: -1 };
  app._router.stack.forEach((layer, idx) => {
    if (layer.handle === publicCalendarRoutes) indices.calendar = idx;
    if (layer.handle === publicEventRoutes) indices.generic = idx;
  });
  assert.ok(indices.calendar >= 0 && indices.generic >= 0, 'both routers must be mounted');
  assert.ok(
    indices.calendar < indices.generic,
    'public calendar router must be mounted before generic /:code router',
  );
});
