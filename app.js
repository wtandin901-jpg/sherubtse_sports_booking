const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const config = require('./config');
const { pool } = require('./config/db');
const { attachUser } = require('./middleware/auth');
const { csrfToken, csrfProtect } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');
const time = require('./utils/time');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1); 

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.get('/healthz', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch (e) { res.status(503).json({ status: 'database unavailable' }); }
});

app.use(session({
  name: 'sherubtse.sid',
  store: new PgStore({
    pool,
    createTableIfMissing: true,
    pruneSessionInterval: config.nodeEnv === 'test' ? false : 900
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 2 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  res.locals.fmt = time.fmt;
  res.locals.toInputValue = time.toInputValue;
  res.locals.user = null;
  next();
});
app.use(attachUser);
app.use(csrfToken);
app.use(csrfProtect);

app.use('/api', require('./routes/apiRoutes'));
app.use('/', require('./routes/pageRoutes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
