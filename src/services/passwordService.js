'use strict';

// Password hashing using Node's built-in scrypt. No external dependency.
//
// Hash format (string-encoded so it stores in a single TEXT column):
//   scrypt$N$r$p$<salt-hex>$<derived-key-hex>
//
// Parameters chosen for ~tens of milliseconds on modern hardware. They are
// embedded in each hash so future tuning does not invalidate stored values.

const crypto = require('node:crypto');

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;

function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derived) => {
      if (err) return reject(err);
      resolve(derived);
    });
  });
}

async function hash(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verify(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (salt.length === 0 || expected.length === 0) return false;
  let derived;
  try {
    derived = await scryptAsync(password, salt, expected.length, { N: n, r, p });
  } catch (_err) {
    return false;
  }
  // Constant-time compare.
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

module.exports = { hash, verify };
