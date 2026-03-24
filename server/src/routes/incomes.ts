import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { toFinPrecision, parseFiniteFloat, parseValidDate } from '../utils/math';
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';
import { sanitizeText } from '../utils/sanitize';

const router = Router();

// --- Protect all routes in this file ---
router.use(authMiddleware);

// S4: Input length limits
const MAX_TEXT_LENGTH = SERVER_CONFIG.limits.maxTextLength;

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

// --- 1. Create new Income ---
// POST /api/incomes
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { title, amount, category, date, notes, originalAmount, originalCurrency, tags, metadata } = req.body;

  const safeTitle = sanitizeText(title);
  const safeCategory = sanitizeText(category);
  const safeNotes = sanitizeText(notes);
  const safeTags = normalizeTags(tags);
  const safeMetadata = normalizeMetadata(metadata);

  if (!safeTitle || amount == null || !safeCategory || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // S4: Input length limits
  if (safeTitle.length > MAX_TEXT_LENGTH || safeCategory.length > MAX_TEXT_LENGTH || (safeNotes && safeNotes.length > MAX_TEXT_LENGTH)) {
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

  try {
    const newIncome = await prisma.income.create({
      data: {
        title: safeTitle,
        amount: toFinPrecision(parsedAmount),
        category: safeCategory,
        date: parsedDate,
        notes: safeNotes || undefined,
        originalAmount: parsedOriginalAmount != null ? toFinPrecision(parsedOriginalAmount) : undefined,
        originalCurrency: originalCurrency || undefined,
        tags: safeTags,
        metadata: safeMetadata,
        userId: userId,
      },
    });
    
    res.status(201).json({
      ...newIncome,
      date: newIncome.date.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Failed to create income:', error);
    res.status(500).json({ message: 'Failed to create income' });
  }
});

// --- 2. Update an Income ---
// PUT /api/incomes/:id
router.put('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomeId = req.params.id;
  const { title, amount, category, date, notes, originalAmount, originalCurrency, tags, metadata } = req.body;

  const safeTitle = sanitizeText(title);
  const safeCategory = sanitizeText(category);
  const safeNotes = sanitizeText(notes);
  const safeTags = normalizeTags(tags);
  const safeMetadata = normalizeMetadata(metadata);

  if (!safeTitle || amount == null || !safeCategory || !date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (safeTitle.length > MAX_TEXT_LENGTH || safeCategory.length > MAX_TEXT_LENGTH || (safeNotes && safeNotes.length > MAX_TEXT_LENGTH)) {
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

  try {
    const updatedIncome = await prisma.income.update({
      where: {
        id: incomeId,
        userId: userId,
      },
      data: {
        title: safeTitle,
        amount: toFinPrecision(parsedAmount),
        category: safeCategory,
        date: parsedDate,
        notes: safeNotes || undefined,
        originalAmount: parsedOriginalAmount != null ? toFinPrecision(parsedOriginalAmount) : undefined,
        originalCurrency: originalCurrency || undefined,
        tags: safeTags,
        metadata: safeMetadata,
      },
    });

    res.json({
      ...updatedIncome,
      date: updatedIncome.date.toISOString().split('T')[0]
    });
  } catch (error: any) {
    console.error('Failed to update income:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Income not found' });
    }
    res.status(500).json({ message: 'Failed to update income' });
  }
});


// --- 3. Delete an Income ---
// DELETE /api/incomes/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const incomeId = req.params.id;

  try {
    await prisma.income.delete({
      where: {
        id: incomeId,
        userId: userId,
      },
    });

    await writeAuditLog({
      action: 'income_delete',
      userId,
      success: true,
      route: '/api/incomes/:id',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { incomeId },
    });

    res.status(200).json({ success: true, message: 'Income deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete income:', error);

    await writeAuditLog({
      action: 'income_delete',
      userId,
      success: false,
      route: '/api/incomes/:id',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { incomeId, error: error?.message || 'unknown' },
    });

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Income not found' });
    }
    res.status(500).json({ message: 'Failed to delete income' });
  }
});

export default router;