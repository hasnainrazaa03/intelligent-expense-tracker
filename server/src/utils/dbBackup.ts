// Whole-database backups for the operator (`npm run db:backup`), encrypted at
// rest (A6, SRV-M9). The file holds every user's transactions and password
// hashes, so it is never written in plain text: a passphrase derives an
// AES-256-GCM key with scrypt, and the file keeps only the ciphertext and the
// parameters needed to derive the key again. `npm run db:decrypt-backup` reverses it.
import { randomBytes, scrypt as scryptCb, createCipheriv, createDecipheriv, type ScryptOptions } from 'crypto';

export const DB_BACKUP_FORMAT = 'orbit-db-backup-encrypted';
export const MIN_BACKUP_PASSPHRASE_LENGTH = 12;

/** Collections in a backup (Prisma client names), and why the rest are left out. */
export const BACKED_UP_MODELS = [
  'user', 'expense', 'income', 'budget', 'semester', 'tuitionInstallment',
  'household', 'householdMember', 'receipt', 'userSettings', 'notificationLog',
] as const;
export const NOT_BACKED_UP: Record<string, string> = {
  RevokedToken: 'only matters until the sessions it revokes expire (7 days)',
  PushSubscription: "a browser's push credentials; devices subscribe again from Settings",
};

/**
 * One-time codes, reset tokens and lockout counters: useless after a restore
 * and harmful in a leak. Password hashes stay, so accounts still sign in.
 */
export const USER_FIELDS_LEFT_OUT = [
  'verificationOtp', 'otpExpires', 'twoFactorOtp', 'twoFactorOtpExpires',
  'resetToken', 'resetTokenExpires', 'loginAttempts', 'lockUntil', 'otpAttempts',
] as const;

export const withoutUserSecrets = <T extends Record<string, unknown>>(user: T): Partial<T> => {
  const copy: Record<string, unknown> = { ...user };
  for (const field of USER_FIELDS_LEFT_OUT) delete copy[field];
  return copy as Partial<T>;
};

export interface ScryptParams { N: number; r: number; p: number }
/** About 128 MB and a fraction of a second: cheap once, costly to brute-force. */
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

export interface EncryptedDbBackup {
  format: typeof DB_BACKUP_FORMAT;
  v: 1;
  kdf: { name: 'scrypt' } & ScryptParams;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const deriveKey = (passphrase: string, salt: Buffer, { N, r, p }: ScryptParams) =>
  new Promise<Buffer>((resolve, reject) => {
    const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r + 1024 * 1024 };
    scryptCb(passphrase, salt, 32, options, (err, key) => (err ? reject(err) : resolve(key)));
  });

export const encryptDbBackup = async (plaintext: string, passphrase: string, params: ScryptParams = DEFAULT_SCRYPT): Promise<EncryptedDbBackup> => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, params);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    format: DB_BACKUP_FORMAT,
    v: 1,
    kdf: { name: 'scrypt', ...params },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
};

export const isEncryptedDbBackup = (value: unknown): value is EncryptedDbBackup =>
  !!value && typeof value === 'object' && (value as { format?: unknown }).format === DB_BACKUP_FORMAT;

export const decryptDbBackup = async (backup: EncryptedDbBackup, passphrase: string): Promise<string> => {
  const { kdf } = backup;
  if (backup.v !== 1 || kdf?.name !== 'scrypt') throw new Error('Unknown backup format version.');
  // Bounds keep a damaged or hostile file from asking for gigabytes of memory.
  if (![kdf.N, kdf.r, kdf.p].every(Number.isInteger) || kdf.N < 2 ** 10 || kdf.N > 2 ** 20 || kdf.r < 1 || kdf.r > 32 || kdf.p < 1 || kdf.p > 16) {
    throw new Error('The backup file is damaged (bad key parameters).');
  }
  const key = await deriveKey(passphrase, Buffer.from(backup.salt, 'base64'), kdf);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(backup.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(backup.tag, 'base64'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(backup.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Wrong passphrase, or the backup file was changed.');
  }
};
