const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/auth');
const limits = require('../middleware/rateLimits');
const { uploadImage } = require('../middleware/upload');
const { makeCrud } = require('../controllers/crud');
const { makeSettingsHandlers } = require('../controllers/settings');
const R = require('../controllers/resources');
const publicC = require('../controllers/public');
const auth = require('../controllers/auth');
const profile = require('../controllers/profile');
const dashboard = require('../controllers/dashboard');
const media = require('../controllers/media');
const messages = require('../controllers/messages');
const users = require('../controllers/users');
const audit = require('../controllers/audit');
const vault = require('../controllers/vault');

const router = express.Router();

// ---- Public ----
router.get('/', publicC.home);
router.post('/contact', limits.contact, publicC.submitContact);
router.get('/login', auth.showLogin);
router.post('/login', limits.login, auth.postLogin);
router.post('/logout', auth.logout);

// ---- Account (any signed-in user) ----
router.get('/profile', requireAuth, profile.show);
router.post('/profile', requireAuth, profile.save);
router.post('/profile/password', requireAuth, limits.login, profile.changePassword);
router.post('/profile/avatar', requireAuth, uploadImage, profile.setAvatar);
router.post('/profile/theme', requireAuth, profile.setTheme);

// ---- Admin ----
const admin = express.Router();
admin.use(requireAuth);
admin.use((req, res, next) => { res.locals.layout = 'layouts/admin'; next(); });
admin.get('/', requirePermission('dashboard.view'), dashboard.overview);

admin.use('/projects', makeCrud(R.projects));
admin.use('/skills', makeCrud(R.skills));
admin.use('/experience', makeCrud(R.experience));
admin.use('/social', makeCrud(R.social));

const profileSettings = makeSettingsHandlers({ key: 'profile-settings', title: 'Profile Settings', perm: 'profile.manage', fields: R.profileFields, intro: 'This content appears on the public homepage.' });
admin.get('/profile-settings', requirePermission(profileSettings.perm), profileSettings.show);
admin.post('/profile-settings', requirePermission(profileSettings.perm), profileSettings.save);
const general = makeSettingsHandlers({ key: 'settings', title: 'General Settings', perm: 'settings.manage', fields: R.generalFields, intro: 'Site-wide options. Only Super Administrators can change these.' });
admin.get('/settings', requirePermission(general.perm), general.show);
admin.post('/settings', requirePermission(general.perm), general.save);

admin.get('/media', requirePermission('media.view'), media.list);
admin.post('/media/upload', requirePermission('media.upload'), uploadImage, media.upload);
admin.post('/media/:id(\\d+)/replace', requirePermission('media.upload'), uploadImage, media.replace);
admin.post('/media/:id(\\d+)/alt', requirePermission('media.upload'), media.updateAlt);
admin.post('/media/:id(\\d+)/delete', requirePermission('media.delete'), media.remove);

admin.get('/messages', requirePermission('messages.view'), messages.list);
admin.get('/messages/:id(\\d+)', requirePermission('messages.view'), messages.show);
admin.post('/messages/:id(\\d+)/status', requirePermission('messages.process'), messages.setStatus);
admin.post('/messages/:id(\\d+)/delete', requirePermission('messages.delete'), messages.remove);

admin.get('/users', requirePermission('users.view'), users.list);
admin.get('/users/new', requirePermission('users.manage'), users.newForm);
admin.post('/users', requirePermission('users.manage'), users.create);
admin.get('/users/:id(\\d+)/edit', requirePermission('users.manage'), users.editForm);
admin.post('/users/:id(\\d+)', requirePermission('users.manage'), users.update);
admin.post('/users/:id(\\d+)/delete', requirePermission('users.manage'), users.remove);

admin.get('/audit', requirePermission('audit.view'), audit.list);

const v = express.Router();
v.use(requirePermission('vault.use'), limits.vault);
v.get('/', vault.list);
v.post('/unlock', limits.vaultUnlock, vault.unlock);
v.post('/lock', vault.lock);
v.post('/', vault.requireUnlocked, vault.create);
v.post('/:id(\\d+)', vault.requireUnlocked, vault.update);
v.post('/:id(\\d+)/delete', vault.requireUnlocked, vault.remove);
v.post('/:id(\\d+)/reveal', vault.requireUnlocked, vault.reveal);
v.post('/:id(\\d+)/notes', vault.requireUnlocked, vault.notes);
admin.use('/vault', v);

router.use('/admin', admin);

module.exports = router;
