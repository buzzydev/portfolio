// Creates the first Super Administrator from environment variables. Never hardcodes a password.
//   ADMIN_USERNAME=owner ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='long-secret-here' npm run create-admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { prisma, disconnect } = require('../src/config/db');
const { userCreate } = require('../src/validators/schemas');

(async () => {
  const { ADMIN_USERNAME: username, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!username || !email || !password) {
    throw new Error('Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) first.');
  }
  const parsed = userCreate.safeParse({ username, email, password, role: 'ADMIN' });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
  const db = prisma();
  const existing = await db.user.count({ where: { role: 'SUPER_ADMIN' } });
  if (existing > 0 && process.env.ALLOW_ADDITIONAL_SUPER !== 'true') {
    throw new Error('A Super Administrator already exists. Set ALLOW_ADDITIONAL_SUPER=true to add another.');
  }
  const user = await db.user.create({
    data: { username: parsed.data.username, email: parsed.data.email, displayName: parsed.data.username, role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 12) },
    select: { id: true, username: true },
  });
  await db.auditLog.create({ data: { userId: user.id, action: 'users.bootstrap', entity: 'User', entityId: String(user.id) } });
  console.log(`Super Administrator "${user.username}" created. Remove ADMIN_PASSWORD from your environment now.`);
})()
  .catch((e) => { console.error(e.code === 'P2002' ? 'That username or email already exists.' : e.message); process.exitCode = 1; })
  .finally(disconnect);
