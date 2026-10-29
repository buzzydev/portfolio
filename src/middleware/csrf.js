const crypto = require('crypto');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
// The only routes allowed to receive multipart bodies. Their token is checked after multer parses the form.
const UPLOAD_ROUTES = [/^\/admin\/media\/upload$/, /^\/admin\/media\/\d+\/replace$/, /^\/profile\/avatar$/];

function ensureToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function matches(req, supplied) {
  const expected = req.session && req.session.csrf;
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reject(req, res) {
  const err = new Error('Invalid or missing security token. Reload the page and try again.');
  err.status = 403;
  err.expose = true;
  return err;
}

function csrf(req, res, next) {
  // The token (and therefore a session) is created lazily, only when a view actually renders it.
  Object.defineProperty(res.locals, 'csrfToken', { configurable: true, enumerable: true, get: () => ensureToken(req) });
  if (SAFE.has(req.method)) return next();
  if (/^multipart\/form-data/i.test(req.headers['content-type'] || '')) {
    if (!UPLOAD_ROUTES.some((re) => re.test(req.path))) return next(reject(req, res));
    req.csrfDeferred = true;
    return next();
  }
  const supplied = req.get('x-csrf-token') || (req.body && req.body._csrf);
  return matches(req, supplied) ? next() : next(reject(req, res));
}

/** Put after multer on upload routes. */
function verifyDeferred(req, res, next) {
  const supplied = req.get('x-csrf-token') || (req.body && req.body._csrf);
  return matches(req, supplied) ? next() : next(reject(req, res));
}

module.exports = { csrf, verifyDeferred, matches };
