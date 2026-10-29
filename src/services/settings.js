const { prisma } = require('../config/db');

const DEFAULTS = {
  siteTitle: 'Developer Portfolio',
  metaDescription: 'Portfolio of a full-stack developer.',
  footerText: '',
  contactEnabled: 'true',
  displayName: 'Your Name',
  headline: 'Building Secure, Modern Digital Experiences.',
  intro: 'Add your introduction in the dashboard under Profile Settings.',
  bio: 'Add your biography in the dashboard under Profile Settings.',
  interests: '',
  strengths: '',
  philosophy: '',
  avatarMediaId: '',
  heroBackgroundMediaId: '',
  githubUrl: '',
  telegramUrl: '',
};

async function getSettings() {
  const rows = await prisma().setting.findMany();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out;
}

/** Saves only keys that exist in DEFAULTS. */
async function saveSettings(values) {
  const db = prisma();
  const ops = Object.entries(values)
    .filter(([k]) => k in DEFAULTS)
    .map(([key, value]) =>
      db.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } }),
    );
  await db.$transaction(ops);
}

module.exports = { DEFAULTS, getSettings, saveSettings };
