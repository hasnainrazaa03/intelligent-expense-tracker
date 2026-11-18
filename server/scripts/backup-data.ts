// Whole-database backup to an encrypted file in server/backups/ (A6, SRV-M9).
// Take one before any risky migration. The passphrase comes from the
// environment; reading it with `read -s` keeps it out of your shell history:
//   read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE
//   npm run db:backup
// Keep the passphrase somewhere safe (a password manager): without it the file
// can't be opened. To read it back: npm run db:decrypt-backup -- <file>
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { BACKED_UP_MODELS, MIN_BACKUP_PASSPHRASE_LENGTH, encryptDbBackup, withoutUserSecrets } from '../src/utils/dbBackup';

const prisma = new PrismaClient();

async function main() {
  const passphrase = process.env.BACKUP_PASSPHRASE ?? '';
  if (passphrase.length < MIN_BACKUP_PASSPHRASE_LENGTH) {
    console.error(`Set BACKUP_PASSPHRASE (at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters) first:\n  read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE`);
    process.exit(1);
  }

  const collections: Record<string, unknown[]> = {};
  for (const model of BACKED_UP_MODELS) {
    const rows = await (prisma[model] as unknown as { findMany: () => Promise<Record<string, unknown>[]> }).findMany();
    collections[model] = model === 'user' ? rows.map(withoutUserSecrets) : rows;
  }
  const counts = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length]));
  const dump = { takenAt: new Date().toISOString(), counts, ...collections };

  const envelope = await encryptDbBackup(JSON.stringify(dump), passphrase);
  const dir = path.join(process.cwd(), 'backups');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `orbit-db-${stamp}.enc.json`);
  await fs.writeFile(file, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
  console.log('Encrypted backup written:', file);
  console.log('Counts:', JSON.stringify(counts));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
