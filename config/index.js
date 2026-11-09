const path = require('path');
const dotenv = require('dotenv');

// Tests use .env.test so they can never touch the real database.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.join(__dirname, '..', envFile) });

function int(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isNaN(v) ? fallback : v;
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int('DB_PORT', 5432),
    database: process.env.DB_NAME || 'sherubtse_sports_booking',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  },
  sessionSecret: process.env.SESSION_SECRET || '',
  cookieSecure: process.env.SESSION_COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === '1',
  bookingMinutes: 90, // fixed by the project requirements
  cancelCutoffMinutes: int('CANCEL_CUTOFF_MINUTES', 0),
  openHour: int('OPEN_HOUR', 6),
  closeHour: int('CLOSE_HOUR', 21)
};

if (config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters. Check your .env file.');
}

module.exports = config;
