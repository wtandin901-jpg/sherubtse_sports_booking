const db = require('../config/db');

const SAFE_COLUMNS = `u.id, u.full_name, u.email, u.is_active, u.booking_access,
  u.must_change_password, u.created_at, r.role_name AS role`;

exports.findById = async (id, executor = db) => {
  const { rows } = await executor.query(
    `SELECT ${SAFE_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [id]);
  return rows[0] || null;
};

exports.findForLogin = async (email) => {
  const { rows } = await db.query(
    `SELECT ${SAFE_COLUMNS}, u.password_hash FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = $1`, [email]);
  return rows[0] || null;
};

exports.getPasswordHash = async (id) => {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
  return rows[0] ? rows[0].password_hash : null;
};

exports.create = async ({ fullName, email, passwordHash, role, mustChangePassword = true }, executor = db) => {
  const { rows } = await executor.query(
    `INSERT INTO users (full_name, email, password_hash, role_id, must_change_password, booking_access)
     SELECT $1, $2, $3, id, $5, FALSE FROM roles WHERE role_name = $4
     RETURNING id`,
    [fullName, email, passwordHash, role, mustChangePassword]);
  return rows[0];
};

exports.list = async () => {
  const { rows } = await db.query(
    `SELECT ${SAFE_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.created_at DESC, u.id DESC`);
  return rows;
};

exports.setPassword = (id, hash, mustChange) =>
  db.query('UPDATE users SET password_hash=$2, must_change_password=$3, updated_at=now() WHERE id=$1', [id, hash, mustChange]);

exports.update = async (id, { isActive, bookingAccess, fullName }) => {
  const { rows } = await db.query(
    `UPDATE users SET
       is_active      = COALESCE($2, is_active),
       booking_access = COALESCE($3, booking_access),
       full_name      = COALESCE($4, full_name),
       updated_at     = now()
     WHERE id = $1 RETURNING id`,
    [id, isActive, bookingAccess, fullName]);
  return rows[0] || null;
};
