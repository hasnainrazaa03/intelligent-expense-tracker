import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// --- Protect all routes in this file ---
router.use(authMiddleware);

// --- 1. Create new Income ---
// POST /api/incomes
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { title, amount, category, date, notes, originalAmount, originalCurrency } = req.body;

  if (!title || !amount || !category || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newIncome = await prisma.income.create({
      data: {
        title,
        amount: parseFloat(amount),
        category,
        date: new Date(date), // Convert ISO string to Date
        notes,
        originalAmount: originalAmount ? parseFloat(originalAmount) : undefined,
        originalCurrency,
        userId: userId, // Link to the logged-in user
      },
    });
    
    // Return the new income (with the correct date format)
    res.status(201).json({
      ...newIncome,
      date: newIncome.date.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Failed to create income:', error);
    res.status(500).json({ message: 'Failed to create income' });
  }
});

// --- 2. Update an Income ---
// PUT /api/incomes/:id
router.put('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomeId = req.params.id;
  const { title, amount, category, date, notes, originalAmount, originalCurrency } = req.body;

  try {
    const updatedIncome = await prisma.income.update({
      where: {
        id: incomeId,
        userId: userId, // Ensures user can only update their *own* income
      },
      data: {
        title,
        amount: parseFloat(amount),
        category,
        date: new Date(date),
        notes,
        originalAmount: originalAmount ? parseFloat(originalAmount) : undefined,
        originalCurrency,
      },
    });

    res.json({
      ...updatedIncome,
      date: updatedIncome.date.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Failed to update income:', error);
    res.status(404).json({ message: 'Income not found or failed to update' });
  }
});


// --- 3. Delete an Income ---
// DELETE /api/incomes/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomeId = req.params.id;

  try {
    await prisma.income.delete({
      where: {
        id: incomeId,
        userId: userId, // Ensures user can only delete their *own* income
      },
    });

    res.status(204).send(); // 204 No Content
  } catch (error) {
    console.error('Failed to delete income:', error);
    res.status(404).json({ message: 'Income not found or failed to delete' });
  }
});

export default router;