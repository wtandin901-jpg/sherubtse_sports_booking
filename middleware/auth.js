const userModel = require('../models/userModel');
const { HttpError, wantsJson } = require('../utils/http');

async function attachUser(req, res, next) {
  try {
    req.user = null;
    res.locals.user = null;
    if (req.session && req.session.userId) {
      const user = await userModel.findById(req.session.userId);
      if (user && user.is_active) {
        req.user = user;
        res.locals.user = user;
      } else {
        delete req.session.userId;
      }
    }
    next();
  } catch (err) { next(err); }
}

function requireLogin(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) return next(new HttpError(401, 'Please log in.'));
    return res.redirect('/login');
  }
  const allowed = ['/change-password', '/logout', '/api/auth/change-password', '/api/auth/logout', '/api/auth/csrf'];
  if (req.user.must_change_password && !allowed.includes(req.originalUrl.split('?')[0])) {
    if (wantsJson(req)) return next(new HttpError(403, 'You must change your password first.'));
    return res.redirect('/change-password');
  }
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do that.'));

function requireBookingAccess(req, res, next) {
  if (req.user.role === 'cr_rl' && req.user.booking_access) return next();
  next(new HttpError(403, 'Booking access has not been approved for your account.'));
}

module.exports = { attachUser, requireLogin, requireRole, requireBookingAccess };
