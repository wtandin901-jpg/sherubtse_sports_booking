const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { requireLogin, requireRole, requireBookingAccess } = require('../middleware/auth');
const auth = require('../controllers/authController');
const schedules = require('../controllers/scheduleController');
const bookings = require('../controllers/bookingController');
const access = require('../controllers/accessController');
const users = require('../controllers/userController');
const groundModel = require('../models/groundModel');
const { asyncHandler, ok } = require('../utils/http');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.nodeEnv === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' }
});

const admin = [requireLogin, requireRole('admin')];
const crrl = [requireLogin, requireRole('cr_rl')];

router.get('/auth/csrf', auth.csrf);
router.post('/auth/login', loginLimiter, auth.login);
router.post('/auth/logout', auth.logout);
router.post('/auth/change-password', requireLogin, auth.changePassword);

router.get('/grounds', asyncHandler(async (req, res) => ok(res, 'Grounds', await groundModel.listActive())));

router.get('/schedules', requireLogin, schedules.list);
router.get('/schedules/:id/slots', requireLogin, schedules.slots);
router.post('/schedules', admin, schedules.create);
router.patch('/schedules/:id', admin, schedules.update);
router.post('/schedules/:id/close', admin, schedules.close);
router.post('/schedules/:id/reopen', admin, schedules.reopen);
router.post('/schedules/:id/delete', admin, schedules.remove);

router.get('/bookings', requireLogin, bookings.list);
router.post('/bookings', requireLogin, requireBookingAccess, bookings.create);
router.post('/bookings/external', admin, bookings.createExternal);
router.post('/bookings/:id/approve', admin, bookings.approve);
router.post('/bookings/:id/reject', admin, bookings.reject);
router.post('/bookings/:id/cancel', requireLogin, requireRole('admin', 'cr_rl'), bookings.cancel);

router.post('/access-requests', crrl, access.create);
router.get('/access-requests', requireLogin, requireRole('admin', 'cr_rl'), access.list);
router.post('/access-requests/:id/approve', admin, access.approve);
router.post('/access-requests/:id/reject', admin, access.reject);

router.get('/users', admin, users.list);
router.post('/users', admin, users.create);
router.patch('/users/:id', admin, users.update);
router.post('/users/:id/reset-password', admin, users.resetPassword);

module.exports = router;
