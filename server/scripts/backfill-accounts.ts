/**
 * One-off backfill for the `account` field, which was added after the first
 * statements were already imported.
 *
 * Existing rows can't be told apart by paymentMethod alone: a Discover purchase
 * and a credit-union card purchase are both "Credit Card". This assigns each
 * historical row to its real source using the only signal that actually
 * separates them — whether the row came from a Discover statement.
 *
 *   DRY RUN (default, writes nothing):
 *     npx ts-node scripts/backfill-accounts.ts
 *   APPLY:
 *     npx ts-node scripts/backfill-accounts.ts --apply
 *
 * Point DATABASE_URL at whichever database you mean to touch, e.g.
 *   DATABASE_URL="<prod url>" npx ts-node scripts/backfill-accounts.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Labels used for the two real sources.
const DISCOVER = 'Discover';
const BANK = 'USCCU Checking';

/** `date|cents` — enough to identify a row, since no two Discover purchases
 *  share both (verified before the import). */
type Key = string;
const keyOf = (date: Date, cents: number): Key => `${date.toISOString().slice(0, 10)}|${cents}`;

async function main() {
  // The Discover rows are exactly those in the verified import payload.
  const payloadPath = path.resolve(__dirname, '../../../../Statements/discover-import.json');
  if (!fs.existsSync(payloadPath)) {
    console.error(`Could not find the Discover payload at:\n  ${payloadPath}\n` +
      'Pass its location by editing payloadPath, or re-generate it.');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8')) as {
    expenses: Array<{ date: string; amount: number }>;
    incomes: Array<{ date: string; amount: number }>;
  };

  const discoverExpenseKeys = new Set<Key>(
    payload.expenses.map((e) => `${e.date}|${Math.round((e.amount + Number.EPSILON) * 100)}`)
  );
  const discoverIncomeKeys = new Set<Key>(
    payload.incomes.map((e) => `${e.date}|${Math.round((e.amount + Number.EPSILON) * 100)}`)
  );

  const expenses = await prisma.expense.findMany({
    select: { id: true, date: true, amount: true, title: true, account: true },
  });
  const incomes = await prisma.income.findMany({
    select: { id: true, date: true, amount: true, title: true, account: true },
  });

  const plan: Array<{ model: 'expense' | 'income'; id: string; account: string; title: string }> = [];

  for (const e of expenses) {
    if (e.account) continue; // never overwrite an account already set
    const isDiscover = discoverExpenseKeys.has(keyOf(e.date, e.amount));
    plan.push({ model: 'expense', id: e.id, account: isDiscover ? DISCOVER : BANK, title: e.title });
  }
  for (const i of incomes) {
    if (i.account) continue;
    const isDiscover = discoverIncomeKeys.has(keyOf(i.date, i.amount));
    plan.push({ model: 'income', id: i.id, account: isDiscover ? DISCOVER : BANK, title: i.title });
  }

  const counts = plan.reduce<Record<string, number>>((acc, p) => {
    acc[p.account] = (acc[p.account] || 0) + 1;
    return acc;
  }, {});

  console.log(`rows needing an account: ${plan.length} (of ${expenses.length} expenses + ${incomes.length} incomes)`);
  for (const [account, n] of Object.entries(counts)) console.log(`  ${account}: ${n}`);
  console.log('\nsample:');
  for (const p of plan.slice(0, 8)) console.log(`  [${p.account}] ${p.title}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  let done = 0;
  for (const p of plan) {
    if (p.model === 'expense') {
      await prisma.expense.update({ where: { id: p.id }, data: { account: p.account } });
    } else {
      await prisma.income.update({ where: { id: p.id }, data: { account: p.account } });
    }
    done++;
  }
  console.log(`\napplied: ${done} rows updated.`);

  const remaining = await prisma.expense.count({ where: { account: null } });
  console.log(`expenses still without an account: ${remaining}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
