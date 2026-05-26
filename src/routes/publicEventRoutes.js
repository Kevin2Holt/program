'use strict';

// Generic public event route — `/:code`.
//
// IMPORTANT: this router must be mounted *after* the public calendar router
// so it does not swallow `/:code/calendar` paths. See routes/index.js.

const express = require('express');
const { loadByCode } = require('../middleware/loadEvent');
const eventController = require('../controllers/public/eventController');

const router = express.Router({ mergeParams: true });

// Reserved-words handling and old-code redirection are part of the main app
// design and will be layered in by their own phases. For Phase 4A this route
// simply resolves the event and renders the public placeholder.
router.get('/:code', loadByCode('code'), eventController.show);

module.exports = router;
