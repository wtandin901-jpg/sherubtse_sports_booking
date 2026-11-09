const db = require('../config/db');
const config = require('../config');
const bookingModel = require('../models/bookingModel');
const scheduleModel = require('../models/scheduleModel');
const groundModel = require('../models/groundModel');
const auditModel = require('../models/auditModel');
const { HttpError, asyncHandler, ok, parseId } = require('../utils/http');
const { cleanText } = require('../utils/validate');
const { parseTime, calcEnd, withinOpeningHours, BOOKING_MINUTES } = require('../utils/time');

exports.list = asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    const q = req.query;
    return ok(res, 'Bookings', await bookingModel.listAll({
      groundId: q.groundId ? parseId(q.groundId, 'groundId') : null,
      status: ['pending', 'confirmed', 'cancelled', 'rejected'].includes(q.status) ? q.status : null,
      sourceType: ['cr_rl', 'staff', 'outsider'].includes(q.sourceType) ? q.sourceType : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : null
    }));
  }
  if (req.user.role === 'cr_rl') return ok(res, 'Your bookings', await bookingModel.listForUser(req.user.id));
  ok(res, 'Upcoming bookings', await bookingModel.listPublicUpcoming());
});

exports.create = asyncHandler(async (req, res) => {
  const scheduleId = parseId(req.body.scheduleId, 'scheduleId');
  const start = parseTime(req.body.startTime);
  if (!start) throw new HttpError(400, 'A valid start time is required.');
  const end = calcEnd(start); // never taken from the browser

  const booking = await db.tx(async (c) => {
    const schedule = await scheduleModel.findById(scheduleId, c, true);
    if (!schedule) throw new HttpError(404, 'Schedule not found.');
    if (schedule.status !== 'open' || !schedule.ground_active) throw new HttpError(409, 'This schedule is not open for booking.');
    if (start < new Date(schedule.start_time) || end > new Date(schedule.end_time)) {
      throw new HttpError(400, 'The booking must fit inside the schedule.');
    }
    if ((start - new Date(schedule.start_time)) % (BOOKING_MINUTES * 60000) !== 0) {
      throw new HttpError(400, 'Choose one of the listed 90-minute slots.');
    }
    if (start <= new Date()) throw new HttpError(400, 'You cannot book a slot that has already started.');
    const row = await bookingModel.insert(c, {
      groundId: schedule.ground_id, scheduleId, bookedBy: req.user.id, sourceType: 'cr_rl',
      bookerName: req.user.full_name, start, end, createdBy: req.user.id, status: 'pending'
    });
    await auditModel.log(req.user.id, 'booking_requested', 'booking', row.id, { scheduleId }, c);
    return row;
  });
  ok(res, 'Booking request sent. It will be confirmed when the administrator approves it.', booking, 201);
});

exports.createExternal = asyncHandler(async (req, res) => {
  const groundId = parseId(req.body.groundId, 'groundId');
  const sourceType = req.body.sourceType;
  if (!['staff', 'outsider'].includes(sourceType)) throw new HttpError(400, 'Source must be staff or outsider.');
  const bookerName = cleanText(req.body.bookerName, { label: 'Name', min: 2, max: 120, required: true });
  const bookerContact = cleanText(req.body.bookerContact, { label: 'Contact', max: 120 });
  const start = parseTime(req.body.startTime);
  if (!start) throw new HttpError(400, 'A valid start time is required.');
  const end = calcEnd(start);
  if (start <= new Date()) throw new HttpError(400, 'Start time must be in the future.');
  if (!withinOpeningHours(start, end, config.openHour, config.closeHour)) {
    throw new HttpError(400, `Bookings must be between ${config.openHour}:00 and ${config.closeHour}:00 (Bhutan time).`);
  }
  const ground = await groundModel.findById(groundId);
  if (!ground || !ground.is_active) throw new HttpError(404, 'Ground not found.');

  const booking = await db.tx(async (c) => {
    const row = await bookingModel.insert(c, {
      groundId, sourceType, bookerName, bookerContact, start, end, createdBy: req.user.id
    });
    await auditModel.log(req.user.id, 'external_booking_created', 'booking', row.id, { sourceType }, c);
    return row;
  });
  ok(res, 'Booking recorded.', booking, 201);
});

exports.cancel = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const reason = cleanText(req.body.reason, { label: 'Reason', max: 300 });
  const row = await db.tx(async (c) => {
    const booking = await bookingModel.findById(id, c, true);
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (!['pending', 'confirmed'].includes(booking.status)) throw new HttpError(409, 'This booking is already cancelled or rejected.');
    if (req.user.role === 'cr_rl') {
      if (booking.booked_by !== req.user.id) throw new HttpError(403, 'You can only cancel your own bookings.');
      const deadline = new Date(new Date(booking.start_time).getTime() - config.cancelCutoffMinutes * 60000);
      if (new Date() >= deadline) {
        throw new HttpError(403, config.cancelCutoffMinutes > 0
          ? `Bookings can only be cancelled at least ${config.cancelCutoffMinutes} minutes before the start.`
          : 'A booking cannot be cancelled after it has started.');
      }
    }
    const cancelled = await bookingModel.cancel(c, id, req.user.id, reason);
    await auditModel.log(req.user.id, 'booking_cancelled', 'booking', id, { reason }, c);
    return cancelled;
  });
  ok(res, 'Booking cancelled.', row);
});

const decide = (newStatus) => asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const note = cleanText(req.body.note, { label: 'Note', max: 300 });
  const row = await db.tx(async (c) => {
    const booking = await bookingModel.findById(id, c, true);
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'pending') throw new HttpError(409, 'Only pending requests can be approved or rejected.');
    if (newStatus === 'confirmed' && new Date(booking.start_time) <= new Date()) {
      throw new HttpError(409, 'This slot has already started. Reject the request instead.');
    }
    const updated = await bookingModel.decide(c, id, newStatus, req.user.id, note);
    await auditModel.log(req.user.id, newStatus === 'confirmed' ? 'booking_approved' : 'booking_rejected', 'booking', id, { note }, c);
    return updated;
  });
  ok(res, newStatus === 'confirmed' ? 'Booking approved.' : 'Booking rejected.', row);
});
exports.approve = decide('confirmed');
exports.reject = decide('rejected');
