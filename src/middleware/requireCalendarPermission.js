'use strict';

// requireCalendarPermission — route-guard middleware that checks a specific
// calendar.* permission. Routes attach this after requireAuth + loadEvent.

const { hasPermission } = require('../services/calendarPermissions');

function requireCalendarPermission(permission) {
  return function (req, res, next) {
    if (!req.user) {
      return res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }
    if (!req.event) {
      return res.status(404).render('public/notFound', { title: 'Not found', pageTitle: 'Not found' });
    }
    if (!hasPermission(req.user, req.event, permission)) {
      return res.status(403).render('partials/permissionDenied', {
        title: 'Forbidden',
        pageTitle: 'Forbidden',
        missingPermission: permission,
      });
    }
    next();
  };
}

module.exports = requireCalendarPermission;
