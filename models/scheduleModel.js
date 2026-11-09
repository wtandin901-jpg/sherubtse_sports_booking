const db = require('../config/db');

const SELECT = `SELECT s.*, g.name AS ground_name, g.is_active AS ground_active
                FROM schedules s JOIN grounds g ON g.id = s.ground_id`;

exports.findById = async (id, executor = db, lock = false) => {
  const { rows } = await executor.query(`${SELECT} WHERE s.id = $1 AND s.deleted_at IS NULL ${lock ? 'FOR UPDATE OF s' : ''}`, [id]);
  return rows[0] || null;
};

exports.listUpcoming = async ({ openOnly = true, groundId = null } = {}) =>
  (await db.query(
    `${SELECT}
     WHERE s.deleted_at IS NULL AND s.end_time > now() AND ($1::boolean = FALSE OR s.status = 'open') AND ($2::int IS NULL OR s.ground_id = $2)
     ORDER BY s.start_time`, [openOnly, groundId])).rows;

exports.insert = async ({ groundId, start, end, createdBy }, executor = db) =>
  (await executor.query(
    'INSERT INTO schedules (ground_id, start_time, end_time, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [groundId, start, end, createdBy])).rows[0];

exports.update = async (id, { groundId, start, end, status }, executor = db) =>
  (await executor.query(
    `UPDATE schedules SET ground_id=$2, start_time=$3, end_time=$4, status=COALESCE($5, status)
     WHERE id=$1 RETURNING *`, [id, groundId, start, end, status])).rows[0];

exports.hasConfirmedBookings = async (groundId, start, end, executor = db) => {
  const { rows } = await executor.query(
    `SELECT 1 FROM bookings WHERE ground_id=$1 AND status IN ('pending','confirmed')
     AND tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)') LIMIT 1`,
    [groundId, start, end]);
  return rows.length > 0;
};


exports.softDelete = (id, executor = db) =>
  executor.query("UPDATE schedules SET status = 'closed', deleted_at = now() WHERE id = $1", [id]);
