'use strict';

const eventService = require('../../services/eventService');

exports.newForm = function newEventForm(req, res) {
  return res.render('events/new', {
    title: 'Create event',
    pageTitle: 'Create event',
    values: { code: '', title: '' },
    errorsByField: {},
  });
};

exports.create = async function createEvent(req, res, next) {
  const code = (req.body && req.body.code) || '';
  const title = (req.body && req.body.title) || '';
  try {
    const event = await eventService.createEvent({
      userId: req.user.id,
      code,
      title,
    });
    if (typeof req.flash === 'function') {
      req.flash('success', `Event "${event.code}" created.`);
    }
    // PRG to the calendar setup page — the calendar module is the only
    // organizer surface that currently exists for an event. Once the broader
    // event editor lands this can change to /events/:id/edit.
    return res.redirect(`/events/${event.id}/calendar`);
  } catch (err) {
    if (err && err.code === 'VALIDATION') {
      return res.status(400).render('events/new', {
        title: 'Create event',
        pageTitle: 'Create event',
        values: { code, title },
        errorsByField: err.errorsByField || {},
      });
    }
    return next(err);
  }
};
