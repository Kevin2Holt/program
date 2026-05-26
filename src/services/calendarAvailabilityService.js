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
 * over recurring rules per Phase 2 §"precedence". When a one-time rule blocks
 * the date for the item we return immediately; otherwise we fall through to
 * the recurring evaluator.
 */
function isBlockedByRules(item, isoDate, rules) {
  if (!rules || rules.length === 0) return false;
  // 1. One-time rules first (highest precedence).
  for (const rule of rules) {
    if (!rule.active || rule.rule_type !== 'one_time') continue;
    if (!ruleTargetsItem(rule, item)) continue;
    if (toIsoDate(rule.blocked_date) === isoDate) return true;
  }
  // 2. Recurring rules. Boundary checks (recurrence_start_date /
  //    recurrence_end_date) are inclusive; absent boundaries mean "unbounded".
  for (const rule of rules) {
    if (!rule.active || rule.rule_type !== 'recurring') continue;
    if (!ruleTargetsItem(rule, item)) continue;
    if (recurringRuleMatchesDate(rule, isoDate)) return true;
  }
  return false;
}

/**
 * Pure date-vs-recurring-rule predicate. Uses UTC-anchored math: every date is
 * interpreted as midnight UTC, so weekday/day-of-month computations are stable
 * across the runtime's local zone. The event_time_zone is the canonical zone
 * for organizer-facing display; for boundary evaluation we deliberately treat
 * dates as opaque YYYY-MM-DD identifiers to avoid DST surprises.
 */
function recurringRuleMatchesDate(rule, isoDate) {
  // Boundary checks (inclusive).
  const startBound = rule.recurrence_start_date ? toIsoDate(rule.recurrence_start_date) : null;
  const endBound = rule.recurrence_end_date ? toIsoDate(rule.recurrence_end_date) : null;
  if (startBound && isoDate < startBound) return false;
  if (endBound && isoDate > endBound) return false;

  const detail = rule.recurrence_detail || {};
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const weekday = d.getUTCDay();           // 0..6
  const dayOfMonth = d.getUTCDate();       // 1..31
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();           // 0..11

  switch (rule.recurrence_pattern) {
    case 'daily':
      return true;
    case 'weekly': {
      const days = Array.isArray(detail.weekdays) ? detail.weekdays : [];
      return days.includes(weekday);
    }
    case 'biweekly': {
      const days = Array.isArray(detail.weekdays) ? detail.weekdays : [];
      if (!days.includes(weekday)) return false;
      // The biweekly anchor is the recurrence_start_date if present, otherwise
      // 1970-01-01 (Thursday). Match dates whose whole-week offset from the
      // anchor is even.
      const anchorIso = startBound || '1970-01-01';
      const anchorD = new Date(`${anchorIso}T00:00:00Z`);
      const diffDays = Math.floor((d.getTime() - anchorD.getTime()) / 86400000);
      const weekOffset = Math.floor(diffDays / 7);
      return weekOffset % 2 === 0;
    }
    case 'monthly_by_date':
      return Number.isInteger(detail.day_of_month) && detail.day_of_month === dayOfMonth;
    case 'monthly_by_weekday': {
      const targetWeekday = Number.isInteger(detail.weekday) ? detail.weekday : null;
      const targetWeek = Number.isInteger(detail.week_of_month) ? detail.week_of_month : null;
      if (targetWeekday === null || targetWeek === null) return false;
      if (weekday !== targetWeekday) return false;
      // Compute the 1-based occurrence number of this weekday in its month.
      // Week 5 represents "last" only if there is no 5th occurrence (i.e.
      // when week 5 doesn't exist, the rule shouldn't match week 4 instead;
      // we keep semantics simple: week 5 means "the 5th occurrence if it
      // exists, else no match"). This is conservative and predictable.
      const occurrenceNumber = Math.floor((dayOfMonth - 1) / 7) + 1;
      if (occurrenceNumber !== targetWeek) return false;
      // Sanity: confirm the same year/month context (always true given d).
      void year; void month;
      return true;
    }
    default:
      return false;
  }
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
/* Range resolver                                                      */
/* ------------------------------------------------------------------ */

// Capacity-aware resolution over the entire configured window for every
// active item. Public callers receive the collapsed public state; organizer
// callers receive the structured organizer state. The resolver expects all
// inputs to be pre-loaded so it stays synchronous + pure.
//
// Shape returned:
//   { window: { start, end },
//     dates: [
//       { date, items: [ { itemId, state, reason?, occurrences?: [...] } ] }
//     ] }
function resolveAvailabilityForRange({
  config,
  items,
  rules,
  occurrencesByItemDate = new Map(), // Map<`${itemId}:${date}`, occurrence[]>
  capacityUsage = new Map(),         // Map<key, used>
  view = 'public',
}) {
  const window = deriveDateWindow(config);
  if (!window) return { window: null, dates: [] };

  const isTimed = config && config.time_behavior_mode === 'timed';
  const dates = enumerateDatesInclusive(window.start, window.end);
  const out = [];

  for (const date of dates) {
    const itemRow = [];
    for (const item of items) {
      const cell = resolveCell({
        config, item, isoDate: date, rules,
        isTimed, occurrencesByItemDate, capacityUsage, view,
      });
      itemRow.push(cell);
    }
    out.push({ date, items: itemRow });
  }
  return { window, dates: out };
}

function resolveCell({
  config, item, isoDate, rules, isTimed, occurrencesByItemDate, capacityUsage, view,
}) {
  const base = {
    itemId: item.id,
    state: ORGANIZER_STATES.AVAILABLE,
    reason: null,
    occurrences: null,
  };

  if (item.status !== 'active') {
    return finalizeCell({ ...base, state: ORGANIZER_STATES.ARCHIVED, reason: 'archived' }, view);
  }
  if (!isDateInWindow(isoDate, deriveDateWindow(config))) {
    return finalizeCell({ ...base, state: ORGANIZER_STATES.OUT_OF_WINDOW, reason: 'out_of_window' }, view);
  }
  if (isBlockedByRules(item, isoDate, rules)) {
    return finalizeCell({ ...base, state: ORGANIZER_STATES.BLOCKED, reason: 'blocked' }, view);
  }

  if (isTimed) {
    const key = `${item.id}:${isoDate}`;
    const occs = occurrencesByItemDate.get(key) || [];
    const annotated = [];
    let anyAvailable = false;
    for (const occ of occs) {
      if (occ.status !== 'active') continue;
      const capUsedKey = `occ:${occ.id}`;
      const used = capacityUsage.get(capUsedKey) || 0;
      const cap = occ.capacity_override != null ? occ.capacity_override : item.capacity;
      const isFull = used >= cap;
      annotated.push({
        occurrenceId: occ.id,
        label: occ.label || null,
        startTime: occ.start_time || null,
        endTime: occ.end_time || null,
        durationMinutes: occ.duration_minutes || null,
        used,
        capacity: cap,
        state: isFull ? ORGANIZER_STATES.FULL : ORGANIZER_STATES.AVAILABLE,
      });
      if (!isFull) anyAvailable = true;
    }
    base.occurrences = annotated;
    if (annotated.length === 0) {
      // No occurrences scheduled on this date — treat as out_of_window so the
      // public view collapses it to "unavailable" without hinting why.
      return finalizeCell({ ...base, state: ORGANIZER_STATES.OUT_OF_WINDOW, reason: 'no_occurrences' }, view);
    }
    if (!anyAvailable) {
      return finalizeCell({ ...base, state: ORGANIZER_STATES.FULL, reason: 'full' }, view);
    }
    return finalizeCell({ ...base, state: ORGANIZER_STATES.AVAILABLE }, view);
  }

  // Date-only mode: collapse to a single (item, date) capacity check.
  const usedKey = `date:${item.id}:${isoDate}`;
  const used = capacityUsage.get(usedKey) || 0;
  if (used >= item.capacity) {
    return finalizeCell({ ...base, state: ORGANIZER_STATES.FULL, reason: 'full' }, view);
  }
  return finalizeCell(base, view);
}

function finalizeCell(cell, view) {
  if (view === 'organizer') return cell;
  // Public collapses every non-available state to 'unavailable'.
  return {
    ...cell,
    state: cell.state === ORGANIZER_STATES.AVAILABLE ? PUBLIC_STATES.AVAILABLE : PUBLIC_STATES.UNAVAILABLE,
    occurrences: cell.occurrences ? cell.occurrences.map((o) => ({
      ...o,
      state: o.state === ORGANIZER_STATES.AVAILABLE ? PUBLIC_STATES.AVAILABLE : PUBLIC_STATES.UNAVAILABLE,
    })) : null,
  };
}

function enumerateDatesInclusive(startIso, endIso) {
  const out = [];
  let d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  // Safety cap: refuse pathological windows that would burn memory.
  let i = 0;
  while (d.getTime() <= end.getTime() && i < 5000) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
    i += 1;
  }
  return out;
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
  resolveAvailabilityForRange,
  enumerateDatesInclusive,
  // Organizer rule CRUD.
  parseAndValidateRuleForm,
  createRuleForEvent,
  updateRuleForEvent,
  archiveRuleForEvent,
  findRuleByIdForEvent,
  listRulesForEvent,
  // Exposed for testing only.
  _internals: { isBlockedByRules, computeRollingWindow, ruleTargetsItem, recurringRuleMatchesDate },
};
