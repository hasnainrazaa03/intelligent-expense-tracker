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
      return {
        start: startOfMonth(now),
        end: formatCalendarDate(now),
        prevStart: startOfMonth(addMonths(now, -1)),
        prevEnd: endOfMonth(addMonths(now, -1)),
      };
    case 'last_month':
      return {
        start: startOfMonth(addMonths(now, -1)),
        end: endOfMonth(addMonths(now, -1)),
        prevStart: startOfMonth(addMonths(now, -2)),
        prevEnd: endOfMonth(addMonths(now, -2)),
      };
    case 'last_90_days':
      return {
        start: formatCalendarDate(addDays(now, -90)),
        end: formatCalendarDate(now),
        prevStart: formatCalendarDate(addDays(now, -180)),
        prevEnd: formatCalendarDate(addDays(now, -91)),
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
