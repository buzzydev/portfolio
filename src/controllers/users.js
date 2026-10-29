const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { userCreate, userUpdate } = require('../validators/schemas');
const { audit } = require('../services/audit');
const { canManageUser, canAssignRole, assignableRoles, LEVEL, hasPermission } = require('../services/permissions');

const crumbs = (last) => [{ label: 'Dashboard', href: '/admin' }, { label: 'Administrators', href: '/admin/users' }].concat(last ? [{ label: last }] : []);
const flat = (issues) => { const e = {}; issues.forEach((i) => { if (!e[i.path[0]]) e[i.path[0]] = i.message; }); return e; };
const SELECT = { id: true, username: true, email: true, displayName: true, role: true, status: true, lastLoginAt: true, createdAt: true };

async function list(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const where = q ? { OR: ['username', 'email', 'displayName'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) } : {};
    const users = await prisma().user.findMany({ where, select: SELECT, orderBy: [{ role: 'asc' }, { username: 'asc' }] });
    const rows = users.map((u) => ({ ...u, manageable: canManageUser(req.user, u) }));
    res.render('admin/users/list', { title: 'Administrators', section: 'users', crumbs: crumbs(), rows, q, canCreate: assignableRoles(req.user).length > 0 });
  } catch (e) { next(e); }
}

function formView(res, { target, values, errors = {}, status = 200, actor }) {
  res.status(status).render('admin/users/form', {
    title: target ? `Edit ${target.username}` : 'New administrator', section: 'users',
    crumbs: crumbs(target ? target.username : 'New'), target, values, errors, roles: assignableRoles(actor),
  });
}

const newForm = (req, res) => formView(res, { values: { role: assignableRoles(req.user)[0] }, actor: req.user });

async function create(req, res, next) {
  try {
    const parsed = userCreate.safeParse(req.body);
    if (!parsed.success) return formView(res, { values: req.body, errors: flat(parsed.error.issues), status: 422, actor: req.user });
    const d = parsed.data;
    if (!canAssignRole(req.user, d.role)) return next(Object.assign(new Error('forbidden'), { status: 403 }));
    try {
      const u = await prisma().user.create({
        data: { username: d.username, email: d.email, displayName: d.displayName, role: d.role, passwordHash: await bcrypt.hash(d.password, 12), createdById: req.user.id },
        select: { id: true },
      });
      await audit(req, 'users.create', 'User', u.id, { username: d.username, role: d.role });
    } catch (err) {
      if (err.code === 'P2002') return formView(res, { values: req.body, errors: { username: 'That username or email is already in use.' }, status: 422, actor: req.user });
      throw err;
    }
    req.flash('success', 'Administrator created.');
    return res.redirect('/admin/users');
  } catch (e) { return next(e); }
}

async function getTarget(req) {
  const id = parseInt(req.params.id, 10);
  return Number.isInteger(id) ? prisma().user.findUnique({ where: { id }, select: SELECT }) : null;
}

async function editForm(req, res, next) {
  try {
    const target = await getTarget(req);
    if (!target) return next();
    if (!canManageUser(req.user, target)) return next(Object.assign(new Error('forbidden'), { status: 403 }));
    return formView(res, { target, values: { displayName: target.displayName, role: target.role, status: target.status }, actor: req.user });
  } catch (e) { return next(e); }
}

async function update(req, res, next) {
  try {
    const target = await getTarget(req);
    if (!target) return next();
    // Hierarchy check runs on the stored target, never on submitted data.
    if (!canManageUser(req.user, target)) return next(Object.assign(new Error('forbidden'), { status: 403 }));
    const parsed = userUpdate.safeParse(req.body);
    if (!parsed.success) return formView(res, { target, values: req.body, errors: flat(parsed.error.issues), status: 422, actor: req.user });
    const d = parsed.data;
    if (!canAssignRole(req.user, d.role)) return next(Object.assign(new Error('forbidden'), { status: 403 }));
    const data = { displayName: d.displayName, role: d.role, status: d.status };
    // Role/status/password changes revoke the target's existing sessions.
    if (d.role !== target.role || d.status !== target.status || d.password) data.sessionVersion = { increment: 1 };
    if (d.password) data.passwordHash = await bcrypt.hash(d.password, 12);
    if (d.status === 'ACTIVE') { data.failedLogins = 0; data.lockedUntil = null; }
    await prisma().user.update({ where: { id: target.id }, data });
    await audit(req, 'users.update', 'User', target.id, { username: target.username, role: d.role, status: d.status, passwordReset: Boolean(d.password) });
    req.flash('success', 'Administrator saved.');
    return res.redirect('/admin/users');
  } catch (e) { return next(e); }
}

async function remove(req, res, next) {
  try {
    const target = await getTarget(req);
    if (!target) return next();
    if (!canManageUser(req.user, target) || target.role === 'SUPER_ADMIN') return next(Object.assign(new Error('forbidden'), { status: 403 }));
    await prisma().user.delete({ where: { id: target.id } });
    await audit(req, 'users.delete', 'User', target.id, { username: target.username });
    req.flash('success', 'Administrator deleted.');
    return res.redirect('/admin/users');
  } catch (e) { return next(e); }
}

module.exports = { list, newForm, create, editForm, update, remove, LEVEL, hasPermission };
