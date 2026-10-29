// Adds the starter skill list (names only, no fake percentages). Safe to re-run.
const { prisma, disconnect } = require('../src/config/db');

const SKILLS = [
  ['Python', 'Languages'], ['JavaScript', 'Languages'], ['HTML and CSS', 'Languages'],
  ['Django', 'Frameworks'], ['Node.js', 'Frameworks'], ['Express.js', 'Frameworks'],
  ['PostgreSQL', 'Data'], ['REST APIs', 'Data'],
  ['Git and GitHub', 'Tooling'], ['Telegram Bot Development', 'Tooling'], ['Railway deployment', 'Tooling'],
];

(async () => {
  const db = prisma();
  if ((await db.skill.count()) > 0) {
    console.log('Skills already exist, nothing to seed.');
  } else {
    await db.skill.createMany({
      data: SKILLS.map(([name, category], i) => ({ name, category, sortOrder: i })),
    });
    console.log(`Seeded ${SKILLS.length} skills.`);
  }
  await disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
