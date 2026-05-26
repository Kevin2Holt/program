'use strict';

// CalendarOccurrence model. Used only for timed offerings; date-only items
// do not require occurrence rows.

const { pool } = require('../db/pool');

const COLUMNS = `
  id, item_id, service_date, start_time, end_time, duration_minutes,
  label, capacity_override, status, created_at, updated_at
`;

async function findById(id, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${COLUMNS} FROM calendar_occurrences WHERE id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

async function listForItem(itemId, { includeArchived = false, client = pool } = {}) {
  const where = includeArchived ? '' : "AND status = 'active'";
  const r = await client.query(
    `SELECT ${COLUMNS}
       FROM calendar_occurrences
      WHERE item_id = $1 ${where}
      ORDER BY service_date ASC, start_time ASC NULLS FIRST, id ASC`,
    [itemId],
  );
  return r.rows;
}

async function listForItemInRange(itemId, startDate, endDate, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${COLUMNS}
       FROM calendar_occurrences
      WHERE item_id = $1
        AND status = 'active'
        AND service_date BETWEEN $2 AND $3
      ORDER BY service_date ASC, start_time ASC NULLS FIRST, id ASC`,
    [itemId, startDate, endDate],
  );
  return r.rows;
}

async function create(attrs, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO calendar_occurrences
       (item_id, service_date, start_time, end_time, duration_minutes,
        label, capacity_override, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'active'))
     RETURNING ${COLUMNS}`,
    [
      attrs.item_id,
      attrs.service_date,
      attrs.start_time || null,
      attrs.end_time || null,
      attrs.duration_minutes || null,
      attrs.label || null,
      attrs.capacity_override || null,
      attrs.status,
    ],
  );
  return r.rows[0];
}

const UPDATABLE = new Set([
  'service_date', 'start_time', 'end_time', 'duration_minutes',
  'label', 'capacity_override',
]);

async function update(id, patch, { client = pool } = {}) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.has(k));
  if (keys.length === 0) return findById(id, { client });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => patch[k]);
  const r = await client.query(
    `UPDATE calendar_occurrences SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...values],
  );
  return r.rows[0] || null;
}

/** Mark an occurrence as no longer offered publicly. Existing bookings remain. */
async function deactivate(id, { client = pool } = {}) {
  const r = await client.query(
    `UPDATE calendar_occurrences SET status = 'not_offered', updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return r.rows[0] || null;
}

async function archive(id, { client = pool } = {}) {
  const r = await client.query(
    `UPDATE calendar_occurrences SET status = 'archived', updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return r.rows[0] || null;
}

module.exports = {
  findById,
  listForItem,
  listForItemInRange,
  create,
  update,
  deactivate,
  archive,
};
