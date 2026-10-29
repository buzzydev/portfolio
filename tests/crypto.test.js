require('./helpers');
const { encrypt, decrypt } = require('../src/utils/crypto');
const crypto = require('crypto');

describe('vault encryption (AES-256-GCM)', () => {
  test('round-trips unicode secrets', () => {
    const secret = 'pässwörd-🔐-"quotes"';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });
  test('ciphertext does not contain the plaintext and differs per call', () => {
    const a = encrypt('hunter2-hunter2');
    const b = encrypt('hunter2-hunter2');
    expect(a).not.toContain('hunter2');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
  });
  test('tampering is detected', () => {
    const parts = encrypt('secret').split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 1;
    parts[3] = ct.toString('base64');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });
  test('wrong key fails', () => {
    const enc = encrypt('secret');
    expect(() => decrypt(enc, crypto.randomBytes(32))).toThrow();
  });
  test('rejects malformed payloads', () => {
    expect(() => decrypt('nope')).toThrow();
  });
});
