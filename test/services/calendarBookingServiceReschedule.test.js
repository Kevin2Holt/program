'use strict';

// Focused tests for calendarBookingService.rescheduleBooking. Reuses the
// require.cache stubbing pattern from calendarBookingServiceFinalize.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const poolPath = require.resolve('../../src/db/pool');
const bookingModelPath = require.resolve('../../src/models/calendarBooking');
const itemModelPath = require.resolve('../../src/models/calendarItem');
const occurrenceModelPath = require.resolve('../../src/models/calendarOccurrence');
const availabilityServicePath = require.resolve('../../src/services/calendarAvailabilityService');
const occurrenceServicePath = require.resolve('../../src/services/calendarOccurrenceService');
const referencesPath = require.resolve('../../src/services/calendarReferences');
const bookingServicePath = require.resolve('../../src/services/calendarBookingService');

function makeStub(absPath, exportsValue) {
  return { id: absPath, filename: absPath, loaded: true, exports: exportsValue };
}

function installStubs(fx) {
  require.cache[poolPath] = makeStub(poolPath, {
    pool: {},
    async withTransaction(fn) { return fn({ __tx: true }); },
  });

  require.cache[bookingModelPath] = makeStub(bookingModelPath, {
    async findById(id) { return fx.bookings.get(Number(id)) || null; },
    async listSelections(bookingId) {
      return fx.selections.filter((s) => Number(s.booking_id) === Number(bookingId));
    },
    async countActiveForItemDate(itemId, date) {
      return fx.countsByItemDate.get(`${itemId}:${date}`) || 0;
    },
    async countActiveForOccurrence(occId) {
      return fx.countsByOccurrence.get(Number(occId)) || 0;
    },
    async createSelection(attrs) {
      const sel = { id: fx.selections.length + 1, ...attrs };
      fx.selections.push(sel);
      return sel;
    },
    async deleteSelections(bookingId) {
      fx.selections = fx.selections.filter((s) => Number(s.booking_id) !== Number(bookingId));
      fx.deleteSelectionsCalls.push(bookingId);
      return undefined;
    },
    async updateFields(id, patch) {
      const cur = fx.bookings.get(Number(id));
      if (!cur) return null;
      Object.assign(cur, patch);
      return cur;
    },
  });

  require.cache[itemModelPath] = makeStub(itemModelPath, {
    async findById(id) { return fx.items.get(Number(id)) || null; },
  });

  require.cache[occurrenceModelPath] = makeStub(occurrenceModelPath, {
    async findById(id) { return fx.occurrences.get(Number(id)) || null; },
  });

  require.cache[availabilityServicePath] = makeStub(availabilityServicePath, {
    async loadHydratedRules() { return []; },
    deriveDateWindow(config) {
      if (config.fixed_start_date && config.fixed_end_date) {
        return { start: config.fixed_start_date, end: config.fixed_end_date };
      }
      return null;
    },
    isDateInWindow(date, window) {
      if (!window) return true;
      return date >= window.start && date <= window.end;
    },
    _internals: { isBlockedByRules: () => false },
  });

  require.cache[occurrenceServicePath] = makeStub(occurrenceServicePath, {
    detectSameDayOverlap() { return { conflict: false }; },
  });

  require.cache[referencesPath] = makeStub(referencesPath, {
    generateConfirmationRef() { return 'ref-fresh'; },
    generateSubmissionToken() { return 'tok-fresh'; },
    isValidConfirmationRefShape(r) { return typeof r === 'string' && r.length >= 3; },
  });

  delete require.cache[bookingServicePath];
}

function freshFixture() {
  return {
    bookings: new Map(),
    items: new Map(),
    occurrences: new Map(),
    selections: [],
    countsByItemDate: new Map(),
    countsByOccurrence: new Map(),
    deleteSelectionsCalls: [],
  };
}

function baseConfig() {
  return {
    id: 1,
    event_id: 1,
    time_behavior_mode: 'date_only',
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-30',
  };
}

function setupBooking(fx) {
  const event = { id: 1, code: 'demo', name: 'Demo' };
  const config = baseConfig();
  const item = { id: 10, name: 'Lunch', status: 'active', capacity: 5 };
  fx.items.set(10, item);
  const booking = {
    id: 99, event_id: 1, calendar_config_id: 1, status: 'active',
    confirmation_ref: 'ref-99', submission_token: 'tok-99',
    registrant: { name: 'A' }, email: 'a@b.test', notes: null,
  };
  fx.bookings.set(99, booking);
  fx.selections.push({
    id: 1, booking_id: 99, item_id: 10, selected_date: '2026-06-05',
    selection_type: 'date_only', item_name_snapshot: 'Lunch',
  });
  return { event, config, booking };
}

test('rescheduleBooking replaces selections and updates registrant fields', async () => {
  const fx = freshFixture();
  installStubs(fx);
  const svc = require('../../src/services/calendarBookingService');
  const { event, config, booking } = setupBooking(fx);

  const res = await svc.rescheduleBooking({
    event, config, booking,
    selections: [
      { selectionType: 'date_only', itemId: 10, selectedDate: '2026-06-10' },
    ],
    registrant: { name: 'A renamed' },
    notes: 'updated note',
  });

  assert.equal(res.booking.id, 99);
  assert.equal(res.booking.notes, 'updated note');
  assert.equal(res.booking.registrant.name, 'A renamed');
  assert.deepEqual(fx.deleteSelectionsCalls, [99]);
  const finalSels = fx.selections.filter((s) => s.booking_id === 99);
  assert.equal(finalSels.length, 1);
  assert.equal(finalSels[0].selected_date, '2026-06-10');
});

test('rescheduleBooking rejects when booking belongs to a different event', async () => {
  const fx = freshFixture();
  installStubs(fx);
  const svc = require('../../src/services/calendarBookingService');
  const { config, booking } = setupBooking(fx);

  await assert.rejects(
    svc.rescheduleBooking({
      event: { id: 2 }, config, booking,
      selections: [{ selectionType: 'date_only', itemId: 10, selectedDate: '2026-06-10' }],
    }),
    (err) => err.code === 'NOT_FOUND' && err.status === 404,
  );
});

test('rescheduleBooking rejects canceled bookings', async () => {
  const fx = freshFixture();
  installStubs(fx);
  const svc = require('../../src/services/calendarBookingService');
  const { event, config, booking } = setupBooking(fx);
  booking.status = 'canceled';

  await assert.rejects(
    svc.rescheduleBooking({
      event, config, booking,
      selections: [{ selectionType: 'date_only', itemId: 10, selectedDate: '2026-06-10' }],
    }),
    (err) => err.code === 'NOT_EDITABLE' && err.status === 409,
  );
});

test('rescheduleBooking rejects empty selection list', async () => {
  const fx = freshFixture();
  installStubs(fx);
  const svc = require('../../src/services/calendarBookingService');
  const { event, config, booking } = setupBooking(fx);

  await assert.rejects(
    svc.rescheduleBooking({ event, config, booking, selections: [] }),
    (err) => err.code === 'NO_SELECTIONS',
  );
});

test('rescheduleBooking rejects selection outside the date window', async () => {
  const fx = freshFixture();
  installStubs(fx);
  const svc = require('../../src/services/calendarBookingService');
  const { event, config, booking } = setupBooking(fx);

  await assert.rejects(
    svc.rescheduleBooking({
      event, config, booking,
      selections: [{ selectionType: 'date_only', itemId: 10, selectedDate: '2027-01-01' }],
    }),
    (err) => err.code === 'OUT_OF_WINDOW',
  );
});
