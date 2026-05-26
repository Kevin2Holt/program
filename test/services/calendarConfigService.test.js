'use strict';

// Unit tests for calendarConfigService.parseAndValidateForm and the
// validation invariants documented in Phase 2/3 specs. These tests are
// pure and never touch the database.

const test = require('node:test');
const assert = require('node:assert/strict');

const svc = require('../../src/services/calendarConfigService');

function baseValidBody(overrides = {}) {
  return {
    title: 'Meals',
    enabled: 'on',
    public_visibility_state: 'draft',
    date_window_mode: 'fixed',
    fixed_start_date: '2026-06-01',
    fixed_end_date: '2026-06-30',
    time_behavior_mode: 'date_only',
    event_time_zone: 'America/New_York',
    calendar_export_mode: 'combined',
    form_config: {
      name: { enabled: 'on', required: 'on' },
      phone: { enabled: 'on', required: 'on' },
      contact_method: { enabled: 'on' },
      number_type: { enabled: 'on' },
      email: {},
      notes: {},
    },
    ...overrides,
  };
}

test('parseAndValidateForm accepts a well-formed fixed-range config', () => {
  const { patch, errors } = svc.parseAndValidateForm(baseValidBody(), {});
  assert.deepEqual(errors, []);
  assert.equal(patch.title, 'Meals');
  assert.equal(patch.enabled, true);
  assert.equal(patch.public_visibility_state, 'draft');
  assert.equal(patch.date_window_mode, 'fixed');
  assert.equal(patch.fixed_start_date, '2026-06-01');
  assert.equal(patch.fixed_end_date, '2026-06-30');
  assert.equal(patch.rolling_window_unit, null);
  assert.equal(patch.rolling_window_size, null);
  assert.equal(patch.time_behavior_mode, 'date_only');
  assert.equal(patch.event_time_zone, 'America/New_York');
  assert.equal(patch.calendar_export_mode, 'combined');
  assert.equal(patch.email_confirmation_enabled, false);
  assert.equal(patch.form_config.phone.enabled, true);
  assert.equal(patch.form_config.phone.required, true);
  assert.equal(patch.form_config.contact_method.enabled, true);
});

test('parseAndValidateForm requires a public title', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({ title: '' }), {});
  assert.ok(errors.some((e) => e.field === 'title'));
});

test('parseAndValidateForm rejects invalid public_visibility_state', () => {
  const { errors } = svc.parseAndValidateForm(
    baseValidBody({ public_visibility_state: 'on_the_loose' }),
    {},
  );
  assert.ok(errors.some((e) => e.field === 'public_visibility_state'));
});

test('parseAndValidateForm rejects invalid date_window_mode', () => {
  const { errors } = svc.parseAndValidateForm(
    baseValidBody({ date_window_mode: 'spiral' }),
    {},
  );
  assert.ok(errors.some((e) => e.field === 'date_window_mode'));
});

test('parseAndValidateForm rejects end-before-start in fixed range', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({
    fixed_start_date: '2026-06-10',
    fixed_end_date: '2026-06-01',
  }), {});
  assert.ok(errors.some((e) => e.field === 'fixed_end_date'));
});

test('parseAndValidateForm rejects malformed fixed dates', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({
    fixed_start_date: '2026-02-30', // Feb 30 doesn't exist
    fixed_end_date: 'not-a-date',
  }), {});
  assert.ok(errors.some((e) => e.field === 'fixed_start_date'));
  assert.ok(errors.some((e) => e.field === 'fixed_end_date'));
});

test('parseAndValidateForm accepts a well-formed rolling-window config', () => {
  const { patch, errors } = svc.parseAndValidateForm(baseValidBody({
    date_window_mode: 'rolling',
    fixed_start_date: undefined,
    fixed_end_date: undefined,
    rolling_window_unit: 'weeks',
    rolling_window_size: '4',
  }), {});
  assert.deepEqual(errors, []);
  assert.equal(patch.date_window_mode, 'rolling');
  assert.equal(patch.rolling_window_unit, 'weeks');
  assert.equal(patch.rolling_window_size, 4);
  assert.equal(patch.fixed_start_date, null);
  assert.equal(patch.fixed_end_date, null);
});

test('parseAndValidateForm rejects rolling-window without unit', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({
    date_window_mode: 'rolling',
    fixed_start_date: undefined,
    fixed_end_date: undefined,
    rolling_window_size: '7',
  }), {});
  assert.ok(errors.some((e) => e.field === 'rolling_window_unit'));
});

test('parseAndValidateForm rejects rolling-window with non-positive size', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({
    date_window_mode: 'rolling',
    fixed_start_date: undefined,
    fixed_end_date: undefined,
    rolling_window_unit: 'days',
    rolling_window_size: '0',
  }), {});
  assert.ok(errors.some((e) => e.field === 'rolling_window_size'));
});

test('parseAndValidateForm rejects unknown rolling unit', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({
    date_window_mode: 'rolling',
    fixed_start_date: undefined,
    fixed_end_date: undefined,
    rolling_window_unit: 'fortnights',
    rolling_window_size: '2',
  }), {});
  assert.ok(errors.some((e) => e.field === 'rolling_window_unit'));
});

test('parseAndValidateForm rejects an invalid IANA time zone', () => {
  const { errors } = svc.parseAndValidateForm(
    baseValidBody({ event_time_zone: 'Earth/Mars' }),
    {},
  );
  assert.ok(errors.some((e) => e.field === 'event_time_zone'));
});

test('parseAndValidateForm requires a non-empty time zone', () => {
  const { errors } = svc.parseAndValidateForm(
    baseValidBody({ event_time_zone: '   ' }),
    {},
  );
  assert.ok(errors.some((e) => e.field === 'event_time_zone'));
});

test('parseAndValidateForm rejects invalid time_behavior_mode and export_mode', () => {
  const { errors } = svc.parseAndValidateForm(baseValidBody({
    time_behavior_mode: 'eventually',
    calendar_export_mode: 'maybe',
  }), {});
  assert.ok(errors.some((e) => e.field === 'time_behavior_mode'));
  assert.ok(errors.some((e) => e.field === 'calendar_export_mode'));
});

test('parseAndValidateForm blocks email_confirmation_enabled when email field is disabled', () => {
  const body = baseValidBody({
    email_confirmation_enabled: 'on',
    form_config: {
      name: { enabled: 'on', required: 'on' },
      email: {}, // not enabled
    },
  });
  const { patch, errors } = svc.parseAndValidateForm(body, {});
  assert.ok(errors.some((e) => e.field === 'email_confirmation_enabled'));
  assert.equal(patch.email_confirmation_enabled, false);
});

test('parseAndValidateForm permits email_confirmation_enabled when email field is enabled', () => {
  const body = baseValidBody({
    email_confirmation_enabled: 'on',
    form_config: {
      name: { enabled: 'on', required: 'on' },
      email: { enabled: 'on', required: 'on' },
    },
  });
  const { patch, errors } = svc.parseAndValidateForm(body, {});
  assert.deepEqual(errors, []);
  assert.equal(patch.email_confirmation_enabled, true);
});

test('parseAndValidateForm forces name field to always be enabled+required', () => {
  const body = baseValidBody({
    form_config: { name: { enabled: '', required: '' } },
  });
  const { patch } = svc.parseAndValidateForm(body, {});
  assert.equal(patch.form_config.name.enabled, true);
  assert.equal(patch.form_config.name.required, true);
});

test('parseAndValidateForm clears phone metadata when phone is disabled', () => {
  const body = baseValidBody({
    form_config: {
      name: { enabled: 'on', required: 'on' },
      phone: {}, // disabled
      contact_method: { enabled: 'on', required: 'on' },
      number_type: { enabled: 'on', required: 'on' },
    },
  });
  const { patch } = svc.parseAndValidateForm(body, {});
  assert.equal(patch.form_config.phone.enabled, false);
  assert.equal(patch.form_config.contact_method.enabled, false);
  assert.equal(patch.form_config.number_type.enabled, false);
});

test('parseAndValidateForm drops unknown form-field keys (no freeform builder)', () => {
  const body = baseValidBody({
    form_config: {
      name: { enabled: 'on', required: 'on' },
      ssn: { enabled: 'on', required: 'on' },
      favorite_color: { enabled: 'on' },
    },
  });
  const { patch } = svc.parseAndValidateForm(body, {});
  assert.ok(!('ssn' in patch.form_config));
  assert.ok(!('favorite_color' in patch.form_config));
  // bounded set only
  for (const k of Object.keys(patch.form_config)) {
    assert.ok(svc.SUPPORTED_FORM_FIELDS.includes(k), `unexpected field ${k}`);
  }
});

test('parseAndValidateForm keeps notes_enabled in sync with form_config.notes.enabled', () => {
  const enabled = svc.parseAndValidateForm(baseValidBody({
    form_config: { name: { enabled: 'on', required: 'on' }, notes: { enabled: 'on' } },
  }), {}).patch;
  assert.equal(enabled.notes_enabled, true);

  const disabled = svc.parseAndValidateForm(baseValidBody({
    form_config: { name: { enabled: 'on', required: 'on' }, notes: {} },
  }), {}).patch;
  assert.equal(disabled.notes_enabled, false);
});

test('isEmailConfirmationToggleDisabled reflects the email form field state', () => {
  assert.equal(svc.isEmailConfirmationToggleDisabled({ form_config: { email: { enabled: false } } }), true);
  assert.equal(svc.isEmailConfirmationToggleDisabled({ form_config: { email: { enabled: true } } }), false);
  assert.equal(svc.isEmailConfirmationToggleDisabled({}), true);
});
