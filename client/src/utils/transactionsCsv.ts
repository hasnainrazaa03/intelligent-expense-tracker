import type { Expense, Income } from '../types';
import { parseCsvRows, parseAmountCell } from './bankImport';
import { formatCalendarDate } from './dateUtils';
import { toCsv } from './csv';

// Orbit's own CSV format for transactions, written by the export and read
// back by the importer (round trip, improvement 17). Expenses and incomes
// share one file; the `type` column tells them apart. A file without `type`
// (an older export, or a hand-made one) is read as expenses.

export const TRANSACTION_CSV_COLUMNS = [
  'type', 'date', 'title', 'amount', 'category', 'paymentMethod', 'account', 'notes', 'tags',
  'isRecurring', 'taxCategory', 'isTaxDeductible', 'originalAmount', 'originalCurrency',
] as const;

export const REQUIRED_CSV_HEADERS = ['title', 'amount', 'category', 'date'] as const;

/** Expenses and incomes as one CSV, oldest first. Only portable fields: no ids, links or metadata. */
export const transactionsToCsv = (expenses: Expense[], incomes: Income[]): string => {
  const rows: Record<string, unknown>[] = [
    ...expenses.map((e) => ({
      type: 'expense', date: e.date, title: e.title, amount: e.amount, category: e.category,
      paymentMethod: e.paymentMethod, account: e.account, notes: e.notes, tags: e.tags,
      isRecurring: e.isRecurring ? 'true' : '', taxCategory: e.taxCategory, isTaxDeductible: e.isTaxDeductible ? 'true' : '',
      originalAmount: e.originalAmount, originalCurrency: e.originalCurrency,
    })),
    ...incomes.map((i) => ({
      type: 'income', date: i.date, title: i.title, amount: i.amount, category: i.category,
      account: i.account, notes: i.notes, tags: i.tags, originalAmount: i.originalAmount, originalCurrency: i.originalCurrency,
    })),
  ];
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return toCsv(TRANSACTION_CSV_COLUMNS, rows);
};

// Mirrors the server's per-row limits: one row over them made the server
// reject the WHOLE import, so a bad row is skipped here and a bad optional
// field is left out.
const MAX_AMOUNT = 10_000_000;
const MAX_ORIGINAL_AMOUNT = 20_000_000;
const MAX_TEXT = 500;
const MAX_SHORT_TEXT = 200;

export interface TransactionsCsvResult {
  expenses: Omit<Expense, 'id'>[];
  incomes: Omit<Income, 'id'>[];
  /** Rows skipped for any reason (includes `nonPositive`). */
  skipped: number;
  /** Of those, rows with a zero or negative amount (refunds/credits). */
  nonPositive: number;
}

export class TransactionsCsvError extends Error {}

const short = (v: string | undefined) => (v && v.length <= MAX_SHORT_TEXT ? v : undefined);
const flag = (v: string | undefined) => v?.trim().toLowerCase() === 'true';

/**
 * Parse a transactions CSV (Orbit's export, or one in the same shape). Bad
 * rows are skipped and counted; only a file-level problem throws.
 *
 * Handles (F18): "1,234.56" and "$12.50" as amounts, quoted notes with line
 * breaks, refunds (skipped rather than failing the batch), an Excel BOM.
 */
export const parseTransactionsCsv = (text: string, maxRows: number): TransactionsCsvResult => {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new TransactionsCsvError('CSV_EMPTY_OR_NO_DATA');
  if (rows.length - 1 > maxRows) throw new TransactionsCsvError(`CSV_ROW_LIMIT_EXCEEDED_MAX_${maxRows}`);

  const header = rows[0].map((h) => h.trim());
  if (!REQUIRED_CSV_HEADERS.every((h) => header.includes(h))) {
    throw new TransactionsCsvError(`MISSING_HEADERS: ${REQUIRED_CSV_HEADERS.join(', ')}`);
  }

  let skipped = 0;
  let nonPositive = 0;
  const expenses: Omit<Expense, 'id'>[] = [];
  const incomes: Omit<Income, 'id'>[] = [];

  for (const values of rows.slice(1)) {
    const entry: Record<string, string | undefined> = {};
    header.forEach((key, i) => { entry[key] = values[i] ? values[i] : undefined; });

    const type = (entry.type || 'expense').trim().toLowerCase();
    const amount = parseAmountCell(entry.amount);
    if ((type !== 'expense' && type !== 'income') || !entry.title || !entry.category || !entry.date || amount === null) { skipped++; continue; }
    if (amount <= 0) { skipped++; nonPositive++; continue; }
    if (amount > MAX_AMOUNT || entry.title.length > MAX_TEXT || entry.category.length > MAX_TEXT) { skipped++; continue; }

    // Keep an ISO calendar day verbatim; only a locale date ("1/15/2025") goes
    // through Date. Never via toISOString(): a YYYY-MM-DD string parsed by
    // `new Date` is UTC midnight, a day earlier for users west of UTC.
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
    const original = parseAmountCell(entry.originalAmount);
    const currency = entry.originalCurrency?.trim().toUpperCase();
    const keepOriginal = original !== null && original > 0 && original <= MAX_ORIGINAL_AMOUNT && !!currency && /^[A-Z]{3}$/.test(currency);
    const common = {
      title: entry.title,
      amount: Math.round(amount * 100) / 100,
      category: entry.category,
      date,
      ...(entry.notes ? { notes: entry.notes.slice(0, MAX_TEXT) } : {}),
      ...(tags && tags.length ? { tags } : {}),
      ...(short(entry.account) ? { account: short(entry.account) } : {}),
      ...(keepOriginal ? { originalAmount: Math.round(original! * 100) / 100, originalCurrency: currency } : {}),
    };

    if (type === 'income') {
      incomes.push(common);
    } else {
      expenses.push({
        ...common,
        paymentMethod: entry.paymentMethod && entry.paymentMethod.length <= MAX_TEXT ? entry.paymentMethod : undefined,
        isRecurring: flag(entry.isRecurring),
        ...(short(entry.taxCategory) ? { taxCategory: short(entry.taxCategory) } : {}),
        ...(flag(entry.isTaxDeductible) ? { isTaxDeductible: true } : {}),
      });
    }
  }

  return { expenses, incomes, skipped, nonPositive };
};
