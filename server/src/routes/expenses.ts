import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware} from '../middleware/auth';
import { Expense } from '../types'; // <-- FIX #1: Import the Expense type

const router = Router();

// --- Protect all routes in this file ---
router.use(authMiddleware);

// --- 1. Create new Expense ---
// POST /api/expenses
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { title, amount, category, date, paymentMethod, notes, originalAmount, originalCurrency, isRecurring } = req.body;

  // Basic validation
  if (!title || !amount || !category || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newExpense = await prisma.expense.create({
      data: {
        title,
        amount: parseFloat(amount),
        category,
        date: new Date(date), // Convert ISO string to Date
        paymentMethod,
        notes,
        originalAmount: originalAmount ? parseFloat(originalAmount) : undefined,
        originalCurrency,
        isRecurring: isRecurring || false,
        userId: userId, // Link to the logged-in user
      },
    });
    
    // Return the new expense (with the correct date format)
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

  try {
    const updatedExpense = await prisma.expense.update({
      where: {
        id: expenseId,
        userId: userId, // Ensures user can only update their *own* expense
      },
      data: {
        title,
        amount: parseFloat(amount),
        category,
        date: new Date(date),
        paymentMethod,
        notes,
        originalAmount: originalAmount ? parseFloat(originalAmount) : undefined,
        originalCurrency,
        isRecurring: isRecurring || false,
      },
    });

    res.json({
      ...updatedExpense,
      date: updatedExpense.date.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Failed to update expense:', error);
    res.status(404).json({ message: 'Expense not found or failed to update' });
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
        userId: userId, // Ensures user can only delete their *own* expense
      },
    });

    res.status(204).send(); // 204 No Content
  } catch (error) {
    console.error('Failed to delete expense:', error);
    res.status(404).json({ message: 'Expense not found or failed to delete' });
  }
});

// --- 4. Create Multiple Expenses (Bulk Import) ---
// POST /api/expenses/bulk
router.post('/bulk', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const expenses = req.body as Omit<Expense, 'id'>[]; // Expect an array

  if (!Array.isArray(expenses) || expenses.length === 0) {
    return res.status(400).json({ message: 'Request body must be a non-empty array of expenses' });
  }

  // --- FIX #2: Be explicit with all properties ---
  // This prevents the TypeScript/Prisma type error.
  const dataToCreate = expenses.map(expense => ({
    title: expense.title,
    category: expense.category,
    amount: parseFloat(expense.amount as any),
    date: new Date(expense.date),
    paymentMethod: expense.paymentMethod,
    notes: expense.notes,
    originalAmount: expense.originalAmount ? parseFloat(expense.originalAmount as any) : undefined,
    originalCurrency: expense.originalCurrency,
    isRecurring: expense.isRecurring || false,
    userId: userId, // Link to the logged-in user
  }));

  try {
    // createMany is highly efficient for bulk inserts
    await prisma.expense.createMany({
      data: dataToCreate,
      // skipDuplicates: true, // In case of a re-upload, skip duplicates
    });
    
    res.status(201).json({ message: `${expenses.length} expenses imported successfully` });

  } catch (error) {
    console.error('Failed to bulk create expenses:', error);
    res.status(500).json({ message: 'Failed to import expenses' });
  }
});

export default router;