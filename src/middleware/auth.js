const { prisma } = require('../config/db');
const { hasPermission } = require('../services/permissions');

const wantsJson = (req) => req.xhr || (req.get('accept') || '').includes('application/json') || req.is('application/json');

/** Loads the signed-in user on every request and drops sessions that were revoked. */
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;
  res.locals.can = () => false;
  const uid = req.session && req.session.userId;
  if (!uid) return next();
  try {
    const user = await prisma().user.findUnique({
      where: { id: uid },
      select: {
        id: true, username: true, email: true, displayName: true, bio: true, role: true, status: true,
        preferredTheme: true, githubUrl: true, telegramUrl: true, avatarId: true, sessionVersion: true,
      },
    });
    if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== req.session.sv) {
      return req.session.regenerate(() => next());
    }
    req.user = user;
    res.locals.currentUser = user;
    res.locals.can = (perm) => hasPermission(user.role, perm);
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return res.status(401).json({ error: 'Sign in required.' });
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) return requireAuth(req, res, next);
    if (hasPermission(req.user.role, perm)) return next();
    if (wantsJson(req)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    return res.status(403).render('errors/403', { layout: 'layouts/public', title: 'Access denied' });
  };
}

module.exports = { loadUser, requireAuth, requirePermission, wantsJson };
