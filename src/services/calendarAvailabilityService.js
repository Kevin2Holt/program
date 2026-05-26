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
const calendarConfigService = require('./calendarConfigService');

const RULE_TYPES = Object.freeze(['one_time', 'recurring']);
const TARGET_SCOPES = Object.freeze(['all', 'single', 'selected']);
const RECURRENCE_PATTERNS = Object.freeze([
  'daily', 'weekly', 'biweekly', 'monthly_by_date', 'monthly_by_weekday',
]);
// 0=Sunday … 6=Saturday — matches JS Date.getUTCDay().
const WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

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

/* ------------------------------------------------------------------ */
/* Organizer rule CRUD                                                 */
/* ------------------------------------------------------------------ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function normalizeWeekdays(raw) {
  const arr = Array.isArray(raw) ? raw : (raw !== undefined && raw !== null ? [raw] : []);
  const out = [];
  for (const v of arr) {
    const n = Number(v);
    if (Number.isInteger(n) && WEEKDAYS.includes(n) && !out.includes(n)) out.push(n);
  }
  out.sort((a, b) => a - b);
  return out;
}

function normalizeItemIds(raw) {
  const arr = Array.isArray(raw) ? raw : (raw !== undefined && raw !== null ? [raw] : []);
  const out = [];
  for (const v of arr) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Parse a raw POST body into a rule patch, a list of target item ids, and
 * field errors. Pure — no DB access.
 *
 * Body keys:
 *   rule_type             'one_time' | 'recurring'
 *   target_scope          'all' | 'single' | 'selected'
 *   target_item_ids       array of item ids (used for single/selected)
 *   blocked_date          ISO date (one_time only)
 *   recurrence_pattern    'daily' | 'weekly' | 'biweekly' | 'monthly_by_date' | 'monthly_by_weekday'
 *   weekdays              array of 0..6 (weekly/biweekly)
 *   day_of_month          1..31 (monthly_by_date)
 *   week_of_month         1..5  (monthly_by_weekday)
 *   weekday_of_month      0..6  (monthly_by_weekday)
 *   recurrence_start_date ISO date (optional)
 *   recurrence_end_date   ISO date (optional)
 *   reason                short text (optional)
 *   active                'on' (optional, default true)
 */
function parseAndValidateRuleForm(body = {}) {
  const errors = [];
  const patch = {};

  // --- rule_type ---
  const ruleType = isNonEmptyString(body.rule_type) ? body.rule_type.trim() : '';
  if (!RULE_TYPES.includes(ruleType)) {
    errors.push({ field: 'rule_type', message: 'Choose one-time or recurring.' });
  } else {
    patch.rule_type = ruleType;
  }

  // --- target_scope ---
  const targetScope = isNonEmptyString(body.target_scope) ? body.target_scope.trim() : '';
  if (!TARGET_SCOPES.includes(targetScope)) {
    errors.push({ field: 'target_scope', message: 'Choose which items this rule applies to.' });
  } else {
    patch.target_scope = targetScope;
  }

  // --- target items (single/selected) ---
  const itemIds = normalizeItemIds(body.target_item_ids);
  if (targetScope === 'single') {
    if (itemIds.length !== 1) {
      errors.push({ field: 'target_item_ids', message: 'Choose exactly one item.' });
    }
  } else if (targetScope === 'selected') {
    if (itemIds.length < 1) {
      errors.push({ field: 'target_item_ids', message: 'Choose at least one item.' });
    }
  }

  // --- active ---
  patch.active = body.active === undefined ? true
    : (body.active === 'on' || body.active === 'true' || body.active === '1' || body.active === true);

  // --- reason ---
  if (isNonEmptyString(body.reason)) {
    const r = body.reason.trim();
    if (r.length > 200) {
      errors.push({ field: 'reason', message: 'Reason must be 200 characters or fewer.' });
    } else {
      patch.reason = r;
    }
  } else {
    patch.reason = null;
  }

  // --- shape-specific fields ---
  if (ruleType === 'one_time') {
    const d = isNonEmptyString(body.blocked_date) ? body.blocked_date.trim() : '';
    if (!d) {
      errors.push({ field: 'blocked_date', message: 'Blocked date is required.' });
    } else if (!isValidISODate(d)) {
      errors.push({ field: 'blocked_date', message: 'Blocked date must be YYYY-MM-DD.' });
    } else {
      patch.blocked_date = d;
    }
    patch.recurrence_pattern = null;
    patch.recurrence_detail = {};
    patch.recurrence_start_date = null;
    patch.recurrence_end_date = null;
  } else if (ruleType === 'recurring') {
    const pat = isNonEmptyString(body.recurrence_pattern) ? body.recurrence_pattern.trim() : '';
    if (!pat) {
      errors.push({ field: 'recurrence_pattern', message: 'Recurrence pattern is required.' });
    } else if (!RECURRENCE_PATTERNS.includes(pat)) {
      errors.push({ field: 'recurrence_pattern', message: 'Recurrence pattern is not supported.' });
    } else {
      patch.recurrence_pattern = pat;
    }

    const detail = {};
    if (pat === 'weekly' || pat === 'biweekly') {
      const days = normalizeWeekdays(body.weekdays);
      if (days.length === 0) {
        errors.push({ field: 'weekdays', message: 'Choose at least one weekday.' });
      } else {
        detail.weekdays = days;
      }
    } else if (pat === 'monthly_by_date') {
      const dom = toIntOrNull(body.day_of_month);
      if (dom === null || Number.isNaN(dom) || dom < 1 || dom > 31) {
        errors.push({ field: 'day_of_month', message: 'Day of month must be between 1 and 31.' });
      } else {
        detail.day_of_month = dom;
      }
    } else if (pat === 'monthly_by_weekday') {
      const wom = toIntOrNull(body.week_of_month);
      const wdm = toIntOrNull(body.weekday_of_month);
      if (wom === null || Number.isNaN(wom) || wom < 1 || wom > 5) {
        errors.push({ field: 'week_of_month', message: 'Week of month must be between 1 and 5.' });
      } else {
        detail.week_of_month = wom;
      }
      if (wdm === null || Number.isNaN(wdm) || !WEEKDAYS.includes(wdm)) {
        errors.push({ field: 'weekday_of_month', message: 'Choose a weekday.' });
      } else {
        detail.weekday = wdm;
      }
    }
    patch.recurrence_detail = detail;

    if (isNonEmptyString(body.recurrence_start_date)) {
      const s = body.recurrence_start_date.trim();
      if (!isValidISODate(s)) {
        errors.push({ field: 'recurrence_start_date', message: 'Start date must be YYYY-MM-DD.' });
      } else {
        patch.recurrence_start_date = s;
      }
    } else {
      patch.recurrence_start_date = null;
    }
    if (isNonEmptyString(body.recurrence_end_date)) {
      const e = body.recurrence_end_date.trim();
      if (!isValidISODate(e)) {
        errors.push({ field: 'recurrence_end_date', message: 'End date must be YYYY-MM-DD.' });
      } else {
        patch.recurrence_end_date = e;
      }
    } else {
      patch.recurrence_end_date = null;
    }
    if (patch.recurrence_start_date && patch.recurrence_end_date
        && patch.recurrence_end_date < patch.recurrence_start_date) {
      errors.push({ field: 'recurrence_end_date', message: 'End date must be on or after start date.' });
    }

    patch.blocked_date = null;
  }

  return { patch, errors, targetItemIds: itemIds };
}

/**
 * Persist a parsed rule + its targets. Resolves the config id from the event.
 * Caller must have validated; `validateProductRules` is run defensively.
 */
async function createRuleForEvent(eventId, patch, targetItemIds, opts = {}) {
  validateProductRules(patch);
  const cfg = await calendarConfigService.getOrCreateForEvent(eventId, opts);
  const created = await ruleModel.create(
    { ...patch, calendar_config_id: cfg.id },
    opts,
  );
  if (created && (patch.target_scope === 'single' || patch.target_scope === 'selected')) {
    await ruleModel.addTargets(created.id, targetItemIds || [], opts);
  }
  return created;
}

async function updateRuleForEvent(eventId, ruleId, patch, targetItemIds, opts = {}) {
  validateProductRules(patch);
  const existing = await ruleModel.findById(ruleId, opts);
  if (!existing) throw notFound('Rule not found');
  const cfg = await calendarConfigService.getOrCreateForEvent(eventId, opts);
  if (Number(existing.calendar_config_id) !== Number(cfg.id)) {
    throw notFound('Rule not found for this event');
  }
  const updated = await ruleModel.update(ruleId, patch, opts);
  if (patch.target_scope === 'all') {
    await ruleModel.clearTargets(ruleId, opts);
  } else if (patch.target_scope === 'single' || patch.target_scope === 'selected') {
    await ruleModel.clearTargets(ruleId, opts);
    await ruleModel.addTargets(ruleId, targetItemIds || [], opts);
  }
  return updated;
}

async function archiveRuleForEvent(eventId, ruleId, opts = {}) {
  const existing = await ruleModel.findById(ruleId, opts);
  if (!existing) throw notFound('Rule not found');
  const cfg = await calendarConfigService.getOrCreateForEvent(eventId, opts);
  if (Number(existing.calendar_config_id) !== Number(cfg.id)) {
    throw notFound('Rule not found for this event');
  }
  return ruleModel.deactivate(ruleId, opts);
}

async function findRuleByIdForEvent(eventId, ruleId, opts = {}) {
  const existing = await ruleModel.findById(ruleId, opts);
  if (!existing) return null;
  const cfg = await calendarConfigService.getOrCreateForEvent(eventId, opts);
  if (Number(existing.calendar_config_id) !== Number(cfg.id)) return null;
  const targets = await ruleModel.listTargets(ruleId, opts);
  return { ...existing, _target_item_ids: targets.map((t) => Number(t.item_id)) };
}

async function listRulesForEvent(eventId, opts = {}) {
  const cfg = await calendarConfigService.getOrCreateForEvent(eventId, opts);
  const rules = await ruleModel.listForConfig(cfg.id, opts);
  for (const r of rules) {
    if (r.target_scope !== 'all') {
      const t = await ruleModel.listTargets(r.id, opts);
      r._target_item_ids = t.map((row) => Number(row.item_id));
    } else {
      r._target_item_ids = null;
    }
  }
  return rules;
}

function validateProductRules(patch) {
  if (patch.rule_type !== undefined && !RULE_TYPES.includes(patch.rule_type)) {
    throw badRequest('Invalid rule_type');
  }
  if (patch.target_scope !== undefined && !TARGET_SCOPES.includes(patch.target_scope)) {
    throw badRequest('Invalid target_scope');
  }
  if (patch.recurrence_pattern && !RECURRENCE_PATTERNS.includes(patch.recurrence_pattern)) {
    throw badRequest('Invalid recurrence_pattern');
  }
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'CALENDAR_RULE_INVALID';
  return err;
}
function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  err.code = 'CALENDAR_RULE_NOT_FOUND';
  return err;
}

module.exports = {
  PUBLIC_STATES,
  ORGANIZER_STATES,
  RULE_TYPES,
  TARGET_SCOPES,
  RECURRENCE_PATTERNS,
  WEEKDAYS,
  deriveDateWindow,
  isDateInWindow,
  rawAvailabilityIgnoringCapacity,
  loadHydratedRules,
  publicStateFromOrganizerState,
  listActiveItemsForEvent,
  toIsoDate,
  // Organizer rule CRUD.
  parseAndValidateRuleForm,
  createRuleForEvent,
  updateRuleForEvent,
  archiveRuleForEvent,
  findRuleByIdForEvent,
  listRulesForEvent,
  // Exposed for testing only.
  _internals: { isBlockedByRules, computeRollingWindow, ruleTargetsItem },
};
