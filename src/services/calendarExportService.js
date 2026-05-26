'use strict';

// calendarExportService — owns organizer export filtering, field inclusion,
// detail levels, and CSV generation.
//
// Sensitive-data protection is enforced here at the service layer, not only
// in the UI (Phase 3 §13).

const bookingModel = require('../models/calendarBooking');

const DETAIL_LEVELS = Object.freeze({
  COUNT_ONLY: 'count_only',
  NAMES_ONLY: 'names_only',
  COUNT_AND_NAMES: 'count_and_names',
  NAMES_AND_CONTACT: 'names_and_contact',
});

const ALLOWED_FIELDS = Object.freeze([
  'name', 'phone', 'contact_method', 'number_type', 'email', 'notes',
]);

/**
 * Build a filtered, field-aware view of bookings + selections suitable for
 * CSV serialization. The service is the single boundary that enforces field
 * inclusion and detail level.
 *
 * Phase 4A: implements the filtering and projection skeleton. Full CSV
 * streaming and time-based filters are scoped to Phase 4B+ (export phase).
 */
async function buildExport({
  eventId,
  itemIds = null,
  dateRange = null,
  detailLevel = DETAIL_LEVELS.NAMES_ONLY,
  includeFields = ['name'],
}, opts = {}) {
  if (!Object.values(DETAIL_LEVELS).includes(detailLevel)) {
    const err = new Error(`Unknown detail level: ${detailLevel}`);
    err.status = 400;
    throw err;
  }
  const fields = (includeFields || []).filter((f) => ALLOWED_FIELDS.includes(f));

  const bookings = await bookingModel.listForEvent(eventId, opts);
  const rows = [];
  for (const b of bookings) {
    if (b.status !== 'active') continue;
    const selections = await bookingModel.listSelections(b.id, opts);
    const filtered = selections.filter((s) => {
      if (itemIds && itemIds.length > 0 && !itemIds.includes(Number(s.item_id))) return false;
      if (dateRange && (s.selected_date < dateRange.start || s.selected_date > dateRange.end)) {
        return false;
      }
      return true;
    });
    if (filtered.length === 0) continue;
    rows.push({ booking: b, selections: filtered });
  }

  return {
    detailLevel,
    fields,
    rows,
    summary: { bookingCount: rows.length },
  };
}

/**
 * Render an export object into CSV. Detail level decides which columns are
 * present; field inclusion decides which registrant columns are present.
 *
 * This is intentionally a small implementation: it handles the four locked
 * detail levels and the supported field set. Real CSV streaming, escaping
 * edge cases, and time-based filtering will be revisited in the export phase.
 */
function toCsv(exportResult) {
  const { detailLevel, fields, rows } = exportResult;
  const header = ['booking_id', 'confirmation_ref', 'selected_date', 'item_name'];
  if (detailLevel === DETAIL_LEVELS.COUNT_ONLY) {
    return csvEscape(['count']) + '\n' + csvEscape([String(exportResult.summary.bookingCount)]);
  }
  if (
    detailLevel === DETAIL_LEVELS.NAMES_ONLY ||
    detailLevel === DETAIL_LEVELS.COUNT_AND_NAMES ||
    detailLevel === DETAIL_LEVELS.NAMES_AND_CONTACT
  ) {
    if (!fields.includes('name')) header.push('name');
    for (const f of fields) header.push(f);
  }
  const lines = [csvEscape(header)];
  for (const { booking, selections } of rows) {
    const reg = booking.registrant || {};
    for (const sel of selections) {
      const base = [
        String(booking.id),
        booking.confirmation_ref,
        String(sel.selected_date).slice(0, 10),
        sel.item_name_snapshot,
      ];
      if (
        detailLevel === DETAIL_LEVELS.NAMES_ONLY ||
        detailLevel === DETAIL_LEVELS.COUNT_AND_NAMES ||
        detailLevel === DETAIL_LEVELS.NAMES_AND_CONTACT
      ) {
        if (!fields.includes('name')) base.push(reg.name || '');
        for (const f of fields) base.push(stringifyField(reg, f, booking));
      }
      lines.push(csvEscape(base));
    }
  }
  return lines.join('\n');
}

function stringifyField(registrant, field, booking) {
  if (field === 'email') return booking.email || registrant.email || '';
  if (field === 'notes') return booking.notes || '';
  return registrant[field] || '';
}

function csvEscape(values) {
  return values.map((v) => {
    const s = String(v == null ? '' : v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',');
}

module.exports = {
  DETAIL_LEVELS,
  ALLOWED_FIELDS,
  buildExport,
  toCsv,
};
