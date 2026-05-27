'use strict';

// eventService — event-code validation and creation, plus owner membership.
// Code rules (Phase: auth + create scaffold):
//   - lowercase letters, digits, and hyphens
//   - must not start or end with a hyphen
//   - 3..32 characters
//   - must not collide with reserved_words (case-insensitive)
//   - must not collide with existing events.code (case-insensitive)
// Old-code history is part of the broader spec and is not consulted here.

const { pool, withTransaction } = require('../db/pool');
const eventModel = require('../models/event');
const reservedWordModel = require('../models/reservedWord');

const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_CODE = 3;
const MAX_CODE = 32;
const MAX_TITLE = 200;

function fieldErrors(errorsByField) {
  const err = new Error('Validation failed');
  err.status = 400;
  err.code = 'VALIDATION';
  err.errorsByField = errorsByField;
  return err;
}

function normalizeCode(raw) {
  return (raw || '').trim().toLowerCase();
}

function validateCodeShape(code) {
  if (!code) return ['Event code is required.'];
  if (code.length < MIN_CODE) return [`Event code must be at least ${MIN_CODE} characters.`];
  if (code.length > MAX_CODE) return [`Event code must be at most ${MAX_CODE} characters.`];
  if (!CODE_RE.test(code)) {
    return ['Event code may contain lowercase letters, digits, and hyphens only (no leading or trailing hyphen).'];
  }
  return null;
}

async function validateAvailability(code, { client = pool } = {}) {
  if (await reservedWordModel.isReserved(code, { client })) {
    return ['This code is reserved. Please choose another.'];
  }
  const existing = await eventModel.findByCode(code, { client });
  if (existing) return ['This code is already in use.'];
  return null;
}

/**
 * Create an event owned by `userId`. Inserts an event_members row in the
 * same transaction so ownership is consistent.
 */
async function createEvent({ userId, code, title }) {
  if (!userId) {
    const err = new Error('Authenticated user required.');
    err.status = 401;
    throw err;
  }
  const cleanCode = normalizeCode(code);
  const cleanTitle = (title || '').trim();

  const errs = {};
  const shape = validateCodeShape(cleanCode);
  if (shape) errs.code = shape;
  if (!cleanTitle) errs.title = ['Event title is required.'];
  else if (cleanTitle.length > MAX_TITLE) errs.title = [`Title must be at most ${MAX_TITLE} characters.`];

  if (Object.keys(errs).length > 0) throw fieldErrors(errs);

  return withTransaction(async (client) => {
    const avail = await validateAvailability(cleanCode, { client });
    if (avail) throw fieldErrors({ code: avail });

    const event = await eventModel.create({
      code: cleanCode,
      title: cleanTitle,
      ownerId: userId,
    }, { client });

    await client.query(
      `INSERT INTO event_members (event_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [event.id, userId],
    );

    return event;
  });
}

/**
 * List events the user can see (owned or member of).
 */
async function listForUser(userId, { client = pool } = {}) {
  if (!userId) return [];
  const r = await client.query(
    `SELECT e.*
       FROM events e
       LEFT JOIN event_members em
              ON em.event_id = e.id AND em.user_id = $1
      WHERE e.owner_id = $1 OR em.user_id IS NOT NULL
      ORDER BY e.updated_at DESC, e.id DESC`,
    [userId],
  );
  return r.rows;
}

module.exports = {
  createEvent,
  listForUser,
  validateCodeShape,
  validateAvailability,
  normalizeCode,
  _internals: { CODE_RE, MIN_CODE, MAX_CODE, fieldErrors },
};
