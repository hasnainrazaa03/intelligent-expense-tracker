import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { toFinPrecision, parseFiniteFloat, parseValidDate } from '../utils/math';

const router = Router();

// --- Protect all routes in this file ---
router.use(authMiddleware);

// S4: Input length limits
const MAX_TEXT_LENGTH = 500;

// --- 1. Create new Income ---
// POST /api/incomes
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { title, amount, category, date, notes, originalAmount, originalCurrency } = req.body;

  if (!title || !amount || !category || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // S4: Input length limits
  if (title.length > MAX_TEXT_LENGTH || category.length > MAX_TEXT_LENGTH || (notes && notes.length > MAX_TEXT_LENGTH)) {
    return res.status(400).json({ message: `Text fields must be ${MAX_TEXT_LENGTH} characters or less` });
  }

  const parsedAmount = parseFiniteFloat(amount);
  if (parsedAmount === null || parsedAmount < 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ message: 'Invalid date' });
  }

  try {
    const newIncome = await prisma.income.create({
      data: {
        title: title.trim(),
        amount: toFinPrecision(parsedAmount),
        category: category.trim(),
        date: parsedDate,
        notes: notes?.trim() || undefined,
        originalAmount: originalAmount ? toFinPrecision(parseFiniteFloat(originalAmount) ?? 0) : undefined,
        originalCurrency: originalCurrency || undefined,
        userId: userId,
      },
    });
    
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

  if (!title || !amount || !category || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const parsedAmount = parseFiniteFloat(amount);
  if (parsedAmount === null || parsedAmount < 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ message: 'Invalid date' });
  }

  try {
    const updatedIncome = await prisma.income.update({
      where: {
        id: incomeId,
        userId: userId,
      },
      data: {
        title: title?.trim(),
        amount: toFinPrecision(parsedAmount),
        category: category?.trim(),
        date: parsedDate,
        notes: notes?.trim() || undefined,
        originalAmount: originalAmount ? toFinPrecision(parseFiniteFloat(originalAmount) ?? 0) : undefined,
        originalCurrency: originalCurrency || undefined,
      },
    });

    res.json({
      ...updatedIncome,
      date: updatedIncome.date.toISOString().split('T')[0]
    });
  } catch (error: any) {
    console.error('Failed to update income:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Income not found' });
    }
    res.status(500).json({ message: 'Failed to update income' });
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
        userId: userId,
      },
    });

    res.status(200).json({ success: true, message: 'Income deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete income:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Income not found' });
    }
    res.status(500).json({ message: 'Failed to delete income' });
  }
});

export default router;