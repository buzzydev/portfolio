const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      if ((req.get('accept') || '').includes('application/json') || req.is('application/json')) {
        return res.status(429).json({ error: message });
      }
      return res.status(429).render('errors/429', { layout: 'layouts/public', title: 'Too many requests', message });
    },
  });

module.exports = {
  general: make(60 * 1000, 300, 'Too many requests. Please slow down.'),
  login: make(15 * 60 * 1000, 10, 'Too many sign-in attempts. Try again in 15 minutes.'),
  contact: make(60 * 60 * 1000, 5, 'Too many messages sent from your network. Try again later.'),
  vault: make(10 * 60 * 1000, 60, 'Too many vault requests. Try again in a few minutes.'),
  vaultUnlock: make(15 * 60 * 1000, 8, 'Too many unlock attempts. Try again in 15 minutes.'),
};
