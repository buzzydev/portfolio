const { prisma } = require('../config/db');
const { buildSchema, parseFields } = require('../validators/fields');
const { getSettings, saveSettings } = require('../services/settings');
const { audit } = require('../services/audit');

/** Settings page driven by a field list. Values are stored as strings in the Setting table. */
function makeSettingsHandlers({ key, title, perm, fields, intro }) {
  const schema = buildSchema(fields);
  const crumbs = [{ label: 'Dashboard', href: '/admin' }, { label: title }];
  const needsMedia = fields.some((f) => f.type === 'media');
  const media = () => (needsMedia ? prisma().media.findMany({ where: { mimeType: { startsWith: 'image/' } }, select: { id: true, filename: true, alt: true }, orderBy: { id: 'desc' }, take: 300 }) : []);

  async function render(res, values, errors = {}, status = 200) {
    res.status(status).render('admin/settings', { title, section: key, crumbs, fields, values, errors, intro, action: `/admin/${key}`, mediaList: await media() });
  }

  return {
    perm,
    show: async (req, res, next) => {
      try {
        const s = await getSettings();
        const values = {};
        fields.forEach((f) => { values[f.name] = f.type === 'checkbox' ? (s[f.name] === 'true' ? 'on' : '') : s[f.name]; });
        await render(res, values);
      } catch (e) { next(e); }
    },
    save: async (req, res, next) => {
      try {
        const { data, errors } = parseFields(schema, req.body);
        if (errors) return await render(res, req.body, errors, 422);
        const out = {};
        for (const f of fields) {
          const v = data[f.name];
          out[f.name] = f.type === 'checkbox' ? String(v) : f.type === 'media' ? (v ? String(v) : '') : v;
        }
        await saveSettings(out);
        await audit(req, `${key}.update`, 'Setting', null, { keys: Object.keys(out) });
        req.flash('success', `${title} saved.`);
        return res.redirect(`/admin/${key}`);
      } catch (e) { return next(e); }
    },
  };
}

module.exports = { makeSettingsHandlers };
