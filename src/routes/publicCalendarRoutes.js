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
//   GET  /:code/calendar/confirmation/:ref/calendar  (add-to-calendar; later)

const express = require('express');
const calendarController = require('../controllers/public/calendarController');
const { loadByCode } = require('../middleware/loadEvent');

const router = express.Router({ mergeParams: true });

// Resolve req.event from `:code` on every request handled by this router.
router.use('/:code/calendar', loadByCode('code'));

router.get('/:code/calendar', calendarController.show);
router.post('/:code/calendar/selections', calendarController.updateSelections);
router.get('/:code/calendar/signup', calendarController.signup);
router.post('/:code/calendar/submit', calendarController.submit);
router.get('/:code/calendar/confirmation/:ref', calendarController.confirmation);

// Placeholder for add-to-calendar output; implemented in a later phase.
router.get('/:code/calendar/confirmation/:ref/calendar', (req, res) => {
  res.status(501).type('text/plain').send('Add-to-calendar output is not implemented yet.');
});

module.exports = router;
