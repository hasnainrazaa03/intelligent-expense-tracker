import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function backup() {
  const prisma = new PrismaClient();

  try {
    console.log('Starting database backup...\n');

    // SRV-M9: never write credentials (password/OTP/reset-token hashes) to a
    // plaintext backup file — a leaked backup would otherwise be a credential dump.
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        isVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const expenses = await prisma.expense.findMany();
    const incomes = await prisma.income.findMany();
    const budgets = await prisma.budget.findMany();
    const semesters = await prisma.semester.findMany();
    const installments = await prisma.tuitionInstallment.findMany();

    const backup = {
      exportedAt: new Date().toISOString(),
      counts: {
        users: users.length,
        expenses: expenses.length,
        incomes: incomes.length,
        budgets: budgets.length,
        semesters: semesters.length,
        tuitionInstallments: installments.length,
      },
      data: {
        users,
        expenses,
        incomes,
        budgets,
        semesters,
        tuitionInstallments: installments,
      },
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filePath = path.join(backupDir, `backup-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf-8');

    console.log('Backup complete!');
    console.log(`File: ${filePath}\n`);
    console.log('Record counts:');
    Object.entries(backup.counts).forEach(([collection, count]) => {
      console.log(`  ${collection}: ${count}`);
    });
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
