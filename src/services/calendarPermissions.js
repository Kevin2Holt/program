'use strict';

// Calendar permission constants and helpers.
//
// The permission surface is the calendar.* namespace, kept intentionally
// shallow so it can merge cleanly into a future role-aware system. During
// the standalone period any authenticated event member may temporarily hold
// all calendar permissions, but every entry point still goes through these
// helpers so later role-aware enforcement is a single-layer change.

const PERMISSIONS = Object.freeze({
  VIEW: 'calendar.view',
  VIEW_DETAILS: 'calendar.view.details',
  EDIT: 'calendar.edit',
  EDIT_ITEMS: 'calendar.edit.items',
  EDIT_AVAILABILITY: 'calendar.edit.availability',
  EDIT_BOOKINGS: 'calendar.edit.bookings',
  EXPORT: 'calendar.export',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/**
 * Return the set of calendar permissions held by `user` for `event`.
 *
 * Standalone-phase policy: any authenticated user that is a member of the
 * event (or its owner) receives all calendar permissions. The full role-aware
 * matrix is a Phase-4B+ concern and is intentionally TODO here. The signature
 * is already permission-aware so callers do not have to change later.
 *
 * @param {{ id: number } | null} user
 * @param {{ id: number, owner_id?: number | null }} event
 * @returns {Set<string>}
 */
function permissionsFor(user, event) {
  if (!user || !event) return new Set();
  // TODO(phase-4b+): consult event_members.role and a role->permissions map.
  // For now, any logged-in member or owner gets the full calendar.* set.
  if (event.owner_id && event.owner_id === user.id) {
    return new Set(ALL_PERMISSIONS);
  }
  // TODO: real membership lookup; for now, assume membership is checked at
  // the route-guard layer (require-auth + event scoping) and grant all.
  return new Set(ALL_PERMISSIONS);
}

/**
 * Convenience predicate. Returns true when the user has the given permission
 * on the event.
 */
function hasPermission(user, event, permission) {
  return permissionsFor(user, event).has(permission);
}

/**
 * Throws when the user lacks the permission. Throws an error with .status=403
 * so the global error handler can render the standard forbidden page.
 */
function requirePermission(user, event, permission) {
  if (!hasPermission(user, event, permission)) {
    const err = new Error(`Forbidden: missing ${permission}`);
    err.status = 403;
    err.code = 'CALENDAR_PERMISSION_DENIED';
    err.missingPermission = permission;
    throw err;
  }
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  permissionsFor,
  hasPermission,
  requirePermission,
};
