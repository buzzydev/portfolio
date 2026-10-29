require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function parseKey(raw) {
  if (!raw) return null;
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  const b = Buffer.from(v, 'base64');
  return b.length === 32 ? b : null;
}

/** Returns the 32-byte vault key or throws. Never logs the key. */
function getVaultKey() {
  const key = parseKey(process.env.VAULT_ENCRYPTION_KEY);
  if (!key) throw new Error('VAULT_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).');
  return key;
}

function validate() {
  const problems = [];
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is missing');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    problems.push('SESSION_SECRET must be at least 32 characters');
  }
  if (!parseKey(process.env.VAULT_ENCRYPTION_KEY)) {
    problems.push('VAULT_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return problems;
}

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (isProd) throw new Error('SESSION_SECRET is required in production');
  // Development fallback: sessions reset on every restart.
  return require('crypto').randomBytes(48).toString('base64url');
}

module.exports = {
  isProd,
  isTest,
  port: Number(process.env.PORT) || 3000,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  getVaultKey,
  validate,
  sessionSecret,
};
