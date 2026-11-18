import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { Semester } from '../types';
import { toFinPrecision, parseFiniteFloat, parseAmount, MAX_AMOUNT, parseCalendarDay } from '../utils/math';
import { toCents, semesterToClient, expenseToClient } from '../utils/money';
import { holdKeyLockUntilResponse } from '../utils/keyedLock';
import { sendError } from '../utils/http';

// Tuition semesters and their installments.
//
// The server owns PAYMENT state (status, linked expense, paid date):
//   - POST /:semesterId/installments/:installmentId/pay creates the tuition
//     expense and marks the installment paid in one request;
//   - deleting a tuition expense un-pays its installment (routes/expenses.ts);
//   - editing it updates the installment's amount and date (routes/expenses.ts).
// The full-state POST / only saves STRUCTURE (names, totals, unpaid amounts,
// how many installments), guarded by a per-semester version. It used to write
// payment state too, so a stale tab or a failed save could undo a payment or
// leave an installment pointing at a deleted expense (S2, C3, F6, S12).

const router = Router();
router.use(authMiddleware);

const MAX_SEMESTERS = 20;
const MAX_INSTALLMENTS_PER_SEMESTER = 20;

// Installments in creation order, everywhere: the tracker numbers them by
// position ("Inst #2"), and that number is part of the tuition expense title.
const withInstallments = { installments: { orderBy: { id: 'asc' as const } } };

// paidDate as a calendar day (YYYY-MM-DD), matching /data/all — the client
// adopts this response, so it must not switch formats under it.
const toClientSemester = (s: any) => {
  const out = semesterToClient(s) as any;
  return {
    ...out,
    installments: (out.installments || []).map((inst: any) => ({
      ...inst,
      paidDate: inst.paidDate instanceof Date ? inst.paidDate.toISOString().split('T')[0] : inst.paidDate ?? null,
    })),
  };
};

const toClientExpense = (e: any) => ({ ...expenseToClient(e), date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date });

const allSemesters = async (userId: string) =>
  (await prisma.semester.findMany({ where: { userId }, include: withInstallments })).map(toClientSemester);

/** "USC Tuition - Fall 2026 (Inst #2)", and the id-based title older versions used. */
export const tuitionTitles = (semesterName: string, position: number, installmentId: string) => {
  const base = semesterName.split('USC TUITION')[0].trim();
  return { title: `USC Tuition - ${base} (Inst #${position})`, legacy: `USC Tuition - ${base} (Inst #${installmentId})` };
};

/**
 * A payment link the client asked for, accepted only if it points at a real
 * Tuition expense of this user that no other installment uses. Kept for
 * clients from before payments moved to the server (a cached tab during a
 * deploy): they still create the expense themselves and save the link here.
 */
const validLegacyLink = async (userId: string, expenseId: unknown, installmentId: string): Promise<string | null> => {
  if (typeof expenseId !== 'string' || !/^[a-f0-9]{24}$/.test(expenseId)) return null;
  const [expense, other] = await Promise.all([
    prisma.expense.findFirst({ where: { id: expenseId, userId, category: 'Tuition' }, select: { id: true } }),
    prisma.tuitionInstallment.findFirst({ where: { semesterUserId: userId, expenseId, NOT: { id: installmentId } }, select: { id: true } }),
  ]);
  return expense && !other ? expense.id : null;
};

// --- Save structure: POST /api/semesters  [semester, ...] -------------------
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

  // Safety: an empty array is never legitimate (the client substitutes default
  // semesters). Treat it as a no-op (SRV-H2).
  if (incomingSemesters.length === 0) {
    return res.status(200).json(await allSemesters(userId));
  }

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
    // Out-of-range amounts used to be written as 0 (or crash the Int32 column).
    const amounts = [sem.totalTuition, ...sem.installments.map((i) => i.amount)];
    if (amounts.some((a) => a != null && (parseAmount(a as any) === null || Number(a) < 0))) {
      return res.status(400).json({ message: `Tuition amounts must be between 0 and ${MAX_AMOUNT.toLocaleString('en-US')}` });
    }
  }

  // One tuition write per user at a time (saves and payments): overlapping
  // ones interleave their steps.
  await holdKeyLockUntilResponse(`semesters:${userId}`, res);

  try {
    const existingList = await prisma.semester.findMany({ where: { userId }, include: withInstallments });
    const existingById = new Map(existingList.map((s) => [s.id, s]));

    // Refuse the whole save if any semester changed since the client loaded it.
    // Clients from before versions existed send none and are let through.
    const stale = incomingSemesters.some((incoming) => {
      const existing = existingById.get(incoming.id);
      return existing && typeof (incoming as any).version === 'number' && (incoming as any).version !== existing.version;
    });
    if (stale) {
      return res.status(409).json({
        error: { code: 'SEMESTERS_CHANGED', message: 'Tuition was changed in another tab or on another device.' },
        message: 'Tuition was changed in another tab or on another device.',
        semesters: existingList.map(toClientSemester),
      });
    }

    const cents = (value: unknown) => toCents(toFinPrecision(parseFiniteFloat(value as any) ?? 0));

    for (const incoming of incomingSemesters) {
      const existing = existingById.get(incoming.id);

      if (!existing) {
        // A new semester: every installment starts unpaid.
        await prisma.semester.create({
          data: {
            id: incoming.id,
            name: incoming.name.trim(),
            totalTuition: cents(incoming.totalTuition),
            userId,
            installments: { create: incoming.installments.map((inst) => ({ amount: cents(inst.amount), status: 'unpaid' })) },
          },
        });
        continue;
      }

      await prisma.semester.update({
        where: { id_internal: existing.id_internal },
        data: { name: incoming.name.trim(), totalTuition: cents(incoming.totalTuition), version: { increment: 1 } },
      });

      const incomingById = new Map(
        incoming.installments.filter((i) => typeof i.id === 'string').map((i) => [i.id as unknown as string, i])
      );

      for (const current of existing.installments) {
        const wanted = incomingById.get(current.id);
        if (current.status === 'paid') {
          // Paid installments are locked: only a payment, or deleting/editing
          // its expense, changes them. A stale "unpaid" from the client is ignored.
          continue;
        }
        if (!wanted) {
          await prisma.tuitionInstallment.delete({ where: { id: current.id } });
          continue;
        }
        const link = wanted.status === 'paid' ? await validLegacyLink(userId, wanted.expenseId, current.id) : null;
        const paidDate = link ? parseCalendarDay(wanted.paidDate) : null;
        await prisma.tuitionInstallment.update({
          where: { id: current.id },
          data: link
            ? { amount: cents(wanted.amount), status: 'paid', expenseId: link, paidDate }
            : { amount: cents(wanted.amount) },
        });
      }

      // New installments (temporary numeric ids from the client).
      const known = new Set(existing.installments.map((i) => i.id));
      for (const inst of incoming.installments) {
        if (typeof inst.id === 'string' && known.has(inst.id)) continue;
        await prisma.tuitionInstallment.create({
          data: { amount: cents(inst.amount), status: 'unpaid', semester: { connect: { id_userId: { id: incoming.id, userId } } } },
        });
      }
    }

    // Semesters missing from the list are NOT deleted any more: nothing in the
    // app removes a semester, and a tab that loaded before another created one
    // used to delete it (S12).

    return res.status(200).json(await allSemesters(userId));
  } catch (error: any) {
    console.error('SEMESTER_RECONCILIATION_CRITICAL_FAILURE:', error);
    return res.status(500).json({ message: 'Failed to synchronize semester data' });
  }
});

// --- Pay an installment: POST /api/semesters/:semesterId/installments/:installmentId/pay
// { paidDate: "YYYY-MM-DD" } → { semester, expense }
// Creates the tuition expense and marks the installment paid together. A
// repeat (double-click, retry, a second tab) returns the same result instead
// of a second expense (F6).
router.post('/:semesterId/installments/:installmentId/pay', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { semesterId, installmentId } = req.params;
  const { paidDate } = req.body || {};

  // A real day: 2026-02-30 used to pass the pattern and land on 2 March.
  const paidDay = parseCalendarDay(paidDate);
  if (!paidDay) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'paidDate must be a date (YYYY-MM-DD)');
  }

  await holdKeyLockUntilResponse(`semesters:${userId}`, res);

  try {
    const semester = await prisma.semester.findUnique({ where: { id_userId: { id: semesterId, userId } }, include: withInstallments });
    const position = semester ? semester.installments.findIndex((i) => i.id === installmentId) : -1;
    if (!semester || position < 0) {
      return sendError(res, 404, 'NOT_FOUND', 'Installment not found. Reload and try again.');
    }
    const installment = semester.installments[position];

    if (installment.status === 'paid') {
      const expense = installment.expenseId ? await prisma.expense.findFirst({ where: { id: installment.expenseId, userId } }) : null;
      return res.json({ semester: toClientSemester(semester), expense: expense ? toClientExpense(expense) : null, alreadyPaid: true });
    }
    if (installment.amount <= 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'This installment has no amount to pay.');
    }

    // Re-link instead of duplicating: a tuition expense for this installment
    // that already exists (an earlier attempt whose link was lost, or one
    // created by an older version of the app) and isn't linked elsewhere.
    const { title, legacy } = tuitionTitles(semester.name, position + 1, installment.id);
    const clientRequestId = `tuition-${installment.id}`;
    const candidates = await prisma.expense.findMany({
      where: { userId, OR: [{ clientRequestId }, { category: 'Tuition', title: { in: [title, legacy] } }] },
    });
    let expense = null;
    for (const candidate of candidates) {
      const linkedElsewhere = await prisma.tuitionInstallment.findFirst({
        where: { semesterUserId: userId, expenseId: candidate.id, NOT: { id: installment.id } },
        select: { id: true },
      });
      if (!linkedElsewhere) { expense = candidate; break; }
    }
    expense ??= await prisma.expense.create({
      data: {
        title,
        amount: installment.amount,
        category: 'Tuition',
        date: paidDay,
        paymentMethod: 'Bank Transfer',
        isRecurring: false,
        clientRequestId,
        userId,
      },
    });

    // If this write fails after the expense was created, a retry finds that
    // expense by its clientRequestId and links it: the two steps converge.
    await prisma.tuitionInstallment.update({
      where: { id: installment.id },
      data: { status: 'paid', expenseId: expense.id, paidDate: expense.date },
    });

    const updated = await prisma.semester.findUnique({ where: { id_userId: { id: semesterId, userId } }, include: withInstallments });
    return res.status(200).json({ semester: toClientSemester(updated), expense: toClientExpense(expense) });
  } catch (error) {
    console.error('Failed to pay installment:', error);
    return sendError(res, 500, 'PAYMENT_FAILED', 'Could not record the tuition payment.');
  }
});

export default router;
