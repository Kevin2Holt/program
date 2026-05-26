'use strict';

// loadEvent — resolves an event from a route parameter and attaches it to
// req.event. Two variants are exported: one for public `/:code` routes and
// one for organizer `/events/:eventId` routes.

const eventModel = require('../models/event');

function notFound(res) {
  return res.status(404).render('public/notFound', {
    title: 'Not found',
    pageTitle: 'Not found',
  });
}

function loadByCode(paramName = 'code') {
  return async function (req, res, next) {
    try {
      const code = req.params[paramName];
      if (!code) return notFound(res);
      const event = await eventModel.findByCode(code);
      if (!event) return notFound(res);
      req.event = event;
      next();
    } catch (err) { next(err); }
  };
}

function loadById(paramName = 'eventId') {
  return async function (req, res, next) {
    try {
      const id = Number(req.params[paramName]);
      if (!Number.isFinite(id)) return notFound(res);
      const event = await eventModel.findById(id);
      if (!event) return notFound(res);
      req.event = event;
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { loadByCode, loadById };
