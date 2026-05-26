'use strict';

// calendarConfigService — owns event-level calendar config decisions:
// enable/disable, date window, time behavior, form configuration,
// confirmation behavior, time zone.

const calendarConfigModel = require('../models/calendarConfig');

const DATE_WINDOW_MODES = new Set(['fixed', 'rolling']);
const ROLLING_UNITS = new Set(['days', 'weeks', 'months']);
const TIME_BEHAVIOR_MODES = new Set(['date_only', 'timed']);
const EXPORT_MODES = new Set(['combined', 'separate']);

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

/**
 * Validate a config patch in product terms (Phase 3 rules) and apply it.
 *
 * Rules enforced here:
 *   - date_window_mode must be one of {fixed, rolling}
 *   - rolling windows require a unit and size
 *   - time_behavior_mode must be one of {date_only, timed}
 *   - email confirmation cannot be enabled unless email collection is
 *     enabled in form_config (Phase 3 §11).
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

  // Email confirmation dependency rule.
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
  getOrCreateForEvent,
  getForEvent,
  updateConfig,
  isEmailConfirmationToggleDisabled,
};
