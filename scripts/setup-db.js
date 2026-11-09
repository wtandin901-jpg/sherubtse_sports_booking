const fs = require('fs');
const path = require('path');
const config = require('../config');
const { pool } = require('../config/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
    const { rows } = await pool.query('SELECT name FROM grounds ORDER BY id');
    console.log(`Schema applied to "${config.db.database}". Grounds:`, rows.map((r) => r.name).join(', '));
  } catch (err) {
    console.error('Database setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
