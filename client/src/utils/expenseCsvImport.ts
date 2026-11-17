import type { Expense } from '../types';
import { parseCsvRows, parseAmountCell } from './bankImport';
import { formatCalendarDate } from './dateUtils';

// Mirrors the server's per-row limits (MAX_AMOUNT, maxTextLength): one row
// over them made the server reject the WHOLE import, so they're skipped here.
const MAX_AMOUNT = 10_000_000;
const MAX_TEXT = 500;

export const REQUIRED_EXPENSE_CSV_HEADERS = ['title', 'amount', 'category', 'date'] as const;

export interface ExpenseCsvResult {
  expenses: Omit<Expense, 'id'>[];
  /** Rows skipped for any reason (includes `nonPositive`). */
  skipped: number;
  /** Of those, rows with a zero or negative amount (refunds/credits). */
  nonPositive: number;
}

export class ExpenseCsvError extends Error {}

/**
 * Parse an expense CSV (the app's own export, or one in the same shape).
 * Bad rows are skipped and counted; only a file-level problem throws.
 *
 * Fixes over the old inline parser (F18): "1,234.56" was read as 1 and
 * "$12.50" was rejected (now parsed as amounts); a quoted note containing a
 * newline split the row apart; a negative amount reached the server and failed
 * the whole batch; an Excel BOM failed the header check; tags were dropped.
 */
export const parseExpenseCsv = (text: string, maxRows: number): ExpenseCsvResult => {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new ExpenseCsvError('CSV_EMPTY_OR_NO_DATA');
  if (rows.length - 1 > maxRows) throw new ExpenseCsvError(`CSV_ROW_LIMIT_EXCEEDED_MAX_${maxRows}`);

  const header = rows[0].map((h) => h.trim());
  if (!REQUIRED_EXPENSE_CSV_HEADERS.every((h) => header.includes(h))) {
    throw new ExpenseCsvError(`MISSING_HEADERS: ${REQUIRED_EXPENSE_CSV_HEADERS.join(', ')}`);
  }

  let skipped = 0;
  let nonPositive = 0;
  const expenses: Omit<Expense, 'id'>[] = [];

  for (const values of rows.slice(1)) {
    const entry: Record<string, string | undefined> = {};
    header.forEach((key, i) => { entry[key] = values[i] ? values[i] : undefined; });

    const amount = parseAmountCell(entry.amount);
    if (!entry.title || !entry.category || !entry.date || amount === null) { skipped++; continue; }
    if (amount <= 0) { skipped++; nonPositive++; continue; }
    if (amount > MAX_AMOUNT || entry.title.length > MAX_TEXT || entry.category.length > MAX_TEXT) { skipped++; continue; }

    // Keep an ISO calendar day (self-export) verbatim; only a locale date
    // (e.g. "1/15/2025") goes through Date. Never round-trip through
    // toISOString(): a YYYY-MM-DD string parsed by `new Date` is UTC midnight,
    // so its LOCAL day is a day earlier for users west of UTC.
    const rawDate = entry.date.trim();
    let date: string;
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      date = rawDate.slice(0, 10);
    } else {
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) { skipped++; continue; }
      date = formatCalendarDate(parsed);
    }

    const tags = entry.tags?.split(';').map((t) => t.trim()).filter(Boolean);
    expenses.push({
      title: entry.title,
      amount: Math.round(amount * 100) / 100,
      category: entry.category,
      date,
      paymentMethod: entry.paymentMethod && entry.paymentMethod.length <= MAX_TEXT ? entry.paymentMethod : undefined,
      notes: entry.notes ? entry.notes.slice(0, MAX_TEXT) : undefined,
      isRecurring: entry.isRecurring?.toLowerCase() === 'true',
      ...(tags && tags.length ? { tags } : {}),
    });
  }

  return { expenses, skipped, nonPositive };
};
