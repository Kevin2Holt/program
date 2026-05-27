'use strict';

// Authentication routes — signup, login, logout. Form pages are GETs;
// mutating actions are POST and follow PRG.

const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/auth/login', authController.loginForm);
router.post('/auth/login', authController.loginSubmit);

router.get('/auth/signup', authController.signupForm);
router.post('/auth/signup', authController.signupSubmit);

router.post('/auth/logout', authController.logout);

module.exports = router;
