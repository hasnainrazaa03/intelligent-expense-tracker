/**
 * Create (or reset) the account the end-to-end tests sign in with: verified,
 * 2FA off, not locked out. CI runs it on a fresh database before seed-demo.ts.
 *
 *   cd server && npx ts-node --transpile-only scripts/ensure-test-user.ts [email] [password]
 *
 * Defaults to test@test.com / Test1234!. It sets a known password, so it refuses
 * to run in production or against a hosted (mongodb+srv, e.g. Atlas) database.
 */
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Load server/.env NOW, so the check below sees the URL Prisma will use.
// Prisma reads .env itself when the client starts, which used to be after the
// check: with no DATABASE_URL exported and an Atlas URL in .env, the check
// passed and the script reset test accounts on the hosted database.
dotenv.config();

const url = process.env.DATABASE_URL || '';
if (process.env.NODE_ENV === 'production' || url.startsWith('mongodb+srv://')) {
  console.error('Refusing to create a test account in production or on a hosted database.');
  process.exit(1);
}

const prisma = new PrismaClient();
const email = (process.argv[2] || 'test@test.com').trim().toLowerCase();
const password = process.argv[3] || 'Test1234!';

(async () => {
  const hash = await bcrypt.hash(password, 10);
  const reset = { password: hash, isVerified: true, twoFactorEnabled: false, loginAttempts: 0, lockUntil: null, otpAttempts: 0 };
  await prisma.user.upsert({ where: { email }, create: { email, ...reset }, update: reset });
  console.log(`Test account ready: ${email}`);
})()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
