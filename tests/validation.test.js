require('./helpers');
const { buildSchema, parseFields } = require('../src/validators/fields');
const S = require('../src/validators/schemas');
const R = require('../src/controllers/resources');
const { sniffImage } = require('../src/middleware/upload');
const { safeNext } = require('../src/utils/helpers');

describe('field validation', () => {
  const schema = buildSchema(R.projects.fields);
  test('requires a title', () => {
    expect(parseFields(schema, { title: '  ' }).errors.title).toMatch(/required/i);
  });
  test('rejects javascript: URLs', () => {
    const r = parseFields(schema, { title: 'x', category: 'OTHER', status: 'DRAFT', githubUrl: 'javascript:alert(1)' });
    expect(r.errors.githubUrl).toBeDefined();
  });
  test('parses a valid project and drops unknown keys', () => {
    const r = parseFields(schema, { title: ' My app ', category: 'WEB_APP', status: 'PUBLISHED', techStack: 'Node.js, , PostgreSQL', featured: 'on', sortOrder: '3', role: 'SUPER_ADMIN', galleryIds: ['4', '5'] });
    expect(r.errors).toBeUndefined();
    expect(r.data).toMatchObject({ title: 'My app', techStack: ['Node.js', 'PostgreSQL'], featured: true, sortOrder: 3, galleryIds: [4, 5], coverId: null });
    expect(r.data.role).toBeUndefined();
  });
  test('rejects unknown enum values', () => {
    expect(parseFields(schema, { title: 'x', category: 'HACK', status: 'DRAFT' }).errors.category).toBeDefined();
  });
});

describe('account schemas', () => {
  test('passwords need 12+ characters', () => {
    expect(S.passwordChange.safeParse({ currentPassword: 'a', newPassword: 'short', confirmPassword: 'short' }).success).toBe(false);
    expect(S.passwordChange.safeParse({ currentPassword: 'a', newPassword: 'long-enough-password', confirmPassword: 'long-enough-password' }).success).toBe(true);
  });
  test('mismatched confirmation fails', () => {
    expect(S.passwordChange.safeParse({ currentPassword: 'a', newPassword: 'long-enough-password', confirmPassword: 'different-password!' }).success).toBe(false);
  });
  test('user creation cannot request SUPER_ADMIN', () => {
    const r = S.userCreate.safeParse({ username: 'bob', email: 'b@x.io', role: 'SUPER_ADMIN', password: 'long-enough-password' });
    expect(r.success).toBe(false);
  });
  test('contact form validates email and message length', () => {
    expect(S.contact.safeParse({ name: 'A', email: 'nope', message: 'hello there friend' }).success).toBe(false);
    expect(S.contact.safeParse({ name: 'A', email: 'a@b.co', message: 'short' }).success).toBe(false);
    expect(S.contact.safeParse({ name: 'A', email: 'a@b.co', message: 'hello there friend' }).success).toBe(true);
  });
  test('vault entry requires a service and a safe URL', () => {
    expect(S.vaultEntry.safeParse({ service: '' }).success).toBe(false);
    expect(S.vaultEntry.safeParse({ service: 'GitHub', url: 'javascript:1' }).success).toBe(false);
    expect(S.vaultEntry.safeParse({ service: 'GitHub', url: 'https://github.com' }).success).toBe(true);
  });
});

describe('upload and redirect safety', () => {
  const pad = (b) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);
  test('detects real image types by magic bytes', () => {
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])).mime).toBe('image/jpeg');
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime).toBe('image/png');
    expect(sniffImage(pad(Buffer.from('GIF89a'))).mime).toBe('image/gif');
  });
  test('rejects SVG, HTML and executables disguised as images', () => {
    expect(sniffImage(pad(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(sniffImage(pad(Buffer.from('<html><script>')))).toBeNull();
    expect(sniffImage(pad(Buffer.from('MZ\x90\x00')))).toBeNull();
  });
  test('open redirects are blocked', () => {
    expect(safeNext('/admin/projects')).toBe('/admin/projects');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', undefined]) expect(safeNext(bad)).toBe('/admin');
  });
});

describe('configuration', () => {
  const env = require('../src/config/env');
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  test('reports missing production variables', () => {
    delete process.env.DATABASE_URL;
    process.env.SESSION_SECRET = 'short';
    process.env.VAULT_ENCRYPTION_KEY = 'bad';
    expect(env.validate()).toHaveLength(3);
  });
  test('accepts a valid configuration', () => {
    expect(env.validate()).toEqual([]);
  });
  test('vault key must be 32 bytes', () => {
    process.env.VAULT_ENCRYPTION_KEY = 'abcd';
    expect(() => env.getVaultKey()).toThrow();
  });
});
