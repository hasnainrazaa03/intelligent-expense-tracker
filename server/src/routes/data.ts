import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { parseFiniteFloat, parseValidDate, toFinPrecision } from '../utils/math';
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';
import { sendError } from '../utils/http';
import { sanitizeText, sanitizeOptionalText } from '../utils/sanitize';

const router = Router();

router.use(authMiddleware);

const MAX_TEXT_LENGTH = SERVER_CONFIG.limits.maxTextLength;
const MAX_ITEMS = SERVER_CONFIG.limits.maxRestoreItemsPerSection;

const normalizeTags = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((tag) => sanitizeText(tag))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 20);
};

const normalizeMetadata = (input: unknown): Record<string, string> | undefined => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const pairs = Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => [sanitizeText(k), sanitizeText(v)] as const)
    .filter(([k, v]) => Boolean(k) && Boolean(v))
    .slice(0, 20);
  if (pairs.length === 0) return undefined;
  return Object.fromEntries(pairs);
};

const normalizeStringArray = (input: unknown, limit = 20): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => sanitizeText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
};

const normalizeNumberArray = (input: unknown, limit = 20): number[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => parseFiniteFloat(item))
    .filter((item): item is number => item !== null && item > 0)
    .map((item) => toFinPrecision(item))
    .slice(0, limit);
};

// --- Audit Event from Client ---
// SRV-M5: clients may only report a fixed set of UI actions, and the written
// action is namespaced ("client:") so a caller cannot forge server-authored
// events (e.g. a fake successful "login"). Metadata is sanitized and capped.
const ALLOWED_CLIENT_AUDIT_ACTIONS = new Set([
  'data_export',
  'backup_export',
  'expense_csv_import',
  'backup_restore',
]);

// Keep only primitive metadata values (string/number/boolean), capped, so a
// client can't push large or nested objects into the audit log.
const normalizeAuditMetadata = (input: unknown): Record<string, string | number | boolean> | undefined => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(result).length >= 20) break;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    const key = sanitizeText(rawKey);
    if (!key) continue;
    result[key] = typeof value === 'string' ? sanitizeText(value) : value;
  }
  return Object.keys(result).length ? result : undefined;
};

router.post('/audit', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { action, metadata } = req.body || {};

  if (!action || typeof action !== 'string' || !ALLOWED_CLIENT_AUDIT_ACTIONS.has(action)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported audit action');
  }

  await writeAuditLog({
    action: `client:${action}`,
    userId,
    success: true,
    route: '/api/data/audit',
    ip: req.ip,
    userAgent: req.get('user-agent') || undefined,
    metadata: normalizeAuditMetadata(metadata),
  });

  return res.status(200).json({ success: true });
});

// --- Get All User Data ---
// GET /api/data/all
router.get('/all', async (req: Request, res: Response) => {
  const userId = req.user!.id;

  try {
    const [expenses, incomes, budgets, semesters] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ 
        where: { userId },
        include: { installments: true }
      }),
    ]);
    
    // Safely adjust date formats
    const cleanDate = (item: { date: Date | null }) => ({
      ...item,
      date: item.date ? item.date.toISOString().split('T')[0] : null
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

// --- Restore All User Data from Backup ---
// POST /api/data/restore
router.post('/restore', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { expenses = [], incomes = [], budgets = [], semesters = [] } = req.body || {};

  if (!Array.isArray(expenses) || !Array.isArray(incomes) || !Array.isArray(budgets) || !Array.isArray(semesters)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid backup format: expenses, incomes, budgets, semesters must be arrays.');
  }

  if (expenses.length > MAX_ITEMS || incomes.length > MAX_ITEMS || budgets.length > MAX_ITEMS || semesters.length > MAX_ITEMS) {
    return sendError(res, 400, 'VALIDATION_ERROR', `Backup is too large. Maximum ${MAX_ITEMS} entries per section.`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Clear existing user data first; order avoids FK issues.
      await tx.expense.deleteMany({ where: { userId } });
      await tx.income.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });
      await tx.semester.deleteMany({ where: { userId } });

      const cleanExpenses = expenses.map((e: any, idx: number) => {
        const safeTitle = sanitizeText(e.title);
        const safeCategory = sanitizeText(e.category);
        const amount = parseFiniteFloat(e.amount);
        const date = parseValidDate(e.date);
        if (!safeTitle || !safeCategory || amount === null || !date) {
          throw new Error(`Invalid expense at index ${idx}`);
        }
        if (safeTitle.length > MAX_TEXT_LENGTH || safeCategory.length > MAX_TEXT_LENGTH || (e.notes && String(e.notes).length > MAX_TEXT_LENGTH)) {
          throw new Error(`Expense text too long at index ${idx}`);
        }
        return {
          title: safeTitle,
          amount: toFinPrecision(amount),
          category: safeCategory,
          date,
          paymentMethod: sanitizeOptionalText(e.paymentMethod),
          notes: sanitizeOptionalText(e.notes),
          originalAmount: e.originalAmount != null ? toFinPrecision(parseFiniteFloat(e.originalAmount) ?? 0) : undefined,
          originalCurrency: sanitizeOptionalText(e.originalCurrency),
          isRecurring: Boolean(e.isRecurring),
          tags: normalizeTags(e.tags),
          metadata: normalizeMetadata(e.metadata),
          taxCategory: sanitizeOptionalText(e.taxCategory),
          isTaxDeductible: Boolean(e.isTaxDeductible),
          splitParticipants: normalizeStringArray(e.splitParticipants),
          splitShares: normalizeNumberArray(e.splitShares),
          receiptText: sanitizeOptionalText(e.receiptText),
          receiptFileName: sanitizeOptionalText(e.receiptFileName),
          userId,
        };
      });

      const cleanIncomes = incomes.map((i: any, idx: number) => {
        const safeTitle = sanitizeText(i.title);
        const safeCategory = sanitizeText(i.category);
        const amount = parseFiniteFloat(i.amount);
        const date = parseValidDate(i.date);
        if (!safeTitle || !safeCategory || amount === null || !date) {
          throw new Error(`Invalid income at index ${idx}`);
        }
        if (safeTitle.length > MAX_TEXT_LENGTH || safeCategory.length > MAX_TEXT_LENGTH || (i.notes && String(i.notes).length > MAX_TEXT_LENGTH)) {
          throw new Error(`Income text too long at index ${idx}`);
        }
        return {
          title: safeTitle,
          amount: toFinPrecision(amount),
          category: safeCategory,
          date,
          notes: sanitizeOptionalText(i.notes),
          originalAmount: i.originalAmount != null ? toFinPrecision(parseFiniteFloat(i.originalAmount) ?? 0) : undefined,
          originalCurrency: sanitizeOptionalText(i.originalCurrency),
          tags: normalizeTags(i.tags),
          metadata: normalizeMetadata(i.metadata),
          userId,
        };
      });

      const cleanBudgets = budgets
        .map((b: any, idx: number) => {
          const safeCategory = sanitizeText(b.category);
          const amount = parseFiniteFloat(b.amount);
          if (!safeCategory || amount === null) {
            throw new Error(`Invalid budget at index ${idx}`);
          }
          return {
            category: safeCategory,
            amount: toFinPrecision(amount),
            userId,
          };
        })
        .filter((b: any) => b.category);

      if (cleanExpenses.length > 0) {
        await tx.expense.createMany({ data: cleanExpenses });
      }
      if (cleanIncomes.length > 0) {
        await tx.income.createMany({ data: cleanIncomes });
      }
      if (cleanBudgets.length > 0) {
        await tx.budget.createMany({ data: cleanBudgets });
      }

      for (let sIdx = 0; sIdx < semesters.length; sIdx++) {
        const sem = semesters[sIdx];
        const safeName = sanitizeText(sem?.name);
        if (!sem?.id || !safeName || !Array.isArray(sem.installments)) {
          throw new Error(`Invalid semester at index ${sIdx}`);
        }
        const totalTuition = toFinPrecision(parseFiniteFloat(sem.totalTuition) ?? 0);

        await tx.semester.create({
          data: {
            id: String(sem.id),
            name: safeName,
            totalTuition,
            userId,
            installments: {
              create: sem.installments.map((inst: any, iIdx: number) => {
                const amount = parseFiniteFloat(inst.amount);
                if (amount === null) {
                  throw new Error(`Invalid installment at semester ${sIdx}, index ${iIdx}`);
                }
                const paidDate = inst.paidDate ? parseValidDate(inst.paidDate) : null;
                if (inst.paidDate && !paidDate) {
                  throw new Error(`Invalid installment date at semester ${sIdx}, index ${iIdx}`);
                }
                return {
                  amount: toFinPrecision(amount),
                  status: inst.status === 'paid' ? 'paid' : 'unpaid',
                  expenseId: inst.expenseId ? String(inst.expenseId) : null,
                  paidDate,
                };
              }),
            },
          },
        });
      }
    }, { timeout: 20000 });

    const [restoredExpenses, restoredIncomes, restoredBudgets, restoredSemesters] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ where: { userId }, include: { installments: true } }),
    ]);

    const cleanDate = (item: { date: Date | null }) => ({
      ...item,
      date: item.date ? item.date.toISOString().split('T')[0] : null,
    });
    const cleanPaidDate = (semester: any) => ({
      ...semester,
      installments: semester.installments.map((inst: any) => ({
        ...inst,
        paidDate: inst.paidDate ? inst.paidDate.toISOString().split('T')[0] : null,
      })),
    });

    res.status(200).json({
      message: 'Backup restored successfully.',
      expenses: restoredExpenses.map(cleanDate),
      incomes: restoredIncomes.map(cleanDate),
      budgets: restoredBudgets,
      semesters: restoredSemesters.map(cleanPaidDate),
    });

    await writeAuditLog({
      action: 'backup_restore',
      userId,
      success: true,
      route: '/api/data/restore',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: {
        expenseCount: restoredExpenses.length,
        incomeCount: restoredIncomes.length,
        budgetCount: restoredBudgets.length,
        semesterCount: restoredSemesters.length,
      },
    });
  } catch (error: any) {
    console.error('Backup restore failed:', error);

    await writeAuditLog({
      action: 'backup_restore',
      userId,
      success: false,
      route: '/api/data/restore',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { error: error?.message || 'unknown' },
    });

    // The real error is logged and audited above; return a generic message so
    // internal/Prisma details aren't leaked to the client.
    return sendError(res, 500, 'RESTORE_FAILED', 'Failed to restore backup.');
  }
});

export default router;