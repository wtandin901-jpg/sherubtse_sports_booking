const crypto = require('crypto');
const { HttpError } = require('../utils/http');

function csrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(String(req.get('x-csrf-token') || (req.body && req.body._csrf) || ''));
  const expected = Buffer.from(req.session.csrfToken || '');
  if (sent.length === 0 || sent.length !== expected.length || !crypto.timingSafeEqual(sent, expected)) {
    return next(new HttpError(403, 'Invalid or missing CSRF token. Refresh the page and try again.'));
  }
  next();
}

module.exports = { csrfToken, csrfProtect };
