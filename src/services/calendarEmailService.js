'use strict';

// calendarEmailService — composes and sends booking confirmation emails.
//
// Call sites use `sendBookingConfirmation` AFTER the booking is finalized.
// The function is best-effort: any error is returned in the result, never
// thrown, so a failed email never causes a successful booking to fail.

const env = require('../config/env');
const mailService = require('./mailService');

/**
 * Decide whether the booking should trigger an email and, if so, send it.
 *
 * @param {Object} input
 * @param {Object} input.event       — event row
 * @param {Object} input.config      — calendar_config row
 * @param {Object} input.formConfig  — registrant_form_config row (resolved)
 * @param {Object} input.booking     — booking row (must include confirmation_ref)
 * @param {Array}  input.selections  — booking_selections rows
 * @returns {Promise<{ sent: boolean, skipped?: string, result?: any }>}
 */
async function sendBookingConfirmation({ event, config, formConfig, booking, selections }) {
  if (!shouldSend({ config, formConfig, booking })) {
    return { sent: false, skipped: 'preconditions-not-met' };
  }
  const subject = `Confirmation: ${event.name || 'Booking'}`;
  const baseUrl = (env.appBaseUrl || '').replace(/\/$/, '');
  const confirmationUrl = `${baseUrl}/${encodeURIComponent(event.code)}/calendar/confirmation/${encodeURIComponent(booking.confirmation_ref)}`;
  const icsUrl = `${confirmationUrl}/calendar.ics`;

  const text = composePlainText({
    event, config, booking, selections, confirmationUrl, icsUrl,
  });

  try {
    const result = await mailService.sendMail({
      to: booking.email,
      subject,
      text,
    });
    return { sent: !!result.delivered, result };
  } catch (err) {
    return { sent: false, error: err };
  }
}

function shouldSend({ config, formConfig, booking }) {
  if (!booking || !booking.email) return false;
  if (!config || !config.email_confirmation_enabled) return false;
  if (!formConfig) return false;
  // formConfig.email may be a boolean or an object; accept either shape.
  const emailFieldEnabled = formConfig.email === true
    || (formConfig.email && formConfig.email.enabled === true);
  return !!emailFieldEnabled;
}

function composePlainText({ event, booking, selections, confirmationUrl, icsUrl }) {
  const lines = [];
  lines.push(`Thanks for signing up for ${event.name || 'the event'}.`);
  lines.push('');
  lines.push(`Confirmation reference: ${booking.confirmation_ref}`);
  if (booking.registrant && booking.registrant.name) {
    lines.push(`Name: ${booking.registrant.name}`);
  }
  lines.push('');
  if (Array.isArray(selections) && selections.length > 0) {
    lines.push('Your selections:');
    selections.forEach((sel) => {
      const parts = [];
      if (sel.item_name_snapshot) parts.push(sel.item_name_snapshot);
      parts.push(String(sel.selected_date).slice(0, 10));
      if (sel.occurrence_label_snapshot) parts.push(sel.occurrence_label_snapshot);
      if (sel.occurrence_start_snapshot) {
        let span = sel.occurrence_start_snapshot;
        if (sel.occurrence_end_snapshot) span += `–${sel.occurrence_end_snapshot}`;
        parts.push(span);
      }
      lines.push(`  - ${parts.join(' · ')}`);
    });
    lines.push('');
  }
  lines.push(`View your confirmation: ${confirmationUrl}`);
  lines.push(`Add to calendar: ${icsUrl}`);
  lines.push('');
  lines.push('If you did not sign up, you can ignore this email.');
  return lines.join('\n');
}

module.exports = {
  sendBookingConfirmation,
  _internals: { shouldSend, composePlainText },
};
