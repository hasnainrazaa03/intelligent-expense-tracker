import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware} from '../middleware/auth';
import { Expense } from '../types';
import { toFinPrecision, parseFiniteFloat, parseValidDate } from '../utils/math';
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';

const router = Router();

// --- Protect all routes in this file ---
router.use(authMiddleware);

// Maximum bulk import size
const MAX_BULK_SIZE = SERVER_CONFIG.limits.maxBulkImportSize;
// S4: Input length limits
const MAX_TEXT_LENGTH = SERVER_CONFIG.limits.maxTextLength;

// --- 1. Create new Expense ---
// POST /api/expenses
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { title, amount, category, date, paymentMethod, notes, originalAmount, originalCurrency, isRecurring } = req.body;

  // Basic validation
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
    const newExpense = await prisma.expense.create({
      data: {
        title: title.trim(),
        amount: toFinPrecision(parsedAmount),
        category: category.trim(),
        date: parsedDate,
        paymentMethod: paymentMethod?.trim() || undefined,
        notes: notes?.trim() || undefined,
        originalAmount: originalAmount ? toFinPrecision(parseFiniteFloat(originalAmount) ?? 0) : undefined,
        originalCurrency: originalCurrency || undefined,
        isRecurring: Boolean(isRecurring),
        userId: userId,
      },
    });
    
    res.status(201).json({
      ...newExpense,
      date: newExpense.date.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Failed to create expense:', error);
    res.status(500).json({ message: 'Failed to create expense' });
  }
});

// --- 2. Update an Expense ---
// PUT /api/expenses/:id
router.put('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const expenseId = req.params.id;
  const { title, amount, category, date, paymentMethod, notes, originalAmount, originalCurrency, isRecurring } = req.body;

  // Required-field validation (same as POST)
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
    const updatedExpense = await prisma.expense.update({
      where: {
        id: expenseId,
        userId: userId,
      },
      data: {
        title: title?.trim(),
        amount: toFinPrecision(parsedAmount),
        category: category?.trim(),
        date: parsedDate,
        paymentMethod: paymentMethod?.trim() || undefined,
        notes: notes?.trim() || undefined,
        originalAmount: originalAmount ? toFinPrecision(parseFiniteFloat(originalAmount) ?? 0) : undefined,
        originalCurrency: originalCurrency || undefined,
        isRecurring: Boolean(isRecurring),
      },
    });

    res.json({
      ...updatedExpense,
      date: updatedExpense.date.toISOString().split('T')[0]
    });
  } catch (error: any) {
    console.error('Failed to update expense:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.status(500).json({ message: 'Failed to update expense' });
  }
});


// --- 3. Delete an Expense ---
// DELETE /api/expenses/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const expenseId = req.params.id;

  try {
    await prisma.expense.delete({
      where: {
        id: expenseId,
        userId: userId,
      },
    });

    await writeAuditLog({
      action: 'expense_delete',
      userId,
      success: true,
      route: '/api/expenses/:id',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { expenseId },
    });

    res.status(200).json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete expense:', error);

    await writeAuditLog({
      action: 'expense_delete',
      userId,
      success: false,
      route: '/api/expenses/:id',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { expenseId, error: error?.message || 'unknown' },
    });

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.status(500).json({ message: 'Failed to delete expense' });
  }
});

// --- 4. Create Multiple Expenses (Bulk Import) ---
// POST /api/expenses/bulk
router.post('/bulk', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const expenses = req.body as Omit<Expense, 'id'>[];

  if (!Array.isArray(expenses) || expenses.length === 0) {
    return res.status(400).json({ message: 'Request body must be a non-empty array of expenses' });
  }

  if (expenses.length > MAX_BULK_SIZE) {
    return res.status(400).json({ message: `Maximum bulk import size is ${MAX_BULK_SIZE} records` });
  }

  try {
    const dataToCreate = expenses.map((expense, index) => {
      const parsedDate = parseValidDate(expense.date);
      if (!parsedDate) {
        throw new Error(`Invalid date at row ${index + 1}: "${expense.date}"`);
      }

      const parsedAmount = parseFiniteFloat(expense.amount as any);
      if (parsedAmount === null) {
        throw new Error(`Invalid amount at row ${index + 1}: "${expense.amount}"`);
      }

      return {
        title: (expense.title || '').trim(),
        category: (expense.category || '').trim(),
        amount: toFinPrecision(parsedAmount),
        date: parsedDate,
        paymentMethod: expense.paymentMethod?.trim() || undefined,
        notes: expense.notes?.trim() || undefined,
        originalAmount: expense.originalAmount ? toFinPrecision(parseFiniteFloat(expense.originalAmount as any) ?? 0) : undefined,
        originalCurrency: expense.originalCurrency || undefined,
        isRecurring: Boolean(expense.isRecurring),
        userId: userId, 
      };
    });

    await prisma.expense.createMany({
      data: dataToCreate,
    });
    
    res.status(201).json({ message: `${expenses.length} expenses imported successfully` });

  } catch (error: any) {
    console.error('Failed to bulk create expenses:', error);
    res.status(400).json({ message: error.message || 'Failed to import expenses' });
  }
});

export default router;