const { app, request, resetDatabase, makeUser, login, futureLocal, closeAll, db } = require('./helpers');

let admin, crrl, crrl2, pendingCrrl, student;

beforeAll(async () => {
  await resetDatabase();
  await makeUser('admin', 'Admin One');
  await makeUser('cr_rl', 'Approved Crrl', { bookingAccess: true });
  await makeUser('cr_rl', 'Second Crrl', { bookingAccess: true });
  await makeUser('cr_rl', 'Pending Crrl');
  await makeUser('student', 'Student One');
  admin = await login('admin.one@test.edu.bt');
  crrl = await login('approved.crrl@test.edu.bt');
  crrl2 = await login('second.crrl@test.edu.bt');
  pendingCrrl = await login('pending.crrl@test.edu.bt');
  student = await login('student.one@test.edu.bt');
});

afterAll(async () => {
  try {
    await resetDatabase();
    console.log('Test database cleaned successfully.');
  } finally {
    await closeAll();
  }
});

async function newSchedule(groundId, day, from = 9, to = 15) {
  const res = await admin.post('/api/schedules', { groundId, startTime: futureLocal(day, from), endTime: futureLocal(day, to) });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('public and authentication', () => {
  test('T01 home page lists three grounds', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    ['Football Ground', 'Basketball Court', 'Volleyball Court'].forEach((n) => expect(res.text).toContain(n));
  });
  test('T02 wrong password is rejected with no session', async () => {
    const bad = await login('admin.one@test.edu.bt', 'wrong-password-123');
    expect(bad.loginResponse.status).toBe(401);
    expect((await bad.agent.get('/api/schedules')).status).toBe(401);
  });
  test('T03 admin dashboard renders for admin', async () => {
    const res = await admin.get('/admin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Admin dashboard');
  });
  test('unauthenticated API call returns 401', async () => {
    expect((await request(app).get('/api/schedules')).status).toBe(401);
  });
  test('POST without CSRF token returns 403', async () => {
    const res = await admin.agent.post('/api/schedules').send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/CSRF/);
  });
  test('login page form POST without _csrf is rejected', async () => {
    expect((await request(app).post('/login').type('form').send({ email: 'a@b.co', password: 'x' })).status).toBe(403);
  });
});

describe('roles and access', () => {
  test('T04 student cannot call admin API', async () => {
    expect((await student.post('/api/schedules', { groundId: 1 })).status).toBe(403);
    expect((await student.get('/api/users')).status).toBe(403);
  });
  test('T21 student cannot book', async () => {
    expect((await student.post('/api/bookings', { scheduleId: 1, startTime: futureLocal(2, 9) })).status).toBe(403);
  });
  test('T22 student dashboard is read-only (no action buttons)', async () => {
    const res = await student.get('/student');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-action');
  });
  test('student is redirected away from the admin page', async () => {
    expect((await student.get('/admin')).status).toBe(403);
  });
  test('T05/T06 CR/RL requests access and admin approves', async () => {
    expect((await pendingCrrl.post('/api/access-requests', { note: 'Class rep for BSc Y2' })).status).toBe(201);
    expect((await pendingCrrl.post('/api/access-requests', {})).status).toBe(409); // duplicate pending
    const list = await admin.get('/api/access-requests?status=pending');
    expect(list.body.data).toHaveLength(1);
    expect((await admin.post(`/api/access-requests/${list.body.data[0].id}/approve`)).status).toBe(200);
    const me = await db.query("SELECT booking_access FROM users WHERE email='pending.crrl@test.edu.bt'");
    expect(me.rows[0].booking_access).toBe(true);
    await db.query("UPDATE users SET booking_access=FALSE WHERE email='pending.crrl@test.edu.bt'"); // reset for T07
  });
  test('T07 unapproved CR/RL cannot book', async () => {
    const s = await newSchedule(1, 2);
    expect((await pendingCrrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(2, 9) })).status).toBe(403);
  });
});

describe('schedules', () => {
  test('T20 admin creates schedule; overlapping schedule on same ground is 409; other ground OK', async () => {
    const s = await newSchedule(2, 3, 8, 12);
    const dup = await admin.post('/api/schedules', { groundId: 2, startTime: futureLocal(3, 10), endTime: futureLocal(3, 14) });
    expect(dup.status).toBe(409);
    expect((await admin.post('/api/schedules', { groundId: 3, startTime: futureLocal(3, 10), endTime: futureLocal(3, 14) })).status).toBe(201);
    const edited = await admin.patch(`/api/schedules/${s.id}`, { startTime: futureLocal(3, 8), endTime: futureLocal(3, 13) });
    expect(edited.status).toBe(200);
  });
  test('T24 invalid schedule input is rejected', async () => {
    const bad = [
      { groundId: 1, startTime: futureLocal(4, 12), endTime: futureLocal(4, 10) },      // end before start
      { groundId: 1, startTime: futureLocal(4, 9), endTime: futureLocal(4, 10) },       // shorter than 90 min
      { groundId: 1, startTime: futureLocal(4, 4), endTime: futureLocal(4, 8) },        // before opening
      { groundId: 1, startTime: 'banana', endTime: futureLocal(4, 8) },
      { groundId: 99, startTime: futureLocal(4, 9), endTime: futureLocal(4, 12) },      // no such ground
      {}
    ];
    for (const body of bad) expect([400, 404]).toContain((await admin.post('/api/schedules', body)).status);
  });
});

describe('bookings', () => {
  test('T08/T14 approved CR/RL requests a slot (pending, holds the slot); booking is exactly 90 min; adjacent slots both succeed', async () => {
    const s = await newSchedule(1, 5, 9, 15);
    const slots = (await crrl.get(`/api/schedules/${s.id}/slots`)).body.data;
    expect(slots).toHaveLength(4);
    const first = await crrl.post('/api/bookings', { scheduleId: s.id, startTime: slots[0].start });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('pending');
    expect(new Date(first.body.data.end_time) - new Date(first.body.data.start_time)).toBe(90 * 60000);
    expect((await crrl2.post('/api/bookings', { scheduleId: s.id, startTime: slots[1].start })).status).toBe(201); // adjacent
    const after = (await crrl.get(`/api/schedules/${s.id}/slots`)).body.data;
    expect(after.map((x) => x.available)).toEqual([false, false, true, true]);
  });
  test('T09 booking that does not fit / is off the slot grid is rejected', async () => {
    const s = await newSchedule(1, 6, 9, 12);
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(6, 11) })).status).toBe(400); // runs past end
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(6, 9, 30) })).status).toBe(400); // off grid
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(7, 9) })).status).toBe(400); // wrong day
    expect((await crrl.post('/api/bookings', { scheduleId: 99999, startTime: futureLocal(6, 9) })).status).toBe(404);
  });
  test('T10/T11 staff/outsider bookings block overlaps with CR/RL bookings (both directions)', async () => {
    const s = await newSchedule(2, 8, 9, 15);
    const staff = await admin.post('/api/bookings/external', {
      groundId: 2, startTime: futureLocal(8, 9), sourceType: 'staff', bookerName: 'Mr Dorji', bookerContact: '17000000' });
    expect(staff.status).toBe(201);
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(8, 9) })).status).toBe(409);
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(8, 10, 30) })).status).toBe(201);
    const outsider = await admin.post('/api/bookings/external', {
      groundId: 2, startTime: futureLocal(8, 10, 30), sourceType: 'outsider', bookerName: 'Visitor' });
    expect(outsider.status).toBe(409);
  });
  test('T13 same time on different grounds is allowed', async () => {
    const a = await newSchedule(1, 9, 9, 12);
    const b = await newSchedule(3, 9, 9, 12);
    expect((await crrl.post('/api/bookings', { scheduleId: a.id, startTime: futureLocal(9, 9) })).status).toBe(201);
    expect((await crrl2.post('/api/bookings', { scheduleId: b.id, startTime: futureLocal(9, 9) })).status).toBe(201);
  });
  test('validation of staff/outsider input', async () => {
    const base = { groundId: 1, startTime: futureLocal(12, 9), sourceType: 'staff', bookerName: 'Valid Name' };
    expect((await admin.post('/api/bookings/external', { ...base, sourceType: 'vip' })).status).toBe(400);
    expect((await admin.post('/api/bookings/external', { ...base, bookerName: '' })).status).toBe(400);
    expect((await admin.post('/api/bookings/external', { ...base, startTime: '2020-01-01T10:00' })).status).toBe(400);
    expect((await admin.post('/api/bookings/external', { ...base, startTime: futureLocal(12, 22) })).status).toBe(400);
  });
  test('students only see sanitized booking info', async () => {
    const res = await student.get('/api/bookings');
    expect(res.status).toBe(200);
    res.body.data.forEach((b) => {
      expect(b).not.toHaveProperty('booker_name');
      expect(b).not.toHaveProperty('booker_contact');
    });
  });
});

describe('cancellation and schedule protection', () => {
  test('T15/T16/T18 cancellation rules', async () => {
    const s = await newSchedule(3, 14, 9, 12);
    const mine = (await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(14, 9) })).body.data;
    expect((await crrl2.post(`/api/bookings/${mine.id}/cancel`)).status).toBe(403);          // not the owner
    expect((await student.post(`/api/bookings/${mine.id}/cancel`)).status).toBe(403);
    expect((await crrl.post(`/api/bookings/${mine.id}/cancel`, { reason: 'Rain' })).status).toBe(200);
    expect((await crrl.post(`/api/bookings/${mine.id}/cancel`)).status).toBe(409);            // already cancelled
    expect((await crrl2.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(14, 9) })).status).toBe(201); // slot released
    const again = (await crrl2.get('/api/bookings')).body.data[0];
    expect((await admin.post(`/api/bookings/${again.id}/cancel`)).status).toBe(200);          // admin can cancel any
  });
  test('T17 CR/RL cannot cancel after the booking has started', async () => {
    const own = (await db.query("SELECT id FROM users WHERE email='approved.crrl@test.edu.bt'")).rows[0].id;
    const sched = await db.query(
      `INSERT INTO schedules (ground_id,start_time,end_time,created_by) VALUES (1, now() - interval '1 hour', now() + interval '3 hours', $1) RETURNING id`, [own]);
    const b = await db.query(
      `INSERT INTO bookings (ground_id,schedule_id,booked_by,source_type,booker_name,start_time,end_time,created_by)
       VALUES (1,$1,$2,'cr_rl','Approved Crrl', now() - interval '30 minutes', now() + interval '60 minutes',$2) RETURNING id`, [sched.rows[0].id, own]);
    expect((await crrl.post(`/api/bookings/${b.rows[0].id}/cancel`)).status).toBe(403);
    await db.query('DELETE FROM bookings WHERE id=$1', [b.rows[0].id]);
    await db.query('DELETE FROM schedules WHERE id=$1', [sched.rows[0].id]);
  });
  test('T19 booked schedule cannot be edited or closed; unbooked can', async () => {
    const booked = await newSchedule(1, 16, 9, 12);
    await crrl.post('/api/bookings', { scheduleId: booked.id, startTime: futureLocal(16, 9) });
    expect((await admin.patch(`/api/schedules/${booked.id}`, { endTime: futureLocal(16, 14) })).status).toBe(409);
    expect((await admin.post(`/api/schedules/${booked.id}/close`)).status).toBe(409);
    const free = await newSchedule(1, 17, 9, 12);
    expect((await admin.post(`/api/schedules/${free.id}/close`)).status).toBe(200);
    expect((await crrl.post('/api/bookings', { scheduleId: free.id, startTime: futureLocal(17, 9) })).status).toBe(409); // closed
    expect((await admin.post(`/api/schedules/${free.id}/reopen`)).status).toBe(200);
  });
});

describe('booking approval workflow', () => {
  test('request is pending, shows on admin page, admin approves, it becomes confirmed', async () => {
    const s = await newSchedule(1, 21, 9, 12);
    const req = await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(21, 9) });
    expect(req.status).toBe(201);
    expect(req.body.data.status).toBe('pending');
    const adminPage = await admin.get('/admin');
    expect(adminPage.text).toContain('Booking requests waiting for approval');
    expect(adminPage.text).toContain(`/api/bookings/${req.body.data.id}/approve`);
    expect((await crrl.get('/cr-rl')).text).toContain('Withdraw');
    expect((await student.get('/student')).text).toContain('Pending approval');
    const approved = await admin.post(`/api/bookings/${req.body.data.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('confirmed');
    expect(approved.body.data.decided_by).not.toBeNull();
    expect((await admin.post(`/api/bookings/${req.body.data.id}/approve`)).status).toBe(409); // not pending any more
  });
  test('a pending request holds the slot: nobody else can request it', async () => {
    const s = await newSchedule(2, 22, 9, 12);
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(22, 9) })).status).toBe(201);
    expect((await crrl2.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(22, 9) })).status).toBe(409);
    expect((await admin.post('/api/bookings/external', {
      groundId: 2, startTime: futureLocal(22, 9), sourceType: 'staff', bookerName: 'Mr Staff' })).status).toBe(409);
  });
  test('rejecting a request frees the slot and keeps the reason', async () => {
    const s = await newSchedule(3, 23, 9, 12);
    const req = await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(23, 9) });
    const rejected = await admin.post(`/api/bookings/${req.body.data.id}/reject`, { note: 'Ground under repair' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('rejected');
    expect(rejected.body.data.decision_note).toBe('Ground under repair');
    expect((await crrl.get('/cr-rl')).text).toContain('Ground under repair');
    expect((await crrl2.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(23, 9) })).status).toBe(201);
  });
  test('only admin can approve or reject; CR/RL can withdraw own pending request', async () => {
    const s = await newSchedule(1, 24, 9, 12);
    const req = (await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(24, 9) })).body.data;
    expect((await crrl.post(`/api/bookings/${req.id}/approve`)).status).toBe(403);
    expect((await crrl2.post(`/api/bookings/${req.id}/reject`)).status).toBe(403);
    expect((await student.post(`/api/bookings/${req.id}/approve`)).status).toBe(403);
    expect((await crrl2.post(`/api/bookings/${req.id}/cancel`)).status).toBe(403);
    expect((await crrl.post(`/api/bookings/${req.id}/cancel`)).status).toBe(200);
    expect((await admin.post(`/api/bookings/${req.id}/approve`)).status).toBe(409);   // cancelled, not pending
    expect((await admin.post('/api/bookings/999999/approve')).status).toBe(404);
  });
  test('a pending request whose start time has passed cannot be approved', async () => {
    const own = (await db.query("SELECT id FROM users WHERE email='approved.crrl@test.edu.bt'")).rows[0].id;
    const sched = await db.query(
      `INSERT INTO schedules (ground_id,start_time,end_time,created_by) VALUES (3, now() - interval '3 hours', now() + interval '3 hours', $1) RETURNING id`, [own]);
    const b = await db.query(
      `INSERT INTO bookings (ground_id,schedule_id,booked_by,source_type,booker_name,start_time,end_time,created_by,status)
       VALUES (3,$1,$2,'cr_rl','Approved Crrl', now() - interval '30 minutes', now() + interval '60 minutes',$2,'pending') RETURNING id`, [sched.rows[0].id, own]);
    expect((await admin.post(`/api/bookings/${b.rows[0].id}/approve`)).status).toBe(409);
    expect((await admin.post(`/api/bookings/${b.rows[0].id}/reject`)).status).toBe(200);
  });
  test('schedule with a pending request cannot be closed', async () => {
    const s = await newSchedule(2, 25, 9, 12);
    await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(25, 9) });
    expect((await admin.post(`/api/schedules/${s.id}/close`)).status).toBe(409);
  });
});

describe('deleting schedules', () => {
  test('unused schedule can be deleted and disappears; it cannot be used afterwards', async () => {
    const s = await newSchedule(3, 26, 9, 12);
    expect((await student.post(`/api/schedules/${s.id}/delete`)).status).toBe(403);
    expect((await crrl.post(`/api/schedules/${s.id}/delete`)).status).toBe(403);
    expect((await admin.post(`/api/schedules/${s.id}/delete`)).status).toBe(200);
    const listed = (await admin.get('/api/schedules?includeClosed=1')).body.data.map((x) => x.id);
    expect(listed).not.toContain(s.id);
    expect((await admin.get(`/api/schedules/${s.id}/slots`)).status).toBe(404);
    expect((await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(26, 9) })).status).toBe(404);
    expect((await admin.post(`/api/schedules/${s.id}/delete`)).status).toBe(404);   // already gone
    expect((await admin.post(`/api/schedules/${s.id}/reopen`)).status).toBe(404);   // cannot be reopened
    expect((await admin.get('/admin')).text).not.toContain(`/api/schedules/${s.id}/delete`);
    expect((await admin.post('/api/schedules', { groundId: 3, startTime: futureLocal(26, 9), endTime: futureLocal(26, 12) })).status).toBe(201);
  });
  test('schedule with an active booking cannot be deleted; after cancelling it can, and history is kept', async () => {
    const s = await newSchedule(1, 27, 9, 12);
    const b = (await crrl.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(27, 9) })).body.data;
    expect((await admin.post(`/api/schedules/${s.id}/delete`)).status).toBe(409);   // pending request
    expect((await admin.post(`/api/bookings/${b.id}/approve`)).status).toBe(200);
    expect((await admin.post(`/api/schedules/${s.id}/delete`)).status).toBe(409);   // confirmed
    expect((await admin.post(`/api/bookings/${b.id}/cancel`, { reason: 'Event cancelled' })).status).toBe(200);
    expect((await admin.post(`/api/schedules/${s.id}/delete`)).status).toBe(200);
    const all = (await admin.get('/api/bookings')).body.data;
    expect(all.find((x) => x.id === b.id).status).toBe('cancelled');               // history kept
  });
  test('a closed schedule can be deleted too', async () => {
    const s = await newSchedule(2, 28, 9, 12);
    expect((await admin.post(`/api/schedules/${s.id}/close`)).status).toBe(200);
    expect((await admin.post(`/api/schedules/${s.id}/delete`)).status).toBe(200);
  });
});

describe('user management', () => {
  test('admin creates a user with a temporary password that must be changed', async () => {
    const created = await admin.post('/api/users', { fullName: 'New Student', email: 'New.Student@test.edu.bt', role: 'student' });
    expect(created.status).toBe(201);
    const temp = created.body.data.temporaryPassword;
    const fresh = await login('new.student@test.edu.bt', temp);
    expect(fresh.loginResponse.body.data.mustChangePassword).toBe(true);
    expect((await fresh.get('/api/schedules')).status).toBe(403);                      // blocked until password changed
    expect((await fresh.post('/api/auth/change-password', { currentPassword: temp, newPassword: 'short' })).status).toBe(400);
    expect((await fresh.post('/api/auth/change-password', { currentPassword: temp, newPassword: 'A-New-Strong-Pass-99' })).status).toBe(200);
    expect((await fresh.get('/api/schedules')).status).toBe(200);
  });
  test('duplicate email, bad role and admin-role creation are rejected', async () => {
    expect((await admin.post('/api/users', { fullName: 'Dup', email: 'student.one@test.edu.bt', role: 'student' })).status).toBe(409);
    expect((await admin.post('/api/users', { fullName: 'Evil Admin', email: 'evil@test.edu.bt', role: 'admin' })).status).toBe(400);
  });
  test('deactivating a user takes effect immediately; admin cannot deactivate self', async () => {
    const victim = await makeUser('cr_rl', 'Temp Crrl');
    const c = await login(victim.email);
    expect((await c.get('/api/schedules')).status).toBe(200);
    expect((await admin.patch(`/api/users/${victim.id}`, { isActive: false })).status).toBe(200);
    expect((await c.get('/api/schedules')).status).toBe(401);
    const me = (await db.query("SELECT id FROM users WHERE email='admin.one@test.edu.bt'")).rows[0].id;
    expect((await admin.patch(`/api/users/${me}`, { isActive: false })).status).toBe(400);
  });
  test('admin reset-password returns a working temporary password', async () => {
    const u = await makeUser('student', 'Forgetful Student');
    const reset = await admin.post(`/api/users/${u.id}/reset-password`);
    expect(reset.status).toBe(200);
    expect((await login(u.email, reset.body.data.temporaryPassword)).loginResponse.status).toBe(200);
  });
  test('revoking booking access blocks booking', async () => {
    const u = await makeUser('cr_rl', 'Revoked Crrl', { bookingAccess: true });
    const c = await login(u.email);
    const s = await newSchedule(2, 20, 9, 12);
    expect((await admin.patch(`/api/users/${u.id}`, { bookingAccess: false })).status).toBe(200);
    expect((await c.post('/api/bookings', { scheduleId: s.id, startTime: futureLocal(20, 9) })).status).toBe(403);
  });
});

describe('T12 concurrency', () => {
  test('simultaneous requests for one slot: exactly one succeeds (repeated 10 times)', async () => {
    for (let round = 0; round < 10; round++) {
      const s = await newSchedule(1, 30 + round, 9, 12);
      const start = futureLocal(30 + round, 9);
      const clients = [crrl, crrl2];
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => clients[i % 2].post('/api/bookings', { scheduleId: s.id, startTime: start })));
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(7);
      const count = await db.query("SELECT count(*)::int AS n FROM bookings WHERE schedule_id=$1 AND status IN ('pending','confirmed')", [s.id]);
      expect(count.rows[0].n).toBe(1);
    }
  });
});
