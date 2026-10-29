const crypto = require('crypto');
const { prisma } = require('../config/db');
const env = require('../config/env');
const { getSettings } = require('../services/settings');
const { contact: contactSchema } = require('../validators/schemas');
const { PROJECT_CATEGORIES } = require('../utils/helpers');

const hmac = (v) => crypto.createHmac('sha256', env.sessionSecret()).update(v).digest('hex');
const formToken = () => { const ts = Date.now(); return `${ts}.${hmac(String(ts))}`; };

function tokenAge(token) {
  const [ts, sig] = String(token || '').split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(ts));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return Date.now() - Number(ts);
}

async function home(req, res, next) {
  try {
    const db = prisma();
    const [settings, skills, projects, experience, social] = await Promise.all([
      getSettings(),
      db.skill.findMany({ where: { visible: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      db.project.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }],
        include: { cover: { select: { id: true, alt: true } } },
      }),
      db.experience.findMany({ where: { visible: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      db.socialLink.findMany({ where: { visible: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    ]);
    const skillGroups = {};
    skills.forEach((s) => (skillGroups[s.category] = (skillGroups[s.category] || []).concat(s)));
    const usedCategories = PROJECT_CATEGORIES.filter((c) => projects.some((p) => p.category === c.value));
    res.render('public/home', {
      title: settings.siteTitle,
      description: settings.metaDescription,
      siteTitle: settings.siteTitle, settings, skillGroups, projects, usedCategories, experience, social,
      formToken: formToken(),
    });
  } catch (err) {
    next(err);
  }
}

async function submitContact(req, res, next) {
  try {
    const json = (req.get('accept') || '').includes('application/json');
    const reply = (status, ok, message, errors) => {
      if (json) return res.status(status).json({ ok, message, errors });
      req.flash(ok ? 'success' : 'error', message);
      return res.redirect('/#contact');
    };
    const settings = await getSettings();
    if (settings.contactEnabled !== 'true') return reply(403, false, 'The contact form is currently disabled.');
    // Honeypot: real visitors never see or fill this field. Pretend success to bots.
    if (req.body.website) return reply(200, true, 'Thanks, your message was sent.');
    const age = tokenAge(req.body.ft);
    if (age === null || age < 3000 || age > 24 * 3600 * 1000) return reply(400, false, 'Please wait a moment and send the form again.');
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = {};
      parsed.error.issues.forEach((i) => { if (!errors[i.path[0]]) errors[i.path[0]] = i.message; });
      return reply(422, false, 'Please fix the highlighted fields.', errors);
    }
    await prisma().contactMessage.create({
      data: { ...parsed.data, ipHash: hmac(`ip:${req.ip}`).slice(0, 32) },
    });
    return reply(201, true, 'Thanks, your message was sent.');
  } catch (err) {
    return next(err);
  }
}

module.exports = { home, submitContact, tokenAge, formToken };
