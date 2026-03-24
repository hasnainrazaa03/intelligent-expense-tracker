import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { parseFiniteFloat, parseValidDate, toFinPrecision } from '../utils/math';

const router = Router();

router.use(authMiddleware);

const MAX_TEXT_LENGTH = 500;
const MAX_ITEMS = 5000;

// --- Get All User Data ---
// GET /api/data/all
router.get('/all', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    const [expenses, incomes, budgets, semesters] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ 
        where: { userId },
        include: { installments: true }
      }),
    ]);
    
    // Safely adjust date formats
    const cleanDate = (item: { date: Date | null }) => ({
      ...item,
      date: item.date ? item.date.toISOString().split('T')[0] : null
    });
    
    const cleanPaidDate = (semester: any) => ({
      ...semester,
      installments: semester.installments.map((inst: any) => ({
        ...inst,
        paidDate: inst.paidDate ? inst.paidDate.toISOString().split('T')[0] : null
      }))
    });

    res.json({
      expenses: expenses.map(cleanDate),
      incomes: incomes.map(cleanDate),
      budgets,
      semesters: semesters.map(cleanPaidDate),
    });

  } catch (error) {
    console.error('Failed to fetch all data:', error);
    res.status(500).json({ message: 'Failed to fetch data' });
  }
});

// --- Restore All User Data from Backup ---
// POST /api/data/restore
router.post('/restore', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { expenses = [], incomes = [], budgets = [], semesters = [] } = req.body || {};

  if (!Array.isArray(expenses) || !Array.isArray(incomes) || !Array.isArray(budgets) || !Array.isArray(semesters)) {
    return res.status(400).json({ message: 'Invalid backup format: expenses, incomes, budgets, semesters must be arrays.' });
  }

  if (expenses.length > MAX_ITEMS || incomes.length > MAX_ITEMS || budgets.length > MAX_ITEMS || semesters.length > MAX_ITEMS) {
    return res.status(400).json({ message: `Backup is too large. Maximum ${MAX_ITEMS} entries per section.` });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Clear existing user data first; order avoids FK issues.
      await tx.expense.deleteMany({ where: { userId } });
      await tx.income.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });
      await tx.semester.deleteMany({ where: { userId } });

      const cleanExpenses = expenses.map((e: any, idx: number) => {
        const amount = parseFiniteFloat(e.amount);
        const date = parseValidDate(e.date);
        if (!e.title || !e.category || amount === null || !date) {
          throw new Error(`Invalid expense at index ${idx}`);
        }
        if (String(e.title).length > MAX_TEXT_LENGTH || String(e.category).length > MAX_TEXT_LENGTH || (e.notes && String(e.notes).length > MAX_TEXT_LENGTH)) {
          throw new Error(`Expense text too long at index ${idx}`);
        }
        return {
          title: String(e.title).trim(),
          amount: toFinPrecision(amount),
          category: String(e.category).trim(),
          date,
          paymentMethod: e.paymentMethod ? String(e.paymentMethod).trim() : undefined,
          notes: e.notes ? String(e.notes).trim() : undefined,
          originalAmount: e.originalAmount != null ? toFinPrecision(parseFiniteFloat(e.originalAmount) ?? 0) : undefined,
          originalCurrency: e.originalCurrency ? String(e.originalCurrency) : undefined,
          isRecurring: Boolean(e.isRecurring),
          userId,
        };
      });

      const cleanIncomes = incomes.map((i: any, idx: number) => {
        const amount = parseFiniteFloat(i.amount);
        const date = parseValidDate(i.date);
        if (!i.title || !i.category || amount === null || !date) {
          throw new Error(`Invalid income at index ${idx}`);
        }
        if (String(i.title).length > MAX_TEXT_LENGTH || String(i.category).length > MAX_TEXT_LENGTH || (i.notes && String(i.notes).length > MAX_TEXT_LENGTH)) {
          throw new Error(`Income text too long at index ${idx}`);
        }
        return {
          title: String(i.title).trim(),
          amount: toFinPrecision(amount),
          category: String(i.category).trim(),
          date,
          notes: i.notes ? String(i.notes).trim() : undefined,
          originalAmount: i.originalAmount != null ? toFinPrecision(parseFiniteFloat(i.originalAmount) ?? 0) : undefined,
          originalCurrency: i.originalCurrency ? String(i.originalCurrency) : undefined,
          userId,
        };
      });

      const cleanBudgets = budgets
        .map((b: any, idx: number) => {
          const amount = parseFiniteFloat(b.amount);
          if (!b.category || amount === null) {
            throw new Error(`Invalid budget at index ${idx}`);
          }
          return {
            category: String(b.category).trim(),
            amount: toFinPrecision(amount),
            userId,
          };
        })
        .filter((b: any) => b.category);

      if (cleanExpenses.length > 0) {
        await tx.expense.createMany({ data: cleanExpenses });
      }
      if (cleanIncomes.length > 0) {
        await tx.income.createMany({ data: cleanIncomes });
      }
      if (cleanBudgets.length > 0) {
        await tx.budget.createMany({ data: cleanBudgets });
      }

      for (let sIdx = 0; sIdx < semesters.length; sIdx++) {
        const sem = semesters[sIdx];
        if (!sem?.id || !sem?.name || !Array.isArray(sem.installments)) {
          throw new Error(`Invalid semester at index ${sIdx}`);
        }
        const totalTuition = toFinPrecision(parseFiniteFloat(sem.totalTuition) ?? 0);

        await tx.semester.create({
          data: {
            id: String(sem.id),
            name: String(sem.name).trim(),
            totalTuition,
            userId,
            installments: {
              create: sem.installments.map((inst: any, iIdx: number) => {
                const amount = parseFiniteFloat(inst.amount);
                if (amount === null) {
                  throw new Error(`Invalid installment at semester ${sIdx}, index ${iIdx}`);
                }
                const paidDate = inst.paidDate ? parseValidDate(inst.paidDate) : null;
                if (inst.paidDate && !paidDate) {
                  throw new Error(`Invalid installment date at semester ${sIdx}, index ${iIdx}`);
                }
                return {
                  amount: toFinPrecision(amount),
                  status: inst.status === 'paid' ? 'paid' : 'unpaid',
                  expenseId: inst.expenseId ? String(inst.expenseId) : null,
                  paidDate,
                };
              }),
            },
          },
        });
      }
    }, { timeout: 20000 });

    const [restoredExpenses, restoredIncomes, restoredBudgets, restoredSemesters] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ where: { userId }, include: { installments: true } }),
    ]);

    const cleanDate = (item: { date: Date | null }) => ({
      ...item,
      date: item.date ? item.date.toISOString().split('T')[0] : null,
    });
    const cleanPaidDate = (semester: any) => ({
      ...semester,
      installments: semester.installments.map((inst: any) => ({
        ...inst,
        paidDate: inst.paidDate ? inst.paidDate.toISOString().split('T')[0] : null,
      })),
    });

    res.status(200).json({
      message: 'Backup restored successfully.',
      expenses: restoredExpenses.map(cleanDate),
      incomes: restoredIncomes.map(cleanDate),
      budgets: restoredBudgets,
      semesters: restoredSemesters.map(cleanPaidDate),
    });
  } catch (error: any) {
    console.error('Backup restore failed:', error);
    res.status(400).json({ message: error.message || 'Failed to restore backup.' });
  }
});

export default router;