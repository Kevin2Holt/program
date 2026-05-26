'use strict';

// calendarOccurrenceService — owns timed-occurrence lifecycle, form
// validation, and same-item overlap detection. Occurrences exist only for
// timed offerings (Phase 3 §timed mode); date-only items have no rows here.

const occurrenceModel = require('../models/calendarOccurrence');
const calendarItemModel = require('../models/calendarItem');
const calendarConfigService = require('./calendarConfigService');
const calendarAvailabilityService = require('./calendarAvailabilityService');

const MAX_CAPACITY = 100000;
const MIN_DURATION = 1;          // minutes
const MAX_DURATION = 24 * 60;    // 24h cap; multi-day occurrences are out of scope

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
  return n;
}

function isValidISODate(v) {
  if (!isNonEmptyString(v) || !ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === v;
}

function timeStringToMinutes(t) {
  if (!isNonEmptyString(t)) return null;
  const m = TIME_RE.exec(t.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToHHMM(min) {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Parse a raw POST body into an occurrence patch + field errors.
 *
 * Pure (no I/O). Window-boundary checking and same-day overlap detection
 * are layered on top by the persistence helpers since they need DB context.
 *
 * Inputs:
 *   item_id           required (create); ignored on edit
 *   service_date      ISO date
 *   start_time        HH:MM (24h)
 *   end_time          HH:MM (24h)         — either end_time OR duration_minutes
 *   duration_minutes  positive integer
 *   capacity_override optional positive integer
 *   label             optional short string
 */
function parseAndValidateForm(body = {}, { isCreate = true } = {}) {
  const errors = [];
  const patch = {};

  // --- item_id (create only) ---
  if (isCreate) {
    const itemId = toIntOrNull(body.item_id);
    if (itemId === null || Number.isNaN(itemId) || itemId < 1) {
      errors.push({ field: 'item_id', message: 'Choose an item.' });
    } else {
      patch.item_id = itemId;
    }
  }

  // --- service_date ---
  const date = isNonEmptyString(body.service_date) ? body.service_date.trim() : '';
  if (!date) {
    errors.push({ field: 'service_date', message: 'Service date is required.' });
  } else if (!isValidISODate(date)) {
    errors.push({ field: 'service_date', message: 'Service date must be a valid YYYY-MM-DD date.' });
  } else {
    patch.service_date = date;
  }

  // --- start_time ---
  const startStr = isNonEmptyString(body.start_time) ? body.start_time.trim() : '';
  const startMin = timeStringToMinutes(startStr);
  if (!startStr) {
    errors.push({ field: 'start_time', message: 'Start time is required.' });
  } else if (startMin === null) {
    errors.push({ field: 'start_time', message: 'Start time must be HH:MM (24h).' });
  } else {
    patch.start_time = minutesToHHMM(startMin);
  }

  // --- end_time / duration_minutes (exactly one) ---
  const endStr = isNonEmptyString(body.end_time) ? body.end_time.trim() : '';
  const durRaw = body.duration_minutes;
  const hasEnd = !!endStr;
  const hasDur = durRaw !== undefined && durRaw !== null && durRaw !== '';

  if (!hasEnd && !hasDur) {
    errors.push({ field: 'end_time', message: 'Provide an end time or a duration.' });
  } else if (hasEnd && hasDur) {
    errors.push({ field: 'end_time', message: 'Provide either an end time or a duration, not both.' });
  } else if (hasEnd) {
    const endMin = timeStringToMinutes(endStr);
    if (endMin === null) {
      errors.push({ field: 'end_time', message: 'End time must be HH:MM (24h).' });
    } else if (startMin !== null && endMin <= startMin) {
      errors.push({ field: 'end_time', message: 'End time must be after start time.' });
    } else if (startMin !== null && (endMin - startMin) > MAX_DURATION) {
      errors.push({ field: 'end_time', message: 'Occurrence may not span more than 24 hours.' });
    } else {
      patch.end_time = minutesToHHMM(endMin);
      patch.duration_minutes = null;
    }
  } else if (hasDur) {
    const dur = toIntOrNull(durRaw);
    if (dur === null || Number.isNaN(dur) || dur < MIN_DURATION) {
      errors.push({ field: 'duration_minutes', message: 'Duration must be a positive whole number of minutes.' });
    } else if (dur > MAX_DURATION) {
      errors.push({ field: 'duration_minutes', message: 'Duration may not exceed 24 hours.' });
    } else {
      patch.duration_minutes = dur;
      patch.end_time = null;
    }
  }

  // --- capacity_override ---
  if (body.capacity_override !== undefined && body.capacity_override !== '') {
    const co = toIntOrNull(body.capacity_override);
    if (co === null || Number.isNaN(co) || co < 1) {
      errors.push({ field: 'capacity_override', message: 'Capacity override must be a positive whole number.' });
    } else if (co > MAX_CAPACITY) {
      errors.push({ field: 'capacity_override', message: `Capacity override must be ${MAX_CAPACITY} or fewer.` });
    } else {
      patch.capacity_override = co;
    }
  } else {
    patch.capacity_override = null;
  }

  // --- label ---
  if (isNonEmptyString(body.label)) {
    const lbl = body.label.trim();
    if (lbl.length > 200) {
      errors.push({ field: 'label', message: 'Label must be 200 characters or fewer.' });
    } else {
      patch.label = lbl;
    }
  } else {
    patch.label = null;
  }

  return { patch, errors };
}

/**
 * Create an occurrence for an item. Validates that the parent item belongs
 * to the event, that the date falls inside the configured window, and that
 * the resulting interval does not overlap any other active occurrence on
 * the same item + same day. Throws structured 400/404 errors.
 */
async function createForItem(eventId, itemId, patch, opts = {}) {
  const item = await calendarItemModel.findById(itemId, opts);
  if (!item || Number(item.event_id) !== Number(eventId)) {
    throw notFound('Item not found for this event');
  }
  const config = await calendarConfigService.getOrCreateForEvent(eventId, opts);

  await assertWithinDateWindow(config, patch.service_date);
  await assertNoSameItemOverlap(itemId, patch, { ignoreOccurrenceId: null, opts });

  return occurrenceModel.create({ ...patch, item_id: itemId }, opts);
}

async function updateForEvent(eventId, occurrenceId, patch, opts = {}) {
  const existing = await occurrenceModel.findById(occurrenceId, opts);
  if (!existing) throw notFound('Occurrence not found');
  const item = await calendarItemModel.findById(existing.item_id, opts);
  if (!item || Number(item.event_id) !== Number(eventId)) {
    throw notFound('Occurrence not found for this event');
  }
  const config = await calendarConfigService.getOrCreateForEvent(eventId, opts);

  const merged = { ...existing, ...patch };
  await assertWithinDateWindow(config, merged.service_date);
  await assertNoSameItemOverlap(existing.item_id, merged, {
    ignoreOccurrenceId: Number(occurrenceId),
    opts,
  });

  return occurrenceModel.update(occurrenceId, patch, opts);
}

async function archiveForEvent(eventId, occurrenceId, opts = {}) {
  const existing = await occurrenceModel.findById(occurrenceId, opts);
  if (!existing) throw notFound('Occurrence not found');
  const item = await calendarItemModel.findById(existing.item_id, opts);
  if (!item || Number(item.event_id) !== Number(eventId)) {
    throw notFound('Occurrence not found for this event');
  }
  return occurrenceModel.archive(occurrenceId, opts);
}

async function findByIdForEvent(eventId, occurrenceId, opts = {}) {
  const existing = await occurrenceModel.findById(occurrenceId, opts);
  if (!existing) return null;
  const item = await calendarItemModel.findById(existing.item_id, opts);
  if (!item || Number(item.event_id) !== Number(eventId)) return null;
  return { ...existing, _item: item };
}

/**
 * List all occurrences for an event, grouped by item where the caller wants
 * them. Returns rows with `_item_name` joined in for view convenience.
 */
async function listForEvent(eventId, opts = {}) {
  const items = await calendarItemModel.listForEvent(eventId, { includeArchived: true, ...opts });
  const itemsById = new Map(items.map((i) => [Number(i.id), i]));
  const out = [];
  for (const item of items) {
    const occs = await occurrenceModel.listForItem(item.id, { includeArchived: true, ...opts });
    for (const occ of occs) {
      out.push({
        ...occ,
        _item: itemsById.get(Number(occ.item_id)) || null,
      });
    }
  }
  return out;
}

async function listForItem(itemId, opts = {}) {
  return occurrenceModel.listForItem(itemId, opts);
}

async function deactivate(id, opts = {}) {
  return occurrenceModel.deactivate(id, opts);
}

/* ------------------------------------------------------------------ */
/* Internal validation helpers                                         */
/* ------------------------------------------------------------------ */

async function assertWithinDateWindow(config, isoDate) {
  const window = calendarAvailabilityService.deriveDateWindow(config);
  if (!window) {
    // Window not yet configured — let the organizer save and surface a
    // softer warning elsewhere. The setup page already warns on incomplete
    // configuration, so we don't block CRUD here.
    return;
  }
  if (!calendarAvailabilityService.isDateInWindow(isoDate, window)) {
    throw badRequest(
      `Service date ${isoDate} is outside the configured calendar window (${window.start} → ${window.end}).`,
    );
  }
}

/**
 * Prevent overlapping active occurrences for the same item on the same day.
 *
 * Conservative default: organizers can always archive/recreate to resolve
 * conflicts, but the server will not silently store an overlap. This rule
 * applies to the item only — different items may share time windows freely.
 */
async function assertNoSameItemOverlap(itemId, patch, { ignoreOccurrenceId = null, opts = {} } = {}) {
  if (!patch.service_date || !patch.start_time) return;
  const sameDay = await occurrenceModel.listForItemInRange(
    itemId, patch.service_date, patch.service_date, opts,
  );
  const candidateWindow = windowFromPatch(patch);
  if (!candidateWindow) return;
  for (const occ of sameDay) {
    if (ignoreOccurrenceId !== null && Number(occ.id) === Number(ignoreOccurrenceId)) continue;
    if (occ.status !== 'active') continue;
    const other = occurrenceMinuteWindow(occ);
    if (!other) continue;
    if (intervalsOverlap(candidateWindow.startMin, candidateWindow.endMin, other.startMin, other.endMin)) {
      throw badRequest(
        `Overlaps an existing occurrence on ${patch.service_date} (${formatRange(other)}).`,
      );
    }
  }
}

function windowFromPatch(patch) {
  if (!patch.start_time) return null;
  const startMin = timeStringToMinutes(patch.start_time);
  if (startMin === null) return null;
  let endMin = null;
  if (patch.end_time) {
    endMin = timeStringToMinutes(patch.end_time);
  } else if (patch.duration_minutes != null) {
    endMin = startMin + Number(patch.duration_minutes);
  }
  if (endMin === null) return null;
  return { startMin, endMin };
}

function formatRange(win) {
  return `${minutesToHHMM(win.startMin)}–${minutesToHHMM(win.endMin)}`;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (re-exported for tests + booking service)              */
/* ------------------------------------------------------------------ */

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function occurrenceMinuteWindow(occ) {
  if (!occ || !occ.start_time) return null;
  const startMin = timeStringToMinutes(occ.start_time);
  if (startMin === null) return null;
  let endMin = null;
  if (occ.end_time) {
    endMin = timeStringToMinutes(occ.end_time);
  } else if (occ.duration_minutes != null) {
    endMin = startMin + Number(occ.duration_minutes);
  }
  if (endMin === null) return null;
  return { startMin, endMin };
}

function detectSameDayOverlap(occurrences) {
  const byDate = new Map();
  for (const occ of occurrences) {
    const date = String(occ.service_date).slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(occ);
  }
  for (const list of byDate.values()) {
    for (let i = 0; i < list.length; i++) {
      const wi = occurrenceMinuteWindow(list[i]);
      if (!wi) continue;
      for (let j = i + 1; j < list.length; j++) {
        const wj = occurrenceMinuteWindow(list[j]);
        if (!wj) continue;
        if (intervalsOverlap(wi.startMin, wi.endMin, wj.startMin, wj.endMin)) {
          return { conflict: true, pair: [list[i], list[j]] };
        }
      }
    }
  }
  return { conflict: false, pair: null };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'CALENDAR_OCCURRENCE_INVALID';
  return err;
}
function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  err.code = 'CALENDAR_OCCURRENCE_NOT_FOUND';
  return err;
}

module.exports = {
  MAX_CAPACITY,
  MIN_DURATION,
  MAX_DURATION,
  parseAndValidateForm,
  createForItem,
  updateForEvent,
  archiveForEvent,
  findByIdForEvent,
  listForEvent,
  listForItem,
  deactivate,
  // Pure helpers (kept exported for booking service + tests).
  intervalsOverlap,
  occurrenceMinuteWindow,
  detectSameDayOverlap,
};
