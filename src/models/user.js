'use strict';

// User model. Thin pg-backed repository; service layer owns validation,
// password hashing, and product rules.

const { pool } = require('../db/pool');

async function findById(id, { client = pool } = {}) {
  const r = await client.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function findByEmail(email, { client = pool } = {}) {
  const r = await client.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email],
  );
  return r.rows[0] || null;
}

async function create({ email, displayName = null, passwordHash }, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, displayName, passwordHash],
  );
  return r.rows[0];
}

async function updateDisplayName(id, displayName, { client = pool } = {}) {
  const r = await client.query(
    `UPDATE users SET display_name = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, displayName],
  );
  return r.rows[0] || null;
}

module.exports = { findById, findByEmail, create, updateDisplayName };
