'use strict';

// attachUser middleware — hydrates req.user from the session, if logged in.
// Kept intentionally minimal in Phase 4A; the full user model and auth flow
// are built out by later phases.

module.exports = function attachUser(req, _res, next) {
  if (req.session && req.session.userId) {
    // TODO(phase-4b+): replace with a real user lookup against the users table.
    req.user = { id: req.session.userId, email: req.session.userEmail || null };
  } else {
    req.user = null;
  }
  next();
};
