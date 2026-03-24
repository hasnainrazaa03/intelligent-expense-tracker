import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { Semester } from '../types';
import { toFinPrecision, parseFiniteFloat } from '../utils/math';

const router = Router();
router.use(authMiddleware);

const MAX_SEMESTERS = 20;
const MAX_INSTALLMENTS_PER_SEMESTER = 20;

router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomingSemesters: Semester[] = req.body;

  // Input validation
  if (!Array.isArray(incomingSemesters)) {
    return res.status(400).json({ message: 'Request body must be an array of semesters' });
  }

  if (incomingSemesters.length > MAX_SEMESTERS) {
    return res.status(400).json({ message: `Maximum ${MAX_SEMESTERS} semesters allowed` });
  }

  // Validate each semester has required fields
  for (const sem of incomingSemesters) {
    if (!sem.id || !sem.name) {
      return res.status(400).json({ message: 'Each semester must have an id and name' });
    }
    if (!Array.isArray(sem.installments)) {
      return res.status(400).json({ message: `Semester "${sem.name}" must have an installments array` });
    }
    if (sem.installments.length > MAX_INSTALLMENTS_PER_SEMESTER) {
      return res.status(400).json({ message: `Maximum ${MAX_INSTALLMENTS_PER_SEMESTER} installments per semester` });
    }
  }

  try {
    for (const incoming of incomingSemesters) {
      const parsedTuition = parseFiniteFloat(incoming.totalTuition as any) ?? 0;
      
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
            name: incoming.name.trim(),
            totalTuition: toFinPrecision(parsedTuition),
            userId: userId,
            installments: {
              create: incoming.installments.map(inst => ({
                amount: toFinPrecision(parseFiniteFloat(inst.amount as any) ?? 0),
                status: inst.status || 'unpaid',
                expenseId: inst.expenseId || null,
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
            name: incoming.name.trim(),
            totalTuition: toFinPrecision(parsedTuition)
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
          const installmentData = {
            amount: toFinPrecision(parseFiniteFloat(inst.amount as any) ?? 0),
            status: inst.status || 'unpaid',
            expenseId: inst.expenseId || null,
            paidDate: inst.paidDate ? new Date(inst.paidDate) : null,
          };

          if (typeof inst.id === 'string' && existingInstIds.includes(inst.id)) {
            // Update existing record
            await prisma.tuitionInstallment.update({
              where: { id: inst.id },
              data: installmentData
            });
          } else {
            // Create new record (it's either a number ID or null)
            await prisma.tuitionInstallment.create({
              data: {
                ...installmentData,
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