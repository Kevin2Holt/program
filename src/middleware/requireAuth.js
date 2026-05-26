'use strict';

// requireAuth — gates authenticated organizer routes. Anonymous users are
// redirected to the login page (route not built in Phase 4A; the placeholder
// /auth/login route lives in the organizer route file).

module.exports = function requireAuth(req, res, next) {
  if (req.user) return next();
  // Preserve the originally requested URL so the login flow can return here.
  const ret = encodeURIComponent(req.originalUrl);
  return res.redirect(`/auth/login?returnTo=${ret}`);
};
