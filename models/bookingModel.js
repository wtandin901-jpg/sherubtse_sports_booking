const db = require('../config/db');

const SELECT = `SELECT b.*, g.name AS ground_name, u.full_name AS user_name
                FROM bookings b JOIN grounds g ON g.id = b.ground_id LEFT JOIN users u ON u.id = b.booked_by`;

exports.insert = async (c, d) =>
  (await c.query(
    `INSERT INTO bookings (ground_id, schedule_id, booked_by, source_type, booker_name, booker_contact,
                           start_time, end_time, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.groundId, d.scheduleId || null, d.bookedBy || null, d.sourceType, d.bookerName, d.bookerContact || null,
     d.start, d.end, d.createdBy, d.status || 'confirmed'])).rows[0];

exports.findById = async (id, executor = db, lock = false) =>
  (await executor.query(`${SELECT} WHERE b.id = $1 ${lock ? 'FOR UPDATE OF b' : ''}`, [id])).rows[0] || null;

exports.listAll = async ({ groundId, status, sourceType, date } = {}) =>
  (await db.query(
    `${SELECT}
     WHERE ($1::int IS NULL OR b.ground_id = $1) AND ($2::text IS NULL OR b.status = $2)
       AND ($3::text IS NULL OR b.source_type = $3)
       AND ($4::date IS NULL OR (b.start_time AT TIME ZONE 'Asia/Thimphu')::date = $4::date)
     ORDER BY b.start_time DESC LIMIT 500`,
    [groundId || null, status || null, sourceType || null, date || null])).rows;

exports.listForUser = async (userId) =>
  (await db.query(`${SELECT} WHERE b.booked_by = $1 ORDER BY b.start_time DESC`, [userId])).rows;

exports.listPublicUpcoming = async () =>
  (await db.query(
    `SELECT b.id, g.name AS ground_name, b.start_time, b.end_time, b.status
     FROM bookings b JOIN grounds g ON g.id = b.ground_id
     WHERE b.status IN ('pending','confirmed') AND b.end_time > now() ORDER BY b.start_time LIMIT 200`)).rows;


exports.listPending = async () =>
  (await db.query(`${SELECT} WHERE b.status = 'pending' AND b.end_time > now() ORDER BY b.start_time`)).rows;

exports.confirmedInRange = async (groundId, start, end, executor = db) =>
  (await executor.query(
    `SELECT start_time, end_time FROM bookings WHERE ground_id=$1 AND status IN ('pending','confirmed')
     AND tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [groundId, start, end])).rows;

exports.cancel = async (c, id, actorId, reason) =>
  (await c.query(
    `UPDATE bookings SET status='cancelled', cancelled_by=$2, cancelled_at=now(), cancel_reason=$3
     WHERE id=$1 AND status IN ('pending','confirmed') RETURNING *`, [id, actorId, reason || null])).rows[0] || null;

exports.decide = async (c, id, status, adminId, note) =>
  (await c.query(
    `UPDATE bookings SET status=$2, decided_by=$3, decided_at=now(), decision_note=$4
     WHERE id=$1 AND status='pending' RETURNING *`, [id, status, adminId, note || null])).rows[0] || null;

exports.counts = async () =>
  (await db.query(
    `SELECT
       (SELECT count(*) FROM bookings WHERE status='confirmed' AND end_time > now())::int AS upcoming_bookings,
       (SELECT count(*) FROM bookings WHERE status='pending' AND end_time > now())::int AS pending_bookings,
       (SELECT count(*) FROM access_requests WHERE status='pending')::int AS pending_requests,
       (SELECT count(*) FROM schedules WHERE status='open' AND end_time > now())::int AS open_schedules`)).rows[0];
