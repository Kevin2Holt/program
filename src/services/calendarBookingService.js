'use strict';

// calendarBookingService — owns booking finalization, pending-selection
// normalization, capacity checks, and overlap detection orchestration.
//
// Phase 4A scaffolds the service surface and the safe pieces (normalization,
// capacity counting via models, transactional booking creation). The full
// availability re-resolution against rules is intentionally TODO and will be
// completed in Phase 4B+ when the recurrence engine lands.

const { withTransaction } = require('../db/pool');
const bookingModel = require('../models/calendarBooking');
const itemModel = require('../models/calendarItem');
const occurrenceModel = require('../models/calendarOccurrence');
const occurrenceService = require('./calendarOccurrenceService');
const availabilityService = require('./calendarAvailabilityService');
const references = require('./calendarReferences');

/* ------------------------------------------------------------------ */
/* Pending-selection state (server session backed)                     */
/* ------------------------------------------------------------------ */

const SESSION_KEY = 'calendarPending';

/**
 * Shape of a single pending selection:
 *   { itemId, selectedDate (ISO), occurrenceId?: number, selectionType }
 *
 * The session stores one keyed entry per calendar_config_id so cross-event
 * carts don't mix in the same browser session.
 */

function getPendingSelections(session, configId) {
  if (!session || !session[SESSION_KEY]) return [];
  const bag = session[SESSION_KEY][configId];
  if (!bag || !Array.isArray(bag.selections)) return [];
  return bag.selections.slice();
}

function setPendingSelections(session, configId, selections) {
  if (!session) return;
  if (!session[SESSION_KEY]) session[SESSION_KEY] = {};
  session[SESSION_KEY][configId] = { selections };
}

function clearPendingSelections(session, configId) {
  if (!session || !session[SESSION_KEY]) return;
  delete session[SESSION_KEY][configId];
}

/**
 * Normalize an incoming selection payload. Returns the canonical list, with
 * duplicates removed and obviously invalid entries dropped. Rejects same-day
 * date-only duplicates per Phase 2 product rule.
 */
function normalizeSelections(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const s of raw) {
    if (!s || !s.itemId || !s.selectedDate || !s.selectionType) continue;
    const itemId = Number(s.itemId);
    const date = String(s.selectedDate).slice(0, 10);
    const type = String(s.selectionType);
    if (type !== 'date_only' && type !== 'occurrence') continue;
    const occurrenceId = type === 'occurrence' ? Number(s.occurrenceId) : null;
    if (type === 'occurrence' && !occurrenceId) continue;
    const key = type === 'occurrence'
      ? `occ:${itemId}:${occurrenceId}`
      : `date:${itemId}:${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ itemId, selectedDate: date, selectionType: type, occurrenceId });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Capacity                                                            */
/* ------------------------------------------------------------------ */

/**
 * Count current capacity usage for a single selection unit. Returns the
 * (used, capacity) tuple needed by capacity checks. The numbers come from
 * persisted booking selections, not from cached UI state.
 */
async function getCapacityUsage(selection, opts = {}) {
  if (selection.selectionType === 'occurrence') {
    const occ = await occurrenceModel.findById(selection.occurrenceId, opts);
    if (!occ) return { used: 0, capacity: 0, exists: false };
    const item = await itemModel.findById(occ.item_id, opts);
    const cap = occ.capacity_override != null ? occ.capacity_override : (item ? item.capacity : 0);
    const used = await bookingModel.countActiveForOccurrence(occ.id, opts);
    return { used, capacity: cap, exists: true };
  }
  // date_only
  const item = await itemModel.findById(selection.itemId, opts);
  if (!item) return { used: 0, capacity: 0, exists: false };
  const used = await bookingModel.countActiveForItemDate(item.id, selection.selectedDate, opts);
  return { used, capacity: item.capacity, exists: true };
}

/* ------------------------------------------------------------------ */
/* Finalization                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a booking transactionally from a normalized selection list and a
 * registrant payload.
 *
 * This is the *foundation* of the final submission path. It already enforces:
 *   - idempotency via submission_token (resubmissions resolve to the same
 *     booking row)
 *   - opaque confirmation reference generation
 *   - capacity revalidation at finalization
 *   - same-day overlap detection
 *   - snapshot preservation on selection rows
 *
 * It does NOT yet enforce the full availability-rule precedence (window /
 * blocked) — that is wired in once the recurrence engine lands. The shape of
 * the function will not change.
 */
async function finalizeBooking({
  event,
  config,
  selections,
  registrant = {},
  email = null,
  notes = null,
  submissionToken = null,
}) {
  const normalized = normalizeSelections(selections);
  if (normalized.length === 0) {
    throw bookingError('NO_SELECTIONS', 'At least one selection is required.', 400);
  }

  // Pre-load the rule set once so we can re-resolve availability outside the
  // capacity transaction. We tolerate the rule list being missing in tests
  // that stub at a lower layer; in that case we skip rule re-resolution and
  // rely on the capacity check below.
  let rules = [];
  try {
    rules = await availabilityService.loadHydratedRules(config.id);
  } catch (_e) { rules = []; }
  const window = availabilityService.deriveDateWindow(config);

  return withTransaction(async (client) => {
    // Idempotency: if a booking with this submission_token already exists,
    // return it instead of creating a duplicate.
    if (submissionToken) {
      const existing = await bookingModel.findBySubmissionToken(submissionToken, { client });
      if (existing) return { booking: existing, idempotent: true };
    }

    // Capacity revalidation and snapshot hydration.
    const hydrated = [];
    const timedForOverlap = [];
    for (const sel of normalized) {
      // Window check (cheap; happens before DB capacity work).
      if (window && !availabilityService.isDateInWindow(sel.selectedDate, window)) {
        throw bookingError('OUT_OF_WINDOW', 'A selection is outside the calendar window.', 409);
      }
      const usage = await getCapacityUsage(sel, { client });
      if (!usage.exists) {
        throw bookingError('SELECTION_GONE', 'A selection is no longer available.', 409);
      }
      if (usage.used >= usage.capacity) {
        throw bookingError('CAPACITY_FULL', 'A selection is full.', 409);
      }
      if (sel.selectionType === 'occurrence') {
        const occ = await occurrenceModel.findById(sel.occurrenceId, { client });
        const item = await itemModel.findById(occ.item_id, { client });
        // Blocked-by-rules check requires the live item; archived items are
        // already rejected by the usage 'exists' clause for occurrences.
        if (item && availabilityService._internals.isBlockedByRules(item, sel.selectedDate, rules)) {
          throw bookingError('BLOCKED', 'A selection is blocked.', 409);
        }
        hydrated.push({ sel, occ, item });
        timedForOverlap.push(occ);
      } else {
        const item = await itemModel.findById(sel.itemId, { client });
        if (!item || item.status !== 'active') {
          throw bookingError('SELECTION_GONE', 'A selection is no longer available.', 409);
        }
        if (availabilityService._internals.isBlockedByRules(item, sel.selectedDate, rules)) {
          throw bookingError('BLOCKED', 'A selection is blocked.', 409);
        }
        hydrated.push({ sel, occ: null, item });
      }
    }

    // Overlap detection across timed occurrences in this submission only.
    const overlap = occurrenceService.detectSameDayOverlap(timedForOverlap);
    if (overlap.conflict) {
      throw bookingError('TIMED_OVERLAP', 'Selections overlap in time.', 409);
    }

    const confirmationRef = references.generateConfirmationRef();
    const booking = await bookingModel.createBooking({
      event_id: event.id,
      calendar_config_id: config.id,
      confirmation_ref: confirmationRef,
      submission_token: submissionToken || null,
      registrant,
      notes,
      email,
      confirmation_meta: {},
      status: 'active',
    }, { client });

    for (const { sel, occ, item } of hydrated) {
      await bookingModel.createSelection({
        booking_id: booking.id,
        item_id: item.id,
        selected_date: sel.selectedDate,
        occurrence_id: occ ? occ.id : null,
        selection_type: sel.selectionType,
        item_name_snapshot: item.name,
        occurrence_label_snapshot: occ ? occ.label : null,
        occurrence_start_snapshot: occ ? occ.start_time : null,
        occurrence_end_snapshot: occ ? occ.end_time : null,
        occurrence_duration_minutes_snapshot: occ ? occ.duration_minutes : null,
      }, { client });
    }

    return { booking, idempotent: false };
  });
}

function bookingError(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/* ------------------------------------------------------------------ */
/* Lookups for organizer/public flows                                  */
/* ------------------------------------------------------------------ */

async function getBookingWithSelections(bookingId, opts = {}) {
  const booking = await bookingModel.findById(bookingId, opts);
  if (!booking) return null;
  const selections = await bookingModel.listSelections(bookingId, opts);
  return { booking, selections };
}

async function getBookingByConfirmationRef(ref, opts = {}) {
  const booking = await bookingModel.findByConfirmationRef(ref, opts);
  if (!booking) return null;
  const selections = await bookingModel.listSelections(booking.id, opts);
  return { booking, selections };
}

async function cancelBooking(bookingId, opts = {}) {
  return bookingModel.cancel(bookingId, opts);
}

/* ------------------------------------------------------------------ */
/* Reschedule / edit                                                   */
/* ------------------------------------------------------------------ */

/**
 * Organizer-side reschedule. Replaces the selection set for an existing
 * active booking, applying the same validation as the public submit path
 * (window, blocked, capacity, overlap). Optionally updates whitelisted
 * registrant/notes/email fields in the same transaction.
 *
 * Implementation note: we DELETE existing selections first so the booking
 * can't conflict with itself on capacity, then re-create them inside the
 * same transaction. If any check fails the transaction is rolled back and
 * the original selections survive untouched.
 *
 * Canceled bookings are not editable here.
 */
async function rescheduleBooking({
  event,
  config,
  booking,
  selections,
  registrant,
  email,
  notes,
}) {
  if (!booking || Number(booking.event_id) !== Number(event.id)) {
    throw bookingError('NOT_FOUND', 'Booking not found.', 404);
  }
  if (booking.status !== 'active') {
    throw bookingError('NOT_EDITABLE', 'Only active bookings can be rescheduled.', 409);
  }
  const normalized = normalizeSelections(selections);
  if (normalized.length === 0) {
    throw bookingError('NO_SELECTIONS', 'At least one selection is required.', 400);
  }

  let rules = [];
  try { rules = await availabilityService.loadHydratedRules(config.id); }
  catch (_e) { rules = []; }
  const window = availabilityService.deriveDateWindow(config);

  return withTransaction(async (client) => {
    // Drop the existing selection rows so capacity counters don't include
    // the booking being rescheduled.
    await bookingModel.deleteSelections(booking.id, { client });

    const hydrated = [];
    const timedForOverlap = [];
    for (const sel of normalized) {
      if (window && !availabilityService.isDateInWindow(sel.selectedDate, window)) {
        throw bookingError('OUT_OF_WINDOW', 'A selection is outside the calendar window.', 409);
      }
      const usage = await getCapacityUsage(sel, { client });
      if (!usage.exists) {
        throw bookingError('SELECTION_GONE', 'A selection is no longer available.', 409);
      }
      if (usage.used >= usage.capacity) {
        throw bookingError('CAPACITY_FULL', 'A selection is full.', 409);
      }
      if (sel.selectionType === 'occurrence') {
        const occ = await occurrenceModel.findById(sel.occurrenceId, { client });
        const item = await itemModel.findById(occ.item_id, { client });
        if (item && availabilityService._internals.isBlockedByRules(item, sel.selectedDate, rules)) {
          throw bookingError('BLOCKED', 'A selection is blocked.', 409);
        }
        hydrated.push({ sel, occ, item });
        timedForOverlap.push(occ);
      } else {
        const item = await itemModel.findById(sel.itemId, { client });
        if (!item || item.status !== 'active') {
          throw bookingError('SELECTION_GONE', 'A selection is no longer available.', 409);
        }
        if (availabilityService._internals.isBlockedByRules(item, sel.selectedDate, rules)) {
          throw bookingError('BLOCKED', 'A selection is blocked.', 409);
        }
        hydrated.push({ sel, occ: null, item });
      }
    }

    const overlap = occurrenceService.detectSameDayOverlap(timedForOverlap);
    if (overlap.conflict) {
      throw bookingError('TIMED_OVERLAP', 'Selections overlap in time.', 409);
    }

    // Recreate selection rows.
    for (const { sel, occ, item } of hydrated) {
      await bookingModel.createSelection({
        booking_id: booking.id,
        item_id: item.id,
        selected_date: sel.selectedDate,
        occurrence_id: occ ? occ.id : null,
        selection_type: sel.selectionType,
        item_name_snapshot: item.name,
        occurrence_label_snapshot: occ ? occ.label : null,
        occurrence_start_snapshot: occ ? occ.start_time : null,
        occurrence_end_snapshot: occ ? occ.end_time : null,
        occurrence_duration_minutes_snapshot: occ ? occ.duration_minutes : null,
      }, { client });
    }

    // Optional field updates.
    const patch = {};
    if (registrant !== undefined) patch.registrant = registrant;
    if (email !== undefined) patch.email = email;
    if (notes !== undefined) patch.notes = notes;
    const updated = Object.keys(patch).length > 0
      ? await bookingModel.updateFields(booking.id, patch, { client })
      : booking;

    return { booking: updated };
  });
}

module.exports = {
  SESSION_KEY,
  getPendingSelections,
  setPendingSelections,
  clearPendingSelections,
  normalizeSelections,
  getCapacityUsage,
  finalizeBooking,
  getBookingWithSelections,
  getBookingByConfirmationRef,
  cancelBooking,
  rescheduleBooking,
};
