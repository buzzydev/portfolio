// Lazy Prisma client so tests and tooling can import the app without a database.
let client;
function prisma() {
  if (!client) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient();
  }
  return client;
}
async function disconnect() {
  if (client) await client.$disconnect();
}
module.exports = { prisma, disconnect };
