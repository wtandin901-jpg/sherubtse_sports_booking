const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const { HttpError, asyncHandler, ok, parseId } = require('../utils/http');
const { cleanText, cleanEmail } = require('../utils/validate');

const tempPassword = () => crypto.randomBytes(12).toString('base64url'); // 16 characters

exports.list = asyncHandler(async (req, res) => ok(res, 'Users', await userModel.list()));

exports.create = asyncHandler(async (req, res) => {
  const fullName = cleanText(req.body.fullName, { label: 'Full name', min: 2, max: 120, required: true });
  const email = cleanEmail(req.body.email);
  if (!['student', 'cr_rl'].includes(req.body.role)) throw new HttpError(400, 'Role must be student or cr_rl.');
  const password = tempPassword();
  const created = await userModel.create({
    fullName, email, role: req.body.role, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true
  });
  await auditModel.log(req.user.id, 'user_created', 'user', created.id, { role: req.body.role });
  ok(res, 'User created.', { id: created.id, email, temporaryPassword: password }, 201);
});

exports.update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const target = await userModel.findById(id);
  if (!target) throw new HttpError(404, 'User not found.');
  const { isActive, bookingAccess } = req.body;
  if (isActive !== undefined && typeof isActive !== 'boolean') throw new HttpError(400, 'isActive must be true or false.');
  if (bookingAccess !== undefined && typeof bookingAccess !== 'boolean') throw new HttpError(400, 'bookingAccess must be true or false.');
  if (id === req.user.id && isActive === false) throw new HttpError(400, 'You cannot deactivate your own account.');
  if (bookingAccess === true && target.role !== 'cr_rl') throw new HttpError(400, 'Only CR/RL accounts can have booking access.');
  const fullName = req.body.fullName === undefined ? null
    : cleanText(req.body.fullName, { label: 'Full name', min: 2, max: 120, required: true });
  await userModel.update(id, { isActive: isActive ?? null, bookingAccess: bookingAccess ?? null, fullName });
  await auditModel.log(req.user.id, 'user_updated', 'user', id, { isActive, bookingAccess });
  ok(res, 'User updated.', await userModel.findById(id));
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await userModel.findById(id))) throw new HttpError(404, 'User not found.');
  const password = tempPassword();
  await userModel.setPassword(id, await bcrypt.hash(password, 12), true);
  await auditModel.log(req.user.id, 'password_reset', 'user', id);
  ok(res, 'Password reset.', { temporaryPassword: password });
});
