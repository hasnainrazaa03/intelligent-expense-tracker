import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { Semester, TuitionInstallment } from '../types';
import { toFinPrecision } from '../utils/math';

const router = Router();
router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomingSemesters: Semester[] = req.body;

  try {
    const updatedData = await prisma.$transaction(async (tx) => {
      // 1. Fetch current state to compare
      const existingSemesters = await tx.semester.findMany({
        where: { userId },
        include: { installments: true }
      });

      const incomingIds = incomingSemesters.map(s => s.id);

      // 2. Identify semesters to DELETE
      // These exist in DB but NOT in the incoming request
      const semestersToDelete = existingSemesters.filter(
        ex => !incomingIds.includes(ex.id)
      );
      
      for (const sem of semestersToDelete) {
        await tx.semester.delete({ where: { id_internal: sem.id_internal } });
      }

      // 3. Reconcile remaining and new semesters
      for (const incoming of incomingSemesters) {
        const existing = existingSemesters.find(ex => ex.id === incoming.id);

        if (!existing) {
          // CREATE new semester with installments
          await tx.semester.create({
            data: {
              id: incoming.id,
              name: incoming.name,
              totalTuition: incoming.totalTuition,
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
          // UPDATE existing semester metadata
          await tx.semester.update({
            where: { id_internal: existing.id_internal },
            data: {
              name: incoming.name,
              totalTuition: incoming.totalTuition
            }
          });

          // SURGICAL INSTALLMENT SYNC
          const existingInstIds = existing.installments.map(i => i.id);
          const incomingInstIds = incoming.installments.filter(i => i.id).map(i => i.id as any);

          // Delete removed installments
          await tx.tuitionInstallment.deleteMany({
            where: {
              semesterId: incoming.id,
              semesterUserId: userId,
              id: { notIn: incomingInstIds }
            }
          });

          // Upsert current installments
          for (const inst of incoming.installments) {
            if (inst.id && existingInstIds.includes(inst.id as any)) {
              // Update
              await tx.tuitionInstallment.update({
                where: { id: inst.id as any },
                data: {
                  amount: toFinPrecision(inst.amount),
                  status: inst.status,
                  expenseId: inst.expenseId,
                  paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
                }
              });
            } else {
              // Create new installment for existing semester
              await tx.tuitionInstallment.create({
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

      // Return clean state
      return tx.semester.findMany({
        where: { userId },
        include: { installments: true }
      });
    }, { timeout: 15000 });

    res.status(200).json(updatedData);
  } catch (error) {
    console.error('DIFFERENTIAL_SYNC_FAILURE:', error);
    res.status(500).json({ message: 'Failed to synchronize semester data' });
  }
});

export default router;