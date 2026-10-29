const express = require('express');
const { prisma } = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { buildSchema, parseFields } = require('../validators/fields');
const { audit } = require('../services/audit');

const PAGE_SIZE = 15;

/** Declarative CRUD router. One config object produces list, create, edit, delete and reorder routes. */
function makeCrud(cfg) {
  const { key, model, title, singular, fields, columns, perms, labelField, search = [], reorder = false, filter, orderBy, include, defaults = {} } = cfg;
  const schema = buildSchema(fields);
  const needsMedia = fields.some((f) => f.type === 'media' || f.type === 'mediamulti');
  const base = `/admin/${key}`;
  const db = () => prisma()[model];
  const router = express.Router();

  const crumbs = (last) => [{ label: 'Dashboard', href: '/admin' }, { label: title, href: base }].concat(last ? [{ label: last }] : []);
  const mediaList = () => (needsMedia ? prisma().media.findMany({ where: { mimeType: { startsWith: 'image/' } }, select: { id: true, filename: true, alt: true }, orderBy: { id: 'desc' }, take: 300 }) : []);
  const toForm = (item) => {
    const v = {};
    for (const f of fields) {
      const x = item[f.name];
      v[f.name] = Array.isArray(x) ? (f.type === 'csv' ? x.join(', ') : x.map(String)) : x == null ? '' : x;
    }
    return v;
  };

  async function renderForm(res, { item, values, errors = {}, status = 200 }) {
    res.status(status).render('admin/crud/form', {
      title: item ? `Edit ${singular}` : `New ${singular}`, section: key, crumbs: crumbs(item ? `Edit ${singular}` : `New ${singular}`),
      cfg, fields, values, errors, item, action: item ? `${base}/${item.id}` : base, base, mediaList: await mediaList(),
    });
  }

  router.get('/', requirePermission(perms.view), async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const q = String(req.query.q || '').trim().slice(0, 100);
      const where = {};
      if (q && search.length) where.OR = search.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }));
      const fv = filter && String(req.query[filter.name] || '');
      if (filter && filter.options.some((o) => o.value === fv)) where[filter.name] = fv;
      const [total, items] = await Promise.all([
        db().count({ where }),
        db().findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, ...(include ? { include } : {}) }),
      ]);
      res.render('admin/crud/list', {
        title, section: key, crumbs: crumbs(), cfg, columns, items, base, q, filterValue: fv || '',
        page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total,
      });
    } catch (err) { next(err); }
  });

  router.get('/new', requirePermission(perms.create), (req, res, next) =>
    renderForm(res, { values: { ...defaults } }).catch(next));

  router.post('/', requirePermission(perms.create), async (req, res, next) => {
    try {
      const { data, errors } = parseFields(schema, req.body);
      if (errors) return await renderForm(res, { values: req.body, errors, status: 422 });
      const created = await db().create({ data });
      await audit(req, `${key}.create`, model, created.id, { label: created[labelField] });
      req.flash('success', `${singular} created.`);
      return res.redirect(base);
    } catch (err) { return next(err); }
  });

  async function load(req) {
    const id = parseInt(req.params.id, 10);
    return Number.isInteger(id) ? db().findUnique({ where: { id } }) : null;
  }

  router.get('/:id(\\d+)/edit', requirePermission(perms.edit), async (req, res, next) => {
    try {
      const item = await load(req);
      if (!item) return next();
      return await renderForm(res, { item, values: toForm(item) });
    } catch (err) { return next(err); }
  });

  router.post('/:id(\\d+)', requirePermission(perms.edit), async (req, res, next) => {
    try {
      const item = await load(req);
      if (!item) return next();
      const { data, errors } = parseFields(schema, req.body);
      if (errors) return await renderForm(res, { item, values: req.body, errors, status: 422 });
      await db().update({ where: { id: item.id }, data });
      await audit(req, `${key}.update`, model, item.id, { label: data[labelField] });
      req.flash('success', `${singular} saved.`);
      return res.redirect(base);
    } catch (err) { return next(err); }
  });

  router.post('/:id(\\d+)/delete', requirePermission(perms.delete), async (req, res, next) => {
    try {
      const item = await load(req);
      if (!item) return next();
      await db().delete({ where: { id: item.id } });
      await audit(req, `${key}.delete`, model, item.id, { label: item[labelField] });
      req.flash('success', `${singular} deleted.`);
      return res.redirect(base);
    } catch (err) { return next(err); }
  });

  if (reorder) {
    router.post('/:id(\\d+)/move', requirePermission(perms.edit), async (req, res, next) => {
      try {
        const id = parseInt(req.params.id, 10);
        const dir = req.body.dir === 'up' ? -1 : req.body.dir === 'down' ? 1 : 0;
        const all = await db().findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
        const i = all.findIndex((r) => r.id === id);
        const j = i + dir;
        if (i === -1 || !dir || j < 0 || j >= all.length) return res.redirect(base);
        [all[i], all[j]] = [all[j], all[i]];
        await prisma().$transaction(all.map((r, idx) => db().update({ where: { id: r.id }, data: { sortOrder: idx } })));
        await audit(req, `${key}.reorder`, model, id);
        return res.redirect(base);
      } catch (err) { return next(err); }
    });
  }

  return router;
}

module.exports = { makeCrud, PAGE_SIZE };
