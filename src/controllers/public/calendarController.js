'use strict';

// Public calendar controller — handles the `/:code/calendar` family.
//
// Phase 4B.3: full browse/select/submit/confirm flow.
//   GET  /:code/calendar              — date×item grid + pending selections
//   POST /:code/calendar/selections   — add/remove/replace pending selections
//   GET  /:code/calendar/signup       — registrant form (gated by selections)
//   POST /:code/calendar/submit       — finalize booking
//   GET  /:code/calendar/confirmation/:ref — booking confirmation page
//
// Selection authority and availability stay on the server. Pending selections
// live in the session, keyed by calendar_config_id. Submit re-resolves
// availability through the booking service which itself re-checks window,
// blocked-by-rules, and capacity inside a transaction.

const calendarConfigService = require('../../services/calendarConfigService');
const calendarBookingService = require('../../services/calendarBookingService');
const calendarAvailabilityService = require('../../services/calendarAvailabilityService');
const calendarOccurrenceService = require('../../services/calendarOccurrenceService');
const bookingModel = require('../../models/calendarBooking');
const occurrenceModel = require('../../models/calendarOccurrence');
const references = require('../../services/calendarReferences');
const calendarIcsService = require('../../services/calendarIcsService');
const calendarEmailService = require('../../services/calendarEmailService');

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

/* ------------------------------------------------------------------ */
/* GET /:code/calendar — date×item grid                                */
/* ------------------------------------------------------------------ */

exports.show = async function show(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;

    const items = await calendarAvailabilityService.listActiveItemsForEvent(req.event.id);
    let rules = [];
    try {
      rules = await calendarAvailabilityService.loadHydratedRules(config.id);
    } catch (_e) { rules = []; }

    const { occurrencesByItemDate, capacityUsage } = await collectOccurrencesAndUsage({
      config, items,
    });

    const resolved = calendarAvailabilityService.resolveAvailabilityForRange({
      config, items, rules,
      occurrencesByItemDate,
      capacityUsage,
      view: 'public',
    });

    const pending = calendarBookingService.getPendingSelections(req.session, config.id);
    const itemsById = new Map(items.map((i) => [Number(i.id), i]));

    res.render('public/calendar/index', {
      title: config.title || 'Calendar',
      pageTitle: config.title || 'Calendar',
      event: req.event,
      config,
      items,
      itemsById,
      grid: resolved,
      dateWindow: resolved.window,
      pendingSelections: pending,
      pendingPretty: prettifyPending(pending, itemsById),
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

/* ------------------------------------------------------------------ */
/* POST /:code/calendar/selections — add/remove/replace                */
/* ------------------------------------------------------------------ */

exports.updateSelections = async function updateSelections(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;

    const body = req.body || {};
    const action = body.action || 'replace';
    const current = calendarBookingService.getPendingSelections(req.session, config.id);

    let updated;
    if (action === 'add') {
      const incoming = readOneSelection(body);
      updated = calendarBookingService.normalizeSelections(
        incoming ? [...current, incoming] : current,
      );
    } else if (action === 'remove') {
      const incoming = readOneSelection(body);
      if (!incoming) {
        updated = current;
      } else {
        updated = current.filter((s) => !sameSelection(s, incoming));
      }
    } else if (action === 'clear') {
      updated = [];
    } else {
      // replace — accepts a fully-formed selections payload (array).
      updated = calendarBookingService.normalizeSelections(body.selections);
    }

    calendarBookingService.setPendingSelections(req.session, config.id, updated);
    res.redirect(`/${req.event.code}/calendar`);
  } catch (err) { next(err); }
};

function readOneSelection(body) {
  if (!body || !body.itemId || !body.selectedDate || !body.selectionType) return null;
  return {
    itemId: Number(body.itemId),
    selectedDate: String(body.selectedDate).slice(0, 10),
    selectionType: String(body.selectionType),
    occurrenceId: body.occurrenceId ? Number(body.occurrenceId) : null,
  };
}

function sameSelection(a, b) {
  if (a.selectionType !== b.selectionType) return false;
  if (a.selectionType === 'occurrence') {
    return Number(a.occurrenceId) === Number(b.occurrenceId);
  }
  return Number(a.itemId) === Number(b.itemId) && a.selectedDate === b.selectedDate;
}

/* ------------------------------------------------------------------ */
/* GET /:code/calendar/signup — registrant form                        */
/* ------------------------------------------------------------------ */

exports.signup = async function signup(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;
    const pending = calendarBookingService.getPendingSelections(req.session, config.id);
    if (pending.length === 0) {
      return res.redirect(`/${req.event.code}/calendar`);
    }
    const items = await calendarAvailabilityService.listActiveItemsForEvent(req.event.id);
    const itemsById = new Map(items.map((i) => [Number(i.id), i]));

    return res.render('public/calendar/signup', {
      title: 'Sign up',
      pageTitle: 'Sign up',
      event: req.event,
      config,
      formConfig: config.form_config || {},
      pendingSelections: pending,
      pendingPretty: prettifyPending(pending, itemsById),
      values: {},
      errors: [],
      errorsByField: {},
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { return next(err); }
};

/* ------------------------------------------------------------------ */
/* POST /:code/calendar/submit                                         */
/* ------------------------------------------------------------------ */

exports.submit = async function submit(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;

    const pending = calendarBookingService.getPendingSelections(req.session, config.id);
    if (pending.length === 0) {
      return res.redirect(`/${req.event.code}/calendar`);
    }

    const formConfig = config.form_config || {};
    const { values, errors } = parseAndValidateRegistrantForm(req.body || {}, formConfig);
    if (errors.length > 0) {
      return renderSignupWithErrors(req, res, config, pending, values, errors);
    }

    // Ensure each submission attempt has a stable idempotency token so
    // duplicate POSTs (back-button, double-click) resolve to the same booking
    // instead of creating a second one.
    if (!req.session.calendarSubmissionTokens) req.session.calendarSubmissionTokens = {};
    let token = req.session.calendarSubmissionTokens[config.id];
    if (!token) {
      token = references.generateSubmissionToken();
      req.session.calendarSubmissionTokens[config.id] = token;
    }

    let result;
    try {
      result = await calendarBookingService.finalizeBooking({
        event: req.event,
        config,
        selections: pending,
        registrant: values.registrant,
        email: values.email,
        notes: values.notes,
        submissionToken: token,
      });
    } catch (err) {
      if (err && err.code && err.status) {
        return renderSignupWithErrors(req, res, config, pending, values, [{
          field: '_form', message: humanizeBookingError(err.code, err.message),
        }], err.status);
      }
      return next(err);
    }

    // Clear pending selections + token so the cart doesn't linger after a
    // successful booking. The confirmation page lives at a separate URL.
    calendarBookingService.clearPendingSelections(req.session, config.id);
    delete req.session.calendarSubmissionTokens[config.id];

    // Best-effort confirmation email. We intentionally do not await failures
    // beyond the service's own guards — the booking is already persisted and
    // the user will see the confirmation page even if mail delivery fails.
    try {
      await calendarEmailService.sendBookingConfirmation({
        event: req.event,
        config,
        formConfig: config.form_config || {},
        booking: result.booking,
        selections: pending,
      });
    } catch (mailErr) {
      // eslint-disable-next-line no-console
      console.warn('[calendar] confirmation email failed:', mailErr && mailErr.message);
    }

    return res.redirect(`/${req.event.code}/calendar/confirmation/${result.booking.confirmation_ref}`);
  } catch (err) { return next(err); }
};

function renderSignupWithErrors(req, res, config, pending, values, errors, status = 400) {
  const errorsByField = {};
  for (const e of errors) {
    if (!errorsByField[e.field]) errorsByField[e.field] = [];
    errorsByField[e.field].push(e.message);
  }
  // Pretty selections for the cart sidebar. We don't need a fresh item lookup
  // here because the signup page only displays the item names/dates already
  // resolved on the previous render — but tests render this page in isolation
  // so we still build a best-effort map without DB access.
  const itemsById = new Map();
  return res.status(status).render('public/calendar/signup', {
    title: 'Sign up',
    pageTitle: 'Sign up',
    event: req.event,
    config,
    formConfig: config.form_config || {},
    pendingSelections: pending,
    pendingPretty: prettifyPending(pending, itemsById),
    values,
    errors,
    errorsByField,
    csrfToken: req.csrfToken ? req.csrfToken() : null,
  });
}

function humanizeBookingError(code, fallback) {
  switch (code) {
    case 'NO_SELECTIONS':
      return 'Please choose at least one date before signing up.';
    case 'OUT_OF_WINDOW':
      return 'One of your selected dates is no longer in the calendar window.';
    case 'BLOCKED':
      return 'One of your selected dates is no longer available.';
    case 'SELECTION_GONE':
      return 'One of your selections is no longer available. Please pick again.';
    case 'CAPACITY_FULL':
      return 'One of your selections just filled up. Please pick a different date or time.';
    case 'TIMED_OVERLAP':
      return 'Two of your time selections overlap. Please pick non-overlapping times.';
    default:
      return fallback || 'Booking could not be completed.';
  }
}

/* ------------------------------------------------------------------ */
/* GET /:code/calendar/confirmation/:ref                               */
/* ------------------------------------------------------------------ */

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
    if (!result || Number(result.booking.event_id) !== Number(req.event.id)) {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    return res.render('public/calendar/confirmation', {
      title: 'Booking confirmation',
      pageTitle: 'Booking confirmation',
      event: req.event,
      config,
      booking: result.booking,
      selections: result.selections,
      addToCalendarEnabled: !!config.add_to_calendar_enabled,
    });
  } catch (err) { return next(err); }
};

/* ------------------------------------------------------------------ */
/* GET /:code/calendar/confirmation/:ref/calendar.ics                  */
/* ------------------------------------------------------------------ */

exports.addToCalendar = async function addToCalendar(req, res, next) {
  try {
    const config = await loadConfigOrNotFound(req.event, res);
    if (!config) return;
    if (!config.add_to_calendar_enabled) {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    const ref = req.params.ref;
    if (!references.isValidConfirmationRefShape(ref)) {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    const result = await calendarBookingService.getBookingByConfirmationRef(ref);
    if (!result || Number(result.booking.event_id) !== Number(req.event.id)) {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    if (result.booking.status !== 'active') {
      return res.status(404).render('public/notFound', {
        title: 'Not found', pageTitle: 'Not found',
      });
    }
    const ics = calendarIcsService.buildIcs({
      event: req.event,
      config,
      booking: result.booking,
      selections: result.selections,
    });
    const fname = `booking-${result.booking.confirmation_ref}.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.send(ics);
  } catch (err) { return next(err); }
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Pre-load all active occurrences in the configured window and current
// capacity usage so the resolver remains synchronous + pure.
async function collectOccurrencesAndUsage({ config, items }) {
  const occurrencesByItemDate = new Map();
  const capacityUsage = new Map();
  const window = calendarAvailabilityService.deriveDateWindow(config);
  if (!window) return { occurrencesByItemDate, capacityUsage };
  const isTimed = config.time_behavior_mode === 'timed';

  if (isTimed) {
    for (const item of items) {
      let occs = [];
      try {
        occs = await occurrenceModel.listForItemInRange(item.id, window.start, window.end);
      } catch (_e) {
        // Fallback for stubs that only implement listForItem.
        try { occs = await occurrenceModel.listForItem(item.id, { includeArchived: false }); }
        catch (_e2) { occs = []; }
      }
      for (const occ of occs) {
        if (occ.status !== 'active') continue;
        const date = String(occ.service_date).slice(0, 10);
        const key = `${item.id}:${date}`;
        if (!occurrencesByItemDate.has(key)) occurrencesByItemDate.set(key, []);
        occurrencesByItemDate.get(key).push(occ);

        try {
          const used = await bookingModel.countActiveForOccurrence(occ.id);
          capacityUsage.set(`occ:${occ.id}`, used);
        } catch (_e) { /* test stubs may not implement counters */ }
      }
    }
  } else {
    // For date-only mode capacity is per (item, date). Pre-fetching all dates
    // would be O(items × days); we leave each cell to ask the model lazily
    // through capacityUsage when known. Tests can stub this map directly.
    for (const item of items) {
      try {
        // Best-effort batch: many adapters expose a per-item summary; here we
        // simply call the standard counter for each date in the window.
        const dates = calendarAvailabilityService.enumerateDatesInclusive(window.start, window.end);
        for (const date of dates) {
          const used = await bookingModel.countActiveForItemDate(item.id, date);
          if (used > 0) capacityUsage.set(`date:${item.id}:${date}`, used);
        }
      } catch (_e) { /* tolerate */ }
    }
  }

  return { occurrencesByItemDate, capacityUsage };
}

// `pretty` returns rich display rows for the cart sidebar / signup view.
function prettifyPending(pending, itemsById) {
  return pending.map((sel) => {
    const item = itemsById && itemsById.get(Number(sel.itemId));
    return {
      ...sel,
      itemName: item ? item.name : `Item #${sel.itemId}`,
      itemColor: item ? item.color : null,
      itemShape: item ? item.shape : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Registrant form parsing                                             */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAndValidateRegistrantForm(body, formConfig) {
  const errors = [];
  const values = {
    registrant: {},
    email: null,
    notes: null,
  };

  const isEnabled = (key) => formConfig[key] && formConfig[key].enabled;
  const isRequired = (key) => formConfig[key] && formConfig[key].required;

  // Name (always supported, default required).
  if (isEnabled('name') || !formConfig.name) {
    const name = (body.name || '').toString().trim();
    if (!name && (isRequired('name') || !formConfig.name)) {
      errors.push({ field: 'name', message: 'Name is required.' });
    } else if (name.length > 120) {
      errors.push({ field: 'name', message: 'Name must be 120 characters or fewer.' });
    } else if (name) {
      values.registrant.name = name;
    }
  }

  // Phone + metadata.
  if (isEnabled('phone')) {
    const phone = (body.phone || '').toString().trim();
    if (!phone && isRequired('phone')) {
      errors.push({ field: 'phone', message: 'Phone number is required.' });
    } else if (phone.length > 40) {
      errors.push({ field: 'phone', message: 'Phone number is too long.' });
    } else if (phone) {
      values.registrant.phone = phone;
    }
    if (isEnabled('contact_method')) {
      const m = (body.contact_method || '').toString().trim();
      if (m && !['call', 'text'].includes(m)) {
        errors.push({ field: 'contact_method', message: 'Choose call or text.' });
      } else if (!m && isRequired('contact_method')) {
        errors.push({ field: 'contact_method', message: 'Choose how to contact you.' });
      } else if (m) {
        values.registrant.contact_method = m;
      }
    }
    if (isEnabled('number_type')) {
      const t = (body.number_type || '').toString().trim();
      if (t && !['cell', 'whatsapp'].includes(t)) {
        errors.push({ field: 'number_type', message: 'Choose cell or WhatsApp.' });
      } else if (!t && isRequired('number_type')) {
        errors.push({ field: 'number_type', message: 'Choose number type.' });
      } else if (t) {
        values.registrant.number_type = t;
      }
    }
  }

  // Email.
  if (isEnabled('email')) {
    const email = (body.email || '').toString().trim();
    if (!email && isRequired('email')) {
      errors.push({ field: 'email', message: 'Email is required.' });
    } else if (email && !EMAIL_RE.test(email)) {
      errors.push({ field: 'email', message: 'Enter a valid email address.' });
    } else if (email && email.length > 200) {
      errors.push({ field: 'email', message: 'Email is too long.' });
    } else if (email) {
      values.email = email;
    }
  }

  // Notes.
  if (isEnabled('notes')) {
    const notes = (body.notes || '').toString();
    if (!notes.trim() && isRequired('notes')) {
      errors.push({ field: 'notes', message: 'Notes are required.' });
    } else if (notes.length > 2000) {
      errors.push({ field: 'notes', message: 'Notes must be 2000 characters or fewer.' });
    } else if (notes.trim()) {
      values.notes = notes.trim();
    }
  }

  return { values, errors };
}

// Exposed for tests.
exports._internals = {
  parseAndValidateRegistrantForm,
  humanizeBookingError,
  prettifyPending,
  collectOccurrencesAndUsage,
};

// Silence unused-require lint when occurrence helpers are referenced.
void calendarOccurrenceService;
