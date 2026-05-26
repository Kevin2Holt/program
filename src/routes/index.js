'use strict';

// Top-level route mounting. Ordering matters: the public calendar router
// must be mounted *before* the generic `/:code` public event router so the
// `/:code/calendar` paths are matched first.

const express = require('express');
const authRoutes = require('./authRoutes');
const organizerCalendarRoutes = require('./organizerCalendarRoutes');
const publicCalendarRoutes = require('./publicCalendarRoutes');
const publicEventRoutes = require('./publicEventRoutes');

const router = express.Router();

// Static/system endpoints
router.get('/', (req, res) => {
  res.render('public/home', { title: 'progr.am', pageTitle: 'progr.am' });
});

router.get('/healthz', (req, res) => res.json({ ok: true }));

// Auth (stubs).
router.use(authRoutes);

// Organizer-side calendar management.
router.use('/events', organizerCalendarRoutes);

// Public calendar (specific) — must come before the generic `/:code` route.
router.use(publicCalendarRoutes);

// Generic public event route — code-first; mounted last among public routes.
router.use(publicEventRoutes);

module.exports = router;
