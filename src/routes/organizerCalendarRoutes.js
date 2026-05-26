'use strict';

// Organizer calendar routes — mounted under `/events/:eventId/calendar`.
//
// Every route in this file requires authentication, an event scoping check,
// and an explicit `calendar.*` permission check. Even when the standalone
// permission policy is broadly permissive, the check runs through the
// permission service so the merge into the main app's role-aware model is a
// single-layer change.

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { loadById } = require('../middleware/loadEvent');
const requireCalendarPermission = require('../middleware/requireCalendarPermission');
const { PERMISSIONS } = require('../services/calendarPermissions');
const ctrl = require('../controllers/organizer/calendarController');

const router = express.Router({ mergeParams: true });

// Apply auth + event resolution to the whole organizer calendar tree.
router.use('/:eventId/calendar', requireAuth, loadById('eventId'));

router.get('/:eventId/calendar',
  requireCalendarPermission(PERMISSIONS.VIEW), ctrl.index);

router.get('/:eventId/calendar/setup',
  requireCalendarPermission(PERMISSIONS.EDIT), ctrl.setup);

router.get('/:eventId/calendar/items',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.items);

router.get('/:eventId/calendar/occurrences',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrences);

router.get('/:eventId/calendar/availability',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availability);

router.get('/:eventId/calendar/bookings',
  requireCalendarPermission(PERMISSIONS.VIEW_DETAILS), ctrl.bookings);

router.get('/:eventId/calendar/export',
  requireCalendarPermission(PERMISSIONS.EXPORT), ctrl.exportPage);

module.exports = router;
