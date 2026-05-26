'use strict';

// CalendarAvailabilityRule + CalendarAvailabilityRuleTarget model.
//
// Rules are persisted as rules and are evaluated on demand; we do NOT
// pre-generate blackout occurrence rows.

const { pool } = require('../db/pool');

const RULE_COLUMNS = `
  id, calendar_config_id, rule_type, target_scope, active,
  blocked_date, recurrence_pattern, recurrence_detail,
  recurrence_start_date, recurrence_end_date, reason,
  created_at, updated_at
`;

async function findById(id, { client = pool } = {}) {
  const r = await client.query(
    `SELECT ${RULE_COLUMNS} FROM calendar_availability_rules WHERE id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

async function listForConfig(configId, { activeOnly = false, client = pool } = {}) {
  const where = activeOnly ? 'AND active = TRUE' : '';
  const r = await client.query(
    `SELECT ${RULE_COLUMNS}
       FROM calendar_availability_rules
      WHERE calendar_config_id = $1 ${where}
      ORDER BY id ASC`,
    [configId],
  );
  return r.rows;
}

async function listTargets(ruleId, { client = pool } = {}) {
  const r = await client.query(
    `SELECT rule_id, item_id
       FROM calendar_availability_rule_targets
      WHERE rule_id = $1`,
    [ruleId],
  );
  return r.rows;
}

async function create(attrs, { client = pool } = {}) {
  const r = await client.query(
    `INSERT INTO calendar_availability_rules
       (calendar_config_id, rule_type, target_scope, active,
        blocked_date, recurrence_pattern, recurrence_detail,
        recurrence_start_date, recurrence_end_date, reason)
     VALUES ($1, $2, $3, COALESCE($4, TRUE),
             $5, $6, COALESCE($7, '{}'::jsonb),
             $8, $9, $10)
     RETURNING ${RULE_COLUMNS}`,
    [
      attrs.calendar_config_id,
      attrs.rule_type,
      attrs.target_scope,
      attrs.active,
      attrs.blocked_date || null,
      attrs.recurrence_pattern || null,
      attrs.recurrence_detail || {},
      attrs.recurrence_start_date || null,
      attrs.recurrence_end_date || null,
      attrs.reason || null,
    ],
  );
  return r.rows[0];
}

async function addTargets(ruleId, itemIds, { client = pool } = {}) {
  if (!itemIds || itemIds.length === 0) return;
  // Build a single multi-row insert.
  const values = itemIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO calendar_availability_rule_targets (rule_id, item_id)
     VALUES ${values}
     ON CONFLICT DO NOTHING`,
    [ruleId, ...itemIds],
  );
}

async function clearTargets(ruleId, { client = pool } = {}) {
  await client.query(
    `DELETE FROM calendar_availability_rule_targets WHERE rule_id = $1`,
    [ruleId],
  );
}

const UPDATABLE = new Set([
  'rule_type', 'target_scope', 'active',
  'blocked_date', 'recurrence_pattern', 'recurrence_detail',
  'recurrence_start_date', 'recurrence_end_date', 'reason',
]);

async function update(id, patch, { client = pool } = {}) {
  const keys = Object.keys(patch).filter((k) => UPDATABLE.has(k));
  if (keys.length === 0) return findById(id, { client });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const values = keys.map((k) => patch[k]);
  const r = await client.query(
    `UPDATE calendar_availability_rules SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1 RETURNING ${RULE_COLUMNS}`,
    [id, ...values],
  );
  return r.rows[0] || null;
}

/** Deactivate (preferred over destructive delete). */
async function deactivate(id, { client = pool } = {}) {
  return update(id, { active: false }, { client });
}

module.exports = {
  findById,
  listForConfig,
  listTargets,
  create,
  update,
  deactivate,
  addTargets,
  clearTargets,
};
