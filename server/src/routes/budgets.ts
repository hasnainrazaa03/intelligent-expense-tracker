import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// --- 1. Save All Budgets (Upsert) ---
// POST /api/budgets
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const budgets: { category: string; amount: number }[] = req.body;

  if (!Array.isArray(budgets)) {
    return res.status(400).json({ message: 'Request body must be an array of budgets' });
  }

  try {
    // We use an Interactive Transaction (async tx) for maximum reliability on MongoDB
    const savedBudgets = await prisma.$transaction(async (tx) => {
      // 1. Validation & Formatting
      const formattedBudgets = budgets.map(b => ({
        category: b.category?.trim(),
        amount: parseFloat(b.amount as any) || 0
      })).filter(b => b.category); // Remove any empty category names

      const activeCategories = formattedBudgets.map(b => b.category);

      // 2. Delete budgets no longer in the list FIRST
      // This "clears the path" for any potential category renames or shifts
      await tx.budget.deleteMany({
        where: {
          userId: userId,
          category: {
            notIn: activeCategories,
          },
        },
      });

      // 3. Upsert the current list
      // We use a loop inside the transaction to ensure each one is processed
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
      timeout: 10000 // Give the transaction 10s to complete
    });

    res.status(200).json(savedBudgets);

  } catch (error: any) {
    console.error('Failed to sync budgets:', error);
    res.status(500).json({ message: 'Failed to synchronize budgets' });
  }
});

export default router;