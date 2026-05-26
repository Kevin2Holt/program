'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub mailService BEFORE requiring calendarEmailService.
const mailPath = require.resolve('../../src/services/mailService');
const captured = [];
require.cache[mailPath] = {
  id: mailPath,
  filename: mailPath,
  loaded: true,
  exports: {
    sendMail: async (msg) => {
      captured.push(msg);
      return { delivered: true, provider: 'stub', info: msg };
    },
  },
};

const calendarEmailService = require('../../src/services/calendarEmailService');

function baseInput(overrides = {}) {
  return {
    event: { id: 1, code: 'demo', name: 'Demo Event' },
    config: { email_confirmation_enabled: true },
    formConfig: { email: { enabled: true } },
    booking: {
      id: 5,
      confirmation_ref: 'abc123',
      email: 'user@example.com',
      registrant: { name: 'Test User' },
    },
    selections: [
      { item_name_snapshot: 'Lunch', selected_date: '2026-06-01' },
    ],
    ...overrides,
  };
}

test('sendBookingConfirmation skips when booking has no email', async () => {
  const res = await calendarEmailService.sendBookingConfirmation(baseInput({
    booking: { confirmation_ref: 'x', email: null, registrant: {} },
  }));
  assert.equal(res.sent, false);
  assert.equal(res.skipped, 'preconditions-not-met');
});

test('sendBookingConfirmation skips when email_confirmation_enabled is false', async () => {
  const res = await calendarEmailService.sendBookingConfirmation(baseInput({
    config: { email_confirmation_enabled: false },
  }));
  assert.equal(res.sent, false);
  assert.equal(res.skipped, 'preconditions-not-met');
});

test('sendBookingConfirmation skips when form email field is disabled', async () => {
  const res = await calendarEmailService.sendBookingConfirmation(baseInput({
    formConfig: { email: { enabled: false } },
  }));
  assert.equal(res.sent, false);
});

test('sendBookingConfirmation sends mail when all preconditions met', async () => {
  captured.length = 0;
  const res = await calendarEmailService.sendBookingConfirmation(baseInput());
  assert.equal(res.sent, true);
  assert.equal(captured.length, 1);
  const msg = captured[0];
  assert.equal(msg.to, 'user@example.com');
  assert.match(msg.subject, /Demo Event/);
  assert.match(msg.text, /abc123/);
  assert.match(msg.text, /Lunch/);
  assert.match(msg.text, /calendar\.ics/);
});

test('shouldSend accepts boolean shape for formConfig.email', () => {
  const { shouldSend } = calendarEmailService._internals;
  assert.equal(shouldSend({
    config: { email_confirmation_enabled: true },
    formConfig: { email: true },
    booking: { email: 'a@b' },
  }), true);
  assert.equal(shouldSend({
    config: { email_confirmation_enabled: true },
    formConfig: { email: false },
    booking: { email: 'a@b' },
  }), false);
});
