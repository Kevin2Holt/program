'use strict';

// CalendarBooking + CalendarBookingSelection model.
//
// A booking parent record groups registrant data and metadata. Child selection
// rows represent the individual item/date or item/occurrence choices. Selection
// rows carry history-preserving snapshot columns so old bookings remain
// understandable even after items/occurrences change.

const { pool } = require('../db/pool');

const BOOKING_COLUMNS = `
  id, event_id, calendar_config_id, confirmation_ref, submission_token,
  registrant, notes, email, confirmation_meta, status,
  created_at, updated_at
`;

const SELECTION_COLUMNS = `
  id, booking_id, item_id, selected_date, occurrence_id, selection_type,
  item_name_snapshot, occurrence_label_snapshot,
  occurrence_start_snapshot, occurrence_end_snapshot,
  occurrence_duration_minutes_snapshot,
  created_at, updated_at
`;

async function findById(id, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM calendar_bookings WHERE id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

async function findByConfirmationRef(ref, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM calendar_bookings WHERE confirmation_ref = $1`,
    [ref],
  );
  return r.rows[0] || null;
}

async function findBySubmissionToken(token, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM calendar_bookings WHERE submission_token = $1`,
    [token],
  );
  return r.rows[0] || null;
}

async function listForEvent(eventId, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${BOOKING_COLUMNS}
       FROM calendar_bookings
      WHERE event_id = $1
      ORDER BY created_at DESC, id DESC`,
    [eventId],
  );
  return r.rows;
}

async function listSelections(bookingId, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${SELECTION_COLUMNS}
       FROM calendar_booking_selections
      WHERE booking_id = $1
      ORDER BY selected_date ASC, id ASC`,
    [bookingId],
  );
  return r.rows;
}

async function createBooking(attrs, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO calendar_bookings
       (event_id, calendar_config_id, confirmation_ref, submission_token,
        registrant, notes, email, confirmation_meta, status)
     VALUES ($1, $2, $3, $4,
             COALESCE($5, '{}'::jsonb), $6, $7,
             COALESCE($8, '{}'::jsonb), COALESCE($9, 'active'))
     RETURNING ${BOOKING_COLUMNS}`,
    [
      attrs.event_id,
      attrs.calendar_config_id,
      attrs.confirmation_ref,
      attrs.submission_token || null,
      attrs.registrant || {},
      attrs.notes || null,
      attrs.email || null,
      attrs.confirmation_meta || {},
      attrs.status,
    ],
  );
  return r.rows[0];
}

async function createSelection(attrs, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO calendar_booking_selections
       (booking_id, item_id, selected_date, occurrence_id, selection_type,
        item_name_snapshot, occurrence_label_snapshot,
        occurrence_start_snapshot, occurrence_end_snapshot,
        occurrence_duration_minutes_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${SELECTION_COLUMNS}`,
    [
      attrs.booking_id,
      attrs.item_id,
      attrs.selected_date,
      attrs.occurrence_id || null,
      attrs.selection_type,
      attrs.item_name_snapshot,
      attrs.occurrence_label_snapshot || null,
      attrs.occurrence_start_snapshot || null,
      attrs.occurrence_end_snapshot || null,
      attrs.occurrence_duration_minutes_snapshot || null,
    ],
  );
  return r.rows[0];
}

async function cancel(id, { client = pool } = {}) {
  const r = await client.query(
    `UPDATE calendar_bookings SET status = 'canceled', updated_at = NOW()
      WHERE id = $1 RETURNING ${BOOKING_COLUMNS}`,
    [id],
  );
  return r.rows[0] || null;
}

/**
 * Count active capacity usage for a given (item, date) tuple. Used by
 * date-only capacity checks. Counts only bookings with status='active'.
 */
async function countActiveForItemDate(itemId, isoDate, { client = pool } = {}) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM calendar_booking_selections s
       JOIN calendar_bookings b ON b.id = s.booking_id
      WHERE s.item_id = $1
        AND s.selected_date = $2
        AND s.selection_type = 'date_only'
        AND b.status = 'active'`,
    [itemId, isoDate],
  );
  return r.rows[0].n;
}

/** Count active capacity usage for a given occurrence. */
async function countActiveForOccurrence(occurrenceId, { client = pool } = {}) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM calendar_booking_selections s
       JOIN calendar_bookings b ON b.id = s.booking_id
      WHERE s.occurrence_id = $1
        AND s.selection_type = 'occurrence'
        AND b.status = 'active'`,
    [occurrenceId],
  );
  return r.rows[0].n;
}

module.exports = {
  findById,
  findByConfirmationRef,
  findBySubmissionToken,
  listForEvent,
  listSelections,
  createBooking,
  createSelection,
  cancel,
  countActiveForItemDate,
  countActiveForOccurrence,
};
