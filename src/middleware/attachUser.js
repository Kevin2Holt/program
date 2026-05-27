'use strict';

// attachUser middleware — hydrates req.user from the session. If the
// session carries a userId, look the row up; otherwise leave req.user null.
// On lookup failure (deleted account, stale session) the session id is
// cleared so the user is treated as anonymous.

const userModel = require('../models/user');

module.exports = async function attachUser(req, _res, next) {
  try {
    if (req.session && req.session.userId) {
      const user = await userModel.findById(req.session.userId);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        };
      } else {
        // Session points at a row that no longer exists; clear it so the
        // user is just anonymous instead of perpetually 500'ing.
        delete req.session.userId;
        req.user = null;
      }
    } else {
      req.user = null;
    }
    return next();
  } catch (err) {
    return next(err);
  }
};
