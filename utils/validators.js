// A password is strong if it is 12-72 characters (bcrypt reads at most 72 bytes) with a letter and a digit.
function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 12) return false;
  if (Buffer.byteLength(password) > 72) return false;
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

module.exports = { isStrongPassword };
