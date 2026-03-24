import { useMemo } from 'react';
import { Expense, Income } from '../types';
import { DateRange } from '../components/Dashboard';

interface DateRangeResult {
  filteredExpenses: Expense[];
  filteredIncomes: Income[];
  previousPeriodExpenses: Expense[];
}

export default function useDateRangeFilter(
  expenses: Expense[],
  incomes: Income[],
  dateRange: DateRange
): DateRangeResult {
  return useMemo(() => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const getUTCDate = (dateString: string) => new Date(dateString);

    let start: Date;
    let end: Date;
    let prevStart: Date;
    let prevEnd: Date;

    switch (dateRange) {
      case 'this_month':
        start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        end = today;
        prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
        prevEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
        break;
      case 'last_month':
        start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
        end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
        prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
        prevEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 0));
        break;
      case 'last_90_days':
        start = new Date(today);
        start.setUTCDate(today.getUTCDate() - 90);
        end = today;
        prevStart = new Date(start);
        prevStart.setUTCDate(start.getUTCDate() - 90);
        prevEnd = new Date(start);
        prevEnd.setUTCDate(start.getUTCDate() - 1);
        break;
      case 'all_time':
      default:
        return { filteredExpenses: expenses, filteredIncomes: incomes, previousPeriodExpenses: [] };
    }

    const currentExpenses = expenses.filter((exp) => {
      const d = getUTCDate(exp.date);
      return d >= start && d <= end;
    });

    const currentIncomes = incomes.filter((inc) => {
      const d = getUTCDate(inc.date);
      return d >= start && d <= end;
    });

    const previousExpenses = expenses.filter((exp) => {
      const d = getUTCDate(exp.date);
      return d >= prevStart && d <= prevEnd;
    });

    return {
      filteredExpenses: currentExpenses,
      filteredIncomes: currentIncomes,
      previousPeriodExpenses: previousExpenses,
    };
  }, [expenses, incomes, dateRange]);
}
