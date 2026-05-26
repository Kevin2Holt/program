'use strict';

// Minimal auth route stubs so `requireAuth` redirects have somewhere to land.
// The real auth flow is part of the main-app spec and will be implemented in
// its own phase.

const express = require('express');
const router = express.Router();

router.get('/auth/login', (req, res) => {
  res.render('auth/login', {
    title: 'Sign in',
    pageTitle: 'Sign in',
    returnTo: req.query.returnTo || '/',
  });
});

module.exports = router;
