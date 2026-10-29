const { prisma } = require('../config/db');
const { hasPermission } = require('../services/permissions');

async function overview(req, res, next) {
  try {
    const db = prisma();
    const [projects, published, skills, admins, messages, newMessages, recent] = await Promise.all([
      db.project.count(),
      db.project.count({ where: { status: 'PUBLISHED' } }),
      db.skill.count(),
      db.user.count(),
      db.contactMessage.count(),
      db.contactMessage.count({ where: { status: 'NEW' } }),
      hasPermission(req.user.role, 'audit.view')
        ? db.auditLog.findMany({ orderBy: { id: 'desc' }, take: 8, include: { user: { select: { username: true } } } })
        : Promise.resolve(null),
    ]);
    res.render('admin/overview', {
      title: 'Overview', section: 'overview', crumbs: [{ label: 'Dashboard' }],
      stats: { projects, published, drafts: projects - published, skills, admins, messages, newMessages }, recent,
    });
  } catch (e) { next(e); }
}

module.exports = { overview };
