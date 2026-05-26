'use strict';

// calendarIcsService — produce RFC 5545 (iCalendar) text for a confirmed
// booking. No external dependency: the spec is small enough that handcrafting
// is simpler than pulling in `ical-generator` and its transitive deps.
//
// Output modes:
//   combined  (default): one VEVENT covering the booking
//   separate            : one VEVENT per selection
//
// Date-only selections produce all-day events. Timed selections produce
// time-bound events with a local timestamp + TZID, matching the configured
// event time zone (so calendar apps render the slot at the right wall-clock
// time regardless of viewer locale).

const PRODID = '-//PerplexityComputer//Calendar 1.0//EN';

/**
 * Build ICS text.
 *
 * @param {Object} input
 * @param {Object} input.event      — required: event row (id, code, name)
 * @param {Object} input.config     — required: calendar_config row
 * @param {Object} input.booking    — required: booking row (id, confirmation_ref)
 * @param {Array}  input.selections — required: array of booking_selections rows
 * @param {string} [input.mode]     — 'combined' | 'separate' (defaults from config)
 * @returns {string} CRLF-joined ICS text
 */
function buildIcs(input) {
  const { event, config, booking, selections } = input || {};
  if (!event || !config || !booking || !Array.isArray(selections)) {
    throw new Error('buildIcs requires { event, config, booking, selections }');
  }
  const mode = input.mode
    || (config.calendar_export_mode === 'separate' ? 'separate' : 'combined');
  const tz = config.event_time_zone || 'UTC';
  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push(`PRODID:${PRODID}`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');

  if (selections.length === 0) {
    // Still emit a marker so consumers don't choke on an empty calendar.
    lines.push(...buildPlaceholderVevent({ event, booking, tz }));
  } else if (mode === 'separate') {
    selections.forEach((sel, idx) => {
      lines.push(...buildVeventForSelection({ event, booking, sel, tz, index: idx }));
    });
  } else {
    lines.push(...buildCombinedVevent({ event, booking, selections, tz }));
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ */
/* VEVENT builders                                                     */
/* ------------------------------------------------------------------ */

function buildVeventForSelection({ event, booking, sel, tz, index }) {
  const out = [];
  const uid = `${booking.confirmation_ref}-${sel.id || index}@calendar`;
  const date = String(sel.selected_date).slice(0, 10);
  const summary = `${event.name || 'Booking'} — ${sel.item_name_snapshot || 'Item'}`;
  out.push('BEGIN:VEVENT');
  out.push(`UID:${escapeText(uid)}`);
  out.push(`DTSTAMP:${icsTimestampUtcNow()}`);
  out.push(`SUMMARY:${escapeText(summary)}`);

  if (sel.occurrence_start_snapshot && sel.occurrence_end_snapshot) {
    out.push(`DTSTART;TZID=${tz}:${icsLocalDateTime(date, sel.occurrence_start_snapshot)}`);
    out.push(`DTEND;TZID=${tz}:${icsLocalDateTime(date, sel.occurrence_end_snapshot)}`);
  } else {
    // All-day event spans a single date.
    const startCompact = compactDate(date);
    const endCompact = compactDate(addOneDay(date));
    out.push(`DTSTART;VALUE=DATE:${startCompact}`);
    out.push(`DTEND;VALUE=DATE:${endCompact}`);
  }
  const description = describeSelection(sel);
  if (description) out.push(`DESCRIPTION:${escapeText(description)}`);
  out.push('END:VEVENT');
  return out;
}

function buildCombinedVevent({ event, booking, selections, tz }) {
  const out = [];
  const uid = `${booking.confirmation_ref}@calendar`;
  out.push('BEGIN:VEVENT');
  out.push(`UID:${escapeText(uid)}`);
  out.push(`DTSTAMP:${icsTimestampUtcNow()}`);
  out.push(`SUMMARY:${escapeText(event.name || 'Booking')}`);

  // Compute combined window: min start to max end. All-day if no timed.
  const window = combinedWindow(selections);
  if (window.timed) {
    out.push(`DTSTART;TZID=${tz}:${icsLocalDateTime(window.startDate, window.startTime)}`);
    out.push(`DTEND;TZID=${tz}:${icsLocalDateTime(window.endDate, window.endTime)}`);
  } else {
    const startCompact = compactDate(window.startDate);
    const endCompact = compactDate(addOneDay(window.endDate));
    out.push(`DTSTART;VALUE=DATE:${startCompact}`);
    out.push(`DTEND;VALUE=DATE:${endCompact}`);
  }

  const lines = ['Selections:'];
  selections.forEach((sel) => {
    lines.push(`- ${describeSelection(sel)}`);
  });
  out.push(`DESCRIPTION:${escapeText(lines.join('\n'))}`);
  out.push('END:VEVENT');
  return out;
}

function buildPlaceholderVevent({ event, booking, tz: _tz }) {
  const out = [];
  const uid = `${booking.confirmation_ref}-empty@calendar`;
  out.push('BEGIN:VEVENT');
  out.push(`UID:${escapeText(uid)}`);
  out.push(`DTSTAMP:${icsTimestampUtcNow()}`);
  out.push(`SUMMARY:${escapeText(event.name || 'Booking')}`);
  // Default to today's date as a stub; consumers should ignore.
  const today = new Date();
  const date = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
  out.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
  out.push(`DTEND;VALUE=DATE:${compactDate(addOneDay(date))}`);
  out.push('END:VEVENT');
  return out;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function describeSelection(sel) {
  const parts = [];
  if (sel.item_name_snapshot) parts.push(sel.item_name_snapshot);
  parts.push(String(sel.selected_date).slice(0, 10));
  if (sel.occurrence_label_snapshot) parts.push(sel.occurrence_label_snapshot);
  if (sel.occurrence_start_snapshot) {
    let span = sel.occurrence_start_snapshot;
    if (sel.occurrence_end_snapshot) span += `–${sel.occurrence_end_snapshot}`;
    parts.push(span);
  }
  return parts.join(' · ');
}

function combinedWindow(selections) {
  let startDate = null;
  let endDate = null;
  let startTime = null;
  let endTime = null;
  let timed = false;
  selections.forEach((sel) => {
    const d = String(sel.selected_date).slice(0, 10);
    if (!startDate || d < startDate) startDate = d;
    if (!endDate || d > endDate) endDate = d;
    if (sel.occurrence_start_snapshot && sel.occurrence_end_snapshot) {
      timed = true;
      if (!startTime || (d === startDate && sel.occurrence_start_snapshot < startTime)) {
        startTime = sel.occurrence_start_snapshot;
      }
      if (!endTime || (d === endDate && sel.occurrence_end_snapshot > endTime)) {
        endTime = sel.occurrence_end_snapshot;
      }
    }
  });
  // If timed but startTime/endTime unset for boundary date, fall back to all-day shape.
  if (timed && (!startTime || !endTime)) timed = false;
  return { startDate, endDate, startTime, endTime, timed };
}

// "2025-06-12" -> "20250612"
function compactDate(yyyyMmDd) {
  return yyyyMmDd.replace(/-/g, '');
}

// "2025-06-12" + "09:30" or "09:30:00" -> "20250612T093000"
function icsLocalDateTime(date, time) {
  const d = compactDate(date);
  const parts = String(time || '00:00:00').split(':');
  const hh = pad2(parts[0] || '0');
  const mm = pad2(parts[1] || '0');
  const ss = pad2(parts[2] || '0');
  return `${d}T${hh}${mm}${ss}`;
}

function icsTimestampUtcNow(now = new Date()) {
  return `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
}

function pad2(n) {
  const s = String(n);
  return s.length < 2 ? '0'.repeat(2 - s.length) + s : s;
}

function addOneDay(yyyyMmDd) {
  // Date math via UTC midnight to avoid TZ drift.
  const [y, m, d] = yyyyMmDd.split('-').map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

// RFC 5545 §3.3.11 text escaping.
function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

module.exports = {
  buildIcs,
  _internals: { describeSelection, combinedWindow, icsLocalDateTime, escapeText, addOneDay },
};
