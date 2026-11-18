import { useMemo } from 'react';
import { Expense, Income } from '../types';
import { DateRange } from '../components/Dashboard';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatCalendarDate,
  isWithinRange,
  parseCalendarDate,
  startOfMonth,
} from '../utils/dateUtils';
import { useToday } from './useToday';

interface DateRangeResult {
  filteredExpenses: Expense[];
  filteredIncomes: Income[];
  previousPeriodExpenses: Expense[];
  previousPeriodIncomes: Income[];
  /** Compare only current-period items dated on/before this day against the
   *  previous period (null = compare everything). See upToCutoff. */
  comparisonCutoff: string | null;
}

interface Window {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  /** Last day of the current window that is like-for-like with prevEnd. */
  compareEnd: string;
}

/** Items dated on/before `cutoff` (all items when there's no cutoff). */
export const upToCutoff = <T extends { date: string }>(items: T[], cutoff: string | null | undefined): T[] =>
  cutoff ? items.filter((item) => item.date <= cutoff) : items;

// All boundaries are LOCAL calendar days (YYYY-MM-DD) so a user's "this month"
// matches the days they picked, regardless of timezone (fixes the UTC drift
// that hid today's transactions for UTC+ users).
// Exported for the export dialog, so its ranges match the dashboard's exactly.
export function computeWindow(dateRange: DateRange, today: string): Window | null {
  const now = parseCalendarDate(today);

  switch (dateRange) {
    case 'this_month': {
      // "This month" lists the WHOLE calendar month. It used to end today, so
      // rent dated the 30th and logged on the 16th vanished from the list and
      // totals (while the budget alert, which uses the full month, counted it).
      // The comparison stays like-for-like: this month up to today vs the SAME
      // span last month. `addMonths` returns the 1st, so build last month's
      // equivalent day directly, clamped to its length (the 31st → Feb 28) (L5).
      const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const prevDay = Math.min(now.getDate(), daysInPrevMonth);
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        compareEnd: formatCalendarDate(now),
        prevStart: startOfMonth(addMonths(now, -1)),
        prevEnd: formatCalendarDate(new Date(now.getFullYear(), now.getMonth() - 1, prevDay)),
      };
    }
    case 'last_month':
      return {
        start: startOfMonth(addMonths(now, -1)),
        end: endOfMonth(addMonths(now, -1)),
        compareEnd: endOfMonth(addMonths(now, -1)),
        prevStart: startOfMonth(addMonths(now, -2)),
        prevEnd: endOfMonth(addMonths(now, -2)),
      };
    case 'last_90_days':
      // Two equal 90-day inclusive windows (was 91 vs 90 — L4).
      return {
        start: formatCalendarDate(addDays(now, -89)),
        end: formatCalendarDate(now),
        compareEnd: formatCalendarDate(now),
        prevStart: formatCalendarDate(addDays(now, -179)),
        prevEnd: formatCalendarDate(addDays(now, -90)),
      };
    case 'all_time':
    default:
      return null;
  }
}

export default function useDateRangeFilter(
  expenses: Expense[],
  incomes: Income[],
  dateRange: DateRange
): DateRangeResult {
  // The lists, totals and comparisons move on at midnight with everything else.
  const today = useToday();
  return useMemo(() => {
    const window = computeWindow(dateRange, today);
    if (!window) {
      return { filteredExpenses: expenses, filteredIncomes: incomes, previousPeriodExpenses: [], previousPeriodIncomes: [], comparisonCutoff: null };
    }

    const { start, end, prevStart, prevEnd, compareEnd } = window;

    return {
      filteredExpenses: expenses.filter((exp) => isWithinRange(exp.date, start, end)),
      filteredIncomes: incomes.filter((inc) => isWithinRange(inc.date, start, end)),
      previousPeriodExpenses: expenses.filter((exp) => isWithinRange(exp.date, prevStart, prevEnd)),
      previousPeriodIncomes: incomes.filter((inc) => isWithinRange(inc.date, prevStart, prevEnd)),
      comparisonCutoff: compareEnd < end ? compareEnd : null,
    };
  }, [expenses, incomes, dateRange, today]);
}
