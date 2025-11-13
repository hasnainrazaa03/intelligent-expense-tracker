import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// --- Protect all routes in this file ---
// This line applies the authMiddleware to every route defined in this file.
// The user's ID will be available in req.user.userId
router.use(authMiddleware);

// --- Get All User Data ---
// A single endpoint to get all data when the app loads
// GET /api/data/all
router.get('/all', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    // Use Prisma's 'findMany' to get all data for this user
    const [expenses, incomes, budgets, semesters] = await Promise.all([
      prisma.expense.findMany({ where: { userId } }),
      prisma.income.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ 
        where: { userId },
        include: { installments: true } // Include nested installments
      }),
    ]);
    
    // We must adjust the date format, as Prisma returns full timestamps
    const cleanDate = (item: { date: Date }) => ({
      ...item,
      date: item.date.toISOString().split('T')[0]
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

export default router;