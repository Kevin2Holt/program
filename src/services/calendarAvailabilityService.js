'use strict';

// calendarAvailabilityService — owns derivation of availability state.
//
// Phase 3 establishes a fixed precedence:
//   1. Date window boundary
//   2. Item active/archive status
//   3. One-time and recurring block rules
//   4. Remaining capacity
//
// One-time rules take precedence over recurring rules when both apply to the
// same date (recommended Phase 2 rule).
//
// Public-facing derivation collapses blocked + full into "unavailable".
// Organizer-facing derivation distinguishes available / full / blocked.
//
// This file scaffolds the public surface; the recurrence engine and the
// fine-grained per-occurrence logic are intentionally TODO and will land in
// Phase 4B+.

const calendarItemModel = require('../models/calendarItem');
const ruleModel = require('../models/calendarAvailabilityRule');

const PUBLIC_STATES = Object.freeze({ AVAILABLE: 'available', UNAVAILABLE: 'unavailable' });
const ORGANIZER_STATES = Object.freeze({
  AVAILABLE: 'available',
  FULL: 'full',
  BLOCKED: 'blocked',
  OUT_OF_WINDOW: 'out_of_window',
  ARCHIVED: 'archived',
});

/**
 * Resolve the active date window for a calendar config. For fixed mode this
 * returns the configured [start, end]; for rolling mode it computes a
 * window snapped to the configured unit (day/week/month).
 *
 * @param {object} config CalendarConfig row
 * @param {Date} [now=new Date()]
 * @returns {{ start: string, end: string } | null} ISO date strings, or null
 *          when the window cannot be derived.
 */
function deriveDateWindow(config, now = new Date()) {
  if (!config) return null;
  if (config.date_window_mode === 'fixed') {
    if (!config.fixed_start_date || !config.fixed_end_date) return null;
    return {
      start: toIsoDate(config.fixed_start_date),
      end: toIsoDate(config.fixed_end_date),
    };
  }
  if (config.date_window_mode === 'rolling') {
    const unit = config.rolling_window_unit;
    const size = config.rolling_window_size;
    if (!unit || !size) return null;
    // TODO(phase-4b+): full natural-boundary snapping. For now this scaffolds
    // a correct "days" implementation and a coarse weeks/months pass that
    // later phases will refine and unit-test against the locked behavior.
    return computeRollingWindow(unit, size, now, config.event_time_zone);
  }
  return null;
}

function computeRollingWindow(unit, size, now /*, tz */) {
  const start = startOfDay(now);
  const end = new Date(start);
  if (unit === 'days') {
    end.setUTCDate(end.getUTCDate() + size);
  } else if (unit === 'weeks') {
    // Coarse: start-of-current-week through `size` whole future weeks.
    // TODO(phase-4b+): use canonical event_time_zone and locked snap rules.
    end.setUTCDate(end.getUTCDate() + size * 7);
  } else if (unit === 'months') {
    end.setUTCMonth(end.getUTCMonth() + size);
  }
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function isDateInWindow(isoDate, window) {
  if (!window) return false;
  return isoDate >= window.start && isoDate <= window.end;
}

/**
 * Compute the *public* availability state of (item, date) ignoring capacity.
 * Capacity is layered in by the booking service so we don't duplicate counts.
 *
 * This is a Phase 4A scaffold of the precedence rule. The recurrence engine
 * is stubbed and only evaluates one-time rules for now.
 */
async function rawAvailabilityIgnoringCapacity({ config, item, isoDate, rules }, _opts = {}) {
  if (item.status !== 'active') return ORGANIZER_STATES.ARCHIVED;

  const window = deriveDateWindow(config);
  if (!isDateInWindow(isoDate, window)) return ORGANIZER_STATES.OUT_OF_WINDOW;

  if (isBlockedByRules(item, isoDate, rules)) return ORGANIZER_STATES.BLOCKED;

  return ORGANIZER_STATES.AVAILABLE;
}

/**
 * Evaluate the rule list against (item, date). One-time rules take precedence
 * over recurring rules per Phase 2 §"precedence". The full recurrence engine
 * is a Phase 4B+ deliverable; this scaffold handles one-time rules correctly
 * and leaves recurring evaluation behind a TODO.
 */
function isBlockedByRules(item, isoDate, rules) {
  if (!rules || rules.length === 0) return false;
  const oneTime = rules.filter((r) => r.active && r.rule_type === 'one_time');
  for (const rule of oneTime) {
    if (toIsoDate(rule.blocked_date) === isoDate && ruleTargetsItem(rule, item)) {
      return true;
    }
  }
  // TODO(phase-4b+): evaluate recurring rules (daily, weekly, biweekly,
  // monthly_by_date, monthly_by_weekday) using the canonical event time zone.
  return false;
}

function ruleTargetsItem(rule, item) {
  if (rule.target_scope === 'all') return true;
  if (rule.target_scope === 'single' || rule.target_scope === 'selected') {
    const targets = rule._target_item_ids;
    if (!targets) return false; // service should hydrate target ids
    return targets.includes(item.id);
  }
  return false;
}

/**
 * Load all rules for a config along with their target item ids so the caller
 * can evaluate availability without further round-trips.
 */
async function loadHydratedRules(configId, opts = {}) {
  const rules = await ruleModel.listForConfig(configId, { activeOnly: true, ...opts });
  for (const rule of rules) {
    if (rule.target_scope !== 'all') {
      const targets = await ruleModel.listTargets(rule.id, opts);
      rule._target_item_ids = targets.map((t) => Number(t.item_id));
    } else {
      rule._target_item_ids = null;
    }
  }
  return rules;
}

/** Map an organizer-state to its public-state (blocked/full collapse). */
function publicStateFromOrganizerState(state) {
  if (state === ORGANIZER_STATES.AVAILABLE) return PUBLIC_STATES.AVAILABLE;
  return PUBLIC_STATES.UNAVAILABLE;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toIsoDate(value) {
  if (typeof value === 'string') return value.length >= 10 ? value.slice(0, 10) : value;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// Re-exported for callers that want to enumerate active items.
async function listActiveItemsForEvent(eventId, opts = {}) {
  return calendarItemModel.listForEvent(eventId, { includeArchived: false, ...opts });
}

module.exports = {
  PUBLIC_STATES,
  ORGANIZER_STATES,
  deriveDateWindow,
  isDateInWindow,
  rawAvailabilityIgnoringCapacity,
  loadHydratedRules,
  publicStateFromOrganizerState,
  listActiveItemsForEvent,
  toIsoDate,
  // Exposed for testing only.
  _internals: { isBlockedByRules, computeRollingWindow, ruleTargetsItem },
};
