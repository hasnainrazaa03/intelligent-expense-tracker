import { useMemo } from 'react';
import { Expense, Income } from '../types';
import { DateRange } from '../components/Dashboard';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatCalendarDate,
  isWithinRange,
  startOfMonth,
} from '../utils/dateUtils';

interface DateRangeResult {
  filteredExpenses: Expense[];
  filteredIncomes: Income[];
  previousPeriodExpenses: Expense[];
}

interface Window {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
}

// All boundaries are LOCAL calendar days (YYYY-MM-DD) so a user's "this month"
// matches the days they picked, regardless of timezone (fixes the UTC drift
// that hid today's transactions for UTC+ users).
function computeWindow(dateRange: DateRange): Window | null {
  const now = new Date();

  switch (dateRange) {
    case 'this_month':
      // "This month" is month-to-date (ends today), so compare against the SAME
      // month-to-date span last month — addMonths is overflow-safe and clamps the
      // day, so today's day-of-month maps to the equivalent day last month. Using
      // the full prior month here inflated the early-month delta (L5).
      return {
        start: startOfMonth(now),
        end: formatCalendarDate(now),
        prevStart: startOfMonth(addMonths(now, -1)),
        prevEnd: formatCalendarDate(addMonths(now, -1)),
      };
    case 'last_month':
      return {
        start: startOfMonth(addMonths(now, -1)),
        end: endOfMonth(addMonths(now, -1)),
        prevStart: startOfMonth(addMonths(now, -2)),
        prevEnd: endOfMonth(addMonths(now, -2)),
      };
    case 'last_90_days':
      // Two equal 90-day inclusive windows (was 91 vs 90 — L4).
      return {
        start: formatCalendarDate(addDays(now, -89)),
        end: formatCalendarDate(now),
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
  return useMemo(() => {
    const window = computeWindow(dateRange);
    if (!window) {
      return { filteredExpenses: expenses, filteredIncomes: incomes, previousPeriodExpenses: [] };
    }

    const { start, end, prevStart, prevEnd } = window;

    return {
      filteredExpenses: expenses.filter((exp) => isWithinRange(exp.date, start, end)),
      filteredIncomes: incomes.filter((inc) => isWithinRange(inc.date, start, end)),
      previousPeriodExpenses: expenses.filter((exp) => isWithinRange(exp.date, prevStart, prevEnd)),
    };
  }, [expenses, incomes, dateRange]);
}
