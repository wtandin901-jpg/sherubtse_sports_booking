const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const userModel = require('../../models/userModel');
const app = require('../../app');

const PASSWORD = 'Test-Password-12345';
const HASH = bcrypt.hashSync(PASSWORD, 4); 

async function resetDatabase() {
  await db.query('TRUNCATE audit_logs, bookings, schedules, access_requests, users RESTART IDENTITY CASCADE');
}

async function makeUser(role, name, { bookingAccess = false } = {}) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}@test.edu.bt`;
  const { id } = await userModel.create({ fullName: name, email, role, passwordHash: HASH, mustChangePassword: false });
  if (bookingAccess) await db.query('UPDATE users SET booking_access = TRUE WHERE id = $1', [id]);
  return { id, email };
}

async function login(email, password = PASSWORD) {
  const agent = request.agent(app);
  let token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const res = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ email, password });
  if (res.status !== 200) return { agent, loginResponse: res };
  token = (await agent.get('/api/auth/csrf')).body.data.csrfToken; 
  const send = (method, url, body) => agent[method](url).set('X-CSRF-Token', token).send(body);
  return {
    agent, loginResponse: res, token,
    get: (url) => agent.get(url),
    post: (url, body = {}) => send('post', url, body),
    patch: (url, body = {}) => send('patch', url, body)
  };
}

function futureLocal(daysAhead, hh, mm = 0) {
  const shifted = new Date(Date.now() + (daysAhead * 24 * 60 + 360) * 60000);
  return `${shifted.toISOString().slice(0, 10)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function closeAll() { await db.pool.end(); }

module.exports = { app, request, PASSWORD, resetDatabase, makeUser, login, futureLocal, closeAll, db };
