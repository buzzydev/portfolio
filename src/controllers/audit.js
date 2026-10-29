const { prisma } = require('../config/db');

const PAGE = 25;

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q = String(req.query.q || '').trim().slice(0, 80);
    const where = q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { entity: { contains: q, mode: 'insensitive' } }] } : {};
    const [total, items] = await Promise.all([
      prisma().auditLog.count({ where }),
      prisma().auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { username: true } } } }),
    ]);
    res.render('admin/audit', { title: 'Audit Logs', section: 'audit', crumbs: [{ label: 'Dashboard', href: '/admin' }, { label: 'Audit Logs' }], items, q, page, pages: Math.max(1, Math.ceil(total / PAGE)), total });
  } catch (e) { next(e); }
}

module.exports = { list };
