'use strict';

const userModel = require('../models/user');

exports.show = async function showAccount(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      // Session points at a missing row — bounce to login.
      req.session && req.session.destroy(() => {});
      return res.redirect('/auth/login');
    }
    return res.render('account/show', {
      title: 'Account',
      pageTitle: 'Account',
      user: {
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at,
      },
    });
  } catch (err) { return next(err); }
};
