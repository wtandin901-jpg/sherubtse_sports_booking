const { Pool } = require('pg');
const config = require('./index');

const pool = new Pool({ ...config.db, max: 10 });
pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

// Run fn(client) inside one transaction; roll back if it throws.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query: (text, params) => pool.query(text, params), tx };
