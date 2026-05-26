'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const perms = require('../../src/services/calendarPermissions');

test('PERMISSIONS uses the calendar.* namespace and is shallow', () => {
  for (const p of perms.ALL_PERMISSIONS) {
    assert.ok(p.startsWith('calendar.'), `${p} not in calendar.* namespace`);
    // At most three segments (calendar + up to two sub-levels).
    assert.ok(p.split('.').length <= 3, `${p} is too deep`);
  }
});

test('ALL_PERMISSIONS covers each documented Phase 2/3 permission', () => {
  const expected = [
    'calendar.view',
    'calendar.view.details',
    'calendar.edit',
    'calendar.edit.items',
    'calendar.edit.availability',
    'calendar.edit.bookings',
    'calendar.export',
  ];
  for (const e of expected) assert.ok(perms.ALL_PERMISSIONS.includes(e), `missing ${e}`);
});

test('permissionsFor returns empty set when no user', () => {
  const got = perms.permissionsFor(null, { id: 1 });
  assert.equal(got.size, 0);
});

test('permissionsFor grants all calendar.* during standalone phase', () => {
  const user = { id: 7 };
  const event = { id: 1, owner_id: 7 };
  const got = perms.permissionsFor(user, event);
  for (const p of perms.ALL_PERMISSIONS) assert.ok(got.has(p), `missing ${p}`);
});

test('requirePermission throws 403-shaped error when permissions are empty', () => {
  // With no user, permissionsFor returns an empty set, which exercises the
  // forbidden branch and lets us assert the error shape.
  assert.throws(
    () => perms.requirePermission(null, { id: 2 }, 'calendar.export'),
    (err) => err.status === 403
      && err.code === 'CALENDAR_PERMISSION_DENIED'
      && err.missingPermission === 'calendar.export',
  );
});

test('hasPermission returns true for an owner-member user', () => {
  const user = { id: 1 };
  const event = { id: 99, owner_id: 1 };
  for (const p of perms.ALL_PERMISSIONS) {
    assert.equal(perms.hasPermission(user, event, p), true);
  }
});
