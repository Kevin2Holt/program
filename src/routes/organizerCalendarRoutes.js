'use strict';

// Organizer calendar routes — mounted under `/events/:eventId/calendar`.
//
// Every route requires authentication, an event scoping check, and an
// explicit `calendar.*` permission check. Permission checks go through the
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

// --- Setup ---
router.get('/:eventId/calendar/setup',
  requireCalendarPermission(PERMISSIONS.EDIT), ctrl.setup);
router.post('/:eventId/calendar/setup',
  requireCalendarPermission(PERMISSIONS.EDIT), ctrl.setupSubmit);

// --- Items ---
router.get('/:eventId/calendar/items',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.items);
router.get('/:eventId/calendar/items/new',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.itemNew);
router.post('/:eventId/calendar/items',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.itemCreate);
router.get('/:eventId/calendar/items/:itemId/edit',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.itemEdit);
router.post('/:eventId/calendar/items/:itemId',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.itemUpdate);
router.post('/:eventId/calendar/items/:itemId/archive',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.itemArchive);
router.post('/:eventId/calendar/items/:itemId/unarchive',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.itemUnarchive);

// --- Occurrences (timed mode) ---
router.get('/:eventId/calendar/occurrences',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrences);
router.get('/:eventId/calendar/occurrences/new',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrenceNew);
router.post('/:eventId/calendar/occurrences',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrenceCreate);
router.get('/:eventId/calendar/occurrences/:occurrenceId/edit',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrenceEdit);
router.post('/:eventId/calendar/occurrences/:occurrenceId',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrenceUpdate);
router.post('/:eventId/calendar/occurrences/:occurrenceId/archive',
  requireCalendarPermission(PERMISSIONS.EDIT_ITEMS), ctrl.occurrenceArchive);

// --- Availability rules ---
router.get('/:eventId/calendar/availability',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availability);
router.get('/:eventId/calendar/availability/new',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availabilityNew);
router.post('/:eventId/calendar/availability',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availabilityCreate);
router.get('/:eventId/calendar/availability/:ruleId/edit',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availabilityEdit);
router.post('/:eventId/calendar/availability/:ruleId',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availabilityUpdate);
router.post('/:eventId/calendar/availability/:ruleId/archive',
  requireCalendarPermission(PERMISSIONS.EDIT_AVAILABILITY), ctrl.availabilityArchive);

// --- Bookings / Export ---
router.get('/:eventId/calendar/bookings',
  requireCalendarPermission(PERMISSIONS.VIEW_DETAILS), ctrl.bookings);
router.get('/:eventId/calendar/bookings/:bookingId',
  requireCalendarPermission(PERMISSIONS.VIEW_DETAILS), ctrl.bookingShow);
router.post('/:eventId/calendar/bookings/:bookingId/cancel',
  requireCalendarPermission(PERMISSIONS.EDIT_BOOKINGS), ctrl.bookingCancel);
router.get('/:eventId/calendar/export',
  requireCalendarPermission(PERMISSIONS.EXPORT), ctrl.exportPage);

module.exports = router;
