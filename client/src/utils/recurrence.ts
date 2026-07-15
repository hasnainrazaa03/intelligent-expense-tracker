import { Expense } from '../types';
import { addDays, formatCalendarDate, parseCalendarDate } from './dateUtils';

// Same day-of-month `months` later, clamped to the target month's length so
// Jan 31 + 1mo -> Feb 28 (dateUtils.addMonths snaps to the 1st, so it can't be
// reused here — recurrence must preserve the original day).
const addMonthsSameDay = (d: Date, months: number): Date => {
  const firstOfTarget = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const daysInTarget = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(d.getDate(), daysInTarget));
};

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';

// Frequency is stored on the expense's metadata under this reserved key, so no
// schema migration is needed. sanitizeText preserves plain words round-trip.
export const RECURRENCE_META_KEY = 'recurrence';

export const RECURRENCE_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/** Read an expense's recurrence frequency; legacy recurring items (no key) are monthly. */
export const getRecurrenceFrequency = (e: { metadata?: Record<string, string> }): RecurrenceFrequency => {
  const f = e.metadata?.[RECURRENCE_META_KEY];
  return f === 'weekly' || f === 'yearly' ? f : 'monthly';
};

/** The next calendar day (YYYY-MM-DD) one period after `dateStr`. addMonths is
 *  overflow-safe (clamps 29–31st), so month/year steps never skip or duplicate. */
export const nextOccurrence = (dateStr: string, freq: RecurrenceFrequency): string => {
  const d = parseCalendarDate(dateStr);
  if (freq === 'weekly') return formatCalendarDate(addDays(d, 7));
  if (freq === 'yearly') return formatCalendarDate(addMonthsSameDay(d, 12));
  return formatCalendarDate(addMonthsSameDay(d, 1));
};

/**
 * Given all expenses, return the recurring instances that are DUE on or before
 * `todayStr` and not yet materialized. Each recurring identity (title+category)
 * yields at most one suggestion — its next occurrence after the latest one on
 * record — so a long gap can't spam many backfilled entries.
 */
export const computeDueRecurring = (expenses: Expense[], todayStr: string): Omit<Expense, 'id'>[] => {
  const latestByIdentity = new Map<string, Expense>();
  expenses
    .filter((e) => e.isRecurring)
    .forEach((e) => {
      const key = `${e.title.toLowerCase()}|${e.category.toLowerCase()}`;
      const current = latestByIdentity.get(key);
      if (!current || current.date < e.date) latestByIdentity.set(key, e);
    });

  const due: Omit<Expense, 'id'>[] = [];
  for (const [key, e] of latestByIdentity) {
    const freq = getRecurrenceFrequency(e);
    const nextDate = nextOccurrence(e.date, freq);
    if (nextDate > todayStr) continue; // not due yet

    // Skip if an entry for this identity already exists on/after the due date
    // (it was already added — even if the added one wasn't flagged recurring).
    const alreadyMaterialized = expenses.some(
      (x) => `${x.title.toLowerCase()}|${x.category.toLowerCase()}` === key && x.date >= nextDate
    );
    if (alreadyMaterialized) continue;

    due.push({
      date: nextDate,
      title: e.title,
      amount: e.amount,
      category: e.category,
      paymentMethod: e.paymentMethod,
      notes: e.notes,
      originalAmount: e.originalAmount,
      originalCurrency: e.originalCurrency,
      isRecurring: true,
      metadata: e.metadata, // preserve the frequency key
    });
  }
  return due;
};
