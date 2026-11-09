const config = require('../config');
const groundModel = require('../models/groundModel');
const scheduleModel = require('../models/scheduleModel');
const bookingModel = require('../models/bookingModel');
const accessModel = require('../models/accessModel');
const userModel = require('../models/userModel');
const { buildSlots } = require('../services/slots');
const { asyncHandler } = require('../utils/http');

async function withSlots(schedules) {
  for (const s of schedules) {
    const bookings = await bookingModel.confirmedInRange(s.ground_id, s.start_time, s.end_time);
    s.slots = buildSlots(s, bookings);
  }
  return schedules;
}

exports.home = asyncHandler(async (req, res) =>
  res.render('index', { title: 'Home', grounds: await groundModel.listActive() }));

exports.loginPage = (req, res) =>
  req.user ? res.redirect('/dashboard') : res.render('login', { title: 'Log in', error: null });

exports.changePasswordPage = (req, res) => res.render('change-password', { title: 'Change password' });

exports.dashboard = (req, res) =>
  res.redirect({ admin: '/admin', cr_rl: '/cr-rl', student: '/student' }[req.user.role]);

exports.admin = asyncHandler(async (req, res) => {
  const q = req.query;
  const [grounds, counts, schedules, requests, pendingBookings, bookings] = await Promise.all([
    groundModel.listActive(),
    bookingModel.counts(),
    scheduleModel.listUpcoming({ openOnly: false }),
    accessModel.listAll('pending'),
    bookingModel.listPending(),
    bookingModel.listAll({
      groundId: /^\d+$/.test(q.groundId || '') ? Number(q.groundId) : null,
      status: ['pending', 'confirmed', 'cancelled', 'rejected'].includes(q.status) ? q.status : null,
      sourceType: ['cr_rl', 'staff', 'outsider'].includes(q.sourceType) ? q.sourceType : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : null
    })
  ]);
  for (const s of schedules) {
    s.locked = await scheduleModel.hasConfirmedBookings(s.ground_id, s.start_time, s.end_time);
  }
  res.render('admin/dashboard', {
    title: 'Admin dashboard', grounds, counts, schedules, requests, pendingBookings, bookings,
    filters: { groundId: q.groundId || '', status: q.status || '', sourceType: q.sourceType || '', date: q.date || '' },
    openHour: config.openHour, closeHour: config.closeHour
  });
});

exports.adminUsers = asyncHandler(async (req, res) =>
  res.render('admin/users', { title: 'Manage users', users: await userModel.list() }));

exports.crRl = asyncHandler(async (req, res) => {
  const [schedules, bookings, requests] = await Promise.all([
    scheduleModel.listUpcoming({ openOnly: true }),
    bookingModel.listForUser(req.user.id),
    accessModel.listForUser(req.user.id)
  ]);
  res.render('cr_rl/dashboard', {
    title: 'CR/RL dashboard', schedules: await withSlots(schedules), bookings, requests,
    cancelCutoff: config.cancelCutoffMinutes
  });
});

exports.student = asyncHandler(async (req, res) => {
  const schedules = await withSlots(await scheduleModel.listUpcoming({ openOnly: true }));
  res.render('student/dashboard', { title: 'Student dashboard', schedules, booked: await bookingModel.listPublicUpcoming() });
});
