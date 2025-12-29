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
    // We use an Interactive Transaction ($transaction function)
    // This is more robust for MongoDB than an array of promises.
    await prisma.$transaction(async (tx) => {
      
      // 1. Delete ALL installments for this user first
      // This prevents "orphaned" installments if a semester ID changes
      await tx.tuitionInstallment.deleteMany({
        where: { semesterUserId: userId }
      });

      // 2. Delete ALL semesters for this user
      await tx.semester.deleteMany({
        where: { userId: userId }
      });

      // 3. Re-create everything fresh
      // This avoids "Upsert" logic which is prone to race conditions in Mongo
      for (const sem of semesters) {
        await tx.semester.create({
          data: {
            id: sem.id,
            name: sem.name,
            totalTuition: sem.totalTuition,
            userId: userId,
            installments: {
              create: sem.installments.map((inst) => ({
                amount: inst.amount,
                status: inst.status,
                expenseId: inst.expenseId,
                paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
                semesterUserId: userId // Crucial for the composite relation
              }))
            }
          }
        });
      }
    }, {
      timeout: 10000 // Give Mongo 10s to finish the bulk write
    });

    // Fetch the clean, updated state to return to frontend
    const updatedData = await prisma.semester.findMany({
      where: { userId },
      include: { installments: true }
    });

    res.status(200).json(updatedData);
  } catch (error) {
    console.error('CRITICAL_DATABASE_FAILURE:', error);
    res.status(500).json({ message: 'Failed to synchronize semester data' });
  }
});

export default router;