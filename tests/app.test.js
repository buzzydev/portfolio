require('./helpers');
const bcrypt = require('bcryptjs');
const request = require('supertest');

jest.mock('../src/config/db', () => {
  const m = () => ({ findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn().mockResolvedValue({ id: 1 }), delete: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), upsert: jest.fn() });
  const db = { user: m(), auditLog: m(), project: m(), skill: m(), experience: m(), socialLink: m(), contactMessage: m(), media: m(), vaultEntry: m(), setting: m(), $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]), $transaction: jest.fn((ops) => Promise.all(ops)) };
  return { prisma: () => db, disconnect: jest.fn(), __db: db };
});
const { __db: db } = require('../src/config/db');
const { encrypt } = require('../src/utils/crypto');
const { createApp } = require('../src/app');

const PASSWORD = 'correct-horse-battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const csrfOf = (res) => (/name="_csrf" value="([a-f0-9]+)"/.exec(res.text) || [])[1];
const makeUser = (role, id = 1) => ({ id, username: `user${id}`, email: `u${id}@x.io`, displayName: '', bio: '', role, status: 'ACTIVE', preferredTheme: 'SYSTEM', githubUrl: '', telegramUrl: '', avatarId: null, sessionVersion: 0, passwordHash: HASH, failedLogins: 0, lockedUntil: null });

async function loginAs(role, id = 1) {
  const user = makeUser(role, id);
  db.user.findFirst.mockResolvedValue(user);
  db.user.findUnique.mockResolvedValue(user);
  const agent = request.agent(createApp());
  const page = await agent.get('/login');
  const res = await agent.post('/login').type('form').send({ _csrf: csrfOf(page), identifier: user.username, password: PASSWORD });
  expect(res.status).toBe(302);
  // A fresh CSRF token for the new session
  const dash = await agent.get('/profile');
  return { agent, user, token: csrfOf(dash) };
}

beforeEach(() => { jest.clearAllMocks(); db.user.findUnique.mockReset(); db.user.findFirst.mockReset(); });

describe('public + session protection', () => {
  test('health check answers without a session', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  test('home renders with empty data and sends security headers', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Building Secure, Modern Digital Experiences.');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
  test.each(['/admin', '/admin/projects', '/admin/vault', '/admin/users', '/profile'])('%s redirects anonymous visitors to /login', async (p) => {
    const res = await request(createApp()).get(p);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
  test('POST without a CSRF token is rejected', async () => {
    const res = await request(createApp()).post('/contact').type('form').send({ name: 'a' });
    expect(res.status).toBe(403);
  });
  test('multipart uploads outside the upload routes are rejected', async () => {
    const res = await request(createApp()).post('/admin/projects').field('x', 'y');
    expect(res.status).toBe(403);
  });
  test('unknown routes return 404', async () => {
    expect((await request(createApp()).get('/nope')).status).toBe(404);
  });
});

describe('login and logout', () => {
  test('wrong password gives a generic message and records the failure', async () => {
    db.user.findFirst.mockResolvedValue(makeUser('SUPER_ADMIN'));
    const agent = request.agent(createApp());
    const page = await agent.get('/login');
    const res = await agent.post('/login').type('form').send({ _csrf: csrfOf(page), identifier: 'user1', password: 'wrong-password-123' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Incorrect username or password');
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { failedLogins: 1 } }));
  });
  test('unknown user gets the same message', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const agent = request.agent(createApp());
    const page = await agent.get('/login');
    const res = await agent.post('/login').type('form').send({ _csrf: csrfOf(page), identifier: 'ghost', password: 'whatever-password' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Incorrect username or password');
  });
  test('suspended accounts cannot sign in', async () => {
    db.user.findFirst.mockResolvedValue({ ...makeUser('ADMIN'), status: 'SUSPENDED' });
    const agent = request.agent(createApp());
    const page = await agent.get('/login');
    const res = await agent.post('/login').type('form').send({ _csrf: csrfOf(page), identifier: 'user1', password: PASSWORD });
    expect(res.status).toBe(401);
  });
  test('sign in, HttpOnly cookie, then sign out ends the session', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    expect((await agent.get('/admin')).status).toBe(200);
    const out = await agent.post('/logout').type('form').send({ _csrf: token });
    expect(out.status).toBe(302);
    expect((await agent.get('/admin')).headers.location).toBe('/login');
  });
  test('session cookie is HttpOnly and SameSite', async () => {
    db.user.findFirst.mockResolvedValue(makeUser('SUPER_ADMIN'));
    const agent = request.agent(createApp());
    const page = await agent.get('/login');
    expect(page.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(page.headers['set-cookie'][0]).toMatch(/SameSite=Lax/i);
  });
  test('revoked sessions (sessionVersion changed) are dropped', async () => {
    const { agent } = await loginAs('ADMIN');
    db.user.findUnique.mockResolvedValue({ ...makeUser('ADMIN'), sessionVersion: 5 });
    expect((await agent.get('/admin')).headers.location).toBe('/login');
  });
});

describe('role restrictions', () => {
  test('junior admin cannot create projects or open the vault', async () => {
    const { agent, token } = await loginAs('JUNIOR_ADMIN');
    expect((await agent.get('/admin/projects')).status).toBe(200);
    const create = await agent.post('/admin/projects').type('form').send({ _csrf: token, title: 'x', category: 'OTHER', status: 'DRAFT' });
    expect(create.status).toBe(403);
    expect(db.project.create).not.toHaveBeenCalled();
    expect((await agent.get('/admin/vault')).status).toBe(403);
    expect((await agent.get('/admin/messages')).status).toBe(403);
    expect((await agent.get('/admin/settings')).status).toBe(403);
  });
  test('admin can create but not delete projects', async () => {
    const { agent, token } = await loginAs('ADMIN');
    const ok = await agent.post('/admin/projects').type('form').send({ _csrf: token, title: 'My site', category: 'WEB_APP', status: 'DRAFT', sortOrder: '0' });
    expect(ok.status).toBe(302);
    expect(db.project.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'My site' }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'projects.create' }) });
    db.project.findUnique.mockResolvedValue({ id: 3, title: 'x' });
    const del = await agent.post('/admin/projects/3/delete').type('form').send({ _csrf: token });
    expect(del.status).toBe(403);
    expect(db.project.delete).not.toHaveBeenCalled();
  });
  test('invalid project input is rejected with 422 and nothing is saved', async () => {
    const { agent, token } = await loginAs('SENIOR_ADMIN');
    const res = await agent.post('/admin/projects').type('form').send({ _csrf: token, title: '', category: 'OTHER', status: 'DRAFT', githubUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
    expect(db.project.create).not.toHaveBeenCalled();
  });
  test('senior admin cannot open user management by default', async () => {
    const { agent } = await loginAs('SENIOR_ADMIN');
    expect((await agent.get('/admin/users/new')).status).toBe(403);
    expect((await agent.get('/admin/users')).status).toBe(200);
  });
});

describe('privilege escalation', () => {
  test('super admin cannot grant SUPER_ADMIN through the form', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    db.user.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === 1 ? makeUser('SUPER_ADMIN') : makeUser('ADMIN', 9)));
    const res = await agent.post('/admin/users/9').type('form').send({ _csrf: token, role: 'SUPER_ADMIN', status: 'ACTIVE', password: '' });
    expect(res.status).toBe(422);
    expect(db.user.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9 } }));
  });
  test('nobody can edit a peer or themselves through user management', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    db.user.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === 1 ? makeUser('SUPER_ADMIN') : makeUser('SUPER_ADMIN', 2)));
    expect((await agent.post('/admin/users/2').type('form').send({ _csrf: token, role: 'ADMIN', status: 'SUSPENDED', password: '' })).status).toBe(403);
    expect((await agent.post('/admin/users/1').type('form').send({ _csrf: token, role: 'ADMIN', status: 'ACTIVE', password: '' })).status).toBe(403);
  });
  test('enabled senior admin cannot touch a super admin or promote above themselves', async () => {
    process.env.SENIOR_CAN_MANAGE_USERS = 'true';
    try {
      const { agent, token } = await loginAs('SENIOR_ADMIN');
      db.user.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === 1 ? makeUser('SENIOR_ADMIN') : where.id === 2 ? makeUser('SUPER_ADMIN', 2) : makeUser('ADMIN', 3)));
      expect((await agent.post('/admin/users/2').type('form').send({ _csrf: token, role: 'ADMIN', status: 'SUSPENDED', password: '' })).status).toBe(403);
      expect((await agent.post('/admin/users/3').type('form').send({ _csrf: token, role: 'SENIOR_ADMIN', status: 'ACTIVE', password: '' })).status).toBe(403);
      const ok = await agent.post('/admin/users/3').type('form').send({ _csrf: token, role: 'JUNIOR_ADMIN', status: 'ACTIVE', password: '' });
      expect(ok.status).toBe(302);
    } finally { delete process.env.SENIOR_CAN_MANAGE_USERS; }
  });
});

describe('password vault', () => {
  const entry = (extra = {}) => ({ id: 7, ownerId: 1, service: 'GitHub', username: 'me', url: '', category: 'Dev', passwordEnc: encrypt('s3cret-value'), notesEnc: encrypt('my note'), ...extra });

  test('list never selects ciphertext and shows no secrets', async () => {
    const { agent } = await loginAs('SUPER_ADMIN');
    db.vaultEntry.findMany.mockResolvedValue([{ id: 7, service: 'GitHub', username: 'me', url: '', category: 'Dev', createdAt: new Date(), updatedAt: new Date() }]);
    const res = await agent.get('/admin/vault');
    expect(res.status).toBe(200);
    const select = db.vaultEntry.findMany.mock.calls[0][0].select;
    expect(select.passwordEnc).toBeUndefined();
    expect(select.notesEnc).toBeUndefined();
    expect(res.text).not.toContain('s3cret-value');
    expect(res.text).toContain('Add Password');
  });
  test('reveal requires a recent password confirmation', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    db.vaultEntry.findUnique.mockResolvedValue(entry());
    const res = await agent.post('/admin/vault/7/reveal').set('X-CSRF-Token', token).set('Accept', 'application/json');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REAUTH');
  });
  test('wrong unlock password is refused; correct one allows reveal with no-store', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    db.vaultEntry.findUnique.mockResolvedValue(entry());
    const bad = await agent.post('/admin/vault/unlock').set('X-CSRF-Token', token).send({ password: 'nope-nope-nope' });
    expect(bad.status).toBe(401);
    const good = await agent.post('/admin/vault/unlock').set('X-CSRF-Token', token).send({ password: PASSWORD });
    expect(good.status).toBe(200);
    const res = await agent.post('/admin/vault/7/reveal').set('X-CSRF-Token', token).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.password).toBe('s3cret-value');
    expect(res.headers['cache-control']).toBe('no-store');
    const logged = JSON.stringify(db.auditLog.create.mock.calls);
    expect(logged).not.toContain('s3cret-value');
  });
  test('entries owned by someone else look missing', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    await agent.post('/admin/vault/unlock').set('X-CSRF-Token', token).send({ password: PASSWORD });
    db.vaultEntry.findUnique.mockResolvedValue(entry({ ownerId: 99 }));
    const res = await agent.post('/admin/vault/7/reveal').set('X-CSRF-Token', token).set('Accept', 'application/json');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('s3cret-value');
  });
  test('create stores only ciphertext; blank password on edit keeps the old one; delete works', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    await agent.post('/admin/vault/unlock').set('X-CSRF-Token', token).send({ password: PASSWORD });
    const created = await agent.post('/admin/vault').type('form').send({ _csrf: token, service: 'Railway', username: 'me', category: 'Dev', password: 'plain-pass-123', notes: 'n' });
    expect(created.status).toBe(302);
    const data = db.vaultEntry.create.mock.calls[0][0].data;
    expect(data.passwordEnc.startsWith('v1:')).toBe(true);
    expect(JSON.stringify(data)).not.toContain('plain-pass-123');
    db.vaultEntry.findUnique.mockResolvedValue(entry());
    await agent.post('/admin/vault/7').type('form').send({ _csrf: token, service: 'GitHub 2', password: '' });
    expect(db.vaultEntry.update.mock.calls[0][0].data.passwordEnc).toBeUndefined();
    await agent.post('/admin/vault/7/delete').type('form').send({ _csrf: token });
    expect(db.vaultEntry.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
  test('locked vault blocks create and delete', async () => {
    const { agent, token } = await loginAs('SUPER_ADMIN');
    const res = await agent.post('/admin/vault').type('form').send({ _csrf: token, service: 'X', password: 'abc' });
    expect(res.status).toBe(302);
    expect(db.vaultEntry.create).not.toHaveBeenCalled();
  });
  test('non-super admins get 403 on every vault endpoint', async () => {
    const { agent, token } = await loginAs('SENIOR_ADMIN');
    expect((await agent.get('/admin/vault')).status).toBe(403);
    const res = await agent.post('/admin/vault/7/reveal').set('X-CSRF-Token', token).set('Accept', 'application/json');
    expect(res.status).toBe(403);
    expect(db.vaultEntry.findUnique).not.toHaveBeenCalled();
  });
});

describe('contact form', () => {
  test('honeypot submissions are silently dropped', async () => {
    const agent = request.agent(createApp());
    const page = await agent.get('/');
    const res = await agent.post('/contact').set('Accept', 'application/json').type('form').send({ _csrf: csrfOf(page), website: 'http://spam', name: 'a', email: 'a@b.co', message: 'hello there friend' });
    expect(res.status).toBe(200);
    expect(db.contactMessage.create).not.toHaveBeenCalled();
  });
  test('too-fast submissions are rejected and valid ones are stored', async () => {
    const agent = request.agent(createApp());
    const page = await agent.get('/');
    const ft = /name="ft" value="([^"]+)"/.exec(page.text)[1];
    const body = { _csrf: csrfOf(page), ft, name: 'Ann', email: 'ann@x.io', message: 'hello there friend' };
    expect((await agent.post('/contact').set('Accept', 'application/json').type('form').send(body)).status).toBe(400);
    const old = `${Date.now() - 10000}.${require('crypto').createHmac('sha256', process.env.SESSION_SECRET).update(String(Date.now() - 10000)).digest('hex')}`;
    const ok = await agent.post('/contact').set('Accept', 'application/json').type('form').send({ ...body, ft: old });
    expect(ok.status).toBe(201);
    expect(db.contactMessage.create).toHaveBeenCalled();
  });
});
