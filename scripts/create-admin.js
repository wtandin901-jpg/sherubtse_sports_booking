const readline = require('readline');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const userModel = require('../models/userModel');
const { cleanEmail, cleanText, checkPassword } = require('../utils/validate');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    if (!hidden) return rl.question(question, resolve);
    const original = rl._writeToOutput;
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => { rl._writeToOutput = original; process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  try {
    const env = process.env;
    const auto = env.ADMIN_NAME && env.ADMIN_EMAIL && env.ADMIN_PASSWORD;
    const fullName = cleanText(auto ? env.ADMIN_NAME : await ask('Full name: '), { label: 'Full name', min: 2, max: 120, required: true });
    const email = cleanEmail(auto ? env.ADMIN_EMAIL : await ask('Email: '));
    const password = checkPassword(auto ? env.ADMIN_PASSWORD : await ask('Password (min 12 chars, letters + digits): ', true));
    const created = await userModel.create({
      fullName, email, role: 'admin', passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false
    });
    console.log(`Admin created with id ${created.id}.`);
  } catch (err) {
    console.error('Could not create admin:', err.code === '23505' ? 'that email already exists.' : err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
})();
