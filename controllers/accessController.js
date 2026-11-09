const accessModel = require('../models/accessModel');
const auditModel = require('../models/auditModel');
const { HttpError, asyncHandler, ok, parseId } = require('../utils/http');
const { cleanText } = require('../utils/validate');

exports.create = asyncHandler(async (req, res) => {
  if (req.user.booking_access) throw new HttpError(409, 'Your account already has booking access.');
  const note = cleanText(req.body.note, { label: 'Note', max: 500 });
  const pending = (await accessModel.listForUser(req.user.id)).some((r) => r.status === 'pending');
  if (pending) throw new HttpError(409, 'You already have a pending request.');
  const row = await accessModel.create(req.user.id, note);
  await auditModel.log(req.user.id, 'access_requested', 'access_request', row.id);
  ok(res, 'Request submitted.', row, 201);
});

exports.list = asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    return ok(res, 'Requests', await accessModel.listAll(status));
  }
  ok(res, 'Your requests', await accessModel.listForUser(req.user.id));
});

const decide = (status) => asyncHandler(async (req, res) => {
  const note = cleanText(req.body.note, { label: 'Note', max: 500 });
  const row = await accessModel.decide(parseId(req.params.id), status, req.user.id, note);
  if (!row) throw new HttpError(404, 'No pending request with that id.');
  ok(res, `Request ${status}.`, row);
});
exports.approve = decide('approved');
exports.reject = decide('rejected');
