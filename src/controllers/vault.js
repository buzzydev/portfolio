const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { vaultEntry: entrySchema } = require('../validators/schemas');
const { encrypt, decrypt } = require('../utils/crypto');
const { audit } = require('../services/audit');

const UNLOCK_MS = 10 * 60 * 1000;
const PAGE = 10;
const SORTS = {
  service: { service: 'asc' },
  updated: { updatedAt: 'desc' },
  created: { createdAt: 'desc' },
};
const crumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Password Vault' }];
const unlocked = (req) => Boolean(req.session.vaultUntil && req.session.vaultUntil > Date.now());
const flat = (issues) => { const e = {}; issues.forEach((i) => { if (!e[i.path[0]]) e[i.path[0]] = i.message; }); return e; };

/** Sensitive operations need a password re-check within the last 10 minutes. */
function requireUnlocked(req, res, next) {
  if (unlocked(req)) return next();
  const wantsJson = (req.get('accept') || '').includes('application/json') || req.is('application/json');
  if (wantsJson) return res.status(403).json({ error: 'Confirm your password to continue.', code: 'REAUTH' });
  req.flash('error', 'Confirm your password to unlock the vault, then try again.');
  return res.redirect('/admin/vault');
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const category = String(req.query.category || '').slice(0, 40);
    const sort = SORTS[req.query.sort] ? req.query.sort : 'service';
    const where = { ownerId: req.user.id };
    if (category) where.category = category;
    if (q) where.OR = ['service', 'username', 'url'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }));
    const db = prisma();
    // passwordEnc / notesEnc are deliberately not selected: ciphertext never reaches the page.
    const [total, items, cats] = await Promise.all([
      db.vaultEntry.count({ where }),
      db.vaultEntry.findMany({
        where, orderBy: SORTS[sort], skip: (page - 1) * PAGE, take: PAGE,
        select: { id: true, service: true, username: true, url: true, category: true, createdAt: true, updatedAt: true },
      }),
      db.vaultEntry.findMany({ where: { ownerId: req.user.id }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    ]);
    res.render('admin/vault', {
      title: 'Password Vault', section: 'vault', crumbs, items, q, category, sort, page,
      pages: Math.max(1, Math.ceil(total / PAGE)), total, categories: cats.map((c) => c.category),
      isUnlocked: unlocked(req), unlockedUntil: unlocked(req) ? req.session.vaultUntil : 0,
    });
  } catch (e) { next(e); }
}

async function unlock(req, res, next) {
  try {
    const password = String((req.body && req.body.password) || '').slice(0, 200);
    const me = await prisma().user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
    if (!password || !(await bcrypt.compare(password, me.passwordHash))) {
      await audit(req, 'vault.unlock_failed', 'Vault');
      return res.status(401).json({ error: 'That password is not correct.' });
    }
    req.session.vaultUntil = Date.now() + UNLOCK_MS;
    await audit(req, 'vault.unlock', 'Vault');
    return res.json({ ok: true, until: req.session.vaultUntil });
  } catch (e) { return next(e); }
}

function lock(req, res) {
  delete req.session.vaultUntil;
  res.json({ ok: true });
}

async function owned(req) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return null;
  const entry = await prisma().vaultEntry.findUnique({ where: { id } });
  // Another account's entry is reported as missing, not forbidden.
  return entry && entry.ownerId === req.user.id ? entry : null;
}

async function create(req, res, next) {
  try {
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.password) {
      const errors = parsed.success ? {} : flat(parsed.error.issues);
      if (!errors.password && (!parsed.success ? !req.body.password : !parsed.data.password)) errors.password = 'Password is required';
      req.flash('error', Object.values(errors)[0] || 'Check the form and try again.');
      return res.redirect('/admin/vault');
    }
    const d = parsed.data;
    const e = await prisma().vaultEntry.create({
      data: { ownerId: req.user.id, service: d.service, username: d.username, url: d.url, category: d.category || 'General', passwordEnc: encrypt(d.password), notesEnc: d.notes ? encrypt(d.notes) : null },
      select: { id: true },
    });
    await audit(req, 'vault.create', 'VaultEntry', e.id, { service: d.service });
    req.flash('success', 'Password saved.');
    return res.redirect('/admin/vault');
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const entry = await owned(req);
    if (!entry) return next();
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) {
      req.flash('error', Object.values(flat(parsed.error.issues))[0]);
      return res.redirect('/admin/vault');
    }
    const d = parsed.data;
    const data = { service: d.service, username: d.username, url: d.url, category: d.category || 'General', notesEnc: d.notes ? encrypt(d.notes) : null };
    if (d.password) data.passwordEnc = encrypt(d.password); // blank keeps the current secret
    await prisma().vaultEntry.update({ where: { id: entry.id }, data });
    await audit(req, 'vault.update', 'VaultEntry', entry.id, { service: d.service, passwordChanged: Boolean(d.password) });
    req.flash('success', 'Entry updated.');
    return res.redirect('/admin/vault');
  } catch (err) { return next(err); }
}

async function remove(req, res, next) {
  try {
    const entry = await owned(req);
    if (!entry) return next();
    await prisma().vaultEntry.delete({ where: { id: entry.id } });
    await audit(req, 'vault.delete', 'VaultEntry', entry.id, { service: entry.service });
    req.flash('success', 'Entry deleted.');
    return res.redirect('/admin/vault');
  } catch (err) { return next(err); }
}

/** Decrypts one secret on request. Response is never cached. */
async function reveal(req, res) {
  try {
    const entry = await owned(req);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    res.set('Cache-Control', 'no-store');
    await audit(req, 'vault.reveal', 'VaultEntry', entry.id, { service: entry.service });
    return res.json({ password: decrypt(entry.passwordEnc) });
  } catch (err) {
    return res.status(500).json({ error: 'Could not decrypt this entry. Check VAULT_ENCRYPTION_KEY.' });
  }
}

async function notes(req, res) {
  try {
    const entry = await owned(req);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    res.set('Cache-Control', 'no-store');
    return res.json({ notes: entry.notesEnc ? decrypt(entry.notesEnc) : '' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not decrypt this entry.' });
  }
}

module.exports = { list, unlock, lock, create, update, remove, reveal, notes, requireUnlocked, unlocked };
