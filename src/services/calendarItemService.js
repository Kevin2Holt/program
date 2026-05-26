'use strict';

// calendarItemService — owns CalendarItem lifecycle and form validation.
//
// The model layer (models/calendarItem.js) is intentionally permissive; this
// service is the single source of truth for what a valid item looks like and
// what an organizer is allowed to change. Controllers must call
// `parseAndValidateForm(body)` to turn a form payload into a model patch and
// a list of field errors, then call `createForEvent`/`updateForEvent`/
// `archiveForEvent` to persist.
//
// Item status is `'active'` or `'archived'`. Items are archived rather than
// hard-deleted once they may participate in booking history (Phase 3 §items).

const calendarItemModel = require('../models/calendarItem');
const calendarConfigService = require('./calendarConfigService');

// Bounded palette so organizer input cannot inject arbitrary CSS color
// strings. Tokens map to the same custom-property palette used by the rest
// of the calendar UI; if a future phase widens this list, validation
// updates here automatically.
const COLOR_PALETTE = Object.freeze([
  '#7aa2f7', // blue
  '#9ece6a', // green
  '#e0af68', // amber
  '#f7768e', // pink
  '#bb9af7', // purple
  '#7dcfff', // cyan
  '#ff9e64', // orange
  '#c0caf5', // muted
]);

// Single-character shape glyphs (kept ASCII-safe so URL/CSV exports survive).
const SHAPE_SET = Object.freeze(['●', '■', '▲', '◆', '★', '♥', '♣', '✚']);

const STATUS_SET = Object.freeze(['active', 'archived']);

const DEFAULT_COLOR = COLOR_PALETTE[0];
const DEFAULT_SHAPE = SHAPE_SET[0];

const MAX_NAME_LEN = 120;
const MAX_CAPACITY = 100000;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
  return n;
}

/**
 * Parse a raw POST body into an item patch + field error list.
 *
 * Pure: does not touch the database. Used by controllers and tests.
 *
 * @param {object} body                 Raw req.body.
 * @param {object} [opts]
 * @param {boolean} [opts.isCreate=true] When true, missing-but-not-provided
 *                                       fields fall through to defaults.
 *                                       When false (edit), only fields that
 *                                       appear in body are validated.
 * @returns {{ patch: object, errors: Array<{field:string,message:string}> }}
 */
function parseAndValidateForm(body = {}, { isCreate = true } = {}) {
  const errors = [];
  const patch = {};

  // --- name ---
  const name = isNonEmptyString(body.name) ? body.name.trim() : '';
  if (!name) {
    errors.push({ field: 'name', message: 'Name is required.' });
  } else if (name.length > MAX_NAME_LEN) {
    errors.push({ field: 'name', message: `Name must be ${MAX_NAME_LEN} characters or fewer.` });
  } else {
    patch.name = name;
  }

  // --- capacity ---
  const cap = toIntOrNull(body.capacity);
  if (cap === null) {
    if (isCreate) {
      // Sensible default for date-only / single-slot items.
      patch.capacity = 1;
    } else {
      errors.push({ field: 'capacity', message: 'Capacity is required.' });
    }
  } else if (Number.isNaN(cap) || cap < 1) {
    errors.push({ field: 'capacity', message: 'Capacity must be a positive whole number.' });
  } else if (cap > MAX_CAPACITY) {
    errors.push({ field: 'capacity', message: `Capacity must be ${MAX_CAPACITY} or fewer.` });
  } else {
    patch.capacity = cap;
  }

  // --- color ---
  const color = isNonEmptyString(body.color) ? body.color.trim() : '';
  if (!color) {
    if (isCreate) patch.color = DEFAULT_COLOR;
    else errors.push({ field: 'color', message: 'Color is required.' });
  } else if (!COLOR_PALETTE.includes(color)) {
    errors.push({ field: 'color', message: 'Color must be from the supported palette.' });
  } else {
    patch.color = color;
  }

  // --- shape ---
  const shape = isNonEmptyString(body.shape) ? body.shape.trim() : '';
  if (!shape) {
    if (isCreate) patch.shape = DEFAULT_SHAPE;
    else errors.push({ field: 'shape', message: 'Shape is required.' });
  } else if (!SHAPE_SET.includes(shape)) {
    errors.push({ field: 'shape', message: 'Shape must be from the supported set.' });
  } else {
    patch.shape = shape;
  }

  // --- sort_order (optional) ---
  if (body.sort_order !== undefined && body.sort_order !== '') {
    const so = toIntOrNull(body.sort_order);
    if (Number.isNaN(so) || so === null) {
      errors.push({ field: 'sort_order', message: 'Sort order must be a whole number.' });
    } else {
      patch.sort_order = so;
    }
  } else if (isCreate) {
    patch.sort_order = 0;
  }

  // status changes go through archive/unarchive helpers, not form patch.
  return { patch, errors };
}

/**
 * Create an item for the given event. Auto-resolves the calendar_config_id.
 * Throws a 400-shaped error if the patch is invalid product-rule-wise.
 */
async function createForEvent(eventId, patch, opts = {}) {
  const cfg = await calendarConfigService.getOrCreateForEvent(eventId, opts);
  validateProductRules(patch);
  return calendarItemModel.create(
    {
      ...patch,
      calendar_config_id: cfg.id,
      event_id: eventId,
      status: 'active',
    },
    opts,
  );
}

/**
 * Update an item by id. Caller must ensure the item belongs to the event;
 * the route layer does this via `findById` + ownership check before dispatch.
 */
async function updateForEvent(eventId, itemId, patch, opts = {}) {
  const existing = await calendarItemModel.findById(itemId, opts);
  if (!existing || Number(existing.event_id) !== Number(eventId)) {
    throw notFound('Item not found for this event');
  }
  validateProductRules(patch);
  return calendarItemModel.update(itemId, patch, opts);
}

async function archiveForEvent(eventId, itemId, opts = {}) {
  const existing = await calendarItemModel.findById(itemId, opts);
  if (!existing || Number(existing.event_id) !== Number(eventId)) {
    throw notFound('Item not found for this event');
  }
  return calendarItemModel.archive(itemId, opts);
}

async function unarchiveForEvent(eventId, itemId, opts = {}) {
  const existing = await calendarItemModel.findById(itemId, opts);
  if (!existing || Number(existing.event_id) !== Number(eventId)) {
    throw notFound('Item not found for this event');
  }
  return calendarItemModel.unarchive(itemId, opts);
}

async function findByIdForEvent(eventId, itemId, opts = {}) {
  const existing = await calendarItemModel.findById(itemId, opts);
  if (!existing || Number(existing.event_id) !== Number(eventId)) return null;
  return existing;
}

async function listForEvent(eventId, opts = {}) {
  return calendarItemModel.listForEvent(eventId, { includeArchived: true, ...opts });
}

/** Re-run product rules on a patch even if it didn't come from the form layer. */
function validateProductRules(patch) {
  if (patch.capacity !== undefined && (
    !Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > MAX_CAPACITY
  )) {
    throw badRequest('Invalid capacity');
  }
  if (patch.color !== undefined && !COLOR_PALETTE.includes(patch.color)) {
    throw badRequest('Invalid color');
  }
  if (patch.shape !== undefined && !SHAPE_SET.includes(patch.shape)) {
    throw badRequest('Invalid shape');
  }
  if (patch.status !== undefined && !STATUS_SET.includes(patch.status)) {
    throw badRequest('Invalid status');
  }
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'CALENDAR_ITEM_INVALID';
  return err;
}
function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  err.code = 'CALENDAR_ITEM_NOT_FOUND';
  return err;
}

module.exports = {
  COLOR_PALETTE,
  SHAPE_SET,
  STATUS_SET,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  MAX_NAME_LEN,
  MAX_CAPACITY,
  parseAndValidateForm,
  createForEvent,
  updateForEvent,
  archiveForEvent,
  unarchiveForEvent,
  findByIdForEvent,
  listForEvent,
};
