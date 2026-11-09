class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, message, data, status = 200) => res.status(status).json({ success: true, message, data });

const wantsJson = (req) => req.originalUrl.startsWith('/api/') || (req.get('accept') || '').includes('application/json');

function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${label}.`);
  return n;
}

module.exports = { HttpError, asyncHandler, ok, wantsJson, parseId };
