// Recurring charges, as in client/src/utils/recurrence.ts: each series
// (title + category) recurs weekly, monthly (the default) or yearly from its
// latest entry, on the series' real day of the month.
import { addDays, addMonthsSameDay, daysInMonth } from './calendar';

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurringExpense {
  title: string;
  category: string;
  amount: number; // dollars
  date: string; // YYYY-MM-DD
  isRecurring?: boolean | null;
  metadata?: unknown;
}

export const frequencyOf = (e: { metadata?: unknown }): Frequency => {
  const f = (e.metadata as Record<string, unknown> | null | undefined)?.recurrence;
  return f === 'weekly' || f === 'yearly' ? f : 'monthly';
};

export const nextOccurrence = (day: string, freq: Frequency, anchorDay?: number) =>
  freq === 'weekly' ? addDays(day, 7) : addMonthsSameDay(day, freq === 'yearly' ? 12 : 1, anchorDay);

/** The series' real day of the month: a month-end entry may have been clamped (31 → 28). */
export const seriesAnchorDay = (dates: string[]): number => {
  const sorted = [...dates].sort();
  const [y, m, d] = sorted[sorted.length - 1].split('-').map(Number);
  if (d < daysInMonth(y, m)) return d;
  return Math.max(...sorted.map((s) => Number(s.slice(8, 10))));
};

const identity = (e: { title: string; category: string }) => `${e.title.toLowerCase()}|${e.category.toLowerCase()}`;

export interface UpcomingBill { identity: string; title: string; amount: number; due: string }

/**
 * Recurring charges whose next date falls between `today` and `today + withinDays`
 * and hasn't been entered yet. `paused` uses the app's keys ("title|category|amount").
 */
export const upcomingBills = (expenses: RecurringExpense[], today: string, withinDays: number, paused: Record<string, unknown> = {}): UpcomingBill[] => {
  const latest = new Map<string, RecurringExpense>();
  const dates = new Map<string, string[]>();
  for (const e of expenses) {
    if (!e.isRecurring) continue;
    const key = identity(e);
    const current = latest.get(key);
    if (!current || current.date < e.date) latest.set(key, e);
    dates.set(key, [...(dates.get(key) ?? []), e.date]);
  }
  const horizon = addDays(today, withinDays);
  const bills: UpcomingBill[] = [];
  for (const [key, e] of latest) {
    if (paused[`${e.title}|${e.category}|${e.amount}`] === true) continue;
    const due = nextOccurrence(e.date, frequencyOf(e), seriesAnchorDay(dates.get(key) ?? [e.date]));
    if (due < today || due > horizon) continue;
    // Already entered (recurring or not) on or after the due date.
    if (expenses.some((x) => identity(x) === key && x.date >= due)) continue;
    bills.push({ identity: key, title: e.title, amount: e.amount, due });
  }
  return bills.sort((a, b) => a.due.localeCompare(b.due));
};
