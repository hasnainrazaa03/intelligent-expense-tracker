/// <reference types="node" />
/**
 * One-off backfill for the `account` field, which was added after the first
 * statements were already imported.
 *
 * Existing rows can't be told apart by paymentMethod alone — a Discover
 * purchase and a credit-union card purchase are both "Credit Card". This
 * assigns each historical row to its real source, three ways:
 *
 *   Discover          rows from the six Discover statements (verified payload)
 *   USCCU Credit Card rows from the "Purchase Credit Card" section that the
 *                     bank PDF bundles alongside the checking account
 *   USCCU Checking    everything else (ACH, Zelle, ATM, debit, deposits)
 *
 * Matching is on (date, cents). Both reference sets were reconciled against the
 * statements before use, and the two are disjoint.
 *
 *   DRY RUN (default, writes nothing):
 *     DATABASE_URL="<url>" npx ts-node scripts/backfill-accounts.ts
 *   APPLY:
 *     DATABASE_URL="<url>" npx ts-node scripts/backfill-accounts.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const DISCOVER = 'Discover';
const CU_CARD = 'USCCU Credit Card';
const CHECKING = 'USCCU Checking';

const key = (date: string, cents: number) => `${date}|${cents}`;
const toCents = (n: number) => Math.round((n + Number.EPSILON) * 100);

async function main() {
  // --- reference set 1: the Discover import payload -------------------------
  // Desktop/Statements sits outside the repo; allow an override for other setups.
  const discoverPath =
    process.env.DISCOVER_PAYLOAD ||
    path.resolve(__dirname, '../../../../Statements/discover-import.json');
  if (!fs.existsSync(discoverPath)) {
    console.error(
      `Missing the Discover payload at:\n  ${discoverPath}\n` +
      'Set DISCOVER_PAYLOAD=/path/to/discover-import.json to point at it.'
    );
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(discoverPath, 'utf8')) as {
    expenses: Array<{ date: string; amount: number }>;
    incomes: Array<{ date: string; amount: number }>;
  };
  const discoverExpense = new Set(payload.expenses.map((e) => key(e.date, toCents(e.amount))));
  const discoverIncome = new Set(payload.incomes.map((e) => key(e.date, toCents(e.amount))));

  // --- reference set 2: the credit-union card section of the bank PDFs ------
  const cuPath = path.resolve(__dirname, 'cu-card-rows.json');
  const cuRows: Array<{ date: string; postDate: string; amount: number }> = fs.existsSync(cuPath)
    ? JSON.parse(fs.readFileSync(cuPath, 'utf8'))
    : [];
  // The importer may have taken either the transaction or the posting date, so
  // accept both.
  const cuCard = new Set<string>();
  for (const r of cuRows) {
    cuCard.add(key(r.date, toCents(r.amount)));
    cuCard.add(key(r.postDate, toCents(r.amount)));
  }

  const overlap = [...discoverExpense].filter((k) => cuCard.has(k));
  if (overlap.length) {
    console.error(`ABORT: ${overlap.length} rows match BOTH Discover and the credit-union card:`);
    overlap.slice(0, 5).forEach((k) => console.error('  ' + k));
    process.exit(1);
  }

  const expenses = await prisma.expense.findMany({ select: { id: true, date: true, amount: true, title: true, account: true } });
  const incomes = await prisma.income.findMany({ select: { id: true, date: true, amount: true, title: true, account: true } });

  const plan: Array<{ model: 'expense' | 'income'; id: string; account: string; title: string; date: string }> = [];

  for (const e of expenses) {
    if (e.account) continue; // never overwrite an account already set
    const k = key(e.date.toISOString().slice(0, 10), e.amount);
    const account = discoverExpense.has(k) ? DISCOVER : cuCard.has(k) ? CU_CARD : CHECKING;
    plan.push({ model: 'expense', id: e.id, account, title: e.title, date: k.split('|')[0] });
  }
  for (const i of incomes) {
    if (i.account) continue;
    const k = key(i.date.toISOString().slice(0, 10), i.amount);
    // Income never comes off a credit card.
    const account = discoverIncome.has(k) ? DISCOVER : CHECKING;
    plan.push({ model: 'income', id: i.id, account, title: i.title, date: k.split('|')[0] });
  }

  const counts = plan.reduce<Record<string, number>>((acc, p) => {
    acc[p.account] = (acc[p.account] || 0) + 1;
    return acc;
  }, {});

  console.log(`rows needing an account: ${plan.length} (of ${expenses.length} expenses + ${incomes.length} incomes)`);
  for (const [account, n] of Object.entries(counts)) console.log(`  ${account}: ${n}`);

  const cuMatched = plan.filter((p) => p.account === CU_CARD).length;
  console.log(`\ncredit-union card rows in the reference set: ${cuRows.length}; matched in the DB: ${cuMatched}`);
  console.log('\nsample:');
  for (const p of plan.slice(0, 6)) console.log(`  [${p.account}] ${p.date} ${p.title}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  let done = 0;
  for (const p of plan) {
    if (p.model === 'expense') await prisma.expense.update({ where: { id: p.id }, data: { account: p.account } });
    else await prisma.income.update({ where: { id: p.id }, data: { account: p.account } });
    done++;
  }
  console.log(`\napplied: ${done} rows updated.`);
  console.log(`expenses still without an account: ${await prisma.expense.count({ where: { account: null } })}`);
  console.log(`incomes still without an account:  ${await prisma.income.count({ where: { account: null } })}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
