import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { Semester } from '../types';
import { toFinPrecision } from '../utils/math';

const router = Router();
router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomingSemesters: Semester[] = req.body;

  try {
    /**
     * LOGIC: We iterate through incoming semesters sequentially.
     * By avoiding a single global $transaction, we prevent MongoDB from 
     * deadlocking when multiple "Auto-save" requests hit at once.
     */
    for (const incoming of incomingSemesters) {
      
      // 1. Reconcile the Parent Semester
      const existing = await prisma.semester.findUnique({
        where: { id_userId: { id: incoming.id, userId } },
        include: { installments: true }
      });

      if (!existing) {
        // Create new semester and all its installments
        await prisma.semester.create({
          data: {
            id: incoming.id,
            name: incoming.name,
            totalTuition: toFinPrecision(incoming.totalTuition),
            userId: userId,
            installments: {
              create: incoming.installments.map(inst => ({
                amount: toFinPrecision(inst.amount),
                status: inst.status,
                expenseId: inst.expenseId,
                paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
              }))
            }
          }
        });
      } else {
        // Update basic semester metadata
        await prisma.semester.update({
          where: { id_internal: existing.id_internal },
          data: {
            name: incoming.name,
            totalTuition: toFinPrecision(incoming.totalTuition)
          }
        });

        // 2. Surgical Installment Sync (Child Records)
        const existingInstIds = existing.installments.map(i => i.id);
        
        // Filter out temporary numeric IDs for the deletion logic
        const incomingDbIds = incoming.installments
          .map(i => i.id)
          .filter(id => typeof id === 'string') as string[];

        // A. Delete removed installments
        await prisma.tuitionInstallment.deleteMany({
          where: {
            semesterId: incoming.id,
            semesterUserId: userId,
            id: { notIn: incomingDbIds }
          }
        });

        // B. Upsert current installments
        for (const inst of incoming.installments) {
          if (typeof inst.id === 'string' && existingInstIds.includes(inst.id)) {
            // Update existing record
            await prisma.tuitionInstallment.update({
              where: { id: inst.id },
              data: {
                amount: toFinPrecision(inst.amount),
                status: inst.status,
                expenseId: inst.expenseId,
                paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
              }
            });
          } else {
            // Create new record (it's either a number ID or null)
            await prisma.tuitionInstallment.create({
              data: {
                amount: toFinPrecision(inst.amount),
                status: inst.status,
                expenseId: inst.expenseId,
                paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
                semester: { connect: { id_userId: { id: incoming.id, userId } } }
              }
            });
          }
        }
      }
    }

    // 3. Cleanup: Remove semesters that are no longer in the manifest
    const incomingIds = incomingSemesters.map(s => s.id);
    await prisma.semester.deleteMany({
      where: {
        userId,
        id: { notIn: incomingIds }
      }
    });

    // 4. Return the fully synchronized state
    const updatedData = await prisma.semester.findMany({
      where: { userId },
      include: { installments: true }
    });

    res.status(200).json(updatedData);

  } catch (error: any) {
    console.error('SEMESTER_RECONCILIATION_CRITICAL_FAILURE:', error);
    res.status(500).json({ message: 'Failed to synchronize semester data' });
  }
});

export default router;