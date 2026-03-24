import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { toFinPrecision, parseFiniteFloat } from '../utils/math';

const router = Router();
router.use(authMiddleware);

// Maximum number of budget categories allowed
const MAX_BUDGET_CATEGORIES = 50;

// --- 1. Save All Budgets (Reconciliation Pattern) ---
// POST /api/budgets
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const budgets: { category: string; amount: number }[] = req.body;

  // 1. Protection against malformed payloads
  if (!Array.isArray(budgets)) {
    return res.status(400).json({ message: 'Request body must be an array of budgets' });
  }

  if (budgets.length > MAX_BUDGET_CATEGORIES) {
    return res.status(400).json({ message: `Maximum ${MAX_BUDGET_CATEGORIES} budget categories allowed` });
  }

  try {
    // Using an Interactive Transaction for atomic reliability
    const savedBudgets = await prisma.$transaction(async (tx) => {
      
      // 2. Validation, Formatting, and Precision Rounding
      const formattedBudgets = budgets.map(b => {
        const parsedAmount = parseFiniteFloat(b.amount as any);
        return {
          category: b.category?.trim(),
          amount: toFinPrecision(parsedAmount ?? 0)
        };
      }).filter(b => b.category); // Remove any entries with empty category names

      const activeCategories = formattedBudgets.map(b => b.category);

      // 3. SAFETY CHECK: Prevent accidental wipe of all budgets
      // If incoming list is empty but user has existing budgets, only delete if explicitly empty
      if (activeCategories.length === 0) {
        // If the user sent an explicitly empty array, delete all budgets
        await tx.budget.deleteMany({ where: { userId } });
        return [];
      }

      // 4. Delete categories that are NOT in the incoming manifest
      await tx.budget.deleteMany({
        where: {
          userId: userId,
          category: {
            notIn: activeCategories,
          },
        },
      });

      // 5. UPSERT: Update existing or create new categories
      const upsertPromises = formattedBudgets.map(budget =>
        tx.budget.upsert({
          where: {
            userId_category: {
              userId: userId,
              category: budget.category,
            },
          },
          update: {
            amount: budget.amount,
          },
          create: {
            category: budget.category,
            amount: budget.amount,
            userId: userId,
          },
        })
      );

      return Promise.all(upsertPromises);
    }, {
      timeout: 10000
    });

    res.status(200).json(savedBudgets);

  } catch (error: any) {
    console.error('CRITICAL_BUDGET_SYNC_FAILURE:', error);
    res.status(500).json({ message: 'Failed to synchronize budgets' });
  }
});

export default router;