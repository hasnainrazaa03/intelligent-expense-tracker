/**
 * Demo data seeder — populates rich, realistic history for the test account so
 * charts, budgets, reports, pivots, and the tuition tracker all have something
 * to show. Idempotent: it wipes the test user's existing expenses/incomes/
 * budgets/semesters first, then reseeds ~8 months.
 *
 *   cd server && npx ts-node scripts/seed-demo.ts [email]
 *
 * Defaults to test@test.com.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = process.argv[2] || 'test@test.com';
const MONTHS_BACK = 7; // current month + 7 prior = 8 months of history

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const money = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
// Date at a given month offset (0 = current) and day-of-month.
const dateAt = (monthsAgo: number, day: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(Math.min(day, 28));
  d.setHours(12, 0, 0, 0);
  return d;
};

// category → [titles], monthly cadence, and per-hit amount range (USD).
const EXPENSE_PLAN: Array<{
  category: string; titles: string[]; perMonth: [number, number]; amount: [number, number]; recurring?: boolean;
}> = [
  { category: 'Housing', titles: ['Monthly rent', 'Apartment rent'], perMonth: [1, 1], amount: [1350, 1450], recurring: true },
  { category: 'Housing', titles: ['Electricity', 'Internet', 'Water bill'], perMonth: [2, 3], amount: [35, 90] },
  { category: 'Food', titles: ['Trader Joes', 'Grocery run', 'Whole Foods', 'Costco'], perMonth: [3, 5], amount: [45, 130] },
  { category: 'Food', titles: ['Dining out', 'Coffee', 'Lunch', 'Boba', 'Late-night eats'], perMonth: [5, 9], amount: [8, 42] },
  { category: 'Transportation', titles: ['Metro pass', 'Rideshare', 'Gas', 'Fryft ride'], perMonth: [3, 6], amount: [12, 55] },
  { category: 'Education', titles: ['Textbooks', 'Course materials', 'Lab fee', 'Software license'], perMonth: [0, 2], amount: [30, 180] },
  { category: 'Healthcare', titles: ['Pharmacy', 'Copay', 'Dental'], perMonth: [0, 2], amount: [15, 120] },
  { category: 'Personal', titles: ['Netflix', 'Spotify', 'Gym', 'Haircut', 'iCloud'], perMonth: [2, 4], amount: [10, 45], recurring: true },
  { category: 'Travel', titles: ['Flight home', 'Weekend trip', 'Hotel'], perMonth: [0, 1], amount: [120, 480] },
  { category: 'Miscellaneous', titles: ['Amazon order', 'Gift', 'Misc'], perMonth: [1, 3], amount: [12, 75] },
];

const INCOME_PLAN: Array<{ category: string; titles: string[]; perMonth: [number, number]; amount: [number, number] }> = [
  { category: 'Salary', titles: ['TA stipend', 'Research assistantship'], perMonth: [1, 1], amount: [2100, 2100] },
  { category: 'Freelance', titles: ['Freelance project', 'Consulting'], perMonth: [0, 1], amount: [250, 900] },
  { category: 'Other', titles: ['Cashback', 'Refund', 'Gift'], perMonth: [0, 1], amount: [20, 150] },
];

const BUDGETS: Record<string, number> = {
  Housing: 1500,
  Food: 650,
  Transportation: 180,
  Education: 150,
  Personal: 120,
  Healthcare: 100,
  Travel: 200,
};

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    throw new Error(`No user with email ${EMAIL}. Register/log in once, then re-run.`);
  }
  const userId = user.id;
  console.log(`Seeding demo data for ${EMAIL} (${userId})…`);

  // Clean slate for this user.
  await prisma.tuitionInstallment.deleteMany({ where: { semesterUserId: userId } });
  await prisma.semester.deleteMany({ where: { userId } });
  await prisma.expense.deleteMany({ where: { userId } });
  await prisma.income.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });

  // Expenses
  const expenses: any[] = [];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    for (const plan of EXPENSE_PLAN) {
      const n = Math.round(rand(plan.perMonth[0], plan.perMonth[1]));
      for (let i = 0; i < n; i++) {
        expenses.push({
          userId,
          title: pick(plan.titles),
          amount: money(rand(plan.amount[0], plan.amount[1])),
          category: plan.category,
          date: dateAt(m, Math.round(rand(1, 28))),
          paymentMethod: pick(['Card', 'Card', 'Cash', 'Transfer']),
          isRecurring: !!plan.recurring,
          tags: [],
          splitParticipants: [],
          splitShares: [],
        });
      }
    }
  }
  await prisma.expense.createMany({ data: expenses });

  // Incomes
  const incomes: any[] = [];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    for (const plan of INCOME_PLAN) {
      const n = Math.round(rand(plan.perMonth[0], plan.perMonth[1]));
      for (let i = 0; i < n; i++) {
        incomes.push({
          userId,
          title: pick(plan.titles),
          amount: money(rand(plan.amount[0], plan.amount[1])),
          category: plan.category,
          date: dateAt(m, pick([1, 15, 28])),
          tags: [],
        });
      }
    }
  }
  await prisma.income.createMany({ data: incomes });

  // Budgets
  for (const [category, amount] of Object.entries(BUDGETS)) {
    await prisma.budget.create({ data: { userId, category, amount } });
  }

  // Tuition — one Bursar semester with a 4-installment plan (2 paid).
  const semesterId = 'fall-2026';
  await prisma.semester.create({
    data: { id: semesterId, userId, name: 'Fall 2026', totalTuition: 24000 },
  });
  const per = 6000;
  for (let i = 0; i < 4; i++) {
    const paid = i < 2;
    await prisma.tuitionInstallment.create({
      data: {
        semesterId,
        semesterUserId: userId,
        amount: per,
        status: paid ? 'paid' : 'unpaid',
        paidDate: paid ? dateAt(2 - i, 5) : null,
      },
    });
  }

  const [ec, ic] = [expenses.length, incomes.length];
  console.log(`Done: ${ec} expenses, ${ic} incomes, ${Object.keys(BUDGETS).length} budgets, 1 semester (4 installments).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
