'use strict';

// Public calendar controller — handles the `/:code/calendar` family.
//
// Phase 4A: renders foundational pages and wires through the booking service
// for selection state and confirmation lookup. The full selection UI, the
// availability-aware grid, and the final submission flow are completed in
// later phases.

const calendarConfigService = require('../../services/calendarConfigService');
const calendarBookingService = require('../../services/calendarBookingService');
const calendarAvailabilityService = require('../../services/calendarAvailabilityService');
const references = require('../../services/calendarReferences');

async function loadConfigOrNotFound(event, res) {
  const config = await calendarConfigService.getForEvent(event.id);
  if (!config || !config.enabled) {
    res.status(404).render('public/notFound', {
      title: 'Calendar not available',
      pageTitle: 'Calendar not available',
    });
    return null;
  }
  return config;
}

exports.show = async function show(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;
    const items = await calendarAvailabilityService.listActiveItemsForEvent(req.event.id);
    const window = calendarAvailabilityService.deriveDateWindow(config);
    const pending = calendarBookingService.getPendingSelections(req.session, config.id);
    res.render('public/calendar/index', {
      title: config.title || 'Calendar',
      pageTitle: config.title || 'Calendar',
      event: req.event,
      config,
      items,
      dateWindow: window,
      pendingSelections: pending,
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.updateSelections = async function updateSelections(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;
    const incoming = req.body && req.body.selections;
    const normalized = calendarBookingService.normalizeSelections(incoming);
    calendarBookingService.setPendingSelections(req.session, config.id, normalized);
    // Redirect-after-post to keep the public flow refresh-safe.
    res.redirect(`/${req.event.code}/calendar`);
  } catch (err) { next(err); }
};

exports.submit = async function submit(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;
    // TODO(phase-4b+): full final-submission pipeline. This stub keeps the
    // route registered and protected so the route shape is real; it returns
    // a 501 placeholder until the booking flow lands.
    res.status(501).render('public/calendar/comingSoon', {
      title: 'Coming soon',
      pageTitle: 'Coming soon',
      event: req.event,
      config,
      heading: 'Public submission is not enabled yet',
      message: 'The booking submission flow is being built in a later phase.',
    });
  } catch (err) { next(err); }
};

exports.confirmation = async function confirmation(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;
    const ref = req.params.ref;
    if (!references.isValidConfirmationRefShape(ref)) {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    const result = await calendarBookingService.getBookingByConfirmationRef(ref);
    if (!result) {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    res.render('public/calendar/confirmation', {
      title: 'Confirmation',
      pageTitle: 'Confirmation',
      event: req.event,
      config,
      booking: result.booking,
      selections: result.selections,
    });
  } catch (err) { next(err); }
};
