const { icon } = require('../utils/icons');
const helpers = require('../utils/helpers');
const { ROLE_LABEL } = require('../services/permissions');

module.exports = function locals(req, res, next) {
  res.locals.icon = icon;
  res.locals.h = helpers;
  res.locals.ROLE_LABEL = ROLE_LABEL;
  res.locals.path = req.path;
  res.locals.title = '';
  res.locals.crumbs = [];
  res.locals.section = '';
  res.locals.flash = [];
  if (req.session && req.session.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }
  req.flash = (type, text) => {
    req.session.flash = (req.session.flash || []).concat({ type, text });
  };
  next();
};
