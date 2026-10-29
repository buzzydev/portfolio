const { prisma } = require('../config/db');
const { audit } = require('../services/audit');

const PAGE = 15;
const STATUSES = ['NEW', 'READ', 'ARCHIVED'];
const crumbs = (last) => [{ label: 'Dashboard', href: '/admin' }, { label: 'Contact Messages', href: '/admin/messages' }].concat(last ? [{ label: last }] : []);

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const where = {};
    if (status) where.status = status;
    if (q) where.OR = ['name', 'email', 'subject', 'message'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }));
    const [total, items] = await Promise.all([
      prisma().contactMessage.count({ where }),
      prisma().contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
    ]);
    res.render('admin/messages/list', { title: 'Contact Messages', section: 'messages', crumbs: crumbs(), items, q, status, page, pages: Math.max(1, Math.ceil(total / PAGE)), total });
  } catch (e) { next(e); }
}

async function show(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    let m = await prisma().contactMessage.findUnique({ where: { id } });
    if (!m) return next();
    if (m.status === 'NEW' && req.user && ['SUPER_ADMIN', 'SENIOR_ADMIN', 'ADMIN'].includes(req.user.role)) {
      m = await prisma().contactMessage.update({ where: { id }, data: { status: 'READ' } });
    }
    return res.render('admin/messages/show', { title: `Message from ${m.name}`, section: 'messages', crumbs: crumbs(`From ${m.name}`), m });
  } catch (e) { return next(e); }
}

async function setStatus(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!STATUSES.includes(req.body.status)) return res.redirect('/admin/messages');
    await prisma().contactMessage.update({ where: { id }, data: { status: req.body.status } });
    await audit(req, 'messages.status', 'ContactMessage', id, { status: req.body.status });
    req.flash('success', 'Message updated.');
    return res.redirect(`/admin/messages/${id}`);
  } catch (e) { return e.code === 'P2025' ? next() : next(e); }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma().contactMessage.delete({ where: { id } });
    await audit(req, 'messages.delete', 'ContactMessage', id);
    req.flash('success', 'Message deleted.');
    return res.redirect('/admin/messages');
  } catch (e) { return e.code === 'P2025' ? next() : next(e); }
}

module.exports = { list, show, setStatus, remove };
