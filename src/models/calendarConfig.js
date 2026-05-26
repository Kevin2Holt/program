'use strict';

// CalendarConfig model: one row per event when the calendar module exists
// for that event. The config row owns event-level structured configuration
// (form fields, export defaults, confirmation behavior, time zone, etc.).

const { pool } = require('../db/pool');

const COLUMNS = `
  id, event_id, title, enabled, public_visibility_state,
  date_window_mode, fixed_start_date, fixed_end_date,
  rolling_window_unit, rolling_window_size,
  time_behavior_mode, event_time_zone,
  notes_enabled, email_confirmation_enabled,
  add_to_calendar_enabled, calendar_export_mode,
  form_config, export_defaults,
  created_at, updated_at
`;

async function findByEventId(eventId, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${COLUMNS} FROM calendar_configs WHERE event_id = $1`,
    [eventId],
  );
  return r.rows[0] || null;
}

async function findById(id, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${COLUMNS} FROM calendar_configs WHERE id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

async function create(eventId, attrs = {}, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO calendar_configs (event_id, title)
     VALUES ($1, COALESCE($2, 'Calendar'))
     RETURNING ${COLUMNS}`,
    [eventId, attrs.title || null],
  );
  return r.rows[0];
}

/**
 * Update arbitrary CalendarConfig columns. Caller supplies a partial of the
 * column-keyed shape; unknown keys are ignored. This is intentionally
 * permissive at the model layer — service-layer code is responsible for
 * validating allowed transitions (e.g. "email confirmation requires email
 * collection enabled").
 */
const UPDATABLE_COLUMNS = new Set([
  'title', 'enabled', 'public_visibility_state',
  'date_window_mode', 'fixed_start_date', 'fixed_end_date',
  'rolling_window_unit', 'rolling_window_size',
  'time_behavior_mode', 'event_time_zone',
  'notes_enabled', 'email_confirmation_enabled',
  'add_to_calendar_enabled', 'calendar_export_mode',
  'form_config', 'export_defaults',
]);

async function update(id, patch, { client = pool } = {}) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE_COLUMNS.has(k));
  if (keys.length === 0) return findById(id, { client });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => patch[k]);
  const r = await client.query(
    `UPDATE calendar_configs
       SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, ...values],
  );
  return r.rows[0] || null;
}

module.exports = { findByEventId, findById, create, update };
