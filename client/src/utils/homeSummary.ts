import type { Budget, Expense, Income } from '../types';
import { computeBudgetSpend } from './budgetUtils';
import { formatCalendarDate, parseCalendarDate } from './dateUtils';
import { getRecurrenceFrequency, nextOccurrence, seriesAnchorDay } from './recurrence';

/** What Home's main card says about this month against its budget (U3). */
export interface MonthPlan {
  budget: number;
  spent: number;
  left: number;
  over: number;
  /** Days left in the month, today included. */
  daysLeft: number;
  /** What's left, spread over the days left: spend about this a day to stay on budget. */
  perDay: number;
  pct: number;
}

export const monthPlan = (budget: number, spent: number, today: string): MonthPlan => {
  const d = parseCalendarDate(today);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - d.getDate() + 1;
  const left = Math.max(0, budget - spent);
  return {
    budget,
    spent,
    left,
    over: Math.max(0, spent - budget),
    daysLeft,
    perDay: daysLeft > 0 ? left / daysLeft : 0,
    pct: budget > 0 ? (spent / budget) * 100 : 0,
  };
};

export interface BudgetRisk { category: string; spent: number; budget: number; pct: number }

/** The budgets closest to or over their limit this month, most used first. */
export const budgetsAtRisk = (budgets: Budget[], monthExpenses: Expense[], limit = 3): BudgetRisk[] => {
  const categories = budgets.map((b) => b.category);
  return budgets
    .filter((b) => b.amount > 0)
    .map((b) => {
      const spent = computeBudgetSpend(b.category, monthExpenses, categories);
      return { category: b.category, spent, budget: b.amount, pct: (spent / b.amount) * 100 };
    })
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
};

export interface UpcomingCharge { title: string; category: string; amount: number; date: string }

const addDays = (ymd: string, n: number): string => {
  const d = parseCalendarDate(ymd);
  d.setDate(d.getDate() + n);
  return formatCalendarDate(d);
};

/**
 * Recurring charges whose next date falls after today and within `days`.
 * Charges already due are left to the recurring review (computeDueRecurring),
 * and paused ones (keyed as the planning panel keys them) are left out.
 */
export const upcomingRecurring = (
  expenses: Expense[],
  today: string,
  days = 14,
  paused: Record<string, unknown> = {},
): UpcomingCharge[] => {
  const horizon = addDays(today, days);
  const latest = new Map<string, Expense>();
  const dates = new Map<string, string[]>();
  for (const e of expenses) {
    if (!e.isRecurring) continue;
    const key = `${e.title.toLowerCase()}|${e.category.toLowerCase()}`;
    const current = latest.get(key);
    if (!current || current.date < e.date) latest.set(key, e);
    dates.set(key, [...(dates.get(key) ?? []), e.date]);
  }
  const out: UpcomingCharge[] = [];
  for (const [key, e] of latest) {
    if (paused[`${e.title}|${e.category}|${e.amount}`]) continue;
    const next = nextOccurrence(e.date, getRecurrenceFrequency(e), seriesAnchorDay(dates.get(key) ?? [e.date]));
    if (next <= today || next > horizon) continue;
    out.push({ title: e.title, category: e.category, amount: e.amount, date: next });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
};

export type RecentItem = { type: 'expense'; item: Expense } | { type: 'income'; item: Income };

/** The latest entries, expenses and income together, newest date first. */
export const recentTransactions = (expenses: Expense[], incomes: Income[], limit = 5): RecentItem[] =>
  [
    ...expenses.map((item) => ({ type: 'expense' as const, item })),
    ...incomes.map((item) => ({ type: 'income' as const, item })),
  ]
    .sort((a, b) => b.item.date.localeCompare(a.item.date))
    .slice(0, limit);

/** Percent change from `before` to `now`; undefined when there's nothing to compare. */
export const percentChange = (now: number, before: number): number | undefined =>
  before > 0 ? ((now - before) / before) * 100 : now > 0 ? Infinity : undefined;
