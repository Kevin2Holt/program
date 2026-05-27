'use strict';

// flash middleware — session-backed one-shot message queue. Reads any
// pending messages, exposes them as res.locals.flash for partials, and
// installs req.flash(kind, message) for handlers to enqueue.
//
// Messages live under req.session.flashes as an array of { kind, message }.
// They are cleared as soon as the request reads them, so PRG flows display
// the message on the redirected GET and never again.

module.exports = function flash(req, res, next) {
  if (!req.session) return next();

  // Pull and clear any messages queued by the previous request.
  const pending = Array.isArray(req.session.flashes) ? req.session.flashes : [];
  req.session.flashes = [];
  res.locals.flash = pending;

  // Provide an enqueue helper that survives until the next request reads it.
  req.flash = function pushFlash(kind, message) {
    if (!req.session) return;
    if (!Array.isArray(req.session.flashes)) req.session.flashes = [];
    req.session.flashes.push({
      kind: String(kind || 'info'),
      message: String(message == null ? '' : message),
    });
  };

  next();
};
