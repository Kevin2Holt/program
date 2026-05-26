'use strict';

// Schema-presence checks. We don't run live migrations here (CI doesn't
// provision a Postgres yet); instead we verify each expected table is
// defined in our SQL files. This keeps the schema definition under
// regression protection.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');

function allMigrationSql() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8') }));
}

test('every required calendar table is defined in migrations', () => {
  const sql = allMigrationSql().map((m) => m.sql).join('\n');
  const required = [
    'calendar_configs',
    'calendar_items',
    'calendar_occurrences',
    'calendar_bookings',
    'calendar_booking_selections',
    'calendar_availability_rules',
    'calendar_availability_rule_targets',
  ];
  for (const t of required) {
    const re = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${t}\\b`, 'i');
    assert.ok(re.test(sql), `migrations are missing CREATE TABLE ${t}`);
  }
});

test('core foundation tables (users, events, session) are defined', () => {
  const sql = allMigrationSql().map((m) => m.sql).join('\n');
  for (const t of ['users', 'session', 'events']) {
    const re = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${t}\\b`, 'i');
    assert.ok(re.test(sql), `migrations are missing CREATE TABLE ${t}`);
  }
});

test('bookings table has confirmation_ref and submission_token columns', () => {
  const sql = allMigrationSql().map((m) => m.sql).join('\n');
  assert.ok(/confirmation_ref\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(sql),
    'confirmation_ref column is missing or non-unique');
  assert.ok(/submission_token\s+TEXT\s+UNIQUE/i.test(sql),
    'submission_token column is missing or non-unique');
});

test('booking selections table carries snapshot columns', () => {
  const sql = allMigrationSql().map((m) => m.sql).join('\n');
  for (const col of [
    'item_name_snapshot',
    'occurrence_label_snapshot',
    'occurrence_start_snapshot',
    'occurrence_end_snapshot',
    'occurrence_duration_minutes_snapshot',
  ]) {
    assert.ok(new RegExp(col, 'i').test(sql), `selections table is missing ${col}`);
  }
});

test('migration runner splits UP/DOWN sections correctly', () => {
  const { splitMigration } = require('../../src/db/migrate');
  const sample = `-- UP\nCREATE TABLE foo();\n-- DOWN\nDROP TABLE foo;`;
  const { up, down } = splitMigration(sample);
  assert.ok(up.includes('CREATE TABLE foo'));
  assert.ok(down.includes('DROP TABLE foo'));
});

test('every migration file uses the -- UP marker', () => {
  for (const m of allMigrationSql()) {
    assert.ok(m.sql.includes('-- UP'), `${m.file} missing -- UP marker`);
  }
});
