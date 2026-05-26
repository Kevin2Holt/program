'use strict';

// Event model. Minimal scaffolding sufficient for the calendar module's
// foundation; the full event lifecycle (versions, blocks, code history)
// lives in the main app spec and is built out in other phases.

const { pool } = require('../db/pool');

async function findById(id, { client = pool } = {}) {
  const r = await client.query('SELECT * FROM events WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function findByCode(code, { client = pool } = {}) {
  const r = await client.query('SELECT * FROM events WHERE code = $1', [code]);
  return r.rows[0] || null;
}

async function create({ code, title = '', ownerId = null }, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO events (code, title, owner_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [code, title, ownerId],
  );
  return r.rows[0];
}

module.exports = { findById, findByCode, create };
