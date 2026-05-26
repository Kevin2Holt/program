'use strict';

// Single shared PostgreSQL pool. Tests may swap this out via dependency
// injection or by setting DATABASE_URL to a test database.

const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  // Reasonable defaults; tune per deploy.
  max: env.isTest ? 4 : 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Surface idle client errors so they don't silently crash the process.
  // Real apps would forward to a logger.
  // eslint-disable-next-line no-console
  console.error('[pg] idle client error', err);
});

/**
 * Run a function inside a transaction. Commits on success, rolls back on
 * error. The callback receives a pg client and must use it for all queries.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
