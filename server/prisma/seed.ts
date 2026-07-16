// server/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean up existing data for a true "clean slate"
  await prisma.tuitionInstallment.deleteMany({});
  await prisma.semester.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.income.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create a Test User
  const hashedPassword = await bcrypt.hash('TrojanPassword123!', 10);
  const user = await prisma.user.create({
    data: {
      email: 'tester@usc.edu',
      password: hashedPassword,
      isVerified: true,
    },
  });

  console.log(`✅ User created: ${user.email}`);

  // 3. Create a Budget
  await prisma.budget.create({
    data: {
      category: 'Food',
      amount: 50000, // $500 in integer cents
      userId: user.id,
    },
  });

  // 4. Create some Expenses & Incomes
  await prisma.expense.create({
    data: {
      title: 'Trader Joes Run',
      amount: 8550, // $85.50 in integer cents
      category: 'Food',
      date: new Date(),
      userId: user.id,
    },
  });

  await prisma.income.create({
    data: {
      title: 'Monthly Stipend',
      amount: 200000, // $2,000 in integer cents
      category: 'Scholarship',
      date: new Date(),
      userId: user.id,
    },
  });

  // 5. Schema Stress Test: USC Semester & Installments
  // This tests your complex composite key relationship
  const semester = await prisma.semester.create({
    data: {
      id: 'fall-2025',
      name: 'Fall 2025',
      totalTuition: 3000000, // $30,000 in integer cents
      userId: user.id,
      installments: {
        create: [
          { amount: 750000, status: 'paid', paidDate: new Date() },
          { amount: 750000, status: 'unpaid' },
          { amount: 750000, status: 'unpaid'},
          { amount: 750000, status: 'unpaid'},
        ]
      }
    },
  });

  console.log('✅ Seed data successfully deployed.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });