const multer = require('multer');
const { verifyDeferred } = require('./csrf');

const MAX_BYTES = 3 * 1024 * 1024;
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

/** Identifies the real format from magic bytes. Client-supplied type and name are never trusted. SVG is rejected on purpose (script risk). */
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  const head = buf.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

function safeName(original, ext) {
  const base = String(original || 'image').replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  return `${base}.${ext}`;
}

/** Parses one image under `file`, then verifies the CSRF token. */
const uploadImage = [
  (req, res, next) =>
    parser.single('file')(req, res, (err) => {
      if (!err) return next();
      const e = new Error(err.code === 'LIMIT_FILE_SIZE' ? 'Image is larger than 3 MB.' : 'Upload failed.');
      e.status = 400;
      e.expose = true;
      return next(e);
    }),
  verifyDeferred,
];

module.exports = { uploadImage, sniffImage, safeName, MAX_BYTES };
