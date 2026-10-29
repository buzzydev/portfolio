const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { profile: profileSchema, passwordChange } = require('../validators/schemas');
const { audit } = require('../services/audit');
const { sniffImage, safeName } = require('../middleware/upload');

const flat = (issues) => { const e = {}; issues.forEach((i) => { if (!e[i.path[0]]) e[i.path[0]] = i.message; }); return e; };

function render(req, res, extra = {}) {
  const u = req.user;
  res.render('profile/index', {
    layout: 'layouts/public',
    title: 'Your profile',
    values: { username: u.username, email: u.email, displayName: u.displayName, bio: u.bio, githubUrl: u.githubUrl, telegramUrl: u.telegramUrl, preferredTheme: u.preferredTheme },
    errors: {}, pwErrors: {}, ...extra,
  });
}

const show = (req, res) => render(req, res);

async function save(req, res, next) {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) { res.status(422); return render(req, res, { values: req.body, errors: flat(parsed.error.issues) }); }
    const d = parsed.data;
    const db = prisma();
    const credentialsChanged = d.username.toLowerCase() !== req.user.username.toLowerCase() || d.email !== req.user.email.toLowerCase();
    if (credentialsChanged) {
      const me = await db.user.findUnique({ where: { id: req.user.id } });
      if (!d.currentPassword || !(await bcrypt.compare(d.currentPassword, me.passwordHash))) {
        res.status(422);
        return render(req, res, { values: req.body, errors: { currentPassword: 'Enter your current password to change your username or email.' } });
      }
    }
    try {
      await db.user.update({
        where: { id: req.user.id },
        data: { username: d.username, email: d.email, displayName: d.displayName, bio: d.bio, githubUrl: d.githubUrl, telegramUrl: d.telegramUrl, preferredTheme: d.preferredTheme },
      });
    } catch (err) {
      if (err.code === 'P2002') {
        res.status(422);
        return render(req, res, { values: req.body, errors: { username: 'That username or email is already in use.' } });
      }
      throw err;
    }
    await audit(req, 'profile.update', 'User', req.user.id, { credentialsChanged });
    req.flash('success', 'Profile saved.');
    return res.redirect('/profile');
  } catch (err) {
    return next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const parsed = passwordChange.safeParse(req.body);
    if (!parsed.success) { res.status(422); return render(req, res, { pwErrors: flat(parsed.error.issues) }); }
    const db = prisma();
    const me = await db.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(parsed.data.currentPassword, me.passwordHash))) {
      res.status(422);
      return render(req, res, { pwErrors: { currentPassword: 'Current password is incorrect.' } });
    }
    const updated = await db.user.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    req.session.sv = updated.sessionVersion; // keep this session; all others are signed out
    await audit(req, 'profile.password_change', 'User', me.id);
    req.flash('success', 'Password updated. Other devices were signed out.');
    return res.redirect('/profile');
  } catch (err) {
    return next(err);
  }
}

async function setAvatar(req, res, next) {
  try {
    if (!req.file) { req.flash('error', 'Choose a JPEG, PNG, WebP or GIF image up to 3 MB.'); return res.redirect('/profile'); }
    const kind = sniffImage(req.file.buffer);
    if (!kind) { req.flash('error', 'That file is not a supported image.'); return res.redirect('/profile'); }
    const db = prisma();
    const media = await db.media.create({
      data: { filename: safeName(req.file.originalname, kind.ext), mimeType: kind.mime, size: req.file.size, alt: `Avatar of ${req.user.username}`, data: req.file.buffer, uploadedById: req.user.id },
      select: { id: true },
    });
    await db.user.update({ where: { id: req.user.id }, data: { avatarId: media.id } });
    await audit(req, 'profile.avatar', 'Media', media.id);
    req.flash('success', 'Avatar updated.');
    return res.redirect('/profile');
  } catch (err) {
    return next(err);
  }
}

async function setTheme(req, res, next) {
  try {
    const t = String((req.body && req.body.theme) || '').toUpperCase();
    if (!['LIGHT', 'DARK', 'SYSTEM'].includes(t)) return res.status(400).json({ error: 'Invalid theme.' });
    await prisma().user.update({ where: { id: req.user.id }, data: { preferredTheme: t } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { show, save, changePassword, setAvatar, setTheme };
