const { prisma } = require('../config/db');
const { sniffImage, safeName } = require('../middleware/upload');
const { audit } = require('../services/audit');

const LIST = { id: true, filename: true, mimeType: true, size: true, alt: true, createdAt: true };
const cleanAlt = (v) => String(v || '').trim().slice(0, 200);

async function list(req, res, next) {
  try {
    const items = await prisma().media.findMany({ select: LIST, orderBy: { id: 'desc' }, take: 200 });
    res.render('admin/media', { title: 'Images and Media', section: 'media', crumbs: [{ label: 'Dashboard', href: '/admin' }, { label: 'Images and Media' }], items });
  } catch (e) { next(e); }
}

async function upload(req, res, next) {
  try {
    if (!req.file) { req.flash('error', 'Choose a JPEG, PNG, WebP or GIF image.'); return res.redirect('/admin/media'); }
    const kind = sniffImage(req.file.buffer);
    if (!kind) { req.flash('error', 'That file is not a supported image. SVG and other formats are not accepted.'); return res.redirect('/admin/media'); }
    const alt = cleanAlt(req.body.alt);
    if (!alt) { req.flash('error', 'Add alternative text that describes the image.'); return res.redirect('/admin/media'); }
    const m = await prisma().media.create({
      data: { filename: safeName(req.file.originalname, kind.ext), mimeType: kind.mime, size: req.file.size, alt, data: req.file.buffer, uploadedById: req.user.id },
      select: { id: true, filename: true },
    });
    await audit(req, 'media.upload', 'Media', m.id, { filename: m.filename });
    req.flash('success', 'Image uploaded.');
    return res.redirect('/admin/media');
  } catch (e) { return next(e); }
}

async function replace(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) { req.flash('error', 'Choose an image to replace it with.'); return res.redirect('/admin/media'); }
    const kind = sniffImage(req.file.buffer);
    if (!kind) { req.flash('error', 'That file is not a supported image.'); return res.redirect('/admin/media'); }
    const existing = await prisma().media.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return next();
    await prisma().media.update({ where: { id }, data: { filename: safeName(req.file.originalname, kind.ext), mimeType: kind.mime, size: req.file.size, data: req.file.buffer } });
    await audit(req, 'media.replace', 'Media', id);
    req.flash('success', 'Image replaced.');
    return res.redirect('/admin/media');
  } catch (e) { return next(e); }
}

async function updateAlt(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const alt = cleanAlt(req.body.alt);
    if (!alt) { req.flash('error', 'Alternative text cannot be empty.'); return res.redirect('/admin/media'); }
    await prisma().media.update({ where: { id }, data: { alt } });
    await audit(req, 'media.alt', 'Media', id);
    req.flash('success', 'Alternative text saved.');
    return res.redirect('/admin/media');
  } catch (e) { return e.code === 'P2025' ? next() : next(e); }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma().media.delete({ where: { id } });
    await audit(req, 'media.delete', 'Media', id);
    req.flash('success', 'Image deleted.');
    return res.redirect('/admin/media');
  } catch (e) { return e.code === 'P2025' ? next() : next(e); }
}

/** Public image endpoint. Only ever returns validated image types, with a locked-down CSP. */
async function serve(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return next();
    const m = await prisma().media.findUnique({ where: { id }, select: { data: true, mimeType: true, updatedAt: true } });
    if (!m) return next();
    const etag = `"${id}-${m.updatedAt.getTime()}"`;
    res.set({ ETag: etag, 'Cache-Control': 'public, max-age=300', 'Content-Type': m.mimeType, 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' });
    if (req.get('if-none-match') === etag) return res.status(304).end();
    return res.send(Buffer.from(m.data));
  } catch (e) { return next(e); }
}

module.exports = { list, upload, replace, updateAlt, remove, serve };
