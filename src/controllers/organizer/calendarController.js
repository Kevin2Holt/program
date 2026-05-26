'use strict';

// Organizer calendar controller — handles the
// `/events/:eventId/calendar/...` family.
//
// Phase 4A: renders placeholder landing/setup/items/availability/bookings/
// export pages that feel integrated with the rest of the app. The actual
// CRUD UIs are completed in later phases; controllers here already hand off
// to the appropriate services so the integration points are real.

const calendarConfigService = require('../../services/calendarConfigService');
const calendarItemModel = require('../../models/calendarItem');
const calendarRuleModel = require('../../models/calendarAvailabilityRule');
const bookingModel = require('../../models/calendarBooking');

exports.index = async function index(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const items = await calendarItemModel.listForEvent(req.event.id, { includeArchived: true });
    res.render('events/calendar/index', {
      title: 'Calendar',
      pageTitle: 'Calendar',
      event: req.event,
      config,
      itemCount: items.length,
      activeItemCount: items.filter((i) => i.status === 'active').length,
    });
  } catch (err) { next(err); }
};

exports.setup = async function setup(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    res.render('events/calendar/setup', {
      title: 'Calendar setup',
      pageTitle: 'Calendar setup',
      event: req.event,
      config,
      emailConfirmationToggleDisabled:
        calendarConfigService.isEmailConfirmationToggleDisabled(config),
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.items = async function items(req, res, next) {
  try {
    const items = await calendarItemModel.listForEvent(req.event.id, { includeArchived: true });
    res.render('events/calendar/items/index', {
      title: 'Calendar items',
      pageTitle: 'Calendar items',
      event: req.event,
      items,
    });
  } catch (err) { next(err); }
};

exports.occurrences = async function occurrences(req, res, next) {
  try {
    res.render('events/calendar/occurrences', {
      title: 'Occurrences',
      pageTitle: 'Occurrences',
      event: req.event,
    });
  } catch (err) { next(err); }
};

exports.availability = async function availability(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const rules = await calendarRuleModel.listForConfig(config.id);
    res.render('events/calendar/availability/index', {
      title: 'Availability',
      pageTitle: 'Availability',
      event: req.event,
      config,
      rules,
    });
  } catch (err) { next(err); }
};

exports.bookings = async function bookings(req, res, next) {
  try {
    const all = await bookingModel.listForEvent(req.event.id);
    res.render('events/calendar/bookings/index', {
      title: 'Bookings',
      pageTitle: 'Bookings',
      event: req.event,
      bookings: all,
    });
  } catch (err) { next(err); }
};

exports.exportPage = async function exportPage(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    res.render('events/calendar/export', {
      title: 'Export',
      pageTitle: 'Export',
      event: req.event,
      config,
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};
