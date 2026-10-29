require('./helpers');
const P = require('../src/services/permissions');

const u = (id, role) => ({ id, role });

describe('role hierarchy', () => {
  test('levels are ordered 1 > 2 > 3 > 4', () => {
    expect(P.LEVEL.SUPER_ADMIN).toBeLessThan(P.LEVEL.SENIOR_ADMIN);
    expect(P.LEVEL.SENIOR_ADMIN).toBeLessThan(P.LEVEL.ADMIN);
    expect(P.LEVEL.ADMIN).toBeLessThan(P.LEVEL.JUNIOR_ADMIN);
  });
  test('only super admin gets settings and vault', () => {
    expect(P.hasPermission('SUPER_ADMIN', 'vault.use')).toBe(true);
    for (const r of ['SENIOR_ADMIN', 'ADMIN', 'JUNIOR_ADMIN']) {
      expect(P.hasPermission(r, 'vault.use')).toBe(false);
      expect(P.hasPermission(r, 'settings.manage')).toBe(false);
    }
  });
  test('junior can view but not change content or read messages', () => {
    expect(P.hasPermission('JUNIOR_ADMIN', 'projects.view')).toBe(true);
    expect(P.hasPermission('JUNIOR_ADMIN', 'projects.create')).toBe(false);
    expect(P.hasPermission('JUNIOR_ADMIN', 'messages.view')).toBe(false);
  });
  test('admin edits projects but cannot delete or manage users', () => {
    expect(P.hasPermission('ADMIN', 'projects.edit')).toBe(true);
    expect(P.hasPermission('ADMIN', 'projects.delete')).toBe(false);
    expect(P.hasPermission('ADMIN', 'users.manage')).toBe(false);
  });
  test('unknown roles and permissions are denied', () => {
    expect(P.hasPermission('HACKER', 'projects.view')).toBe(false);
    expect(P.hasPermission('ADMIN', 'made.up')).toBe(false);
  });
});

describe('privilege escalation', () => {
  afterEach(() => { delete process.env.SENIOR_CAN_MANAGE_USERS; });

  test('super admin manages lower roles but never peers or self', () => {
    const s = u(1, 'SUPER_ADMIN');
    expect(P.canManageUser(s, u(2, 'SENIOR_ADMIN'))).toBe(true);
    expect(P.canManageUser(s, u(3, 'SUPER_ADMIN'))).toBe(false);
    expect(P.canManageUser(s, u(1, 'SUPER_ADMIN'))).toBe(false);
  });
  test('super admin can assign L2-L4 but never create another super admin', () => {
    expect(P.assignableRoles(u(1, 'SUPER_ADMIN'))).toEqual(['SENIOR_ADMIN', 'ADMIN', 'JUNIOR_ADMIN']);
    expect(P.canAssignRole(u(1, 'SUPER_ADMIN'), 'SUPER_ADMIN')).toBe(false);
  });
  test('senior admin cannot manage users unless explicitly enabled', () => {
    const s = u(2, 'SENIOR_ADMIN');
    expect(P.canManageUser(s, u(3, 'ADMIN'))).toBe(false);
    expect(P.assignableRoles(s)).toEqual([]);
    process.env.SENIOR_CAN_MANAGE_USERS = 'true';
    expect(P.canManageUser(s, u(3, 'ADMIN'))).toBe(true);
    expect(P.canManageUser(s, u(4, 'SENIOR_ADMIN'))).toBe(false);
    expect(P.canManageUser(s, u(5, 'SUPER_ADMIN'))).toBe(false);
    expect(P.assignableRoles(s)).toEqual(['ADMIN', 'JUNIOR_ADMIN']);
    expect(P.canAssignRole(s, 'SENIOR_ADMIN')).toBe(false);
  });
  test('lower roles can never manage anyone', () => {
    expect(P.canManageUser(u(3, 'ADMIN'), u(4, 'JUNIOR_ADMIN'))).toBe(false);
    expect(P.canManageUser(u(4, 'JUNIOR_ADMIN'), u(1, 'SUPER_ADMIN'))).toBe(false);
  });
});
