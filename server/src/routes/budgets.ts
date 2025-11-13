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
    // This is a complex but powerful Prisma transaction.
    // It loops through all the budgets you sent.
    // For each one, it tries to "upsert" it.
    
    // 1. Connect to the user
    // 2. Find a budget with the same userId AND category
    // 3. If it finds one (update), it changes the amount.
    // 4. If it doesn't (create), it makes a new budget.
    
    const upsertTransactions = budgets.map(budget =>
      prisma.budget.upsert({
        where: {
          // This special '@@unique' index is from our schema
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

    // We also need to delete budgets that are no longer in the list
    // Get all categories that were just sent
    const activeCategories = budgets.map(b => b.category);
    
    // Delete any budget for this user where the category is NOT in the new list
    const deleteTransaction = prisma.budget.deleteMany({
      where: {
        userId: userId,
        category: {
          notIn: activeCategories,
        },
      },
    });

    // --- THIS IS THE FIX ---
    // We spread the array of upsert promises and add the single delete promise.
    // Do NOT wrap upsertTransactions in Promise.all()
    const transactionResults = await prisma.$transaction([
      ...upsertTransactions,
      deleteTransaction
    ]);

    // The results are an array. The upsert results are first, followed by the delete result.
    // We only care about the upsert results (which are all but the last item) to send back.
    const savedBudgets = transactionResults.slice(0, -1);

    res.status(200).json(savedBudgets);

  } catch (error) {
    console.error('Failed to save budgets:', error);
    res.status(500).json({ message: 'Failed to save budgets' });
  }
});

export default router;