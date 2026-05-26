'use strict';

// Opaque-token helpers used by the calendar module.
//
// Confirmation refs must be opaque, non-sequential, scoped to one booking,
// safe for public viewing by possession of link, and not usable as an edit
// link. We use 32 bytes of crypto-random data base64url-encoded.
//
// Submission tokens are similarly opaque and are stored on the booking row to
// dedupe accidental double-submits.

const crypto = require('crypto');

function base64urlBytes(n) {
  return crypto.randomBytes(n)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Generate a fresh opaque confirmation reference for a booking. Returns a
 * URL-safe string of ~43 characters (256 bits of entropy).
 */
function generateConfirmationRef() {
  return base64urlBytes(32);
}

/**
 * Generate a fresh opaque submission token. Tokens are typically minted by
 * the server when rendering the public signup form and persisted on the
 * booking row at finalization time; resubmissions with the same token resolve
 * to the same booking.
 */
function generateSubmissionToken() {
  return base64urlBytes(24);
}

/**
 * Validate the shape of a confirmation reference. Used by the public
 * confirmation route to reject obvious garbage before a DB hit.
 */
const REF_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
function isValidConfirmationRefShape(ref) {
  return typeof ref === 'string' && REF_PATTERN.test(ref);
}

module.exports = {
  generateConfirmationRef,
  generateSubmissionToken,
  isValidConfirmationRefShape,
};
