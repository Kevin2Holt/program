'use strict';

// calendarOccurrenceService — owns timed-occurrence lifecycle and overlap
// detection. Occurrences exist only for timed offerings (Phase 3 §9).

const occurrenceModel = require('../models/calendarOccurrence');

async function listForItem(itemId, opts = {}) {
  return occurrenceModel.listForItem(itemId, opts);
}

async function createForItem(itemId, attrs, opts = {}) {
  // TODO(phase-4b+): validate duration vs start/end consistency, enforce
  // overlap rules across occurrences of the same item if the organizer enables
  // overlap prevention at the occurrence level, and normalize timezone-naive
  // times against the canonical event time zone.
  return occurrenceModel.create({ ...attrs, item_id: itemId }, opts);
}

async function deactivate(id, opts = {}) {
  return occurrenceModel.deactivate(id, opts);
}

/**
 * Pure helper: do two same-day time intervals overlap?
 *
 * Inputs are minute-of-day integers (0..1440). Intervals are treated as
 * [start, end). Adjacent intervals do not overlap.
 *
 * Date-only items never participate in overlap logic; the booking service
 * is responsible for filtering those out before calling this helper.
 */
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Compute (startMinutes, endMinutes) from an occurrence row. Returns null if
 * the occurrence is not time-bound.
 */
function occurrenceMinuteWindow(occ) {
  if (!occ || !occ.start_time) return null;
  const startMin = timeStringToMinutes(occ.start_time);
  let endMin = null;
  if (occ.end_time) {
    endMin = timeStringToMinutes(occ.end_time);
  } else if (occ.duration_minutes != null) {
    endMin = startMin + Number(occ.duration_minutes);
  }
  if (endMin == null) return null;
  return { startMin, endMin };
}

function timeStringToMinutes(t) {
  // Accept 'HH:MM' or 'HH:MM:SS'.
  const parts = String(t).split(':').map(Number);
  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  return hh * 60 + mm;
}

/**
 * Detect overlap among a set of occurrences scheduled on the same date. Used
 * by the booking service when validating a multi-occurrence submission.
 *
 * @returns {{conflict: boolean, pair: [occA, occB] | null}}
 */
function detectSameDayOverlap(occurrences) {
  // Group by service_date so cross-day pairs never count as conflicts.
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

module.exports = {
  listForItem,
  createForItem,
  deactivate,
  intervalsOverlap,
  occurrenceMinuteWindow,
  detectSameDayOverlap,
};
