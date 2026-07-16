// One-off full-database backup to a timestamped JSON file. Run BEFORE the
// money-as-cents migration so the pre-migration state can be restored.
//   npx ts-node scripts/backup-data.ts
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const [users, expenses, incomes, budgets, semesters, installments] = await Promise.all([
    prisma.user.findMany(),
    prisma.expense.findMany(),
    prisma.income.findMany(),
    prisma.budget.findMany(),
    prisma.semester.findMany(),
    prisma.tuitionInstallment.findMany(),
  ]);

  const dump = { takenAt: new Date().toISOString(), counts: {
    users: users.length, expenses: expenses.length, incomes: incomes.length,
    budgets: budgets.length, semesters: semesters.length, installments: installments.length,
  }, users, expenses, incomes, budgets, semesters, installments };

  const dir = path.join(process.cwd(), 'backups');
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `pre-cents-migration-${stamp}.json`);
  await fs.writeFile(file, JSON.stringify(dump, null, 2), 'utf8');
  console.log('Backup written:', file);
  console.log('Counts:', JSON.stringify(dump.counts));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
