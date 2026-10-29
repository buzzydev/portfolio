const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const env = require('./config/env');
const { loadUser } = require('./middleware/auth');
const { csrf } = require('./middleware/csrf');
const locals = require('./middleware/locals');
const limits = require('./middleware/rateLimits');
const { notFound, errorHandler } = require('./middleware/errors');
const media = require('./controllers/media');

function buildSessionStore() {
  const { Pool } = require('pg');
  const PgStore = require('connect-pg-simple')(session);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  pool.on('error', (err) => console.error('session pool error:', err.message));
  return new PgStore({ pool, tableName: 'session', createTableIfMissing: false });
}

function createApp({ sessionStore } = {}) {
  const app = express();
  app.set('trust proxy', 1); // Railway terminates TLS in front of the app
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/public');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(env.isProd ? {} : { upgradeInsecureRequests: null }),
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Health check and images are served before sessions so they never create cookies.
  app.get('/health', async (req, res) => {
    try {
      await require('./config/db').prisma().$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.get('/media/:id(\\d+)', media.serve);
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: env.isProd ? '1h' : 0 }));

  app.use(limits.general);
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    session({
      name: 'sid',
      secret: env.sessionSecret(),
      store: sessionStore || (env.isTest ? undefined : buildSessionStore()),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, secure: env.isProd, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );
  app.use(loadUser);
  app.use(csrf);
  app.use(locals);
  app.use(require('./routes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
