'use strict';

// CalendarItem model. Items are archived (status='archived') rather than
// hard-deleted once they may participate in booking history.

const { pool } = require('../db/pool');

const COLUMNS = `
  id, calendar_config_id, event_id, name, capacity, color, shape,
  status, time_config, sort_order, created_at, updated_at
`;

async function findById(id, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${COLUMNS} FROM calendar_items WHERE id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

async function listForEvent(eventId, { includeArchived = false, client = pool } = {}) {
  const where = includeArchived ? '' : "AND status = 'active'";
  const r = await client.query(
    `SELECT ${COLUMNS}
       FROM calendar_items
      WHERE event_id = $1 ${where}
      ORDER BY sort_order ASC, id ASC`,
    [eventId],
  );
  return r.rows;
}

async function listForConfig(configId, { includeArchived = false, client = pool } = {}) {
  const where = includeArchived ? '' : "AND status = 'active'";
  const r = await client.query(
    `SELECT ${COLUMNS}
       FROM calendar_items
      WHERE calendar_config_id = $1 ${where}
      ORDER BY sort_order ASC, id ASC`,
    [configId],
  );
  return r.rows;
}

async function create(attrs, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO calendar_items
       (calendar_config_id, event_id, name, capacity, color, shape, status, time_config, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'active'), COALESCE($8, '{}'::jsonb), COALESCE($9, 0))
     RETURNING ${COLUMNS}`,
    [
      attrs.calendar_config_id,
      attrs.event_id,
      attrs.name,
      attrs.capacity,
      attrs.color,
      attrs.shape,
      attrs.status,
      attrs.time_config,
      attrs.sort_order,
    ],
  );
  return r.rows[0];
}

const UPDATABLE = new Set(['name', 'capacity', 'color', 'shape', 'time_config', 'sort_order']);

async function update(id, patch, { client = pool } = {}) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.has(k));
  if (keys.length === 0) return findById(id, { client });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => patch[k]);
  const r = await client.query(
    `UPDATE calendar_items
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, ...values],
  );
  return r.rows[0] || null;
}

/** Archive instead of deleting. Preserves booking history. */
async function archive(id, { client = pool } = {}) {
  const r = await client.query(
    `UPDATE calendar_items SET status = 'archived', updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return r.rows[0] || null;
}

/** Restore an archived item. */
async function unarchive(id, { client = pool } = {}) {
  const r = await client.query(
    `UPDATE calendar_items SET status = 'active', updated_at = NOW()
      WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return r.rows[0] || null;
}

module.exports = {
  findById,
  listForEvent,
  listForConfig,
  create,
  update,
  archive,
  unarchive,
};
