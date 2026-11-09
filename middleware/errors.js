const { wantsJson } = require('../utils/http');

function notFound(req, res, next) {
  const err = new Error('Page not found.');
  err.status = 404;
  next(err);
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.message;

  if (err.code === '23P01') {            
    status = 409;
    message = err.constraint === 'bookings_no_overlap'
      ? 'That time overlaps an existing confirmed booking on this ground.'
      : 'That schedule overlaps another open schedule on this ground.';
  } else if (err.code === '23505') {
    status = 409; message = 'A record with these details already exists.';
  } else if (['23514', '23503', '22P02', '22007', '22008', '22003'].includes(err.code)) {
    status = 400; message = 'Invalid data supplied.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Malformed JSON body.';
  }

  if (status >= 500) { console.error(err); message = 'Unexpected server error.'; }
  if (wantsJson(req)) return res.status(status).json({ success: false, message, errors: err.details });
  res.status(status).render('error', { title: 'Error', status, message });
}

module.exports = { notFound, errorHandler };
