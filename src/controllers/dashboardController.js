'use strict';

const eventService = require('../services/eventService');

exports.show = async function showDashboard(req, res, next) {
  try {
    const events = await eventService.listForUser(req.user.id);
    return res.render('dashboard/show', {
      title: 'Dashboard',
      pageTitle: 'Dashboard',
      events,
    });
  } catch (err) { return next(err); }
};
