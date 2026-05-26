#!/usr/bin/env node
'use strict';

// Minimal, dependency-free migration runner.
//
// Migrations live in src/db/migrations as numbered SQL files. Each file is
// applied at most once. The runner records applied filenames in a
// `schema_migrations` table.
//
// Usage:
//   node src/db/migrate.js up       Apply all pending migrations
//   node src/db/migrate.js down     Roll back the most recently applied
//                                   migration if it has a `-- DOWN` marker.
//
// Migration file format:
//   -- UP
//   <SQL statements>
//   -- DOWN
//   <optional reverse SQL>

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function splitMigration(sql) {
  const upMarker = sql.indexOf('-- UP');
  const downMarker = sql.indexOf('-- DOWN');
  if (upMarker === -1) {
    return { up: sql, down: null };
  }
  const upStart = upMarker + '-- UP'.length;
  if (downMarker === -1) {
    return { up: sql.slice(upStart).trim(), down: null };
  }
  return {
    up: sql.slice(upStart, downMarker).trim(),
    down: sql.slice(downMarker + '-- DOWN'.length).trim(),
  };
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function listApplied() {
  const r = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return r.rows.map((r) => r.filename);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function up() {
  await ensureTable();
  const applied = new Set(await listApplied());
  const files = listMigrationFiles();
  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const full = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(full, 'utf8');
    const { up: upSql } = splitMigration(sql);
    process.stdout.write(`Applying ${file} ... `);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(upSql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      process.stdout.write('ok\n');
      appliedCount += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      process.stdout.write('FAILED\n');
      throw err;
    } finally {
      client.release();
    }
  }
  if (appliedCount === 0) process.stdout.write('No pending migrations.\n');
}

async function down() {
  await ensureTable();
  const applied = await listApplied();
  if (applied.length === 0) {
    process.stdout.write('Nothing to roll back.\n');
    return;
  }
  const last = applied[applied.length - 1];
  const full = path.join(MIGRATIONS_DIR, last);
  const sql = fs.readFileSync(full, 'utf8');
  const { down: downSql } = splitMigration(sql);
  if (!downSql) {
    throw new Error(`Migration ${last} has no -- DOWN section.`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(downSql);
    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [last]);
    await client.query('COMMIT');
    process.stdout.write(`Rolled back ${last}.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const cmd = process.argv[2] || 'up';
  try {
    if (cmd === 'up') await up();
    else if (cmd === 'down') await down();
    else throw new Error(`Unknown command: ${cmd}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

module.exports = { up, down, splitMigration, listMigrationFiles };
