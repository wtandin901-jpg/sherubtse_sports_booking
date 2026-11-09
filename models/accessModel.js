const db = require('../config/db');
const auditModel = require('./auditModel');

exports.create = async (userId, note) => {
  const { rows } = await db.query(
    'INSERT INTO access_requests (user_id, note) VALUES ($1,$2) RETURNING *', [userId, note || null]);
  return rows[0];
};

exports.listForUser = async (userId) =>
  (await db.query('SELECT * FROM access_requests WHERE user_id=$1 ORDER BY requested_at DESC', [userId])).rows;

exports.listAll = async (status) =>
  (await db.query(
    `SELECT a.*, u.full_name, u.email FROM access_requests a JOIN users u ON u.id = a.user_id
     WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.requested_at DESC`, [status || null])).rows;

exports.decide = (id, status, adminId, decisionNote) =>
  db.tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE access_requests SET status=$2, decided_by=$3, decided_at=now(), decision_note=$4
       WHERE id=$1 AND status='pending' RETURNING *`,
      [id, status, adminId, decisionNote || null]);
    if (!rows[0]) return null;
    if (status === 'approved') {
      await c.query('UPDATE users SET booking_access = TRUE, updated_at = now() WHERE id = $1', [rows[0].user_id]);
    }
    await auditModel.log(adminId, `access_${status}`, 'access_request', id, { userId: rows[0].user_id }, c);
    return rows[0];
  });
