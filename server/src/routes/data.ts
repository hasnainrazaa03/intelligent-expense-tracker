import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { parseFiniteFloat, parseValidDate, toFinPrecision, parseAmount, MAX_AMOUNT, MAX_ORIGINAL_AMOUNT } from '../utils/math';
import { ValidationError } from '../utils/errors';

// An amount that must be valid (a backup entry): throws a 400-mapped error.
const requireAmount = (value: unknown, max: number, where: string): number => {
  const n = parseAmount(value, max);
  if (n === null || n < 0) throw new ValidationError(`Invalid amount in ${where}`);
  return n;
};
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';
import { sendError } from '../utils/http';
import { sanitizeText, sanitizeOptionalText, sanitizeOptionalNotes } from '../utils/sanitize';
import { newObjectId } from '../utils/objectId';
import { normalizeTags, normalizeMetadata, normalizeStringArray, normalizeNumberArray, normalizeCurrencyCode } from '../utils/normalize';
import { toCents, expenseToClient, incomeToClient, budgetToClient, semesterToClient } from '../utils/money';
import { parseSettingsPatch, settingsToClient, SettingsData, WIPED_SETTINGS } from '../utils/settings';

const router = Router();

router.use(authMiddleware);

const MAX_TEXT_LENGTH = SERVER_CONFIG.limits.maxTextLength;
const MAX_ITEMS = SERVER_CONFIG.limits.maxRestoreItemsPerSection;

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
    const [expenses, incomes, budgets, semesters, settings] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ 
        where: { userId },
        include: { installments: true }
      }),
      prisma.userSettings.findUnique({ where: { userId } }),
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
      expenses: expenses.map(expenseToClient).map(cleanDate),
      incomes: incomes.map(incomeToClient).map(cleanDate),
      budgets: budgets.map(budgetToClient),
      semesters: semesters.map(semesterToClient).map(cleanPaidDate),
      settings: settingsToClient(settings),
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
  const { expenses = [], incomes = [], budgets = [], semesters = [], settings } = req.body || {};

  if (!Array.isArray(expenses) || !Array.isArray(incomes) || !Array.isArray(budgets) || !Array.isArray(semesters)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid backup format: expenses, incomes, budgets, semesters must be arrays.');
  }

  if (expenses.length > MAX_ITEMS || incomes.length > MAX_ITEMS || budgets.length > MAX_ITEMS || semesters.length > MAX_ITEMS) {
    return sendError(res, 400, 'VALIDATION_ERROR', `Backup is too large. Maximum ${MAX_ITEMS} entries per section.`);
  }

  // Settings (goals, accounts, categories, …) are optional: backups made before
  // they moved to the server don't have them, and then the current ones stay.
  let restoredSettings: SettingsData | null = null;
  if (settings !== undefined && settings !== null) {
    try {
      restoredSettings = parseSettingsPatch(settings);
    } catch (error) {
      if (error instanceof ValidationError) return sendError(res, 400, 'INVALID_BACKUP', `Invalid settings: ${error.message}`);
      throw error;
    }
  }

  // A restored expense keeps its household tag only if the user is still an
  // active member there (same rule as creating one).
  const memberships = await prisma.householdMember.findMany({ where: { userId, status: 'active' }, select: { householdId: true } });
  const myHouseholds = new Set(memberships.map((m) => m.householdId));

  try {
    await prisma.$transaction(async (tx) => {
      // Clear existing user data first; order avoids FK issues.
      await tx.expense.deleteMany({ where: { userId } });
      await tx.income.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });
      await tx.semester.deleteMany({ where: { userId } });

      // Restored expenses get new ids, but tuition installments (and receipt
      // images) point at expenses by id. Choose each new id up front and keep
      // backup-id → new-id, so those links can be rewritten below instead of
      // all pointing at ids that no longer exist.
      const expenseIdMap = new Map<string, string>();

      const cleanExpenses = expenses.map((e: any, idx: number) => {
        const newId = newObjectId();
        if (e.id != null) expenseIdMap.set(String(e.id), newId);
        const safeTitle = sanitizeText(e.title);
        const safeCategory = sanitizeText(e.category);
        const amount = parseAmount(e.amount);
        const date = parseValidDate(e.date);
        if (!safeTitle || !safeCategory || amount === null || !date) {
          throw new ValidationError(`Invalid expense at index ${idx}`);
        }
        if (safeTitle.length > MAX_TEXT_LENGTH || safeCategory.length > MAX_TEXT_LENGTH || (e.notes && String(e.notes).length > MAX_TEXT_LENGTH)) {
          throw new ValidationError(`Expense text too long at index ${idx}`);
        }
        return {
          title: safeTitle,
          amount: toCents(toFinPrecision(amount)),
          category: safeCategory,
          date,
          paymentMethod: sanitizeOptionalText(e.paymentMethod),
          notes: sanitizeOptionalNotes(e.notes),
          originalAmount: e.originalAmount != null ? toCents(toFinPrecision(requireAmount(e.originalAmount, MAX_ORIGINAL_AMOUNT, `expense at index ${idx}`))) : undefined,
          originalCurrency: normalizeCurrencyCode(e.originalCurrency),
          isRecurring: Boolean(e.isRecurring),
          tags: normalizeTags(e.tags),
          metadata: normalizeMetadata(e.metadata),
          taxCategory: sanitizeOptionalText(e.taxCategory),
          isTaxDeductible: Boolean(e.isTaxDeductible),
          splitParticipants: normalizeStringArray(e.splitParticipants),
          splitShares: normalizeNumberArray(e.splitShares).map(toCents),
          receiptText: sanitizeOptionalText(e.receiptText),
          receiptFileName: sanitizeOptionalText(e.receiptFileName),
          account: sanitizeOptionalText(e.account),
          householdId: typeof e.householdId === 'string' && myHouseholds.has(e.householdId) ? e.householdId : null,
          id: newId,
          userId,
        };
      });

      const cleanIncomes = incomes.map((i: any, idx: number) => {
        const safeTitle = sanitizeText(i.title);
        const safeCategory = sanitizeText(i.category);
        const amount = parseAmount(i.amount);
        const date = parseValidDate(i.date);
        if (!safeTitle || !safeCategory || amount === null || !date) {
          throw new ValidationError(`Invalid income at index ${idx}`);
        }
        if (safeTitle.length > MAX_TEXT_LENGTH || safeCategory.length > MAX_TEXT_LENGTH || (i.notes && String(i.notes).length > MAX_TEXT_LENGTH)) {
          throw new ValidationError(`Income text too long at index ${idx}`);
        }
        return {
          title: safeTitle,
          amount: toCents(toFinPrecision(amount)),
          category: safeCategory,
          date,
          notes: sanitizeOptionalNotes(i.notes),
          originalAmount: i.originalAmount != null ? toCents(toFinPrecision(requireAmount(i.originalAmount, MAX_ORIGINAL_AMOUNT, `income at index ${idx}`))) : undefined,
          originalCurrency: normalizeCurrencyCode(i.originalCurrency),
          tags: normalizeTags(i.tags),
          metadata: normalizeMetadata(i.metadata),
          userId,
        };
      });

      const cleanBudgets = budgets
        .map((b: any, idx: number) => {
          const safeCategory = sanitizeText(b.category);
          const amount = parseAmount(b.amount);
          if (!safeCategory || amount === null) {
            throw new ValidationError(`Invalid budget at index ${idx}`);
          }
          return {
            category: safeCategory,
            amount: toCents(toFinPrecision(amount)),
            userId,
          };
        })
        .filter((b: any) => b.category);

      if (cleanExpenses.length > 0) {
        await tx.expense.createMany({ data: cleanExpenses });
      }

      // Receipt images aren't in the backup; they're keyed by expense id. Re-point
      // the ones whose expense came back, and drop the rest (their expense is gone).
      const receipts = await tx.receipt.findMany({ where: { userId }, select: { id: true, expenseId: true } });
      for (const r of receipts) {
        const newId = expenseIdMap.get(r.expenseId);
        if (newId) await tx.receipt.update({ where: { id: r.id }, data: { expenseId: newId } });
        else await tx.receipt.delete({ where: { id: r.id } });
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
          throw new ValidationError(`Invalid semester at index ${sIdx}`);
        }
        const totalTuition = toCents(toFinPrecision(sem.totalTuition == null ? 0 : requireAmount(sem.totalTuition, MAX_AMOUNT, `semester ${sIdx} tuition`)));

        await tx.semester.create({
          data: {
            id: String(sem.id),
            name: safeName,
            totalTuition,
            userId,
            installments: {
              create: sem.installments.map((inst: any, iIdx: number) => {
                const amount = parseAmount(inst.amount);
                if (amount === null) {
                  throw new ValidationError(`Invalid installment at semester ${sIdx}, index ${iIdx}`);
                }
                const paidDate = inst.paidDate ? parseValidDate(inst.paidDate) : null;
                if (inst.paidDate && !paidDate) {
                  throw new ValidationError(`Invalid installment date at semester ${sIdx}, index ${iIdx}`);
                }
                return {
                  amount: toCents(toFinPrecision(amount)),
                  status: inst.status === 'paid' ? 'paid' : 'unpaid',
                  // Through the id map: the backup's expense ids were replaced.
                  expenseId: inst.expenseId ? expenseIdMap.get(String(inst.expenseId)) ?? null : null,
                  paidDate,
                };
              }),
            },
          },
        });
      }

      if (restoredSettings) {
        await tx.userSettings.upsert({ where: { userId }, create: { userId, ...restoredSettings }, update: restoredSettings });
      }
    }, { timeout: 20000 });

    const [restoredExpenses, restoredIncomes, restoredBudgets, restoredSemesters, settingsRow] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.semester.findMany({ where: { userId }, include: { installments: true } }),
      prisma.userSettings.findUnique({ where: { userId } }),
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
      expenses: restoredExpenses.map(expenseToClient).map(cleanDate),
      incomes: restoredIncomes.map(incomeToClient).map(cleanDate),
      budgets: restoredBudgets.map(budgetToClient),
      semesters: restoredSemesters.map(semesterToClient).map(cleanPaidDate),
      settings: settingsToClient(settingsRow),
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

    // A bad entry in the backup: say which, as a 400.
    if (error instanceof ValidationError) {
      return sendError(res, 400, 'INVALID_BACKUP', error.message);
    }
    // The real error is logged and audited above; return a generic message so
    // internal/Prisma details aren't leaked to the client.
    return sendError(res, 500, 'RESTORE_FAILED', 'Failed to restore backup.');
  }
});

// --- Wipe all of the user's financial data (irreversible) ---
// POST /api/data/wipe  { confirm: "DELETE" }
// Uses POST (not DELETE) because the client omits Content-Type on DELETE, which
// would leave the confirmation body unparsed. Requires the exact phrase so it
// can't fire by accident.
router.post('/wipe', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { confirm } = req.body || {};

  if (confirm !== 'DELETE') {
    return sendError(res, 400, 'CONFIRMATION_REQUIRED', 'Type DELETE to confirm data deletion.');
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      // Tuition installments hang off semesters; remove them first.
      await tx.tuitionInstallment.deleteMany({ where: { semesterUserId: userId } }).catch(() => undefined);
      const receipts = await tx.receipt.deleteMany({ where: { userId } }).catch(() => ({ count: 0 }));
      const semesters = await tx.semester.deleteMany({ where: { userId } });
      const expenses = await tx.expense.deleteMany({ where: { userId } });
      const incomes = await tx.income.deleteMany({ where: { userId } });
      const budgets = await tx.budget.deleteMany({ where: { userId } });
      // Savings goals, account balances and paused recurring charges are
      // financial data too; preferences (currency, categories, …) stay.
      await tx.userSettings.updateMany({ where: { userId }, data: WIPED_SETTINGS });
      return {
        expenses: expenses.count,
        incomes: incomes.count,
        budgets: budgets.count,
        semesters: semesters.count,
        receipts: (receipts as { count: number }).count,
      };
    });

    await writeAuditLog({
      action: 'data_wipe',
      userId,
      success: true,
      route: '/api/data/wipe',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: deleted,
    });

    const settingsRow = await prisma.userSettings.findUnique({ where: { userId } });
    return res.json({ message: 'All data deleted.', deleted, settings: settingsToClient(settingsRow) });
  } catch (error: any) {
    console.error('Failed to wipe data:', error);
    await writeAuditLog({
      action: 'data_wipe',
      userId,
      success: false,
      route: '/api/data/wipe',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { error: error?.message || 'unknown' },
    });
    return sendError(res, 500, 'WIPE_FAILED', 'Failed to delete data.');
  }
});

export default router;