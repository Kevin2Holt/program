'use strict';

// Integration tests for the organizer booking management routes.
//   GET  /events/:eventId/calendar/bookings
//   GET  /events/:eventId/calendar/bookings/:bookingId
//   POST /events/:eventId/calendar/bookings/:bookingId/cancel
//
// Stubs the model layer + auth via the shared organizer stubs and additionally
// stubs calendarBooking so we can seed bookings + selections. We extend the
// stub before requiring the app so the cancel path observes our model.

const test = require('node:test');
const assert = require('node:assert/strict');

const stubs = require('./_organizerCalendarStubs');

const calendarBookingModelPath = require.resolve('../../src/models/calendarBooking');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

const fx = stubs.buildFixtures();
stubs.installStubs(fx);

// Extend the booking-model stub with a small in-memory store that the
// organizer flow needs (list/findById/cancel/listSelections).
const bookingStore = {
  bookings: new Map(),
  selections: [],
  nextId: 1,
};

require.cache[calendarBookingModelPath] = makeStub(calendarBookingModelPath, {
  async listForEvent(eventId) {
    const out = [];
    for (const b of bookingStore.bookings.values()) {
      if (Number(b.event_id) === Number(eventId)) out.push(b);
    }
    return out;
  },
  async findById(id) { return bookingStore.bookings.get(Number(id)) || null; },
  async listSelections(bookingId) {
    return bookingStore.selections.filter(
      (s) => Number(s.booking_id) === Number(bookingId),
    );
  },
  async cancel(id) {
    const cur = bookingStore.bookings.get(Number(id));
    if (!cur) return null;
    cur.status = 'canceled';
    cur.updated_at = new Date();
    return cur;
  },
});

function seedBooking(attrs = {}) {
  const id = bookingStore.nextId++;
  const row = {
    id,
    event_id: 42,
    calendar_config_id: 1,
    confirmation_ref: attrs.confirmation_ref || `ref-${id}`,
    submission_token: null,
    registrant: attrs.registrant || { name: `Person ${id}` },
    notes: attrs.notes || null,
    email: attrs.email || null,
    confirmation_meta: {},
    status: attrs.status || 'active',
    created_at: new Date(),
    updated_at: new Date(),
  };
  bookingStore.bookings.set(id, row);
  return row;
}

function seedSelection(bookingId, attrs = {}) {
  const sel = {
    id: bookingStore.selections.length + 1,
    booking_id: bookingId,
    item_id: attrs.item_id || 1,
    selected_date: attrs.selected_date || '2026-06-03',
    occurrence_id: attrs.occurrence_id || null,
    selection_type: attrs.selection_type || 'date_only',
    item_name_snapshot: attrs.item_name_snapshot || 'Pancakes',
    occurrence_label_snapshot: attrs.occurrence_label_snapshot || null,
    occurrence_start_snapshot: attrs.occurrence_start_snapshot || null,
    occurrence_end_snapshot: attrs.occurrence_end_snapshot || null,
    occurrence_duration_minutes_snapshot: attrs.occurrence_duration_minutes_snapshot || null,
  };
  bookingStore.selections.push(sel);
  return sel;
}

function buildApp() { return stubs.freshApp(); }

test('GET /events/:id/calendar/bookings renders the list including registrant name and status', async () => {
  bookingStore.bookings.clear();
  bookingStore.selections.length = 0;
  seedBooking({ registrant: { name: 'Ada Lovelace' }, email: 'ada@example.com' });
  seedBooking({ registrant: { name: 'Grace Hopper' }, status: 'canceled' });

  const res = await stubs.request(buildApp(), {
    path: '/events/42/calendar/bookings',
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /Ada Lovelace/);
  assert.match(res.body, /Grace Hopper/);
  // Status pill / column should mention canceled.
  assert.match(res.body, /canceled/i);
});

test('GET /events/:id/calendar/bookings/:bookingId renders the detail page with selections', async () => {
  bookingStore.bookings.clear();
  bookingStore.selections.length = 0;
  const booking = seedBooking({ registrant: { name: 'Ada Lovelace' } });
  seedSelection(booking.id, { item_name_snapshot: 'Pancakes', selected_date: '2026-06-03' });
  seedSelection(booking.id, { item_name_snapshot: 'Eggs', selected_date: '2026-06-04' });

  const res = await stubs.request(buildApp(), {
    path: `/events/42/calendar/bookings/${booking.id}`,
  });
  assert.equal(res.status, 200);
  assert.match(res.body, /Ada Lovelace/);
  assert.match(res.body, /Pancakes/);
  assert.match(res.body, /Eggs/);
  assert.match(res.body, /2026-06-03/);
});

test('GET /events/:id/calendar/bookings/:bookingId 404s for booking belonging to a different event', async () => {
  bookingStore.bookings.clear();
  bookingStore.selections.length = 0;
  // Create a booking that belongs to event 999, not 42.
  const id = bookingStore.nextId++;
  bookingStore.bookings.set(id, {
    id, event_id: 999, calendar_config_id: 1,
    confirmation_ref: 'ref-x', registrant: { name: 'Other' },
    confirmation_meta: {}, status: 'active',
    created_at: new Date(), updated_at: new Date(),
  });

  const res = await stubs.request(buildApp(), {
    path: `/events/42/calendar/bookings/${id}`,
  });
  assert.equal(res.status, 404);
});

test('POST /events/:id/calendar/bookings/:bookingId/cancel transitions status to canceled and redirects', async () => {
  bookingStore.bookings.clear();
  bookingStore.selections.length = 0;
  const booking = seedBooking({ registrant: { name: 'Ada Lovelace' } });
  assert.equal(booking.status, 'active');

  const res = await stubs.request(buildApp(), {
    method: 'POST',
    path: `/events/42/calendar/bookings/${booking.id}/cancel`,
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/events/42/calendar/bookings');
  assert.equal(bookingStore.bookings.get(booking.id).status, 'canceled');
});

test('POST /events/:id/calendar/bookings/:bookingId/cancel is idempotent (already canceled)', async () => {
  bookingStore.bookings.clear();
  bookingStore.selections.length = 0;
  const booking = seedBooking({ registrant: { name: 'Ada' }, status: 'canceled' });
  const before = booking.updated_at;

  const res = await stubs.request(buildApp(), {
    method: 'POST',
    path: `/events/42/calendar/bookings/${booking.id}/cancel`,
  });
  assert.equal(res.status, 302);
  // Still canceled, no error.
  assert.equal(bookingStore.bookings.get(booking.id).status, 'canceled');
  // updated_at should NOT have been bumped because cancel() wasn't called.
  assert.equal(bookingStore.bookings.get(booking.id).updated_at, before);
});

test('POST /events/:id/calendar/bookings/:bookingId/cancel 404s for booking from a different event', async () => {
  bookingStore.bookings.clear();
  const id = bookingStore.nextId++;
  bookingStore.bookings.set(id, {
    id, event_id: 999, calendar_config_id: 1,
    confirmation_ref: 'ref-z', registrant: { name: 'Other' },
    confirmation_meta: {}, status: 'active',
    created_at: new Date(), updated_at: new Date(),
  });

  const res = await stubs.request(buildApp(), {
    method: 'POST',
    path: `/events/42/calendar/bookings/${id}/cancel`,
  });
  assert.equal(res.status, 404);
  assert.equal(bookingStore.bookings.get(id).status, 'active');
});
