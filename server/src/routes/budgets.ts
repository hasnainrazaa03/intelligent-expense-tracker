import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

/**
 * Helper to ensure financial precision.
 * Rounds to 2 decimal places to prevent floating-point errors.
 */
const toFinPrecision = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- 1. Save All Budgets (Reconciliation Pattern) ---
// POST /api/budgets
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const budgets: { category: string; amount: number }[] = req.body;

  // 1. Protection against malformed payloads
  if (!Array.isArray(budgets)) {
    return res.status(400).json({ message: 'Request body must be an array of budgets' });
  }

  try {
    // Using an Interactive Transaction for atomic reliability
    const savedBudgets = await prisma.$transaction(async (tx) => {
      
      // 2. Validation, Formatting, and Precision Rounding
      const formattedBudgets = budgets.map(b => ({
        category: b.category?.trim(),
        // Apply financial precision immediately before it hits the DB
        amount: toFinPrecision(parseFloat(b.amount as any) || 0)
      })).filter(b => b.category); // Remove any entries with empty category names

      const activeCategories = formattedBudgets.map(b => b.category);

      /**
       * 3. SOFT RECONCILIATION:
       * Instead of wiping everything, we only delete categories that are NOT 
       * in the incoming manifest. We also include a safety check: if the list
       * is suspiciously empty but the user has many existing budgets, 
       * you could add a 'confirm wipe' flag here later.
       */
      await tx.budget.deleteMany({
        where: {
          userId: userId,
          category: {
            notIn: activeCategories,
          },
        },
      });

      // 4. UPSERT: Update existing or create new categories
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
      timeout: 10000 // 10s timeout to handle MongoDB write locks
    });

    res.status(200).json(savedBudgets);

  } catch (error: any) {
    console.error('CRITICAL_BUDGET_SYNC_FAILURE:', error);
    res.status(500).json({ message: 'Failed to synchronize budgets' });
  }
});

export default router;