// One-time migration: convert existing Float dollar amounts to integer cents,
// in-place, for every money field. Idempotent via a marker document so a second
// run is a no-op (never double-multiplies). Run AFTER backing up:
//   npx ts-node scripts/backup-data.ts
//   npx ts-node scripts/migrate-to-cents.ts
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MARKER = 'money-as-cents';

// $round then $toInt so a float like 85.499999*100 lands on 8550 (int32).
const toCentsExpr = (field: string) => ({ $toInt: { $round: [{ $multiply: [field, 100] }, 0] } });
const nullableToCents = (field: string) => ({
  $cond: [{ $eq: [{ $ifNull: [field, null] }, null] }, null, toCentsExpr(field)],
});
const arrayToCents = (field: string) => ({
  $map: { input: { $ifNull: [field, []] }, as: 's', in: toCentsExpr('$$s') },
});

const pipelines: Record<string, Record<string, unknown>> = {
  Expense: { amount: toCentsExpr('$amount'), originalAmount: nullableToCents('$originalAmount'), splitShares: arrayToCents('$splitShares') },
  Income: { amount: toCentsExpr('$amount'), originalAmount: nullableToCents('$originalAmount') },
  Budget: { amount: toCentsExpr('$amount') },
  Semester: { totalTuition: toCentsExpr('$totalTuition') },
  TuitionInstallment: { amount: toCentsExpr('$amount') },
};

async function main() {
  const already = (await prisma.$runCommandRaw({ count: '_migrations', query: { name: MARKER } })) as { n?: number };
  if ((already?.n ?? 0) > 0) {
    console.log('Migration already applied (marker present). No-op.');
    return;
  }

  for (const [collection, set] of Object.entries(pipelines)) {
    const result = (await prisma.$runCommandRaw({
      update: collection,
      updates: [{ q: {}, u: [{ $set: set }], multi: true }],
    } as any)) as { n?: number; nModified?: number };
    console.log(`${collection}: matched ${result?.n ?? 0}, modified ${result?.nModified ?? 0}`);
  }

  await prisma.$runCommandRaw({ insert: '_migrations', documents: [{ name: MARKER, appliedAt: new Date().toISOString() }] });
  console.log('Marker written. Migration complete.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
