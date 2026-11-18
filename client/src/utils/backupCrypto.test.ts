import { describe, it, expect } from 'vitest';
import { encryptBackup, decryptBackup, isEncryptedBackup, WrongPassphraseError, ENCRYPTED_BACKUP_FORMAT, PBKDF2_ITERATIONS } from './backupCrypto';

// Fewer PBKDF2 rounds than real backups use keeps the suite fast; the minimum
// a file may ask for is 100,000.
const FAST = 100_000;
const backup = JSON.stringify({ version: '1.1.0', data: { expenses: [{ title: 'Café ☕', amount: 4.5 }], incomes: [], budgets: [], semesters: [] } });

describe('backupCrypto', () => {
  it('round-trips a backup, including non-ASCII text', async () => {
    const enc = await encryptBackup(backup, 'correct horse battery', FAST);
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(enc).toMatchObject({ format: ENCRYPTED_BACKUP_FORMAT, v: 1, kdf: 'PBKDF2-SHA256', iterations: FAST });
    expect(enc.data).not.toContain('Café');
    expect(await decryptBackup(enc, 'correct horse battery')).toBe(backup);
  });

  it('defaults to the recommended iteration count', async () => {
    const enc = await encryptBackup('{}', 'passphrase');
    expect(enc.iterations).toBe(PBKDF2_ITERATIONS);
  });

  it('uses a fresh salt and IV every time', async () => {
    const [a, b] = await Promise.all([encryptBackup(backup, 'same pass', FAST), encryptBackup(backup, 'same pass', FAST)]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('rejects a wrong passphrase', async () => {
    const enc = await encryptBackup(backup, 'right passphrase', FAST);
    await expect(decryptBackup(enc, 'wrong passphrase')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('rejects a changed file', async () => {
    const enc = await encryptBackup(backup, 'right passphrase', FAST);
    const bytes = atob(enc.data);
    const flipped = String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1);
    await expect(decryptBackup({ ...enc, data: btoa(flipped) }, 'right passphrase')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('refuses iteration counts that are too low or would hang the tab', async () => {
    const enc = await encryptBackup(backup, 'right passphrase', FAST);
    await expect(decryptBackup({ ...enc, iterations: 1000 }, 'right passphrase')).rejects.toThrow(/damaged/);
    await expect(decryptBackup({ ...enc, iterations: 1e9 }, 'right passphrase')).rejects.toThrow(/damaged/);
  });

  it('tells plain backups and other JSON apart from encrypted ones', () => {
    expect(isEncryptedBackup(JSON.parse(backup))).toBe(false);
    expect(isEncryptedBackup(null)).toBe(false);
    expect(isEncryptedBackup({ format: ENCRYPTED_BACKUP_FORMAT, salt: 'a', iv: 'b' })).toBe(false);
  });
});
