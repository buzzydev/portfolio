const { PROJECT_CATEGORIES, EXPERIENCE_TYPES } = require('../utils/helpers');
const { ICON_NAMES } = require('../utils/icons');

const STATUS = [{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }];
const perms = (k) => ({ view: `${k}.view`, create: `${k}.create`, edit: `${k}.edit`, delete: `${k}.delete` });
const order = [{ sortOrder: 'asc' }, { id: 'asc' }];

const projects = {
  key: 'projects', model: 'project', title: 'Projects', singular: 'project', labelField: 'title',
  perms: perms('projects'), search: ['title', 'description'], reorder: true,
  orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
  filter: { name: 'category', label: 'All categories', options: PROJECT_CATEGORIES },
  defaults: { category: 'WEB_APP', status: 'DRAFT', sortOrder: 0 },
  columns: [
    { key: 'coverId', label: '', type: 'thumb' },
    { key: 'title', label: 'Project', type: 'primary' },
    { key: 'category', label: 'Category', type: 'enum', options: PROJECT_CATEGORIES },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'featured', label: 'Featured', type: 'bool' },
    { key: 'updatedAt', label: 'Updated', type: 'date' },
  ],
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'description', label: 'Description', type: 'textarea', max: 3000, rows: 5 },
    { name: 'category', label: 'Category', type: 'select', options: PROJECT_CATEGORIES },
    { name: 'techStack', label: 'Technology stack', type: 'csv', help: 'Comma separated, e.g. Node.js, PostgreSQL' },
    { name: 'githubUrl', label: 'GitHub repository URL', type: 'url' },
    { name: 'liveUrl', label: 'Live demo URL', type: 'url' },
    { name: 'coverId', label: 'Cover image', type: 'media', help: 'Upload images in Images and Media first.' },
    { name: 'galleryIds', label: 'Gallery images', type: 'mediamulti', help: 'Hold Ctrl or Cmd to pick several.' },
    { name: 'status', label: 'Publication status', type: 'select', options: STATUS },
    { name: 'featured', label: 'Featured project (shown first)', type: 'checkbox' },
    { name: 'sortOrder', label: 'Display order', type: 'number', help: 'Lower numbers appear first.' },
  ],
};

const skills = {
  key: 'skills', model: 'skill', title: 'Skills', singular: 'skill', labelField: 'name',
  perms: perms('skills'), search: ['name', 'category'], reorder: true, orderBy: order,
  defaults: { category: 'General', visible: 'on', sortOrder: 0 },
  columns: [
    { key: 'name', label: 'Skill', type: 'primary' },
    { key: 'category', label: 'Group', type: 'text' },
    { key: 'visible', label: 'Visible', type: 'bool' },
  ],
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, max: 60 },
    { name: 'category', label: 'Group', type: 'text', required: true, max: 40, help: 'Skills with the same group are shown together.' },
    { name: 'description', label: 'Short note (optional)', type: 'text', max: 160 },
    { name: 'visible', label: 'Show on the public site', type: 'checkbox' },
    { name: 'sortOrder', label: 'Display order', type: 'number' },
  ],
};

const experience = {
  key: 'experience', model: 'experience', title: 'Experience', singular: 'entry', labelField: 'title',
  perms: perms('experience'), search: ['title', 'organization'], reorder: true, orderBy: order,
  filter: { name: 'type', label: 'All types', options: EXPERIENCE_TYPES },
  defaults: { type: 'EXPERIENCE', visible: 'on', sortOrder: 0 },
  columns: [
    { key: 'title', label: 'Title', type: 'primary' },
    { key: 'type', label: 'Type', type: 'enum', options: EXPERIENCE_TYPES },
    { key: 'organization', label: 'Organization', type: 'text' },
    { key: 'visible', label: 'Visible', type: 'bool' },
  ],
  fields: [
    { name: 'type', label: 'Type', type: 'select', options: EXPERIENCE_TYPES },
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'organization', label: 'Organization', type: 'text' },
    { name: 'startDate', label: 'Start', type: 'text', max: 30, help: 'Free text, e.g. 2023 or Mar 2023.' },
    { name: 'endDate', label: 'End', type: 'text', max: 30, help: 'Leave empty if ongoing or not applicable.' },
    { name: 'description', label: 'Description', type: 'textarea', max: 2000, rows: 4 },
    { name: 'visible', label: 'Show on the public site', type: 'checkbox' },
    { name: 'sortOrder', label: 'Display order', type: 'number' },
  ],
};

const social = {
  key: 'social', model: 'socialLink', title: 'Social Links', singular: 'link', labelField: 'label',
  perms: perms('social'), search: ['label', 'url'], reorder: true, orderBy: order,
  defaults: { icon: 'link', visible: 'on', sortOrder: 0 },
  columns: [
    { key: 'label', label: 'Label', type: 'primary' },
    { key: 'url', label: 'URL', type: 'text' },
    { key: 'visible', label: 'Visible', type: 'bool' },
  ],
  fields: [
    { name: 'label', label: 'Label', type: 'text', required: true, max: 40 },
    { name: 'url', label: 'URL', type: 'url', required: true },
    { name: 'icon', label: 'Icon', type: 'select', options: ['link', 'github', 'send', 'mail', 'user', 'code', 'star'].filter((n) => ICON_NAMES.includes(n)).map((n) => ({ value: n, label: n })) },
    { name: 'visible', label: 'Show on the public site', type: 'checkbox' },
    { name: 'sortOrder', label: 'Display order', type: 'number' },
  ],
};

const profileFields = [
  { name: 'displayName', label: 'Display name', type: 'text', max: 80 },
  { name: 'headline', label: 'Hero headline', type: 'text', max: 140 },
  { name: 'intro', label: 'Hero introduction', type: 'textarea', max: 600, rows: 3 },
  { name: 'bio', label: 'About me', type: 'textarea', max: 3000, rows: 6 },
  { name: 'interests', label: 'Technical interests', type: 'textarea', max: 1000, rows: 3 },
  { name: 'strengths', label: 'Strengths', type: 'textarea', max: 1000, rows: 3 },
  { name: 'philosophy', label: 'Development philosophy', type: 'textarea', max: 1000, rows: 3 },
  { name: 'avatarMediaId', label: 'Profile image', type: 'media' },
  { name: 'heroBackgroundMediaId', label: 'Hero background image (optional)', type: 'media' },
  { name: 'githubUrl', label: 'GitHub URL', type: 'url' },
  { name: 'telegramUrl', label: 'Telegram URL', type: 'url' },
];

const generalFields = [
  { name: 'siteTitle', label: 'Site title', type: 'text', required: true, max: 80 },
  { name: 'metaDescription', label: 'Meta description', type: 'textarea', max: 300, rows: 2 },
  { name: 'footerText', label: 'Footer text', type: 'text', max: 200 },
  { name: 'contactEnabled', label: 'Accept messages from the contact form', type: 'checkbox' },
];

module.exports = { projects, skills, experience, social, profileFields, generalFields };
