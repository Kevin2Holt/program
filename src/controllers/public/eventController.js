'use strict';

// Public event controller — serves the generic `/:code` public event page.
// This is intentionally minimal in Phase 4A; the full block-rendering model
// comes from the main app spec and lands in later phases.

exports.show = function show(req, res) {
  res.render('public/event', {
    title: req.event.title || req.event.code,
    pageTitle: req.event.title || req.event.code,
    event: req.event,
  });
};
