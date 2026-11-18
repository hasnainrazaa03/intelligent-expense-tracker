// Passphrase-protected backups (B9). A full backup holds every transaction, so
// it can be encrypted before it leaves the browser: the passphrase derives an
// AES-256-GCM key with PBKDF2-SHA256, and the file holds only the ciphertext
// plus what's needed to derive the key again. Orbit never sees the passphrase;
// forgetting it means the backup can't be opened.
//
// The file is still JSON (so "Restore full backup" accepts it), shaped like:
// { format: 'orbit-backup-encrypted', v: 1, kdf: 'PBKDF2-SHA256', iterations, salt, iv, data }
// with salt, iv and data in base64. Plain backups keep working unchanged.

export const ENCRYPTED_BACKUP_FORMAT = 'orbit-backup-encrypted';
export const MIN_PASSPHRASE_LENGTH = 8;
/** OWASP's 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
// A file asking for more would hang the tab for minutes; fewer would be weak.
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;

export interface EncryptedBackup {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

/** The passphrase didn't open the backup (or the file was changed). */
export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase doesn't open this backup.");
    this.name = 'WrongPassphraseError';
  }
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  // In chunks: spreading a few MB into fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const deriveKey = async (passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number, usage: KeyUsage) => {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
};

export const isEncryptedBackup = (value: unknown): value is EncryptedBackup => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.format === ENCRYPTED_BACKUP_FORMAT && typeof v.salt === 'string' && typeof v.iv === 'string' && typeof v.data === 'string';
};

/** Encrypts a backup's JSON text with a passphrase. */
export const encryptBackup = async (plaintext: string, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedBackup> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
};

/** Returns the backup's JSON text; throws WrongPassphraseError if it doesn't open. */
export const decryptBackup = async (backup: EncryptedBackup, passphrase: string): Promise<string> => {
  if (backup.v !== 1 || backup.kdf !== 'PBKDF2-SHA256') {
    throw new Error('This backup was made by a newer version of Orbit. Reload the page and try again.');
  }
  const { iterations } = backup;
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error("This encrypted backup is damaged and can't be opened.");
  }
  let salt: Uint8Array<ArrayBuffer>;
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(backup.salt);
    iv = fromBase64(backup.iv);
    data = fromBase64(backup.data);
  } catch {
    throw new Error("This encrypted backup is damaged and can't be opened.");
  }
  const key = await deriveKey(passphrase, salt, iterations, 'decrypt');
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plaintext);
  } catch {
    // GCM can't tell a wrong key from a changed file; the wrong key is far likelier.
    throw new WrongPassphraseError();
  }
};
