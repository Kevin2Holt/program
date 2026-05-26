'use strict';

// Organizer calendar controller — handles the
// `/events/:eventId/calendar/...` family.
//
// Phase 4A: renders placeholder landing/setup/items/availability/bookings/
// export pages that feel integrated with the rest of the app. The actual
// CRUD UIs are completed in later phases; controllers here already hand off
// to the appropriate services so the integration points are real.

const calendarConfigService = require('../../services/calendarConfigService');
const calendarItemService = require('../../services/calendarItemService');
const calendarOccurrenceService = require('../../services/calendarOccurrenceService');
const calendarAvailabilityService = require('../../services/calendarAvailabilityService');
const calendarItemModel = require('../../models/calendarItem');
const calendarOccurrenceModel = require('../../models/calendarOccurrence');
const bookingModel = require('../../models/calendarBooking');
const calendarBookingService = require('../../services/calendarBookingService');
const calendarExportService = require('../../services/calendarExportService');
const publicCalendarController = require('../public/calendarController');

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

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

exports.items = async function items(req, res, next) {
  try {
    const items = await calendarItemService.listForEvent(req.event.id);
    const flash = consumeFlash(req, 'calendarItemsFlash');
    res.render('events/calendar/items/index', {
      title: 'Calendar items',
      pageTitle: 'Calendar items',
      event: req.event,
      items,
      flash,
    });
  } catch (err) { next(err); }
};

exports.itemNew = function itemNew(req, res) {
  renderItemForm(res, {
    event: req.event,
    mode: 'create',
    item: null,
    values: null,
    errors: [],
    csrfToken: req.csrfToken ? req.csrfToken() : null,
  });
};

exports.itemCreate = async function itemCreate(req, res, next) {
  try {
    const { patch, errors } = calendarItemService.parseAndValidateForm(req.body || {}, { isCreate: true });
    if (errors.length > 0) {
      return res.status(400).render('events/calendar/items/form', baseItemFormLocals({
        event: req.event, mode: 'create', item: null,
        values: { ...patch, ...sanitizeRawForView(req.body) }, errors,
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      }));
    }
    try {
      await calendarItemService.createForEvent(req.event.id, patch);
    } catch (err) {
      return renderItemCreateError(req, res, err, patch, next);
    }
    setFlash(req, 'calendarItemsFlash', { kind: 'success', message: 'Item created.' });
    return res.redirect(`/events/${req.event.id}/calendar/items`);
  } catch (err) { return next(err); }
};

exports.itemEdit = async function itemEdit(req, res, next) {
  try {
    const item = await calendarItemService.findByIdForEvent(req.event.id, req.params.itemId);
    if (!item) return notFound(res);
    renderItemForm(res, {
      event: req.event, mode: 'edit', item,
      values: null, errors: [],
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.itemUpdate = async function itemUpdate(req, res, next) {
  try {
    const existing = await calendarItemService.findByIdForEvent(req.event.id, req.params.itemId);
    if (!existing) return notFound(res);
    const { patch, errors } = calendarItemService.parseAndValidateForm(req.body || {}, { isCreate: false });
    if (errors.length > 0) {
      return res.status(400).render('events/calendar/items/form', baseItemFormLocals({
        event: req.event, mode: 'edit', item: existing,
        values: { ...existing, ...patch, ...sanitizeRawForView(req.body) }, errors,
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      }));
    }
    try {
      await calendarItemService.updateForEvent(req.event.id, req.params.itemId, patch);
    } catch (err) {
      if (err && err.status === 400) {
        return res.status(400).render('events/calendar/items/form', baseItemFormLocals({
          event: req.event, mode: 'edit', item: existing,
          values: { ...existing, ...patch }, errors: [{ field: '_form', message: err.message }],
          csrfToken: req.csrfToken ? req.csrfToken() : null,
        }));
      }
      return next(err);
    }
    setFlash(req, 'calendarItemsFlash', { kind: 'success', message: 'Item updated.' });
    return res.redirect(`/events/${req.event.id}/calendar/items`);
  } catch (err) { return next(err); }
};

exports.itemArchive = async function itemArchive(req, res, next) {
  try {
    await calendarItemService.archiveForEvent(req.event.id, req.params.itemId);
    setFlash(req, 'calendarItemsFlash', { kind: 'success', message: 'Item archived.' });
    return res.redirect(`/events/${req.event.id}/calendar/items`);
  } catch (err) {
    if (err && err.status === 404) return notFound(res);
    return next(err);
  }
};

exports.itemUnarchive = async function itemUnarchive(req, res, next) {
  try {
    await calendarItemService.unarchiveForEvent(req.event.id, req.params.itemId);
    setFlash(req, 'calendarItemsFlash', { kind: 'success', message: 'Item restored.' });
    return res.redirect(`/events/${req.event.id}/calendar/items`);
  } catch (err) {
    if (err && err.status === 404) return notFound(res);
    return next(err);
  }
};

function renderItemForm(res, opts) {
  res.render('events/calendar/items/form', baseItemFormLocals(opts));
}
function baseItemFormLocals(opts) {
  const { event, mode, item, values, errors, csrfToken } = opts;
  return {
    title: mode === 'create' ? 'New item' : 'Edit item',
    pageTitle: mode === 'create' ? 'New item' : 'Edit item',
    event,
    mode,
    item,
    values,
    errors: errors || [],
    errorsByField: groupErrors(errors || []),
    csrfToken,
    palette: calendarItemService.COLOR_PALETTE,
    shapes: calendarItemService.SHAPE_SET,
  };
}
function sanitizeRawForView(body) {
  // Only pull through fields the form template reads back. Prevents stray
  // body keys (e.g. an attacker-supplied 'event_id') from contaminating view
  // locals on re-render after a validation failure.
  return {
    name: body.name,
    capacity: body.capacity,
    color: body.color,
    shape: body.shape,
    sort_order: body.sort_order,
  };
}
async function renderItemCreateError(req, res, err, patch, next) {
  if (err && err.status === 400) {
    return res.status(400).render('events/calendar/items/form', baseItemFormLocals({
      event: req.event, mode: 'create', item: null,
      values: { ...patch }, errors: [{ field: '_form', message: err.message }],
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    }));
  }
  return next(err);
}

/* ------------------------------------------------------------------ */
/* Occurrences                                                         */
/* ------------------------------------------------------------------ */

exports.occurrences = async function occurrences(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const rows = await calendarOccurrenceService.listForEvent(req.event.id);
    const items = await calendarItemService.listForEvent(req.event.id);
    const flash = consumeFlash(req, 'calendarOccurrencesFlash');
    res.render('events/calendar/occurrences/index', {
      title: 'Occurrences',
      pageTitle: 'Occurrences',
      event: req.event,
      config,
      occurrences: rows,
      items,
      flash,
    });
  } catch (err) { next(err); }
};

exports.occurrenceNew = async function occurrenceNew(req, res, next) {
  try {
    const items = await calendarItemService.listForEvent(req.event.id);
    renderOccurrenceForm(res, {
      event: req.event, mode: 'create', occurrence: null,
      items: items.filter((i) => i.status === 'active'),
      values: null, errors: [],
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.occurrenceCreate = async function occurrenceCreate(req, res, next) {
  try {
    const items = await calendarItemService.listForEvent(req.event.id);
    const activeItems = items.filter((i) => i.status === 'active');
    const { patch, errors } = calendarOccurrenceService.parseAndValidateForm(req.body || {}, { isCreate: true });
    if (errors.length > 0) {
      return res.status(400).render('events/calendar/occurrences/form', baseOccurrenceFormLocals({
        event: req.event, mode: 'create', occurrence: null, items: activeItems,
        values: { ...patch, ...req.body }, errors,
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      }));
    }
    try {
      await calendarOccurrenceService.createForItem(req.event.id, patch.item_id, patch);
    } catch (err) {
      if (err && (err.status === 400 || err.status === 404)) {
        return res.status(err.status).render('events/calendar/occurrences/form', baseOccurrenceFormLocals({
          event: req.event, mode: 'create', occurrence: null, items: activeItems,
          values: { ...patch, ...req.body }, errors: [{ field: '_form', message: err.message }],
          csrfToken: req.csrfToken ? req.csrfToken() : null,
        }));
      }
      return next(err);
    }
    setFlash(req, 'calendarOccurrencesFlash', { kind: 'success', message: 'Occurrence created.' });
    return res.redirect(`/events/${req.event.id}/calendar/occurrences`);
  } catch (err) { return next(err); }
};

exports.occurrenceEdit = async function occurrenceEdit(req, res, next) {
  try {
    const occ = await calendarOccurrenceService.findByIdForEvent(req.event.id, req.params.occurrenceId);
    if (!occ) return notFound(res);
    const items = await calendarItemService.listForEvent(req.event.id);
    renderOccurrenceForm(res, {
      event: req.event, mode: 'edit', occurrence: occ,
      items: items.filter((i) => i.status === 'active' || Number(i.id) === Number(occ.item_id)),
      values: null, errors: [],
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.occurrenceUpdate = async function occurrenceUpdate(req, res, next) {
  try {
    const occ = await calendarOccurrenceService.findByIdForEvent(req.event.id, req.params.occurrenceId);
    if (!occ) return notFound(res);
    const items = await calendarItemService.listForEvent(req.event.id);
    const activeItems = items.filter((i) => i.status === 'active' || Number(i.id) === Number(occ.item_id));
    const { patch, errors } = calendarOccurrenceService.parseAndValidateForm(req.body || {}, { isCreate: false });
    if (errors.length > 0) {
      return res.status(400).render('events/calendar/occurrences/form', baseOccurrenceFormLocals({
        event: req.event, mode: 'edit', occurrence: occ, items: activeItems,
        values: { ...occ, ...patch, ...req.body }, errors,
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      }));
    }
    try {
      await calendarOccurrenceService.updateForEvent(req.event.id, req.params.occurrenceId, patch);
    } catch (err) {
      if (err && (err.status === 400 || err.status === 404)) {
        return res.status(err.status).render('events/calendar/occurrences/form', baseOccurrenceFormLocals({
          event: req.event, mode: 'edit', occurrence: occ, items: activeItems,
          values: { ...occ, ...patch }, errors: [{ field: '_form', message: err.message }],
          csrfToken: req.csrfToken ? req.csrfToken() : null,
        }));
      }
      return next(err);
    }
    setFlash(req, 'calendarOccurrencesFlash', { kind: 'success', message: 'Occurrence updated.' });
    return res.redirect(`/events/${req.event.id}/calendar/occurrences`);
  } catch (err) { return next(err); }
};

exports.occurrenceArchive = async function occurrenceArchive(req, res, next) {
  try {
    await calendarOccurrenceService.archiveForEvent(req.event.id, req.params.occurrenceId);
    setFlash(req, 'calendarOccurrencesFlash', { kind: 'success', message: 'Occurrence archived.' });
    return res.redirect(`/events/${req.event.id}/calendar/occurrences`);
  } catch (err) {
    if (err && err.status === 404) return notFound(res);
    return next(err);
  }
};

function renderOccurrenceForm(res, opts) {
  res.render('events/calendar/occurrences/form', baseOccurrenceFormLocals(opts));
}
function baseOccurrenceFormLocals(opts) {
  const { event, mode, occurrence, items, values, errors, csrfToken } = opts;
  return {
    title: mode === 'create' ? 'New occurrence' : 'Edit occurrence',
    pageTitle: mode === 'create' ? 'New occurrence' : 'Edit occurrence',
    event,
    mode,
    occurrence,
    items: items || [],
    values,
    errors: errors || [],
    errorsByField: groupErrors(errors || []),
    csrfToken,
  };
}

/* ------------------------------------------------------------------ */
/* Availability rules                                                  */
/* ------------------------------------------------------------------ */

exports.availability = async function availability(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const rules = await calendarAvailabilityService.listRulesForEvent(req.event.id);
    const items = await calendarItemService.listForEvent(req.event.id);
    const flash = consumeFlash(req, 'calendarAvailabilityFlash');
    res.render('events/calendar/availability/index', {
      title: 'Availability',
      pageTitle: 'Availability',
      event: req.event,
      config,
      rules,
      items,
      flash,
    });
  } catch (err) { next(err); }
};

exports.availabilityNew = async function availabilityNew(req, res, next) {
  try {
    const items = await calendarItemService.listForEvent(req.event.id);
    renderRuleForm(res, {
      event: req.event, mode: 'create', rule: null,
      items: items.filter((i) => i.status === 'active'),
      values: null, errors: [],
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.availabilityCreate = async function availabilityCreate(req, res, next) {
  try {
    const items = await calendarItemService.listForEvent(req.event.id);
    const activeItems = items.filter((i) => i.status === 'active');
    const { patch, errors, targetItemIds } =
      calendarAvailabilityService.parseAndValidateRuleForm(req.body || {});
    if (errors.length > 0) {
      return res.status(400).render('events/calendar/availability/form', baseRuleFormLocals({
        event: req.event, mode: 'create', rule: null, items: activeItems,
        values: { ...patch, _target_item_ids: targetItemIds, ...req.body }, errors,
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      }));
    }
    try {
      await calendarAvailabilityService.createRuleForEvent(req.event.id, patch, targetItemIds);
    } catch (err) {
      if (err && err.status === 400) {
        return res.status(400).render('events/calendar/availability/form', baseRuleFormLocals({
          event: req.event, mode: 'create', rule: null, items: activeItems,
          values: { ...patch, _target_item_ids: targetItemIds }, errors: [{ field: '_form', message: err.message }],
          csrfToken: req.csrfToken ? req.csrfToken() : null,
        }));
      }
      return next(err);
    }
    setFlash(req, 'calendarAvailabilityFlash', { kind: 'success', message: 'Rule created.' });
    return res.redirect(`/events/${req.event.id}/calendar/availability`);
  } catch (err) { return next(err); }
};

exports.availabilityEdit = async function availabilityEdit(req, res, next) {
  try {
    const rule = await calendarAvailabilityService.findRuleByIdForEvent(req.event.id, req.params.ruleId);
    if (!rule) return notFound(res);
    const items = await calendarItemService.listForEvent(req.event.id);
    renderRuleForm(res, {
      event: req.event, mode: 'edit', rule,
      items: items.filter((i) => i.status === 'active' || (rule._target_item_ids || []).includes(Number(i.id))),
      values: null, errors: [],
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.availabilityUpdate = async function availabilityUpdate(req, res, next) {
  try {
    const rule = await calendarAvailabilityService.findRuleByIdForEvent(req.event.id, req.params.ruleId);
    if (!rule) return notFound(res);
    const items = await calendarItemService.listForEvent(req.event.id);
    const activeItems = items.filter((i) => i.status === 'active' || (rule._target_item_ids || []).includes(Number(i.id)));
    const { patch, errors, targetItemIds } =
      calendarAvailabilityService.parseAndValidateRuleForm(req.body || {});
    if (errors.length > 0) {
      return res.status(400).render('events/calendar/availability/form', baseRuleFormLocals({
        event: req.event, mode: 'edit', rule, items: activeItems,
        values: { ...rule, ...patch, _target_item_ids: targetItemIds, ...req.body }, errors,
        csrfToken: req.csrfToken ? req.csrfToken() : null,
      }));
    }
    try {
      await calendarAvailabilityService.updateRuleForEvent(
        req.event.id, req.params.ruleId, patch, targetItemIds,
      );
    } catch (err) {
      if (err && err.status === 400) {
        return res.status(400).render('events/calendar/availability/form', baseRuleFormLocals({
          event: req.event, mode: 'edit', rule, items: activeItems,
          values: { ...rule, ...patch, _target_item_ids: targetItemIds },
          errors: [{ field: '_form', message: err.message }],
          csrfToken: req.csrfToken ? req.csrfToken() : null,
        }));
      }
      return next(err);
    }
    setFlash(req, 'calendarAvailabilityFlash', { kind: 'success', message: 'Rule updated.' });
    return res.redirect(`/events/${req.event.id}/calendar/availability`);
  } catch (err) { return next(err); }
};

exports.availabilityArchive = async function availabilityArchive(req, res, next) {
  try {
    await calendarAvailabilityService.archiveRuleForEvent(req.event.id, req.params.ruleId);
    setFlash(req, 'calendarAvailabilityFlash', { kind: 'success', message: 'Rule deactivated.' });
    return res.redirect(`/events/${req.event.id}/calendar/availability`);
  } catch (err) {
    if (err && err.status === 404) return notFound(res);
    return next(err);
  }
};

function renderRuleForm(res, opts) {
  res.render('events/calendar/availability/form', baseRuleFormLocals(opts));
}
function baseRuleFormLocals(opts) {
  const { event, mode, rule, items, values, errors, csrfToken } = opts;
  return {
    title: mode === 'create' ? 'New rule' : 'Edit rule',
    pageTitle: mode === 'create' ? 'New rule' : 'Edit rule',
    event,
    mode,
    rule,
    items: items || [],
    values,
    errors: errors || [],
    errorsByField: groupErrors(errors || []),
    csrfToken,
    weekdays: calendarAvailabilityService.WEEKDAYS,
    recurrencePatterns: calendarAvailabilityService.RECURRENCE_PATTERNS,
  };
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function notFound(res) {
  return res.status(404).render('public/notFound', { title: 'Not found', pageTitle: 'Not found' });
}
function setFlash(req, key, value) {
  if (req.session) req.session[key] = value;
}
function consumeFlash(req, key) {
  if (!req.session) return null;
  const f = req.session[key] || null;
  if (f) delete req.session[key];
  return f;
}

exports.bookings = async function bookings(req, res, next) {
  try {
    const all = await bookingModel.listForEvent(req.event.id);
    const flash = consumeFlash(req, 'calendarBookingsFlash');
    res.render('events/calendar/bookings/index', {
      title: 'Bookings',
      pageTitle: 'Bookings',
      event: req.event,
      bookings: all,
      flash,
    });
  } catch (err) { next(err); }
};

exports.bookingShow = async function bookingShow(req, res, next) {
  try {
    const result = await calendarBookingService.getBookingWithSelections(req.params.bookingId);
    if (!result || !result.booking || Number(result.booking.event_id) !== Number(req.event.id)) {
      return notFound(res);
    }
    return res.render('events/calendar/bookings/show', {
      title: 'Booking detail',
      pageTitle: 'Booking detail',
      event: req.event,
      booking: result.booking,
      selections: result.selections,
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { return next(err); }
};

exports.bookingCancel = async function bookingCancel(req, res, next) {
  try {
    const existing = await bookingModel.findById(req.params.bookingId);
    if (!existing || Number(existing.event_id) !== Number(req.event.id)) {
      return notFound(res);
    }
    if (existing.status !== 'canceled') {
      await calendarBookingService.cancelBooking(existing.id);
    }
    setFlash(req, 'calendarBookingsFlash', { kind: 'success', message: 'Booking canceled.' });
    return res.redirect(`/events/${req.event.id}/calendar/bookings`);
  } catch (err) { return next(err); }
};

/* ------------------------------------------------------------------ */
/* Booking edit / reschedule                                           */
/* ------------------------------------------------------------------ */

exports.bookingEdit = async function bookingEdit(req, res, next) {
  try {
    const result = await calendarBookingService.getBookingWithSelections(req.params.bookingId);
    if (!result || !result.booking || Number(result.booking.event_id) !== Number(req.event.id)) {
      return notFound(res);
    }
    if (result.booking.status !== 'active') {
      // Canceled bookings are intentionally not editable. Bounce back to the
      // detail page with a clear message rather than rendering an empty form.
      setFlash(req, 'calendarBookingsFlash', {
        kind: 'error',
        message: 'Canceled bookings cannot be edited.',
      });
      return res.redirect(`/events/${req.event.id}/calendar/bookings/${result.booking.id}`);
    }
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const items = await calendarItemModel.listForEvent(req.event.id, { includeArchived: false });
    const occurrences = (config.time_behavior_mode === 'timed')
      ? await listOccurrencesForItems(items)
      : [];
    return renderBookingEdit(res, {
      event: req.event,
      config,
      booking: result.booking,
      selections: result.selections,
      items,
      occurrences,
      values: bookingValuesFromExisting(result.booking, result.selections),
      errors: [],
      errorsByField: {},
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { return next(err); }
};

exports.bookingUpdate = async function bookingUpdate(req, res, next) {
  try {
    const result = await calendarBookingService.getBookingWithSelections(req.params.bookingId);
    if (!result || !result.booking || Number(result.booking.event_id) !== Number(req.event.id)) {
      return notFound(res);
    }
    const booking = result.booking;
    if (booking.status !== 'active') {
      setFlash(req, 'calendarBookingsFlash', {
        kind: 'error',
        message: 'Canceled bookings cannot be edited.',
      });
      return res.redirect(`/events/${req.event.id}/calendar/bookings/${booking.id}`);
    }
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const items = await calendarItemModel.listForEvent(req.event.id, { includeArchived: false });
    const occurrences = (config.time_behavior_mode === 'timed')
      ? await listOccurrencesForItems(items)
      : [];

    const body = req.body || {};
    // Parse registrant fields using the same validator as the public flow.
    const formConfig = config.form_config || {};
    const parsed = publicCalendarController._internals
      .parseAndValidateRegistrantForm(body, formConfig);
    const errors = parsed.errors.slice();

    // Parse selections. The form posts parallel arrays of
    // selection_type[], item_id[], selected_date[], occurrence_id[].
    const selections = parseSelectionsFromForm(body);
    if (selections.length === 0) {
      errors.push({ field: '_form', message: 'At least one selection is required.' });
    }

    const values = { ...parsed.values, selections, raw: body };

    if (errors.length > 0) {
      return renderBookingEditWithErrors(res, {
        event: req.event, config, booking, oldSelections: result.selections,
        items, occurrences, values, errors, csrfToken: req.csrfToken ? req.csrfToken() : null,
      });
    }

    try {
      await calendarBookingService.rescheduleBooking({
        event: req.event,
        config,
        booking,
        selections,
        registrant: parsed.values.registrant,
        email: parsed.values.email,
        notes: parsed.values.notes,
      });
    } catch (err) {
      if (err && err.code && err.status) {
        return renderBookingEditWithErrors(res, {
          event: req.event, config, booking, oldSelections: result.selections,
          items, occurrences, values,
          errors: [{
            field: '_form',
            message: publicCalendarController._internals.humanizeBookingError(err.code, err.message),
          }],
          csrfToken: req.csrfToken ? req.csrfToken() : null,
          status: err.status,
        });
      }
      return next(err);
    }

    setFlash(req, 'calendarBookingsFlash', {
      kind: 'success',
      message: 'Booking updated.',
    });
    return res.redirect(`/events/${req.event.id}/calendar/bookings/${booking.id}`);
  } catch (err) { return next(err); }
};

function renderBookingEdit(res, opts) {
  res.render('events/calendar/bookings/edit', {
    title: 'Edit booking',
    pageTitle: 'Edit booking',
    event: opts.event,
    config: opts.config,
    booking: opts.booking,
    selections: opts.selections,
    items: opts.items,
    occurrences: opts.occurrences,
    values: opts.values,
    errors: opts.errors,
    errorsByField: opts.errorsByField,
    csrfToken: opts.csrfToken,
  });
}

function renderBookingEditWithErrors(res, opts) {
  const errorsByField = {};
  for (const e of opts.errors) {
    if (!errorsByField[e.field]) errorsByField[e.field] = [];
    errorsByField[e.field].push(e.message);
  }
  res.status(opts.status || 400).render('events/calendar/bookings/edit', {
    title: 'Edit booking',
    pageTitle: 'Edit booking',
    event: opts.event,
    config: opts.config,
    booking: opts.booking,
    selections: opts.oldSelections,
    items: opts.items,
    occurrences: opts.occurrences,
    values: opts.values,
    errors: opts.errors,
    errorsByField,
    csrfToken: opts.csrfToken,
  });
}

function parseSelectionsFromForm(body) {
  const types = toArray(body['selection_type']);
  const itemIds = toArray(body['item_id']);
  const dates = toArray(body['selected_date']);
  const occIds = toArray(body['occurrence_id']);
  const out = [];
  const len = Math.max(types.length, itemIds.length, dates.length);
  for (let i = 0; i < len; i += 1) {
    const t = types[i];
    const itemId = Number(itemIds[i]);
    const date = dates[i];
    if (!t || !itemId || !date) continue;
    const sel = { itemId, selectedDate: String(date).slice(0, 10), selectionType: t };
    if (t === 'occurrence') sel.occurrenceId = Number(occIds[i]);
    out.push(sel);
  }
  return out;
}

function toArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function bookingValuesFromExisting(booking, selections) {
  const reg = booking.registrant || {};
  return {
    registrant: reg,
    email: booking.email || null,
    notes: booking.notes || null,
    name: reg.name || '',
    phone: reg.phone || '',
    contact_method: reg.contact_method || '',
    number_type: reg.number_type || '',
    selections: selections.map((s) => ({
      itemId: s.item_id,
      selectedDate: String(s.selected_date).slice(0, 10),
      selectionType: s.selection_type,
      occurrenceId: s.occurrence_id || null,
    })),
  };
}

async function listOccurrencesForItems(items) {
  const out = [];
  for (const it of items) {
    try {
      const list = await calendarOccurrenceModel.listForItem(it.id, { includeArchived: false });
      for (const o of list) out.push({ ...o, item_name: it.name });
    } catch (_e) { /* tolerate */ }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

exports.exportPage = async function exportPage(req, res, next) {
  try {
    const config = await calendarConfigService.getOrCreateForEvent(req.event.id);
    const items = await calendarItemModel.listForEvent(req.event.id, { includeArchived: true });
    res.render('events/calendar/export', {
      title: 'Export',
      pageTitle: 'Export',
      event: req.event,
      config,
      items,
      detailLevels: calendarExportService.DETAIL_LEVELS,
      allowedFields: calendarExportService.ALLOWED_FIELDS,
      values: { detail_level: 'names_only', include_fields: ['name'] },
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  } catch (err) { next(err); }
};

exports.exportRun = async function exportRun(req, res, next) {
  try {
    const body = req.body || {};
    const detailLevel = String(body.detail_level || 'names_only');
    const includeFields = toArray(body.include_fields).map((f) => String(f));
    const itemIdsRaw = toArray(body.item_ids).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    const itemIds = itemIdsRaw.length > 0 ? itemIdsRaw : null;
    const start = body.start_date ? String(body.start_date).slice(0, 10) : null;
    const end = body.end_date ? String(body.end_date).slice(0, 10) : null;
    const dateRange = (start && end) ? { start, end } : null;

    const result = await calendarExportService.buildExport({
      eventId: req.event.id,
      itemIds,
      dateRange,
      detailLevel,
      includeFields,
    });
    const csv = calendarExportService.toCsv(result);
    const fname = `bookings-${req.event.code || req.event.id}-${new Date()
      .toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    // Prepend a UTF-8 BOM so Excel opens it with the right encoding.
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
};
