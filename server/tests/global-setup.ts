import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Once per run: give the API tests an empty database with the current schema.
// It DROPS that database, so it refuses anything that isn't clearly a local
// test database.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('\n[server tests] TEST_DATABASE_URL is not set, so the API tests are skipped (unit tests still run).\n');
    return;
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (url.startsWith('mongodb+srv://') || !/test/i.test(dbName)) {
    throw new Error(`TEST_DATABASE_URL must be a local database whose name contains "test" (got "${dbName}"). It is dropped before every run.`);
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$runCommandRaw({ dropDatabase: 1 });
  await prisma.$disconnect();
  execSync('npx prisma db push --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
