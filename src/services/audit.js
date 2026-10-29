const { prisma } = require('../config/db');

/** Records an administrative action. Never throws and never stores secrets: pass only ids and labels in `meta`. */
async function audit(req, action, entity, entityId = null, meta = null) {
  try {
    await prisma().auditLog.create({
      data: {
        userId: req.user ? req.user.id : null,
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        meta: meta || undefined,
        ip: req.ip || null,
      },
    });
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

module.exports = { audit };
