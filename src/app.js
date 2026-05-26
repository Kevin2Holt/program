'use strict';

// Express application factory. Kept as a factory so tests can create an
// isolated app instance without binding to a port.

const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const { pool } = require('./db/pool');
const attachUser = require('./middleware/attachUser');
const routes = require('./routes');

function createApp(options = {}) {
  const app = express();

  if (env.trustProxy) app.set('trust proxy', env.trustProxy);

  // View engine.
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  // Static assets.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Body parsing.
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: '256kb' }));

  // Session — pg-backed. Tests may pass a memory store via options.
  const sessionStore = options.sessionStore || new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  });
  app.use(session({
    store: sessionStore,
    secret: env.session.secret,
    name: env.session.name,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      maxAge: env.session.maxAgeMs,
    },
  }));

  // Light global rate limiting. Per-route limits land with their phases.
  if (!env.isTest) {
    app.use(rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }));
  }

  // Attach user from session.
  app.use(attachUser);

  // Make user available to all views.
  app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    res.locals.appName = 'progr.am';
    next();
  });

  // TODO(phase-4b+): wire CSRF protection here (csurf), expose req.csrfToken()
  // to all POST endpoints. Skipped in 4A so test routes remain reachable
  // without token plumbing; the structure leaves a clear seam for it.

  app.use(routes);

  // 404 handler.
  app.use((req, res) => {
    res.status(404).render('public/notFound', {
      title: 'Not found', pageTitle: 'Not found',
    });
  });

  // Error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    // eslint-disable-next-line no-console
    if (!env.isTest) console.error(err);
    const status = err.status || 500;
    res.status(status);
    if (status === 403) {
      return res.render('partials/permissionDenied', {
        title: 'Forbidden',
        pageTitle: 'Forbidden',
        missingPermission: err.missingPermission || null,
      });
    }
    res.render('public/error', {
      title: 'Something went wrong',
      pageTitle: 'Something went wrong',
      status,
      message: env.isProduction ? 'Something went wrong.' : err.message,
    });
  });

  return app;
}

module.exports = { createApp };
