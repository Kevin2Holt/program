'use strict';

// authController — signup, login, logout. Controllers stay thin; service
// layer owns validation and persistence.

const authService = require('../services/authService');

function safeReturnTo(raw) {
  // Only allow same-origin internal paths so a malicious returnTo can't
  // redirect off-site after login.
  if (typeof raw !== 'string') return '/dashboard';
  if (raw.length === 0) return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

exports.loginForm = function loginForm(req, res) {
  if (req.user) return res.redirect('/dashboard');
  return res.render('auth/login', {
    title: 'Sign in',
    pageTitle: 'Sign in',
    returnTo: safeReturnTo(req.query.returnTo),
    values: { email: '' },
    errorsByField: {},
  });
};

exports.loginSubmit = async function loginSubmit(req, res, next) {
  if (req.user) return res.redirect('/dashboard');
  const { email = '', password = '' } = req.body || {};
  const returnTo = safeReturnTo(req.body && req.body.returnTo);
  try {
    const user = await authService.login({ email, password });
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      return req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        if (typeof req.flash === 'function') req.flash('success', 'Signed in.');
        return res.redirect(returnTo);
      });
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION') {
      return res.status(400).render('auth/login', {
        title: 'Sign in',
        pageTitle: 'Sign in',
        returnTo,
        values: { email },
        errorsByField: err.errorsByField || {},
      });
    }
    return next(err);
  }
};

exports.signupForm = function signupForm(req, res) {
  if (req.user) return res.redirect('/dashboard');
  return res.render('auth/signup', {
    title: 'Create account',
    pageTitle: 'Create account',
    values: { email: '', displayName: '' },
    errorsByField: {},
  });
};

exports.signupSubmit = async function signupSubmit(req, res, next) {
  if (req.user) return res.redirect('/dashboard');
  const {
    email = '', password = '', passwordConfirm = '', displayName = '',
  } = req.body || {};
  try {
    const user = await authService.signup({
      email, password, passwordConfirm, displayName,
    });
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      return req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        if (typeof req.flash === 'function') req.flash('success', 'Welcome to progr.am.');
        return res.redirect('/dashboard');
      });
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION') {
      return res.status(400).render('auth/signup', {
        title: 'Create account',
        pageTitle: 'Create account',
        values: { email, displayName },
        errorsByField: err.errorsByField || {},
      });
    }
    return next(err);
  }
};

exports.logout = function logout(req, res, next) {
  if (!req.session) return res.redirect('/');
  return req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('progam.sid');
    return res.redirect('/');
  });
};
