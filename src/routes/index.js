'use strict';

// Top-level route mounting. Ordering matters: the public calendar router
// must be mounted *before* the generic `/:code` public event router so the
// `/:code/calendar` paths are matched first. Likewise, the organizer
// create-event router (`/events/new`, `/events`) is mounted before the
// organizer calendar router so `/events/new` is not interpreted as
// `/events/:eventId` where `eventId = "new"`.

const express = require('express');
const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const accountRoutes = require('./accountRoutes');
const organizerEventRoutes = require('./organizerEventRoutes');
const organizerCalendarRoutes = require('./organizerCalendarRoutes');
const publicCalendarRoutes = require('./publicCalendarRoutes');
const publicEventRoutes = require('./publicEventRoutes');

const router = express.Router();

// Static/system endpoints
router.get('/', (req, res) => {
  res.render('public/home', { title: 'progr.am', pageTitle: 'progr.am' });
});

router.get('/healthz', (req, res) => res.json({ ok: true }));

// Auth.
router.use(authRoutes);

// Authenticated organizer surfaces.
router.use(dashboardRoutes);
router.use(accountRoutes);

// Organizer event create (must precede per-event calendar routes so
// `/events/new` isn't matched as `/events/:eventId`).
router.use(organizerEventRoutes);

// Organizer-side calendar management.
router.use('/events', organizerCalendarRoutes);

// Public calendar (specific) — must come before the generic `/:code` route.
router.use(publicCalendarRoutes);

// Generic public event route — code-first; mounted last among public routes.
router.use(publicEventRoutes);

module.exports = router;
