const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const userModel = require('../models/userModel');
const { cleanEmail, cleanText } = require('../utils/validate');

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('Usage: npm run users:import -- path/to/users.csv'); process.exit(1); }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const out = ['full_name,email,role,temporary_password'];
  let created = 0, skipped = 0;
  for (const line of lines.slice(1)) {
    const [name, mail, role] = line.split(',').map((s) => s.trim());
    try {
      if (!['student', 'cr_rl'].includes(role)) throw new Error('role must be student or cr_rl');
      const fullName = cleanText(name, { label: 'Name', min: 2, max: 120, required: true });
      const email = cleanEmail(mail);
      const password = crypto.randomBytes(12).toString('base64url');
      await userModel.create({ fullName, email, role, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true });
      out.push(`${fullName},${email},${role},${password}`);
      created++;
    } catch (err) {
      skipped++;
      console.warn(`Skipped "${line}": ${err.code === '23505' ? 'email already exists' : err.message}`);
    }
  }
  fs.writeFileSync('users-with-temp-passwords.csv', out.join('\n') + '\n');
  console.log(`Created ${created}, skipped ${skipped}. Passwords saved in users-with-temp-passwords.csv`);
  await pool.end();
})();
