/**
 * Central authorization policy.
 * Level numbers: lower number = higher authority (1 > 2 > 3 > 4).
 * Every server route calls into this file; the UI only mirrors it.
 */
const LEVEL = { SUPER_ADMIN: 1, SENIOR_ADMIN: 2, ADMIN: 3, JUNIOR_ADMIN: 4 };
const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Administrator',
  SENIOR_ADMIN: 'Senior Administrator',
  ADMIN: 'Administrator',
  JUNIOR_ADMIN: 'Junior Administrator',
};

const CONTENT_VIEW = ['projects.view', 'skills.view', 'experience.view', 'social.view', 'media.view'];
const CONTENT_FULL = [
  'projects.view', 'projects.create', 'projects.edit', 'projects.delete',
  'skills.view', 'skills.create', 'skills.edit', 'skills.delete',
  'experience.view', 'experience.create', 'experience.edit', 'experience.delete',
  'social.view', 'social.create', 'social.edit', 'social.delete',
  'media.view', 'media.upload', 'media.delete',
  'messages.view', 'messages.process', 'messages.delete',
];

// The permission matrix. '*' = everything (Super Administrator only).
const MATRIX = {
  SUPER_ADMIN: ['*'],
  SENIOR_ADMIN: ['dashboard.view', ...CONTENT_FULL, 'profile.manage', 'audit.view', 'users.view'],
  ADMIN: [
    'dashboard.view',
    'projects.view', 'projects.create', 'projects.edit',
    'skills.view', 'skills.create', 'skills.edit',
    'experience.view', 'social.view',
    'media.view', 'media.upload',
    'messages.view', 'messages.process',
  ],
  JUNIOR_ADMIN: ['dashboard.view', ...CONTENT_VIEW],
};

// Permissions that can never be granted to anyone but a Super Administrator.
const SUPER_ONLY = new Set(['settings.manage', 'vault.use']);

function hasPermission(role, perm) {
  if (!LEVEL[role]) return false;
  if (role === 'SUPER_ADMIN') return true;
  if (SUPER_ONLY.has(perm)) return false;
  if (perm === 'users.manage') {
    // Opt-in: a Senior Administrator may manage Level 3/4 only when explicitly enabled.
    return role === 'SENIOR_ADMIN' && process.env.SENIOR_CAN_MANAGE_USERS === 'true';
  }
  return MATRIX[role].includes(perm);
}

/** Actor may act on target only if strictly higher in the hierarchy and not the same account. */
function canManageUser(actor, target) {
  if (!actor || !target) return false;
  if (actor.id === target.id) return false;
  if (!hasPermission(actor.role, 'users.manage')) return false;
  return LEVEL[actor.role] < LEVEL[target.role];
}

/** Roles the actor may hand out: strictly below the actor, and never SUPER_ADMIN. */
function assignableRoles(actor) {
  if (!actor || !hasPermission(actor.role, 'users.manage')) return [];
  return Object.keys(LEVEL).filter((r) => r !== 'SUPER_ADMIN' && LEVEL[r] > LEVEL[actor.role]);
}

function canAssignRole(actor, role) {
  return assignableRoles(actor).includes(role);
}

module.exports = { LEVEL, ROLE_LABEL, MATRIX, hasPermission, canManageUser, assignableRoles, canAssignRole };
