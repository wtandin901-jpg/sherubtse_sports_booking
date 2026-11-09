const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const { HttpError, asyncHandler, ok, wantsJson } = require('../utils/http');
const { checkPassword } = require('../utils/validate');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1234', 12);

exports.csrf = (req, res) => ok(res, 'CSRF token', { csrfToken: res.locals.csrfToken });

exports.login = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = email ? await userModel.findForLogin(email) : null;
  const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !valid || !user.is_active) {
    if (wantsJson(req)) throw new HttpError(401, 'Invalid email or password.');
    return res.status(401).render('login', { title: 'Log in', error: 'Invalid email or password.' });
  }

  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = user.id;
  await auditModel.log(user.id, 'login', 'user', user.id);

  if (wantsJson(req)) {
    return ok(res, 'Logged in.', { role: user.role, mustChangePassword: user.must_change_password });
  }
  res.redirect('/dashboard');
});

exports.logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sherubtse.sid');
    if (wantsJson(req)) return ok(res, 'Logged out.');
    res.redirect('/');
  });
};

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const currentHash = await userModel.getPasswordHash(req.user.id);
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, currentHash))) {
    throw new HttpError(400, 'Current password is incorrect.');
  }
  checkPassword(newPassword);
  if (newPassword === currentPassword) throw new HttpError(400, 'New password must be different.');
  await userModel.setPassword(req.user.id, await bcrypt.hash(newPassword, 12), false);
  await auditModel.log(req.user.id, 'password_changed', 'user', req.user.id);
  ok(res, 'Password changed.');
});
