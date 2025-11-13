import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { Semester, TuitionInstallment } from '../types';

const router = Router();
router.use(authMiddleware);

// --- 1. Save All Semesters (Upsert) ---
// POST /api/semesters
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  // We expect an array of Semester objects from the client
  const semesters: Semester[] = req.body;

  if (!Array.isArray(semesters)) {
    return res.status(400).json({ message: 'Request body must be an array of semesters' });
  }

  try {
    const transactionOperations = [];

    // Loop over each semester sent from the client
    for (const semester of semesters) {
      // 1: Upsert the Semester itself (the main object)
      const upsertSemester = prisma.semester.upsert({
        where: {
          id_userId: { // <-- FIX: This composite key now exists!
            id: semester.id,
            userId: userId,
          },
        },
        update: {
          name: semester.name,
          totalTuition: semester.totalTuition,
        },
        create: {
          id: semester.id,
          name: semester.name,
          totalTuition: semester.totalTuition,
          userId: userId,
        },
      });
      transactionOperations.push(upsertSemester);

      // 2: Delete all *existing* installments for this semester
      const deleteInstallments = prisma.tuitionInstallment.deleteMany({
        where: {
          semesterId: semester.id,
          semesterUserId: userId, // <-- FIX: Use the new relation field
        },
      });
      transactionOperations.push(deleteInstallments);

      // 3: Re-create all installments from the client
      const createInstallments = prisma.tuitionInstallment.createMany({
        data: semester.installments.map((inst: TuitionInstallment) => ({
          amount: inst.amount,
          status: inst.status,
          expenseId: inst.expenseId,
          paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
          semesterId: semester.id, // Link to the parent semester
          semesterUserId: userId, // <-- FIX: Add the new relation field
        })),
      });
      transactionOperations.push(createInstallments);
    }

    // Run all operations in a single, all-or-nothing transaction
    await prisma.$transaction(transactionOperations);

    // After saving, fetch the final state back from the DB to send to the client
    const finalSemesters = await prisma.semester.findMany({
      where: { userId },
      include: { installments: true },
    });
    
    // Clean up dates for the client
    const cleanPaidDate = (semester: any) => ({
      ...semester,
      installments: semester.installments.map((inst: any) => ({
        ...inst,
        paidDate: inst.paidDate ? inst.paidDate.toISOString().split('T')[0] : null
      }))
    });

    res.status(200).json(finalSemesters.map(cleanPaidDate));

  } catch (error) {
    console.error('Failed to save semesters:', error);
    res.status(500).json({ message: 'Failed to save semesters' });
  }
});

export default router;