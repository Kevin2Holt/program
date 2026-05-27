'use strict';

// authService — signup and login validation/orchestration.
// Validation errors throw with `err.status` and `err.errorsByField` so
// controllers can re-render the form preserving values.

const userModel = require('../models/user');
const passwordService = require('./passwordService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_DISPLAY_NAME = 80;

function fieldErrors(errorsByField) {
  const err = new Error('Validation failed');
  err.status = 400;
  err.code = 'VALIDATION';
  err.errorsByField = errorsByField;
  return err;
}

function validateSignupInput({ email, password, passwordConfirm, displayName }) {
  const errs = {};
  const cleanEmail = (email || '').trim();
  if (!cleanEmail) errs.email = ['Email is required.'];
  else if (cleanEmail.length > 254) errs.email = ['Email is too long.'];
  else if (!EMAIL_RE.test(cleanEmail)) errs.email = ['Enter a valid email address.'];

  if (!password) {
    errs.password = ['Password is required.'];
  } else if (password.length < MIN_PASSWORD) {
    errs.password = [`Password must be at least ${MIN_PASSWORD} characters.`];
  } else if (password.length > MAX_PASSWORD) {
    errs.password = [`Password must be at most ${MAX_PASSWORD} characters.`];
  }

  if (password && passwordConfirm !== password) {
    errs.passwordConfirm = ['Passwords do not match.'];
  }

  const cleanName = (displayName || '').trim();
  if (cleanName.length > MAX_DISPLAY_NAME) {
    errs.displayName = [`Display name must be at most ${MAX_DISPLAY_NAME} characters.`];
  }

  return { errs, clean: { email: cleanEmail, displayName: cleanName || null } };
}

async function signup({ email, password, passwordConfirm, displayName }) {
  const { errs, clean } = validateSignupInput({
    email, password, passwordConfirm, displayName,
  });
  if (Object.keys(errs).length > 0) throw fieldErrors(errs);

  const existing = await userModel.findByEmail(clean.email);
  if (existing) {
    throw fieldErrors({ email: ['An account with this email already exists.'] });
  }

  const passwordHash = await passwordService.hash(password);
  const user = await userModel.create({
    email: clean.email,
    displayName: clean.displayName,
    passwordHash,
  });
  return user;
}

async function login({ email, password }) {
  const cleanEmail = (email || '').trim();
  if (!cleanEmail || !password) {
    throw fieldErrors({ _form: ['Enter your email and password.'] });
  }
  const user = await userModel.findByEmail(cleanEmail);
  if (!user || !user.password_hash) {
    throw fieldErrors({ _form: ['Email or password is incorrect.'] });
  }
  const ok = await passwordService.verify(password, user.password_hash);
  if (!ok) {
    throw fieldErrors({ _form: ['Email or password is incorrect.'] });
  }
  return user;
}

module.exports = {
  signup,
  login,
  _internals: { validateSignupInput, fieldErrors, EMAIL_RE, MIN_PASSWORD },
};
