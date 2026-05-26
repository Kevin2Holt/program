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
    // Pull and clear one-shot flash state set by setupSubmit on redirect.
    const flash = consumeSetupFlash(req);
    renderSetup(res, {
      event: req.event,
      config,
      values: null,
      errors: [],
      flash,
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.setupSubmit = async function setupSubmit(req, res, next) {
  try {
    const current = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const { patch, errors } = calendarConfigService.parseAndValidateForm(
      req.body || {},
      current,
    );

    if (errors.length > 0) {
      // Re-render the form with the user's submitted values + field errors so
      // the organizer never loses input. We synthesize a "values" view of the
      // patch merged onto the current config; controllers must keep this
      // shape stable for the template.
      const merged = { ...current, ...patch };
      return res.status(400).render('events/calendar/setup', {
        title: 'Calendar setup',
        pageTitle: 'Calendar setup',
        event: req.event,
        config: current,
        values: merged,
        errors,
        errorsByField: groupErrors(errors),
        flash: { kind: 'error', message: 'Please fix the highlighted fields and try again.' },
        emailConfirmationToggleDisabled:
          calendarConfigService.isEmailConfirmationToggleDisabled({ form_config: merged.form_config }),
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      });
    }

    await calendarConfigService.updateConfig(req.event.id, patch);
    setSetupFlash(req, { kind: 'success', message: 'Calendar settings saved.' });
    return res.redirect(`/events/${req.event.id}/calendar/setup`);
  } catch (err) {
    // Treat structured 400s from the service as form errors instead of 500s.
    if (err && err.status === 400) {
      try {
        const current = await calendarConfigService.getOrCreateForEvent(req.event.id);
        return res.status(400).render('events/calendar/setup', {
          title: 'Calendar setup',
          pageTitle: 'Calendar setup',
          event: req.event,
          config: current,
          values: null,
          errors: [{ field: '_form', message: err.message }],
          errorsByField: { _form: [err.message] },
          flash: { kind: 'error', message: err.message },
          emailConfirmationToggleDisabled:
            calendarConfigService.isEmailConfirmationToggleDisabled(current),
          csrfToken: req.csrfToken ? req.csrfToken() : null,
        });
      } catch (inner) { return next(inner); }
    }
    return next(err);
  }
};

function renderSetup(res, opts) {
  const { event, config, values, errors, flash, csrfToken } = opts;
  res.render('events/calendar/setup', {
    title: 'Calendar setup',
    pageTitle: 'Calendar setup',
    event,
    config,
    values,
    errors: errors || [],
    errorsByField: groupErrors(errors || []),
    flash,
    emailConfirmationToggleDisabled:
      calendarConfigService.isEmailConfirmationToggleDisabled(config),
    csrfToken,
  });
}

function groupErrors(errors) {
  const out = {};
  for (const e of errors) {
    if (!out[e.field]) out[e.field] = [];
    out[e.field].push(e.message);
  }
  return out;
}

function setSetupFlash(req, flash) {
  if (!req.session) return;
  req.session.calendarSetupFlash = flash;
}

function consumeSetupFlash(req) {
  if (!req.session) return null;
  const f = req.session.calendarSetupFlash || null;
  if (f) delete req.session.calendarSetupFlash;
  return f;
}

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
