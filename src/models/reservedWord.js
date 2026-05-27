'use strict';

// reservedWord — thin pg-backed lookup. Lower-case match.

const { pool } = require('../db/pool');

async function isReserved(word, { client = pool } = {}) {
  if (!word) return false;
  const r = await client.query(
    'SELECT 1 FROM reserved_words WHERE LOWER(word) = LOWER($1) LIMIT 1',
    [String(word)],
  );
  return r.rowCount > 0;
}

async function list({ client = pool } = {}) {
  const r = await client.query('SELECT word, reason FROM reserved_words ORDER BY word');
  return r.rows;
}

module.exports = { isReserved, list };
