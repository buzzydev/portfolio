const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { login: loginSchema } = require('../validators/schemas');
const { audit } = require('../services/audit');
const { safeNext } = require('../utils/helpers');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
// Compared against when the account does not exist, so timing does not reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const GENERIC = 'Incorrect username or password, or the account is temporarily locked.';

const regenerate = (req) => new Promise((res, rej) => req.session.regenerate((e) => (e ? rej(e) : res())));
const save = (req) => new Promise((res, rej) => req.session.save((e) => (e ? rej(e) : res())));

function showLogin(req, res) {
  if (req.user) return res.redirect('/admin');
  return res.render('auth/login', { layout: 'layouts/auth', title: 'Sign in', error: null, identifier: '' });
}

async function postLogin(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    const fail = (identifier = '') =>
      res.status(401).render('auth/login', { layout: 'layouts/auth', title: 'Sign in', error: GENERIC, identifier });
    if (!parsed.success) return fail();
    const { identifier, password } = parsed.data;
    const db = prisma();
    const user = await db.user.findFirst({
      where: { OR: [{ username: { equals: identifier, mode: 'insensitive' } }, { email: { equals: identifier, mode: 'insensitive' } }] },
    });
    const locked = user && user.lockedUntil && user.lockedUntil > new Date();
    if (!user || user.status !== 'ACTIVE' || locked) {
      await bcrypt.compare(password, DUMMY_HASH);
      if (user) await audit({ user: null, ip: req.ip }, 'auth.login_blocked', 'User', user.id);
      return fail(identifier);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const fails = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: fails },
      });
      await audit({ user: null, ip: req.ip }, 'auth.login_failed', 'User', user.id);
      return fail(identifier);
    }
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const returnTo = req.session.returnTo;
    await regenerate(req); // new session id on privilege change (prevents fixation)
    req.session.userId = user.id;
    req.session.sv = user.sessionVersion;
    await save(req);
    await audit({ user, ip: req.ip }, 'auth.login', 'User', user.id);
    return res.redirect(safeNext(returnTo));
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.user) await audit(req, 'auth.logout', 'User', req.user.id);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('sid');
      return res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showLogin, postLogin, logout };
