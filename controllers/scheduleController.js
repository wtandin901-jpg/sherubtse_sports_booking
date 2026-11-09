const db = require('../config/db');
const config = require('../config');
const scheduleModel = require('../models/scheduleModel');
const bookingModel = require('../models/bookingModel');
const groundModel = require('../models/groundModel');
const auditModel = require('../models/auditModel');
const { buildSlots } = require('../services/slots');
const { HttpError, asyncHandler, ok, parseId } = require('../utils/http');
const { parseTime, withinOpeningHours, BOOKING_MINUTES, addMinutes } = require('../utils/time');

function checkTimes(startInput, endInput) {
  const start = parseTime(startInput);
  const end = parseTime(endInput);
  if (!start || !end) throw new HttpError(400, 'Valid start and end times are required.');
  if (end <= start) throw new HttpError(400, 'End time must be after start time.');
  if (end < addMinutes(start, BOOKING_MINUTES)) throw new HttpError(400, `A schedule must be at least ${BOOKING_MINUTES} minutes long.`);
  if (end <= new Date()) throw new HttpError(400, 'A schedule cannot end in the past.');
  if (!withinOpeningHours(start, end, config.openHour, config.closeHour)) {
    throw new HttpError(400, `Schedules must be on one day between ${config.openHour}:00 and ${config.closeHour}:00 (Bhutan time).`);
  }
  return { start, end };
}

exports.list = asyncHandler(async (req, res) => {
  const includeClosed = req.query.includeClosed === '1' && req.user.role === 'admin';
  const groundId = req.query.groundId ? parseId(req.query.groundId, 'groundId') : null;
  ok(res, 'Schedules', await scheduleModel.listUpcoming({ openOnly: !includeClosed, groundId }));
});

exports.slots = asyncHandler(async (req, res) => {
  const schedule = await scheduleModel.findById(parseId(req.params.id));
  if (!schedule) throw new HttpError(404, 'Schedule not found.');
  const bookings = await bookingModel.confirmedInRange(schedule.ground_id, schedule.start_time, schedule.end_time);
  ok(res, 'Slots', buildSlots(schedule, bookings));
});

exports.create = asyncHandler(async (req, res) => {
  const groundId = parseId(req.body.groundId, 'groundId');
  const ground = await groundModel.findById(groundId);
  if (!ground || !ground.is_active) throw new HttpError(404, 'Ground not found.');
  const { start, end } = checkTimes(req.body.startTime, req.body.endTime);
  const schedule = await scheduleModel.insert({ groundId, start, end, createdBy: req.user.id });
  await auditModel.log(req.user.id, 'schedule_created', 'schedule', schedule.id, { groundId });
  ok(res, 'Schedule created.', schedule, 201);
});

exports.update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const updated = await db.tx(async (c) => {
    const current = await scheduleModel.findById(id, c, true);
    if (!current) throw new HttpError(404, 'Schedule not found.');
    if (await scheduleModel.hasConfirmedBookings(current.ground_id, current.start_time, current.end_time, c)) {
      throw new HttpError(409, 'This schedule has confirmed bookings. Cancel them first.');
    }
    const groundId = req.body.groundId ? parseId(req.body.groundId, 'groundId') : current.ground_id;
    const ground = await groundModel.findById(groundId, c);
    if (!ground || !ground.is_active) throw new HttpError(404, 'Ground not found.');
    const { start, end } = checkTimes(req.body.startTime || current.start_time.toISOString(),
                                      req.body.endTime || current.end_time.toISOString());
    const row = await scheduleModel.update(id, { groundId, start, end }, c);
    await auditModel.log(req.user.id, 'schedule_updated', 'schedule', id, {}, c);
    return row;
  });
  ok(res, 'Schedule updated.', updated);
});

async function setStatus(req, res, status) {
  const id = parseId(req.params.id);
  const row = await db.tx(async (c) => {
    const current = await scheduleModel.findById(id, c, true);
    if (!current) throw new HttpError(404, 'Schedule not found.');
    if (status === 'closed' &&
        await scheduleModel.hasConfirmedBookings(current.ground_id, current.start_time, current.end_time, c)) {
      throw new HttpError(409, 'This schedule has confirmed bookings. Cancel them first.');
    }
    const r = await scheduleModel.update(id, {
      groundId: current.ground_id, start: current.start_time, end: current.end_time, status }, c);
    await auditModel.log(req.user.id, `schedule_${status === 'closed' ? 'closed' : 'reopened'}`, 'schedule', id, {}, c);
    return r;
  });
  ok(res, `Schedule ${status === 'closed' ? 'closed' : 'reopened'}.`, row);
}
exports.close = asyncHandler((req, res) => setStatus(req, res, 'closed'));
exports.reopen = asyncHandler((req, res) => setStatus(req, res, 'open'));

exports.remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await db.tx(async (c) => {
    const current = await scheduleModel.findById(id, c, true);
    if (!current) throw new HttpError(404, 'Schedule not found.');
    if (await scheduleModel.hasConfirmedBookings(current.ground_id, current.start_time, current.end_time, c)) {
      throw new HttpError(409, 'This schedule has pending or confirmed bookings. Cancel or reject them first.');
    }
    await scheduleModel.softDelete(id, c);
    await auditModel.log(req.user.id, 'schedule_deleted', 'schedule', id, {}, c);
  });
  ok(res, 'Schedule deleted.');
});
