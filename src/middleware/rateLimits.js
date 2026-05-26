'use strict';

// Per-route rate limiters. Each limiter is a no-op in the test environment
// so unit tests can exercise routes without bumping into limits; production
// and dev still get protection.

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

function makeLimiter({ windowMs, max, message }) {
  if (env.isTest) {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: message || 'Too many requests, please try again shortly.',
  });
}

// Public selection updates: cart-style toggles, expected ~1/sec ceiling.
const selectionsLimiter = makeLimiter({ windowMs: 60 * 1000, max: 60 });

// Public submit: the actual booking write. Slow ceiling per IP.
const submitLimiter = makeLimiter({ windowMs: 60 * 1000, max: 10 });

// ICS download: cheap GET but worth a per-minute cap to avoid pathological
// scraping of confirmation refs.
const icsLimiter = makeLimiter({ windowMs: 60 * 1000, max: 30 });

module.exports = {
  selectionsLimiter,
  submitLimiter,
  icsLimiter,
};
