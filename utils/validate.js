const { HttpError } = require('./http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, { label, min = 0, max = 255, required = false }) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && s.length < Math.max(min, 1)) throw new HttpError(400, `${label} is required.`);
  if (s.length > max) throw new HttpError(400, `${label} must be at most ${max} characters.`);
  if (s && s.length < min) throw new HttpError(400, `${label} must be at least ${min} characters.`);
  return s;
}

function cleanEmail(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(s) || s.length > 255) throw new HttpError(400, 'A valid email address is required.');
  return s;
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 12) throw new HttpError(400, 'Password must be at least 12 characters.');
  if (Buffer.byteLength(pw) > 72) throw new HttpError(400, 'Password must be at most 72 bytes.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'Password must contain letters and digits.');
  return pw;
}

module.exports = { cleanText, cleanEmail, checkPassword };
