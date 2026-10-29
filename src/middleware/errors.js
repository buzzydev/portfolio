const env = require('../config/env');
const { wantsJson } = require('./auth');

function notFound(req, res) {
  if (wantsJson(req)) return res.status(404).json({ error: 'Not found.' });
  return res.status(404).render('errors/404', { layout: 'layouts/public', title: 'Page not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  // Log the message only: never request bodies, which can contain secrets.
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, env.isProd ? err.message : err.stack);
  const message = status < 500 && err.expose ? err.message : status === 403 ? 'You do not have permission to do that.' : 'Something went wrong. Please try again.';
  if (res.headersSent) return next(err);
  if (wantsJson(req)) return res.status(status).json({ error: message });
  const view = status === 403 ? 'errors/403' : status === 404 ? 'errors/404' : status < 500 ? 'errors/400' : 'errors/500';
  return res.status(status).render(view, { layout: 'layouts/public', title: 'Error', message });
}

module.exports = { notFound, errorHandler };
