const db = require('../config/db');
exports.listActive = async () =>
  (await db.query('SELECT id, name, ground_type FROM grounds WHERE is_active ORDER BY id')).rows;
exports.findById = async (id, executor = db) =>
  (await executor.query('SELECT id, name, is_active FROM grounds WHERE id=$1', [id])).rows[0] || null;
