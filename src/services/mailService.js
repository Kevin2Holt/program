'use strict';

// mailService — pluggable mail transport.
//
// Providers:
//   noop  — discard silently (default; tests, dev without SMTP)
//   log   — emit to console for local debugging
//   smtp  — attempt actual SMTP delivery. Implemented as a best-effort hook:
//           if `nodemailer` is installed it will be used; otherwise the call
//           degrades to a console warning and `delivered: false`. This keeps
//           the dependency footprint flat (no new required dep) while leaving
//           production deployments a clear path to enable SMTP by installing
//           nodemailer.
//
// All transports MUST return a result of the shape:
//   { delivered: boolean, provider: string, info?: any, error?: Error }
// They MUST NOT throw on transport failure (best-effort by design).

const env = require('../config/env');

async function sendMail({ to, subject, text, html, from }) {
  if (!to || !subject) {
    return { delivered: false, provider: env.email.provider, error: new Error('Missing to/subject') };
  }
  const message = {
    from: from || env.email.from,
    to,
    subject,
    text: text || '',
    html: html || undefined,
  };

  switch (env.email.provider) {
    case 'log':
      // eslint-disable-next-line no-console
      console.log('[mail:log]', JSON.stringify({
        to: message.to,
        from: message.from,
        subject: message.subject,
        preview: (message.text || '').slice(0, 200),
      }));
      return { delivered: true, provider: 'log', info: message };

    case 'smtp':
      return sendSmtp(message);

    case 'noop':
    default:
      return { delivered: false, provider: 'noop', info: message };
  }
}

async function sendSmtp(message) {
  let nodemailer;
  try {
    // Optional dependency — only required when EMAIL_PROVIDER=smtp.
    nodemailer = require('nodemailer'); // eslint-disable-line global-require
  } catch (_err) {
    // eslint-disable-next-line no-console
    console.warn('[mail:smtp] nodemailer is not installed; install it to enable SMTP delivery');
    return { delivered: false, provider: 'smtp', error: new Error('nodemailer not installed') };
  }
  try {
    const { host, port, user, pass } = env.email.smtp;
    if (!host) {
      return { delivered: false, provider: 'smtp', error: new Error('SMTP_HOST not configured') };
    }
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    const info = await transport.sendMail(message);
    return { delivered: true, provider: 'smtp', info };
  } catch (err) {
    return { delivered: false, provider: 'smtp', error: err };
  }
}

module.exports = { sendMail };
