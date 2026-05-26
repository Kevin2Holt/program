'use strict';

// Public calendar routes — mounted under `/:code/calendar`.
//
// ROUTE ORDERING NOTE:
// The application's public route model is code-first. The generic `/:code`
// route in publicEventRoutes is intentionally registered *after* this
// router so it never swallows `/:code/calendar` URLs. The router below
// pre-loads the event by code and exposes:
//
//   GET  /:code/calendar
//   POST /:code/calendar/selections
//   GET  /:code/calendar/signup
//   POST /:code/calendar/submit
//   GET  /:code/calendar/confirmation/:ref
//   GET  /:code/calendar/confirmation/:ref/calendar.ics  (add-to-calendar)

const express = require('express');
const calendarController = require('../controllers/public/calendarController');
const { loadByCode } = require('../middleware/loadEvent');
const { selectionsLimiter, submitLimiter, icsLimiter } = require('../middleware/rateLimits');

const router = express.Router({ mergeParams: true });

// Resolve req.event from `:code` on every request handled by this router.
router.use('/:code/calendar', loadByCode('code'));

router.get('/:code/calendar', calendarController.show);
router.post('/:code/calendar/selections', selectionsLimiter, calendarController.updateSelections);
router.get('/:code/calendar/signup', calendarController.signup);
router.post('/:code/calendar/submit', submitLimiter, calendarController.submit);
router.get('/:code/calendar/confirmation/:ref', calendarController.confirmation);
router.get('/:code/calendar/confirmation/:ref/calendar.ics', icsLimiter, calendarController.addToCalendar);
// Back-compat alias without extension.
router.get('/:code/calendar/confirmation/:ref/calendar', icsLimiter, calendarController.addToCalendar);

module.exports = router;
