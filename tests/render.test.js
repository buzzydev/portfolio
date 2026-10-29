require('./helpers');
const bcrypt = require('bcryptjs');
const request = require('supertest');

jest.mock('../src/config/db', () => {
  const m = () => ({ findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}), delete: jest.fn(), count: jest.fn().mockResolvedValue(0), upsert: jest.fn() });
  const db = { user: m(), auditLog: m(), project: m(), skill: m(), experience: m(), socialLink: m(), contactMessage: m(), media: m(), vaultEntry: m(), setting: m(), $queryRaw: jest.fn(), $transaction: jest.fn((o) => Promise.all(o)) };
  return { prisma: () => db, disconnect: jest.fn(), __db: db };
});
const { __db: db } = require('../src/config/db');
const { createApp } = require('../src/app');

const HASH = bcrypt.hashSync('correct-horse-battery', 4);
const user = { id: 1, username: 'owner', email: 'o@x.io', displayName: 'Owner', bio: '', role: 'SUPER_ADMIN', status: 'ACTIVE', preferredTheme: 'DARK', githubUrl: '', telegramUrl: '', avatarId: null, sessionVersion: 0, passwordHash: HASH, failedLogins: 0 };
const now = new Date();

test('every admin page renders with realistic data', async () => {
  db.user.findFirst.mockResolvedValue(user);
  db.user.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === 2 ? { ...user, id: 2, username: 'jr', role: 'JUNIOR_ADMIN' } : user));
  db.user.findMany.mockResolvedValue([user, { ...user, id: 2, username: 'jr', role: 'JUNIOR_ADMIN' }]);
  db.project.findMany.mockResolvedValue([{ id: 1, title: 'Bot', description: 'd', coverId: 4, galleryIds: [4], techStack: ['aiogram'], category: 'TELEGRAM_BOT', githubUrl: 'https://github.com/x', liveUrl: '', featured: true, status: 'PUBLISHED', sortOrder: 0, createdAt: now, updatedAt: now, cover: { id: 4, alt: 'Screenshot' } }]);
  db.project.findUnique.mockResolvedValue({ id: 1, title: 'Bot', description: 'd', coverId: 4, galleryIds: [4], techStack: ['aiogram'], category: 'TELEGRAM_BOT', githubUrl: '', liveUrl: '', featured: true, status: 'PUBLISHED', sortOrder: 0 });
  db.media.findMany.mockResolvedValue([{ id: 4, filename: 'a.png', mimeType: 'image/png', size: 2048, alt: 'Screenshot', createdAt: now }]);
  db.skill.findMany.mockResolvedValue([{ id: 1, name: 'Python', category: 'Languages', description: '', sortOrder: 0, visible: true }]);
  db.experience.findMany.mockResolvedValue([{ id: 1, type: 'EDUCATION', title: 'BSc', organization: 'Uni', startDate: '2020', endDate: '2024', description: '', sortOrder: 0, visible: true }]);
  db.socialLink.findMany.mockResolvedValue([{ id: 1, label: 'GitHub', url: 'https://github.com/x', icon: 'github', sortOrder: 0, visible: true }]);
  db.contactMessage.findMany.mockResolvedValue([{ id: 1, name: 'Ann', email: 'a@x.io', subject: 'Hi', message: 'Hello there', status: 'NEW', createdAt: now }]);
  db.contactMessage.findUnique.mockResolvedValue({ id: 1, name: 'Ann', email: 'a@x.io', subject: 'Hi', message: '<script>alert(1)</script>', status: 'NEW', createdAt: now });
  db.contactMessage.update.mockResolvedValue({ id: 1, name: 'Ann', email: 'a@x.io', subject: 'Hi', message: '<script>alert(1)</script>', status: 'READ', createdAt: now });
  db.auditLog.findMany.mockResolvedValue([{ id: 1, action: 'projects.create', entity: 'project', entityId: '1', meta: { label: 'Bot' }, createdAt: now, user: { username: 'owner' } }]);
  db.vaultEntry.findMany.mockResolvedValue([{ id: 1, service: 'GitHub', username: 'me', url: 'https://github.com', category: 'Dev', createdAt: now, updatedAt: now }]);
  db.setting.findMany.mockResolvedValue([{ key: 'displayName', value: 'Ada' }]);
  db.project.count.mockResolvedValue(20);

  const agent = request.agent(createApp());
  const page = await agent.get('/login');
  const token = /name="_csrf" value="([a-f0-9]+)"/.exec(page.text)[1];
  await agent.post('/login').type('form').send({ _csrf: token, identifier: 'owner', password: 'correct-horse-battery' });

  const paths = ['/', '/profile', '/admin', '/admin/projects', '/admin/projects/new', '/admin/projects/1/edit', '/admin/projects?q=bot&category=TELEGRAM_BOT',
    '/admin/skills', '/admin/skills/new', '/admin/experience', '/admin/experience/new', '/admin/social', '/admin/social/new', '/admin/profile-settings', '/admin/settings',
    '/admin/media', '/admin/messages', '/admin/messages/1', '/admin/users', '/admin/users/new', '/admin/users/2/edit', '/admin/audit', '/admin/vault'];
  for (const p of paths) {
    const res = await agent.get(p);
    if (res.status !== 200) throw new Error(`${p} -> ${res.status}\n${res.text.slice(0, 600)}`);
  }
  // Public page uses data from the database and escapes output
  const home = await agent.get('/');
  expect(home.text).toContain('Ada');
  expect(home.text).toContain('Telegram Bots');
  // Stored HTML in a contact message must be escaped on the admin page
  const msg = await agent.get('/admin/messages/1');
  expect(msg.text).not.toContain('<script>alert(1)</script>');
  expect(msg.text).toContain('&lt;script&gt;');
  // Dark preference from the user is applied server-side
  expect(home.text).toContain('data-theme="dark"');
  // Admin navigation shows the username, not a generic "Profile" label
  expect(home.text).toContain('Owner');
});
