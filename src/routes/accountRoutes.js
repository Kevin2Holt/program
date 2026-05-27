'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const accountController = require('../controllers/accountController');

const router = express.Router();

router.get('/account', requireAuth, accountController.show);

module.exports = router;
