import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { toFinPrecision, parseFiniteFloat } from '../utils/math';
import { SERVER_CONFIG } from '../config';
import { sanitizeText } from '../utils/sanitize';
import { toCents, budgetToClient } from '../utils/money';

const router = Router();
router.use(authMiddleware);

// Maximum number of budget categories allowed
const MAX_BUDGET_CATEGORIES = 50;
const MAX_TEXT_LENGTH = SERVER_CONFIG.limits.maxTextLength;

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

  // 2. Validate + format up front (outside any DB call) so bad input returns a
  //    proper 400 instead of being swallowed as a 500 inside a transaction.
  const formattedBudgets: { category: string; amount: number }[] = [];
  for (const b of budgets) {
    const category = sanitizeText(b?.category);
    const parsedAmount = parseFiniteFloat(b?.amount as any);
    if (!category) {
      return res.status(400).json({ message: 'Budget category is required' });
    }
    if (category.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ message: `Budget category must be ${MAX_TEXT_LENGTH} characters or less` });
    }
    if (parsedAmount === null || parsedAmount < 0) {
      return res.status(400).json({ message: 'Budget amount must be zero or greater' });
    }
    formattedBudgets.push({ category, amount: toCents(toFinPrecision(parsedAmount)) });
  }

  // Collapse duplicate category names (last one wins) so a repeated key can't
  // cause a write conflict on the [userId, category] unique index.
  const byCategory = new Map<string, number>();
  for (const b of formattedBudgets) byCategory.set(b.category, b.amount);
  const activeCategories = [...byCategory.keys()];

  try {
    // Reconcile WITHOUT an interactive transaction. On MongoDB/Atlas a
    // multi-document transaction adds a commit round-trip that flakes over
    // Render's network — the writes land but the commit ack errors, so the user
    // sees a 500 on data that actually saved. This full-state reconcile is
    // idempotent (the client always sends the complete desired set), so plain
    // sequential writes are safe: a retry simply converges.

    // Delete categories no longer present (or all, if the list is explicitly empty).
    await prisma.budget.deleteMany({
      where: activeCategories.length === 0
        ? { userId }
        : { userId, category: { notIn: activeCategories } },
    });

    if (activeCategories.length === 0) {
      return res.status(200).json([]);
    }

    // Upsert each surviving category.
    const savedBudgets = await Promise.all(
      [...byCategory.entries()].map(([category, amount]) =>
        prisma.budget.upsert({
          where: { userId_category: { userId, category } },
          update: { amount },
          create: { category, amount, userId },
        })
      )
    );

    res.status(200).json(savedBudgets.map(budgetToClient));
  } catch (error: any) {
    // Log the real error server-side; never echo internal/Prisma messages to
    // the client (they leak engine internals and mislabel 500s as 400s).
    console.error('CRITICAL_BUDGET_SYNC_FAILURE:', error);
    res.status(500).json({ message: 'Failed to synchronize budgets' });
  }
});

export default router;