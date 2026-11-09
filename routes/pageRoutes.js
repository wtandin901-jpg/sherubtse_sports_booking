const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { requireLogin, requireRole } = require('../middleware/auth');
const pages = require('../controllers/pageController');
const auth = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.nodeEnv === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).render('login', { title: 'Log in', error: 'Too many attempts. Try again in 15 minutes.' })
});

router.get('/', pages.home);
router.get('/login', pages.loginPage);
router.post('/login', loginLimiter, auth.login);
router.post('/logout', auth.logout);
router.get('/change-password', requireLogin, pages.changePasswordPage);
router.get('/dashboard', requireLogin, pages.dashboard);

router.get('/admin', requireLogin, requireRole('admin'), pages.admin);
router.get('/admin/users', requireLogin, requireRole('admin'), pages.adminUsers);
router.get('/cr-rl', requireLogin, requireRole('cr_rl'), pages.crRl);
router.get('/student', requireLogin, requireRole('student'), pages.student);

module.exports = router;
