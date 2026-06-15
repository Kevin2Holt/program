'use strict';

// Centralized environment configuration. Loads .env once and exposes a frozen
// object so application code never has to read process.env directly.

require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return fallback;
  }
  return v;
}

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '3000', 10),

  databaseUrl: required('DATABASE_URL', 'postgres://program:program@localhost:5432/program_dev'),

  session: {
    secret: required('SESSION_SECRET', 'dev-only-insecure-secret'),
    name: process.env.SESSION_NAME || 'program.sid',
    // 30 days; pending-selection state is also kept in this session.
    maxAgeMs: 1000 * 60 * 60 * 24 * 30,
  },

  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0,

  // Application base URL — used when composing absolute links in emails and
  // ICS files. Defaults to localhost in dev; required in production via env.
  appBaseUrl: required('APP_BASE_URL', 'http://localhost:3000'),

  email: {
    // 'noop' = silently drop, 'log' = console.log, 'smtp' = attempt SMTP.
    // Default 'noop' so dev/test never accidentally send mail.
    provider: process.env.EMAIL_PROVIDER || 'noop',
    from: process.env.MAIL_FROM || 'noreply@example.com',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
});

module.exports = env;
