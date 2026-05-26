'use strict';

// calendarConfigService — owns event-level calendar config decisions:
// enable/disable, date window, time behavior, form configuration,
// confirmation behavior, time zone.
//
// This module is the single source of truth for what a valid calendar
// configuration looks like. Controllers must call `parseAndValidateForm`
// to turn an HTTP form payload into a model patch and a list of
// field-level errors, and `updateConfig` to persist a patch.

const calendarConfigModel = require('../models/calendarConfig');

const DATE_WINDOW_MODES = new Set(['fixed', 'rolling']);
const ROLLING_UNITS = new Set(['days', 'weeks', 'months']);
const TIME_BEHAVIOR_MODES = new Set(['date_only', 'timed']);
const EXPORT_MODES = new Set(['combined', 'separate']);
const VISIBILITY_STATES = new Set(['draft', 'published', 'hidden']);

// Bounded structured form-field surface. Only these keys may appear in
// the persisted form_config. Anything outside this list is dropped — the
// spec explicitly forbids a freeform form-builder.
const SUPPORTED_FORM_FIELDS = Object.freeze([
  'name',
  'phone',
  'contact_method', // call / text (phone metadata)
  'number_type',    // cell / WhatsApp (phone metadata)
  'email',
  'notes',
]);

// Fields that should only render when phone collection is enabled.
const PHONE_METADATA_FIELDS = Object.freeze(['contact_method', 'number_type']);

const DEFAULT_FORM_CONFIG = Object.freeze({
  name: { enabled: true, required: true },
  phone: { enabled: false, required: false },
  contact_method: { enabled: false, required: false },
  number_type: { enabled: false, required: false },
  email: { enabled: false, required: false },
  notes: { enabled: false, required: false },
});

const DEFAULT_EXPORT_DEFAULTS = Object.freeze({
  detail_level: 'names_only',
  include_fields: ['name'],
});

/**
 * Return the calendar config for an event, creating an initial config row
 * if none exists. The initial config is disabled by default so the calendar
 * surface stays invisible to the public until the organizer publishes it.
 */
async function getOrCreateForEvent(eventId, opts = {}) {
  let cfg = await calendarConfigModel.findByEventId(eventId, opts);
  if (cfg) return cfg;
  cfg = await calendarConfigModel.create(eventId, {}, opts);
  // Seed sensible defaults for the JSONB columns.
  cfg = await calendarConfigModel.update(
    cfg.id,
    { form_config: DEFAULT_FORM_CONFIG, export_defaults: DEFAULT_EXPORT_DEFAULTS },
    opts,
  );
  return cfg;
}

async function getForEvent(eventId, opts = {}) {
  return calendarConfigModel.findByEventId(eventId, opts);
}

// ---- Validation primitives ---------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toBool(v) {
  // HTML checkboxes arrive as 'on' when checked or are missing entirely.
  if (v === true || v === 'on' || v === 'true' || v === '1') return true;
  return false;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
  return n;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidISODate(v) {
  if (!isNonEmptyString(v) || !ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip protection (e.g. 2025-02-30 -> not 2025-02-30 after parse).
  return d.toISOString().slice(0, 10) === v;
}

function isValidTimeZone(v) {
  if (!isNonEmptyString(v)) return false;
  try {
    // Node's Intl rejects unknown IANA zones.
    new Intl.DateTimeFormat('en-US', { timeZone: v }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Coerce a raw `form_config` object (possibly arriving from form parsing) into
 * the bounded structured shape we persist. Unknown keys are dropped. Sub-keys
 * that aren't `enabled`/`required` are dropped. Booleans are normalized.
 */
function normalizeFormConfig(raw) {
  const out = {};
  for (const key of SUPPORTED_FORM_FIELDS) {
    const incoming = (raw && typeof raw === 'object' && raw[key]) || {};
    const enabled = toBool(incoming.enabled);
    const required = toBool(incoming.required) && enabled;
    out[key] = { enabled, required };
  }
  // Name is always considered enabled+required per Phase 2/3 spec
  // (it is a baseline supported field, required by default).
  out.name = { enabled: true, required: true };
  // Phone-metadata fields are only meaningful when phone is enabled.
  if (!out.phone.enabled) {
    for (const k of PHONE_METADATA_FIELDS) {
      out[k] = { enabled: false, required: false };
    }
  }
  return out;
}

/**
 * Turn a raw POST body into a model patch plus an array of field-level
 * errors. Pure function: does not touch the database. Used by the
 * controller and by tests.
 *
 * @param {object} body  Raw req.body (already form-parsed).
 * @param {object} currentConfig  Current persisted config (for defaults).
 * @returns {{ patch: object, errors: Array<{field:string,message:string}>, normalized: object }}
 */
function parseAndValidateForm(body = {}, currentConfig = {}) {
  const errors = [];
  const patch = {};

  // --- Visibility section ---
  const title = isNonEmptyString(body.title) ? body.title.trim() : '';
  if (!title) {
    errors.push({ field: 'title', message: 'Title is required.' });
  } else if (title.length > 200) {
    errors.push({ field: 'title', message: 'Title must be 200 characters or fewer.' });
  } else {
    patch.title = title;
  }

  patch.enabled = toBool(body.enabled);

  const visibility = isNonEmptyString(body.public_visibility_state)
    ? body.public_visibility_state.trim()
    : 'draft';
  if (!VISIBILITY_STATES.has(visibility)) {
    errors.push({
      field: 'public_visibility_state',
      message: 'Invalid public visibility state.',
    });
  } else {
    patch.public_visibility_state = visibility;
  }

  // --- Date window ---
  const dateWindowMode = isNonEmptyString(body.date_window_mode)
    ? body.date_window_mode.trim()
    : 'fixed';
  if (!DATE_WINDOW_MODES.has(dateWindowMode)) {
    errors.push({ field: 'date_window_mode', message: 'Invalid date window mode.' });
  } else {
    patch.date_window_mode = dateWindowMode;
  }

  if (dateWindowMode === 'fixed') {
    const start = isNonEmptyString(body.fixed_start_date) ? body.fixed_start_date.trim() : '';
    const end = isNonEmptyString(body.fixed_end_date) ? body.fixed_end_date.trim() : '';
    if (!start) {
      errors.push({ field: 'fixed_start_date', message: 'Start date is required for a fixed range.' });
    } else if (!isValidISODate(start)) {
      errors.push({ field: 'fixed_start_date', message: 'Start date must be a valid YYYY-MM-DD date.' });
    }
    if (!end) {
      errors.push({ field: 'fixed_end_date', message: 'End date is required for a fixed range.' });
    } else if (!isValidISODate(end)) {
      errors.push({ field: 'fixed_end_date', message: 'End date must be a valid YYYY-MM-DD date.' });
    }
    if (isValidISODate(start) && isValidISODate(end) && end < start) {
      errors.push({ field: 'fixed_end_date', message: 'End date must be on or after the start date.' });
    }
    if (isValidISODate(start)) patch.fixed_start_date = start;
    if (isValidISODate(end)) patch.fixed_end_date = end;
    // Clear rolling fields so we never carry stale state.
    patch.rolling_window_unit = null;
    patch.rolling_window_size = null;
  } else if (dateWindowMode === 'rolling') {
    const unit = isNonEmptyString(body.rolling_window_unit)
      ? body.rolling_window_unit.trim()
      : '';
    if (!unit) {
      errors.push({ field: 'rolling_window_unit', message: 'Rolling window unit is required.' });
    } else if (!ROLLING_UNITS.has(unit)) {
      errors.push({ field: 'rolling_window_unit', message: 'Rolling window unit must be days, weeks, or months.' });
    } else {
      patch.rolling_window_unit = unit;
    }
    const size = toIntOrNull(body.rolling_window_size);
    if (size === null) {
      errors.push({ field: 'rolling_window_size', message: 'Rolling window size is required.' });
    } else if (Number.isNaN(size) || size < 1) {
      errors.push({ field: 'rolling_window_size', message: 'Rolling window size must be a positive whole number.' });
    } else if (size > 366) {
      errors.push({ field: 'rolling_window_size', message: 'Rolling window size is too large.' });
    } else {
      patch.rolling_window_size = size;
    }
    patch.fixed_start_date = null;
    patch.fixed_end_date = null;
  }

  // --- Time behavior ---
  const timeBehavior = isNonEmptyString(body.time_behavior_mode)
    ? body.time_behavior_mode.trim()
    : 'date_only';
  if (!TIME_BEHAVIOR_MODES.has(timeBehavior)) {
    errors.push({ field: 'time_behavior_mode', message: 'Invalid time behavior mode.' });
  } else {
    patch.time_behavior_mode = timeBehavior;
  }

  const tz = isNonEmptyString(body.event_time_zone)
    ? body.event_time_zone.trim()
    : '';
  if (!tz) {
    errors.push({ field: 'event_time_zone', message: 'Event time zone is required.' });
  } else if (!isValidTimeZone(tz)) {
    errors.push({ field: 'event_time_zone', message: 'Event time zone must be a valid IANA time zone (e.g. America/New_York).' });
  } else {
    patch.event_time_zone = tz;
  }

  // --- Public signup form fields (bounded structured config) ---
  const rawForm = (body.form_config && typeof body.form_config === 'object') ? body.form_config : {};
  const formConfig = normalizeFormConfig(rawForm);
  patch.form_config = formConfig;

  // --- Notes ---
  // Notes is modeled as a separately controlled flag at the config level *and*
  // as a structured form field. Keep them in sync: the column reflects
  // whether the notes field is enabled.
  patch.notes_enabled = formConfig.notes.enabled;

  // --- Confirmation & export ---
  const exportMode = isNonEmptyString(body.calendar_export_mode)
    ? body.calendar_export_mode.trim()
    : 'combined';
  if (!EXPORT_MODES.has(exportMode)) {
    errors.push({ field: 'calendar_export_mode', message: 'Invalid calendar export mode.' });
  } else {
    patch.calendar_export_mode = exportMode;
  }

  patch.add_to_calendar_enabled = toBool(body.add_to_calendar_enabled);

  const wantsEmailConfirmation = toBool(body.email_confirmation_enabled);
  if (wantsEmailConfirmation && !formConfig.email.enabled) {
    errors.push({
      field: 'email_confirmation_enabled',
      message: 'Email confirmation requires the email form field to be enabled.',
    });
    patch.email_confirmation_enabled = false;
  } else {
    patch.email_confirmation_enabled = wantsEmailConfirmation;
  }

  return { patch, errors, normalized: { ...currentConfig, ...patch } };
}

/**
 * Validate a config patch in product terms (Phase 3 rules) and apply it.
 * The patch is expected to have already been produced by parseAndValidateForm
 * (or assembled in code with equivalent care); this layer re-runs the
 * cross-field rules that aren't easily expressed in the SQL schema.
 */
async function updateConfig(eventId, patch, opts = {}) {
  const cfg = await getOrCreateForEvent(eventId, opts);
  const next = { ...cfg, ...patch };

  if (patch.date_window_mode && !DATE_WINDOW_MODES.has(patch.date_window_mode)) {
    throw badRequest('Invalid date_window_mode');
  }
  if (next.date_window_mode === 'rolling') {
    if (patch.rolling_window_unit && !ROLLING_UNITS.has(patch.rolling_window_unit)) {
      throw badRequest('Invalid rolling_window_unit');
    }
  }
  if (patch.time_behavior_mode && !TIME_BEHAVIOR_MODES.has(patch.time_behavior_mode)) {
    throw badRequest('Invalid time_behavior_mode');
  }
  if (patch.calendar_export_mode && !EXPORT_MODES.has(patch.calendar_export_mode)) {
    throw badRequest('Invalid calendar_export_mode');
  }
  if (patch.public_visibility_state && !VISIBILITY_STATES.has(patch.public_visibility_state)) {
    throw badRequest('Invalid public_visibility_state');
  }
  if (patch.event_time_zone !== undefined && !isValidTimeZone(patch.event_time_zone)) {
    throw badRequest('Invalid event_time_zone');
  }

  // Email confirmation dependency rule (cross-field invariant).
  const formConfig = patch.form_config || cfg.form_config || {};
  const emailEnabled = !!(formConfig.email && formConfig.email.enabled);
  if (next.email_confirmation_enabled && !emailEnabled) {
    throw badRequest(
      'email_confirmation_enabled requires the email form field to be enabled',
    );
  }

  return calendarConfigModel.update(cfg.id, patch, opts);
}

/**
 * UI helper: whether the email-confirmation toggle should be presented as
 * disabled (grayed out, still visible). True when the form's email field is
 * not enabled.
 */
function isEmailConfirmationToggleDisabled(config) {
  const formConfig = (config && config.form_config) || {};
  return !(formConfig.email && formConfig.email.enabled);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'CALENDAR_CONFIG_INVALID';
  return err;
}

module.exports = {
  DEFAULT_FORM_CONFIG,
  DEFAULT_EXPORT_DEFAULTS,
  DATE_WINDOW_MODES,
  ROLLING_UNITS,
  TIME_BEHAVIOR_MODES,
  EXPORT_MODES,
  VISIBILITY_STATES,
  SUPPORTED_FORM_FIELDS,
  PHONE_METADATA_FIELDS,
  getOrCreateForEvent,
  getForEvent,
  updateConfig,
  parseAndValidateForm,
  normalizeFormConfig,
  isValidTimeZone,
  isValidISODate,
  isEmailConfirmationToggleDisabled,
};
