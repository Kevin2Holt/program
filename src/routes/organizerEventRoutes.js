'use strict';

// Organizer event create routes. Lives separately from the per-event
// organizer calendar routes (`/events/:eventId/...`) so the create form
// can be mounted at `/events/new` without needing a numeric param.

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const eventController = require('../controllers/organizer/eventController');

const router = express.Router();

router.get('/events/new', requireAuth, eventController.newForm);
router.post('/events', requireAuth, eventController.create);

module.exports = router;
