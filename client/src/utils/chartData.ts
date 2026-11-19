import type { Budget, Expense } from '../types';
import type { DateRange } from '../components/DateRangeFilter';
import { addMonths, monthKey, parseCalendarDate } from './dateUtils';
import { computeTotalBudgetedSpend } from './budgetUtils';

// Chart data shared by Home and Budgets (moved out of the old Dashboard, U3).

/** The spending-trend bars: days of the month, or months for longer ranges. */
export const buildBarChartData = (expenses: Expense[], selectedRange: DateRange, today: string): { label: string; amount: number }[] => {
  if (selectedRange === 'this_month' || selectedRange === 'last_month') {
      // `expenses` is already filtered to the selected month, so bucket by the
      // picked calendar day-of-month (local, no UTC shift).
      const dailyTotals: { [key: number]: number } = {};
      for (const expense of expenses) {
          const day = parseCalendarDate(expense.date).getDate();
          dailyTotals[day] = (dailyTotals[day] || 0) + Number(expense.amount);
      }

      const now = parseCalendarDate(today);
      const targetRef = selectedRange === 'this_month' ? now : addMonths(now, -1);
      const daysInMonth = new Date(targetRef.getFullYear(), targetRef.getMonth() + 1, 0).getDate();

      return Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          return { label: `${day}`, amount: dailyTotals[day] || 0 };
      });

  } else {
      const monthlyTotals: { [key: string]: number } = {};
      for (const expense of expenses) {
          const key = monthKey(expense.date); // YYYY-MM
          monthlyTotals[key] = (monthlyTotals[key] || 0) + Number(expense.amount);
      }

      if (selectedRange === 'last_90_days') {
          // Show a continuous run of months (4 covers any 90-day window), filling
          // empty months with 0 instead of dropping them — a gappy axis misread
          // the trend (L6).
          const now = parseCalendarDate(today);
          return Array.from({ length: 4 }, (_, idx) => {
              const ref = addMonths(now, -(3 - idx));
              const key = monthKey(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`);
              return {
                  label: ref.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                  amount: monthlyTotals[key] || 0,
              };
          });
      }

      // All-time: show every month between the first and last expense so gaps in
      // the middle render as zero bars rather than being collapsed out (L6).
      const keys = Object.keys(monthlyTotals).sort();
      if (keys.length === 0) return [];
      const [minY, minM] = keys[0].split('-').map(Number);
      const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number);
      const monthSpan = (maxY - minY) * 12 + (maxM - minM);
      return Array.from({ length: monthSpan + 1 }, (_, i) => {
          const ref = addMonths(parseCalendarDate(`${keys[0]}-01`), i);
          const key = monthKey(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`);
          return {
              label: ref.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
              amount: monthlyTotals[key] || 0,
          };
      });
  }
};

/** Last 6 months: spend on budgeted categories against the monthly budget total. */
export const buildBudgetPerformance = (allExpenses: Expense[], budgets: Budget[], today: string): { name: string; spent: number; budgeted: number }[] => {
    if (budgets.length === 0) return [];
    const totalMonthlyBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const budgetCategories = budgets.map((b) => b.category);
    const data: { name: string; spent: number; budgeted: number }[] = [];
    const now = parseCalendarDate(today);

    for (let i = 5; i >= 0; i--) {
        // addMonths is overflow-safe (naive setMonth wraps on 29-31st, producing
        // duplicate/skipped months — CMP-H6).
        const monthRef = addMonths(now, -i);
        const key = monthKey(`${monthRef.getFullYear()}-${String(monthRef.getMonth() + 1).padStart(2, '0')}-01`);
        const monthName = monthRef.toLocaleString('en-US', { month: 'short' });
        const yearShort = monthRef.getFullYear().toString().slice(-2);
        const monthExpenses = allExpenses.filter((exp) => monthKey(exp.date) === key);
        // Compare like-for-like: only spend on budgeted categories vs the budget
        // total. Summing ALL spend (incl. unbudgeted categories) against a partial
        // budget produced fake overruns (e.g. unbudgeted rent showing 500% of a
        // food-only budget). Consistent with BudgetTracker / Reports.
        const totalSpent = computeTotalBudgetedSpend(budgetCategories, monthExpenses);
        data.push({ name: `${monthName} '${yearShort}`, spent: totalSpent, budgeted: totalMonthlyBudget });
    }
    return data;
};
