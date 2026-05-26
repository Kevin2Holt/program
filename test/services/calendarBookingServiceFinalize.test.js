'use strict';

// Tests for calendarBookingService.finalizeBooking — the transactional
// booking finalizer. We stub the persistence boundary (db/pool models +
// availability service) via require.cache so the service runs end-to-end
// without touching Postgres. This complements normalizeSelections tests in
// calendarBookingService.test.js.

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

function buildFixtures() {
  return {
    items: new Map(),           // id -> item
    occurrences: new Map(),     // id -> occurrence
    bookings: new Map(),        // id -> booking
    selections: [],             // booking selection rows
    countsByItemDate: new Map(),// key item:date -> used count
    countsByOccurrence: new Map(), // occId -> used count
    tokenIndex: new Map(),      // submission_token -> booking
    refIndex: new Map(),        // confirmation_ref -> booking
    nextBookingId: 1,
    confirmationCounter: 0,
    submissionTokens: [],
    rulesByConfig: new Map(),
    derivedWindowsByConfig: new Map(),
    isBlockedByRulesCalls: [],
    isBlockedFn: () => false, // overridable per-test
  };
}

function installStubs(fx) {
  // Pool: provide a withTransaction that runs the callback with a sentinel
  // client object so model stubs can detect transactional calls.
  require.cache[poolPath] = makeStub(poolPath, {
    pool: {},
    async withTransaction(fn) {
      const client = { __tx: true };
      return fn(client);
    },
  });

  require.cache[bookingModelPath] = makeStub(bookingModelPath, {
    async findById(id) { return fx.bookings.get(Number(id)) || null; },
    async findBySubmissionToken(token) { return fx.tokenIndex.get(token) || null; },
    async findByConfirmationRef(ref) { return fx.refIndex.get(ref) || null; },
    async listSelections(bookingId) {
      return fx.selections.filter((s) => Number(s.booking_id) === Number(bookingId));
    },
    async countActiveForItemDate(itemId, date) {
      return fx.countsByItemDate.get(`${itemId}:${date}`) || 0;
    },
    async countActiveForOccurrence(occId) {
      return fx.countsByOccurrence.get(Number(occId)) || 0;
    },
    async createBooking(attrs) {
      const id = fx.nextBookingId++;
      const row = {
        id,
        event_id: attrs.event_id,
        calendar_config_id: attrs.calendar_config_id,
        confirmation_ref: attrs.confirmation_ref,
        submission_token: attrs.submission_token,
        registrant: attrs.registrant,
        notes: attrs.notes,
        email: attrs.email,
        confirmation_meta: attrs.confirmation_meta || {},
        status: attrs.status || 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };
      fx.bookings.set(id, row);
      if (attrs.submission_token) fx.tokenIndex.set(attrs.submission_token, row);
      if (attrs.confirmation_ref) fx.refIndex.set(attrs.confirmation_ref, row);
      return row;
    },
    async createSelection(attrs) {
      const sel = { id: fx.selections.length + 1, ...attrs };
      fx.selections.push(sel);
      return sel;
    },
    async cancel(id) {
      const cur = fx.bookings.get(Number(id));
      if (!cur) return null;
      cur.status = 'canceled';
      return cur;
    },
    async listForEvent() { return []; },
  });

  require.cache[itemModelPath] = makeStub(itemModelPath, {
    async findById(id) { return fx.items.get(Number(id)) || null; },
  });

  require.cache[occurrenceModelPath] = makeStub(occurrenceModelPath, {
    async findById(id) { return fx.occurrences.get(Number(id)) || null; },
  });

  // Availability service: minimal surface used by finalizeBooking.
  require.cache[availabilityServicePath] = makeStub(availabilityServicePath, {
    async loadHydratedRules(configId) {
      return fx.rulesByConfig.get(configId) || [];
    },
    deriveDateWindow(config) {
      if (fx.derivedWindowsByConfig.has(config.id)) {
        return fx.derivedWindowsByConfig.get(config.id);
      }
      if (config.fixed_start_date && config.fixed_end_date) {
        return { start: config.fixed_start_date, end: config.fixed_end_date };
      }
      return null;
    },
    isDateInWindow(date, window) {
      if (!window) return true;
      return date >= window.start && date <= window.end;
    },
    _internals: {
      isBlockedByRules(item, date, rules) {
        fx.isBlockedByRulesCalls.push({ itemId: item && item.id, date, rulesCount: rules.length });
        return fx.isBlockedFn(item, date, rules);
      },
    },
  });

  // Occurrence service: only detectSameDayOverlap is used.
  require.cache[occurrenceServicePath] = makeStub(occurrenceServicePath, {
    detectSameDayOverlap(occs) {
      // Simple test impl: if any two occurrences share start_time on the same
      // service_date, flag a conflict. Otherwise no conflict.
      const seen = new Map();
      for (const o of occs) {
        const key = `${o.service_date}:${o.start_time}`;
        if (seen.has(key)) return { conflict: true };
        seen.set(key, true);
      }
      return { conflict: false };
    },
  });

  require.cache[referencesPath] = makeStub(referencesPath, {
    generateConfirmationRef() {
      fx.confirmationCounter += 1;
      return `ref-${fx.confirmationCounter}`;
    },
    generateSubmissionToken() {
      const t = `tok-${fx.submissionTokens.length + 1}`;
      fx.submissionTokens.push(t);
      return t;
    },
    isValidConfirmationRefShape(ref) {
      return typeof ref === 'string' && ref.length >= 3;
    },
  });

  delete require.cache[bookingServicePath];
}

function freshService(fx) {
  installStubs(fx);
  // eslint-disable-next-line global-require
  return require('../../src/services/calendarBookingService');
}

function baseConfig() {
  return {
    id: 1,
    event_id: 42,
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-30',
    date_window_mode: 'fixed',
  };
}

function baseEvent() {
  return { id: 42, code: 'cal26' };
}

function seedItem(fx, attrs = {}) {
  const id = attrs.id || (fx.items.size + 1);
  const item = {
    id,
    event_id: 42,
    calendar_config_id: 1,
    name: attrs.name || `Item ${id}`,
    capacity: attrs.capacity ?? 2,
    color: attrs.color || '#ff0000',
    shape: attrs.shape || 'circle',
    status: attrs.status || 'active',
  };
  fx.items.set(id, item);
  return item;
}

function seedOccurrence(fx, attrs = {}) {
  const id = attrs.id || (fx.occurrences.size + 1);
  const occ = {
    id,
    item_id: attrs.item_id,
    service_date: attrs.service_date,
    start_time: attrs.start_time || '10:00',
    end_time: attrs.end_time || '11:00',
    duration_minutes: attrs.duration_minutes || 60,
    label: attrs.label || null,
    capacity_override: attrs.capacity_override ?? null,
    status: 'active',
  };
  fx.occurrences.set(id, occ);
  return occ;
}

test('finalizeBooking creates a booking with a single date-only selection (happy path)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  seedItem(fx, { id: 7, capacity: 3 });

  const result = await service.finalizeBooking({
    event: baseEvent(),
    config: baseConfig(),
    selections: [{ itemId: 7, selectedDate: '2026-06-10', selectionType: 'date_only' }],
    registrant: { name: 'Ada' },
    submissionToken: 'tok-test-1',
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.booking.event_id, 42);
  assert.equal(result.booking.calendar_config_id, 1);
  assert.equal(result.booking.status, 'active');
  assert.equal(result.booking.confirmation_ref, 'ref-1');
  assert.equal(result.booking.submission_token, 'tok-test-1');
  assert.deepEqual(result.booking.registrant, { name: 'Ada' });

  // A selection row was persisted with the snapshot fields populated.
  assert.equal(fx.selections.length, 1);
  const sel = fx.selections[0];
  assert.equal(sel.booking_id, result.booking.id);
  assert.equal(sel.item_id, 7);
  assert.equal(sel.selected_date, '2026-06-10');
  assert.equal(sel.selection_type, 'date_only');
  assert.equal(sel.item_name_snapshot, 'Item 7');
});

test('finalizeBooking is idempotent via submission_token (same booking returned)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  seedItem(fx, { id: 7, capacity: 3 });

  const first = await service.finalizeBooking({
    event: baseEvent(),
    config: baseConfig(),
    selections: [{ itemId: 7, selectedDate: '2026-06-10', selectionType: 'date_only' }],
    registrant: { name: 'Ada' },
    submissionToken: 'tok-idem',
  });

  const second = await service.finalizeBooking({
    event: baseEvent(),
    config: baseConfig(),
    selections: [{ itemId: 7, selectedDate: '2026-06-10', selectionType: 'date_only' }],
    registrant: { name: 'Ada' },
    submissionToken: 'tok-idem',
  });

  assert.equal(second.idempotent, true);
  assert.equal(second.booking.id, first.booking.id);
  // Only one selection row total — no duplicate insert on the retry.
  assert.equal(fx.selections.length, 1);
});

test('finalizeBooking rejects empty selections with NO_SELECTIONS (400)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  await assert.rejects(
    () => service.finalizeBooking({
      event: baseEvent(), config: baseConfig(), selections: [],
    }),
    (err) => err.code === 'NO_SELECTIONS' && err.status === 400,
  );
});

test('finalizeBooking rejects out-of-window dates with OUT_OF_WINDOW (409)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  seedItem(fx, { id: 7 });

  await assert.rejects(
    () => service.finalizeBooking({
      event: baseEvent(),
      config: baseConfig(),
      // 2026-07-15 is outside the fixed window 2026-06-01..2026-06-30.
      selections: [{ itemId: 7, selectedDate: '2026-07-15', selectionType: 'date_only' }],
      submissionToken: 'tok-oow',
    }),
    (err) => err.code === 'OUT_OF_WINDOW' && err.status === 409,
  );
  // No booking was persisted.
  assert.equal(fx.bookings.size, 0);
  assert.equal(fx.selections.length, 0);
});

test('finalizeBooking rejects blocked dates with BLOCKED (409)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  seedItem(fx, { id: 7 });
  // Make the rule check declare the date as blocked.
  fx.isBlockedFn = (_item, date) => date === '2026-06-10';

  await assert.rejects(
    () => service.finalizeBooking({
      event: baseEvent(),
      config: baseConfig(),
      selections: [{ itemId: 7, selectedDate: '2026-06-10', selectionType: 'date_only' }],
      submissionToken: 'tok-blocked',
    }),
    (err) => err.code === 'BLOCKED' && err.status === 409,
  );
  assert.equal(fx.bookings.size, 0);
});

test('finalizeBooking rejects full selections with CAPACITY_FULL (409)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  seedItem(fx, { id: 7, capacity: 2 });
  fx.countsByItemDate.set('7:2026-06-10', 2);

  await assert.rejects(
    () => service.finalizeBooking({
      event: baseEvent(),
      config: baseConfig(),
      selections: [{ itemId: 7, selectedDate: '2026-06-10', selectionType: 'date_only' }],
      submissionToken: 'tok-cap',
    }),
    (err) => err.code === 'CAPACITY_FULL' && err.status === 409,
  );
});

test('finalizeBooking rejects archived items with SELECTION_GONE (409)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  seedItem(fx, { id: 7, status: 'archived' });

  await assert.rejects(
    () => service.finalizeBooking({
      event: baseEvent(),
      config: baseConfig(),
      selections: [{ itemId: 7, selectedDate: '2026-06-10', selectionType: 'date_only' }],
      submissionToken: 'tok-gone',
    }),
    (err) => err.code === 'SELECTION_GONE' && err.status === 409,
  );
});

test('finalizeBooking detects same-day timed overlap (TIMED_OVERLAP)', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  const itemA = seedItem(fx, { id: 11, capacity: 5 });
  const itemB = seedItem(fx, { id: 12, capacity: 5 });
  // Two occurrences on the same day with the same start_time -> overlap.
  const occA = seedOccurrence(fx, {
    id: 101, item_id: itemA.id, service_date: '2026-06-10', start_time: '10:00',
  });
  const occB = seedOccurrence(fx, {
    id: 102, item_id: itemB.id, service_date: '2026-06-10', start_time: '10:00',
  });

  await assert.rejects(
    () => service.finalizeBooking({
      event: baseEvent(),
      config: baseConfig(),
      selections: [
        { itemId: itemA.id, selectedDate: '2026-06-10', selectionType: 'occurrence', occurrenceId: occA.id },
        { itemId: itemB.id, selectedDate: '2026-06-10', selectionType: 'occurrence', occurrenceId: occB.id },
      ],
      submissionToken: 'tok-overlap',
    }),
    (err) => err.code === 'TIMED_OVERLAP' && err.status === 409,
  );
});

test('finalizeBooking handles a timed-occurrence happy path with capacity override', async () => {
  const fx = buildFixtures();
  const service = freshService(fx);
  const item = seedItem(fx, { id: 11, capacity: 2 });
  const occ = seedOccurrence(fx, {
    id: 101, item_id: item.id, service_date: '2026-06-10',
    start_time: '10:00', end_time: '11:00', duration_minutes: 60,
    label: 'morning', capacity_override: 5,
  });

  const result = await service.finalizeBooking({
    event: baseEvent(),
    config: baseConfig(),
    selections: [{
      itemId: item.id, selectedDate: '2026-06-10',
      selectionType: 'occurrence', occurrenceId: occ.id,
    }],
    registrant: { name: 'Ada' },
    submissionToken: 'tok-occ',
  });

  assert.equal(result.idempotent, false);
  assert.equal(fx.selections.length, 1);
  const sel = fx.selections[0];
  assert.equal(sel.occurrence_id, 101);
  assert.equal(sel.occurrence_label_snapshot, 'morning');
  assert.equal(sel.occurrence_start_snapshot, '10:00');
  assert.equal(sel.occurrence_end_snapshot, '11:00');
  assert.equal(sel.occurrence_duration_minutes_snapshot, 60);
});
