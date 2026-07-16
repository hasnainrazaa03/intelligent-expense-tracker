import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware} from '../middleware/auth';
import { Expense } from '../types';
import { toFinPrecision, parseFiniteFloat, parseValidDate } from '../utils/math';
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';
import { sanitizeText, sanitizeOptionalText } from '../utils/sanitize';
import { normalizeTags, normalizeMetadata, normalizeStringArray, normalizeNumberArray } from '../utils/normalize';
import { toCents, expenseToClient } from '../utils/money';

const router = Router();

// --- Protect all routes in this file ---
router.use(authMiddleware);

// Maximum bulk import size
const MAX_BULK_SIZE = SERVER_CONFIG.limits.maxBulkImportSize;
// S4: Input length limits
const MAX_TEXT_LENGTH = SERVER_CONFIG.limits.maxTextLength;

// Validate an optional household tag: returns the id only if the user is an
// active member (so nobody can tag an expense into a household they're not in),
// null when untagged, or 'FORBIDDEN' when they aren't a member.
const resolveHouseholdId = async (userId: string, householdId: unknown): Promise<string | null | 'FORBIDDEN'> => {
  if (!householdId || typeof householdId !== 'string') return null;
  const member = await prisma.householdMember.findFirst({ where: { householdId, userId, status: 'active' } });
  return member ? householdId : 'FORBIDDEN';
};

// --- 1. Create new Expense ---
// POST /api/expenses
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const {
    title,
    amount,
    category,
    date,
    paymentMethod,
    notes,
    originalAmount,
    originalCurrency,
    isRecurring,
    tags,
    metadata,
    taxCategory,
    isTaxDeductible,
    splitParticipants,
    splitShares,
    receiptText,
    receiptFileName,
    householdId,
    clientRequestId,
  } = req.body;

  const safeTitle = sanitizeText(title);
  const safeCategory = sanitizeText(category);
  const safePaymentMethod = sanitizeText(paymentMethod);
  const safeNotes = sanitizeText(notes);
  const safeTaxCategory = sanitizeText(taxCategory);
  const safeReceiptText = sanitizeText(receiptText);
  const safeReceiptFileName = sanitizeText(receiptFileName);
  const safeTags = normalizeTags(tags);
  const safeMetadata = normalizeMetadata(metadata);
  const safeSplitParticipants = normalizeStringArray(splitParticipants);
  const safeSplitShares = normalizeNumberArray(splitShares);

  // Basic validation
  if (!safeTitle || amount == null || !safeCategory || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // S4: Input length limits
  if (
    safeTitle.length > MAX_TEXT_LENGTH ||
    safeCategory.length > MAX_TEXT_LENGTH ||
    (safePaymentMethod && safePaymentMethod.length > MAX_TEXT_LENGTH) ||
    (safeNotes && safeNotes.length > MAX_TEXT_LENGTH)
  ) {
    return res.status(400).json({ message: `Text fields must be ${MAX_TEXT_LENGTH} characters or less` });
  }

  const parsedAmount = parseFiniteFloat(amount);
  if (parsedAmount === null || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  const parsedOriginalAmount = originalAmount != null ? parseFiniteFloat(originalAmount) : null;
  if (originalAmount != null && (parsedOriginalAmount === null || parsedOriginalAmount <= 0)) {
    return res.status(400).json({ message: 'Invalid original amount' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ message: 'Invalid date' });
  }

  const resolvedHouseholdId = await resolveHouseholdId(userId, householdId);
  if (resolvedHouseholdId === 'FORBIDDEN') {
    return res.status(403).json({ message: 'You are not a member of that household.' });
  }

  // Idempotency (offline replay): if this client key already created an expense
  // for this user, return that one instead of creating a duplicate.
  if (typeof clientRequestId === 'string' && clientRequestId) {
    const existing = await prisma.expense.findFirst({ where: { userId, clientRequestId } });
    if (existing) {
      return res.status(200).json({ ...expenseToClient(existing), date: existing.date.toISOString().split('T')[0] });
    }
  }

  try {
    const newExpense = await prisma.expense.create({
      data: {
        title: safeTitle,
        amount: toCents(toFinPrecision(parsedAmount)),
        category: safeCategory,
        date: parsedDate,
        paymentMethod: safePaymentMethod || undefined,
        notes: safeNotes || undefined,
        originalAmount: parsedOriginalAmount != null ? toCents(toFinPrecision(parsedOriginalAmount)) : undefined,
        originalCurrency: originalCurrency || undefined,
        isRecurring: Boolean(isRecurring),
        tags: safeTags,
        metadata: safeMetadata,
        taxCategory: safeTaxCategory || undefined,
        isTaxDeductible: Boolean(isTaxDeductible),
        splitParticipants: safeSplitParticipants,
        splitShares: safeSplitShares.map(toCents),
        receiptText: safeReceiptText || undefined,
        receiptFileName: safeReceiptFileName || undefined,
        householdId: resolvedHouseholdId,
        clientRequestId: typeof clientRequestId === 'string' ? clientRequestId : undefined,
        userId: userId,
      },
    });

    res.status(201).json({
      ...expenseToClient(newExpense),
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
  const {
    title,
    amount,
    category,
    date,
    paymentMethod,
    notes,
    originalAmount,
    originalCurrency,
    isRecurring,
    tags,
    metadata,
    taxCategory,
    isTaxDeductible,
    splitParticipants,
    splitShares,
    receiptText,
    receiptFileName,
    householdId,
    clientRequestId,
  } = req.body;

  const safeTitle = sanitizeText(title);
  const safeCategory = sanitizeText(category);
  const safePaymentMethod = sanitizeText(paymentMethod);
  const safeNotes = sanitizeText(notes);
  const safeTaxCategory = sanitizeText(taxCategory);
  const safeReceiptText = sanitizeText(receiptText);
  const safeReceiptFileName = sanitizeText(receiptFileName);
  const safeTags = normalizeTags(tags);
  const safeMetadata = normalizeMetadata(metadata);
  const safeSplitParticipants = normalizeStringArray(splitParticipants);
  const safeSplitShares = normalizeNumberArray(splitShares);

  // Required-field validation (same as POST)
  if (!safeTitle || amount == null || !safeCategory || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (
    safeTitle.length > MAX_TEXT_LENGTH ||
    safeCategory.length > MAX_TEXT_LENGTH ||
    (safePaymentMethod && safePaymentMethod.length > MAX_TEXT_LENGTH) ||
    (safeNotes && safeNotes.length > MAX_TEXT_LENGTH)
  ) {
    return res.status(400).json({ message: `Text fields must be ${MAX_TEXT_LENGTH} characters or less` });
  }

  const parsedAmount = parseFiniteFloat(amount);
  if (parsedAmount === null || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  const parsedOriginalAmount = originalAmount != null ? parseFiniteFloat(originalAmount) : null;
  if (originalAmount != null && (parsedOriginalAmount === null || parsedOriginalAmount <= 0)) {
    return res.status(400).json({ message: 'Invalid original amount' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ message: 'Invalid date' });
  }

  const resolvedHouseholdId = await resolveHouseholdId(userId, householdId);
  if (resolvedHouseholdId === 'FORBIDDEN') {
    return res.status(403).json({ message: 'You are not a member of that household.' });
  }

  try {
    const updatedExpense = await prisma.expense.update({
      where: {
        id: expenseId,
        userId: userId,
      },
      data: {
        title: safeTitle,
        amount: toCents(toFinPrecision(parsedAmount)),
        category: safeCategory,
        date: parsedDate,
        paymentMethod: safePaymentMethod || undefined,
        notes: safeNotes || undefined,
        originalAmount: parsedOriginalAmount != null ? toCents(toFinPrecision(parsedOriginalAmount)) : undefined,
        originalCurrency: originalCurrency || undefined,
        isRecurring: Boolean(isRecurring),
        tags: safeTags,
        metadata: safeMetadata,
        taxCategory: safeTaxCategory || undefined,
        isTaxDeductible: Boolean(isTaxDeductible),
        splitParticipants: safeSplitParticipants,
        splitShares: safeSplitShares.map(toCents),
        receiptText: safeReceiptText || undefined,
        receiptFileName: safeReceiptFileName || undefined,
        householdId: resolvedHouseholdId,
      },
    });

    res.json({
      ...expenseToClient(updatedExpense),
      date: updatedExpense.date.toISOString().split('T')[0]
    });
  } catch (error: any) {
    console.error('Failed to update expense:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.status(500).json({ message: 'Failed to update expense' });
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
        userId: userId,
      },
    });
    // Clean up any attached receipt image (no FK cascade to the Receipt store).
    await prisma.receipt.deleteMany({ where: { expenseId, userId } });

    await writeAuditLog({
      action: 'expense_delete',
      userId,
      success: true,
      route: '/api/expenses/:id',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { expenseId },
    });

    res.status(200).json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete expense:', error);

    await writeAuditLog({
      action: 'expense_delete',
      userId,
      success: false,
      route: '/api/expenses/:id',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { expenseId, error: error?.message || 'unknown' },
    });

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.status(500).json({ message: 'Failed to delete expense' });
  }
});

// --- 4. Create Multiple Expenses (Bulk Import) ---
// POST /api/expenses/bulk
router.post('/bulk', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const expenses = req.body as Omit<Expense, 'id'>[];

  if (!Array.isArray(expenses) || expenses.length === 0) {
    return res.status(400).json({ message: 'Request body must be a non-empty array of expenses' });
  }

  if (expenses.length > MAX_BULK_SIZE) {
    return res.status(400).json({ message: `Maximum bulk import size is ${MAX_BULK_SIZE} records` });
  }

  try {
    const dataToCreate = expenses.map((expense, index) => {
      const parsedDate = parseValidDate(expense.date);
      if (!parsedDate) {
        throw new Error(`Invalid date at row ${index + 1}: "${expense.date}"`);
      }

      const safeTitle = sanitizeText(expense.title);
      const safeCategory = sanitizeText(expense.category);
      if (!safeTitle || !safeCategory) {
        throw new Error(`Title and category are required at row ${index + 1}`);
      }
      if (
        safeTitle.length > MAX_TEXT_LENGTH ||
        safeCategory.length > MAX_TEXT_LENGTH ||
        (expense.paymentMethod && String(expense.paymentMethod).trim().length > MAX_TEXT_LENGTH) ||
        (expense.notes && String(expense.notes).trim().length > MAX_TEXT_LENGTH)
      ) {
        throw new Error(`Text field too long at row ${index + 1}`);
      }

      const parsedAmount = parseFiniteFloat(expense.amount as any);
      if (parsedAmount === null || parsedAmount <= 0) {
        throw new Error(`Invalid amount at row ${index + 1}: "${expense.amount}"`);
      }

      const parsedOriginalAmount = expense.originalAmount != null ? parseFiniteFloat(expense.originalAmount as any) : null;
      if (expense.originalAmount != null && (parsedOriginalAmount === null || parsedOriginalAmount <= 0)) {
        throw new Error(`Invalid original amount at row ${index + 1}`);
      }

      return {
        title: safeTitle,
        category: safeCategory,
        amount: toCents(toFinPrecision(parsedAmount)),
        date: parsedDate,
        paymentMethod: sanitizeOptionalText(expense.paymentMethod),
        notes: sanitizeOptionalText(expense.notes),
        originalAmount: parsedOriginalAmount != null ? toCents(toFinPrecision(parsedOriginalAmount)) : undefined,
        originalCurrency: expense.originalCurrency || undefined,
        isRecurring: Boolean(expense.isRecurring),
        tags: normalizeTags(expense.tags),
        metadata: normalizeMetadata(expense.metadata),
        taxCategory: sanitizeOptionalText(expense.taxCategory),
        isTaxDeductible: Boolean(expense.isTaxDeductible),
        splitParticipants: normalizeStringArray(expense.splitParticipants),
        splitShares: normalizeNumberArray(expense.splitShares).map(toCents),
        receiptText: sanitizeOptionalText(expense.receiptText),
        receiptFileName: sanitizeOptionalText(expense.receiptFileName),
        userId: userId, 
      };
    });

    await prisma.expense.createMany({
      data: dataToCreate,
    });
    
    res.status(201).json({ message: `${expenses.length} expenses imported successfully` });

  } catch (error: any) {
    // Don't surface internal/Prisma error text to the client.
    console.error('Failed to bulk create expenses:', error);
    res.status(500).json({ message: 'Failed to import expenses' });
  }
});

// --- Receipt image (stored in a separate collection so it stays out of /all) ---
// Kept under the 1MB JSON body limit (index.ts) so oversized uploads get this
// route's clear message rather than a generic parser error. Downscaled receipt
// JPEGs are ~50–150KB, well within this.
const MAX_RECEIPT_BYTES = 900_000;
// Only raster image data URLs — reject SVG (can carry script) and other types.
const RECEIPT_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,/i;

// PUT /api/expenses/:id/receipt — upsert the receipt image for an owned expense
router.put('/:id/receipt', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const expenseId = req.params.id;
  const image = req.body?.image;
  if (typeof image !== 'string' || !RECEIPT_DATA_URL.test(image)) {
    return res.status(400).json({ message: 'A valid PNG/JPEG/WebP image is required.' });
  }
  if (image.length > MAX_RECEIPT_BYTES) {
    return res.status(413).json({ message: 'Receipt image is too large (max ~900KB after compression).' });
  }
  const owned = await prisma.expense.findFirst({ where: { id: expenseId, userId }, select: { id: true } });
  if (!owned) return res.status(404).json({ message: 'Expense not found.' });

  await prisma.receipt.upsert({
    where: { expenseId },
    update: { image },
    create: { expenseId, userId, image },
  });
  res.json({ message: 'Receipt saved.' });
});

// GET /api/expenses/:id/receipt — fetch the receipt image (owner only)
router.get('/:id/receipt', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const receipt = await prisma.receipt.findFirst({ where: { expenseId: req.params.id, userId }, select: { image: true } });
  if (!receipt) return res.status(404).json({ message: 'No receipt attached.' });
  res.json({ image: receipt.image });
});

// DELETE /api/expenses/:id/receipt — remove the receipt image
router.delete('/:id/receipt', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await prisma.receipt.deleteMany({ where: { expenseId: req.params.id, userId } });
  res.json({ message: 'Receipt removed.' });
});

export default router;