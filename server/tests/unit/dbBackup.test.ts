import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  BACKED_UP_MODELS, NOT_BACKED_UP, USER_FIELDS_LEFT_OUT, DEFAULT_SCRYPT,
  encryptDbBackup, decryptDbBackup, isEncryptedDbBackup, withoutUserSecrets,
} from '../../src/utils/dbBackup';

// Cheap key derivation for tests; real backups use DEFAULT_SCRYPT.
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const dump = JSON.stringify({ takenAt: '2026-11-17T00:00:00.000Z', expense: [{ title: 'Café ☕', amount: 450 }] });

describe('database backup encryption (A6)', () => {
  it('round-trips and keeps nothing readable in the file', async () => {
    const enc = await encryptDbBackup(dump, 'a long operator passphrase', FAST);
    expect(isEncryptedDbBackup(enc)).toBe(true);
    expect(JSON.stringify(enc)).not.toContain('Caf');
    expect(await decryptDbBackup(enc, 'a long operator passphrase')).toBe(dump);
  });

  it('rejects a wrong passphrase and a changed file', async () => {
    const enc = await encryptDbBackup(dump, 'a long operator passphrase', FAST);
    await expect(decryptDbBackup(enc, 'another passphrase')).rejects.toThrow(/Wrong passphrase/);
    const data = Buffer.from(enc.data, 'base64');
    data[0] ^= 1;
    await expect(decryptDbBackup({ ...enc, data: data.toString('base64') }, 'a long operator passphrase')).rejects.toThrow(/Wrong passphrase/);
  });

  it('refuses key parameters that would exhaust memory', async () => {
    const enc = await encryptDbBackup(dump, 'a long operator passphrase', FAST);
    await expect(decryptDbBackup({ ...enc, kdf: { ...enc.kdf, N: 2 ** 30 } }, 'a long operator passphrase')).rejects.toThrow(/damaged/);
  });

  it('defaults to strong scrypt parameters', () => {
    expect(DEFAULT_SCRYPT.N).toBeGreaterThanOrEqual(2 ** 17);
  });

  it('leaves out one-time codes and reset tokens but keeps the password hash', () => {
    const user = { id: 'u1', email: 'a@b.c', password: '$2a$10$hash', resetToken: 'r', verificationOtp: 'o', twoFactorOtp: 't', lockUntil: new Date(), otpAttempts: 2 };
    const kept = withoutUserSecrets(user);
    expect(kept).toEqual({ id: 'u1', email: 'a@b.c', password: '$2a$10$hash' });
  });

  it('decides about every collection and names only real User fields', () => {
    const models = Prisma.dmmf.datamodel.models;
    const decided = new Set([...BACKED_UP_MODELS.map((m) => m[0].toUpperCase() + m.slice(1)), ...Object.keys(NOT_BACKED_UP)]);
    // A new model fails here until it is added to one list or the other.
    expect(models.map((m) => m.name).filter((name) => !decided.has(name))).toEqual([]);
    const userFields = new Set(models.find((m) => m.name === 'User')!.fields.map((f) => f.name));
    expect(USER_FIELDS_LEFT_OUT.filter((f) => !userFields.has(f))).toEqual([]);
  });
});
