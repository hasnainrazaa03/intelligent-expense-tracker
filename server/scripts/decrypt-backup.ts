// Decrypts a backup made by `npm run db:backup`:
//   read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE
//   npm run db:decrypt-backup -- backups/orbit-db-<time>.enc.json [--out <file>]
// Writes the plain JSON next to it (name without .enc) unless --out says otherwise. The
// output holds everyone's data: delete it when you're done.
import { promises as fs } from 'fs';
import { decryptDbBackup, isEncryptedDbBackup } from '../src/utils/dbBackup';

async function main() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  const input = args.find((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
  if (!input || (outAt >= 0 && !out)) {
    console.error('Usage: npm run db:decrypt-backup -- <file.enc.json> [--out <file.json>]');
    process.exit(1);
  }
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!passphrase) {
    console.error('Set BACKUP_PASSPHRASE first:\n  read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE');
    process.exit(1);
  }

  const envelope = JSON.parse(await fs.readFile(input, 'utf8'));
  if (!isEncryptedDbBackup(envelope)) {
    console.error(`${input} isn't an encrypted Orbit database backup.`);
    process.exit(1);
  }
  const plaintext = await decryptDbBackup(envelope, passphrase);
  const target = out ?? (input.endsWith('.enc.json') ? `${input.slice(0, -'.enc.json'.length)}.json` : `${input}.json`);
  await fs.writeFile(target, plaintext, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log('Decrypted to', target, '(plain text: delete it when you are done)');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
