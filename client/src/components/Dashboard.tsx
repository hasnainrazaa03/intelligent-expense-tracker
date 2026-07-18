import React, { useMemo } from 'react';
import { Expense, Budget, Income } from '../types';
import { DateRangeFilter, type DateRange } from './DateRangeFilter';

export type { DateRange };
import SummaryCard from './SummaryCard';
import CategoryPieChart from './CategoryPieChart';
import SpendingBarChart from './SpendingBarChart';
import BudgetTracker from './BudgetTracker';
import BudgetPerformanceChart from './BudgetPerformanceChart';
import FinancialPlanningPanel from './FinancialPlanningPanel';
import { getCategoryColor, getMainCategory } from '../utils/colorUtils';
import { CalendarDaysIcon, TagIcon, TrendingUpIcon, BanknotesIcon } from './Icons';
import { startOfMonth, endOfMonth, isWithinRange, addMonths, parseCalendarDate, monthKey } from '../utils/dateUtils';
import { formatCurrency } from '../utils/currencyUtils';
import { computeBudgetSpend, computeTotalBudgetedSpend } from '../utils/budgetUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import SectionSkeleton from './SectionSkeleton';

interface DashboardProps {
  expenses: Expense[];
  incomes: Income[];
  allIncomes: Income[];
  allExpenses: Expense[];
  previousPeriodExpenses: Expense[];
  selectedRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  budgets: Budget[];
  isLoading?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({
  expenses, incomes, allIncomes, allExpenses, previousPeriodExpenses,
  selectedRange, onDateRangeChange, budgets, isLoading = false
}) => {
  const { displayCurrency, conversionRate } = useCurrency();

  // Budgets are monthly, so budget utilization is ALWAYS the current calendar
  // month — independent of the dashboard's selected period (CMP-M15). Both the
  // alerts and the Budget-protocols tracker use this, so "All time" no longer
  // shows 700%+ (multi-month spend vs a one-month allocation).
  const monthExpenses = useMemo(() => {
    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();
    return allExpenses.filter((e) => isWithinRange(e.date, monthStart, monthEnd));
  }, [allExpenses]);

  const budgetAlerts = useMemo(() => {
    if (budgets.length === 0) return [] as Array<{ category: string; spent: number; budget: number; pct: number; severity: 'warning' | 'danger' }>;

    return budgets
      .map((budget) => {
        // Shared matcher (CMP-H4): a main-category budget aggregates its subcategories.
        const spent = computeBudgetSpend(budget.category, monthExpenses);
        const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        if (pct < 80) return null;
        return {
          category: budget.category,
          spent,
          budget: budget.amount,
          pct,
          severity: pct >= 100 ? 'danger' as const : 'warning' as const,
        };
      })
      .filter((item): item is { category: string; spent: number; budget: number; pct: number; severity: 'warning' | 'danger' } => item !== null)
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, monthExpenses]);
  
  const { periodTotalExpense, periodTotalIncome, topCategory, periodChange, netFlow } = useMemo(() => {
    const periodTotalExpense = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const periodTotalIncome = incomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
    const netFlow = periodTotalIncome - periodTotalExpense;
    
    const previousPeriodTotal = previousPeriodExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

    let periodChange: number | undefined = undefined;
    if (previousPeriodTotal > 0) {
        periodChange = ((periodTotalExpense - previousPeriodTotal) / previousPeriodTotal) * 100;
    } else if (periodTotalExpense > 0) {
        periodChange = Infinity;
    }

    const categoryTotals = expenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });

    const topCategory = (Object.entries(categoryTotals) as [string, number][]).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
    
    return { periodTotalExpense, periodTotalIncome, topCategory, periodChange, netFlow };
  }, [expenses, incomes, previousPeriodExpenses]);

  const categoryData = useMemo(() => {
    const mainCategoryTotals = expenses.reduce((acc, exp) => {
      const mainCategory = getMainCategory(exp.category);
      acc[mainCategory] = (acc[mainCategory] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });

    return (Object.entries(mainCategoryTotals) as [string, number][])
    .map(([name, value]) => ({
      name,
      value,
      fill: getCategoryColor(name),
    }))
    .sort((a, b) => b.value - a.value);
  }, [expenses]);
  
  const barChartData = useMemo(() => {
    if (selectedRange === 'this_month' || selectedRange === 'last_month') {
        // `expenses` is already filtered to the selected month, so bucket by the
        // picked calendar day-of-month (local, no UTC shift).
        const dailyTotals: { [key: number]: number } = {};
        expenses.forEach(expense => {
            const day = parseCalendarDate(expense.date).getDate();
            dailyTotals[day] = (dailyTotals[day] || 0) + Number(expense.amount);
        });

        const targetRef = selectedRange === 'this_month' ? new Date() : addMonths(new Date(), -1);
        const daysInMonth = new Date(targetRef.getFullYear(), targetRef.getMonth() + 1, 0).getDate();

        return Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            return { label: `${day}`, amount: dailyTotals[day] || 0 };
        });

    } else {
        const monthlyTotals: { [key: string]: number } = {};
        expenses.forEach(expense => {
            const key = monthKey(expense.date); // YYYY-MM
            monthlyTotals[key] = (monthlyTotals[key] || 0) + Number(expense.amount);
        });

        if (selectedRange === 'last_90_days') {
            // Show a continuous run of months (4 covers any 90-day window), filling
            // empty months with 0 instead of dropping them — a gappy axis misread
            // the trend (L6).
            const now = new Date();
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
  }, [expenses, selectedRange]);

  const budgetPerformanceData = useMemo(() => {
    if (budgets.length === 0) return [];
    const totalMonthlyBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const budgetCategories = budgets.map((b) => b.category);
    const data: { name: string; spent: number; budgeted: number }[] = [];
    const now = new Date();

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
}, [allExpenses, budgets]);

  const barChartTitle = (selectedRange === 'this_month' || selectedRange === 'last_month') ? 'Daily spending trend' : 'Monthly spending trend';

  if (isLoading) {
    return <SectionSkeleton title="Loading dashboard" rows={5} />;
  }

  return (
    <div className="space-y-5 md:space-y-6">
        {/* 1. HEADER SECTION */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-4">
          <div className="flex flex-col min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.18em] uppercase text-app-muted mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ok shadow-glow" />
              Live overview
            </span>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight tracking-tight break-words">
                Financial hub
              </h2>
          </div>
          <div className="w-full lg:w-auto flex justify-center lg:justify-end overflow-x-auto no-scrollbar py-1">
            <DateRangeFilter selectedRange={selectedRange} onChange={onDateRangeChange} />
          </div>
      </div>

      {budgetAlerts.length > 0 && (
        <section className="glass rounded-2xl p-4 md:p-5" aria-live="polite">
          <h3 className="font-display text-sm md:text-base font-semibold text-app-text mb-3">Budget alerts</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {budgetAlerts.map((alert) => (
              <div
                key={alert.category}
                className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs md:text-sm border ${alert.severity === 'danger' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-warn/10 border-warn/30 text-warn'}`}
              >
                <span className="font-medium truncate">{alert.category}</span>
                <span className="font-semibold tabular-nums whitespace-nowrap">
                  {formatCurrency(alert.spent, displayCurrency, conversionRate, true)} / {formatCurrency(alert.budget, displayCurrency, conversionRate, true)} · {alert.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

        {/* 2. SUMMARY CARDS + CATEGORY SPLIT (left) · BUDGET PROTOCOLS (right) */}
        {/* Both columns stretch to equal height so the two panels end on the same
            line — the pie card grows to fill the left column, the budget card to
            fill the right, regardless of which side has more content. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <div className="flex flex-col gap-4 md:gap-5 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
              <SummaryCard title="EXPENSES" value={periodTotalExpense} icon={<CalendarDaysIcon className="h-6 w-6" />} percentageChange={periodChange} accent="rose" />
              <SummaryCard title="INCOME" value={periodTotalIncome} icon={<BanknotesIcon className="h-6 w-6" />} accent="green" />
              <SummaryCard title="NET_FLOW" value={netFlow} icon={<TrendingUpIcon className="h-6 w-6" />} isNetFlow={true} accent="indigo" />
              <SummaryCard title="TOP_CATEGORY" value={topCategory} isString={true} icon={<TagIcon className="h-6 w-6" />} accent="amber" />
            </div>

            <div className="glass rounded-2xl p-4 md:p-5 min-w-0 flex-1 flex flex-col">
              <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">Categorical split</h3>
              <div className="flex-1 min-h-[260px] md:min-h-[300px]">
                <CategoryPieChart data={categoryData} />
              </div>
            </div>
          </div>

          <div className="@container glass rounded-2xl p-4 md:p-5 min-w-0 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 md:mb-6 gap-2">
              <h3 className="font-display text-lg md:text-xl font-bold text-app-text">Budget protocols</h3>
              <p className="text-[11px] font-medium text-app-muted">Usage vs. allocation, by month</p>
            </div>
            {/* Pass ALL expenses — BudgetTracker has its own month selector. */}
            <BudgetTracker expenses={allExpenses} budgets={budgets} />
          </div>
        </div>

        {/* 3. HISTORICAL ANALYTICS + SPENDING TREND (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <div className="glass rounded-2xl p-4 md:p-5 min-w-0">
            <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">Historical analytics · 6-month window</h3>
            <div className="h-64 md:h-72">
              <BudgetPerformanceChart data={budgetPerformanceData} />
            </div>
          </div>

          <div className="glass rounded-2xl p-4 md:p-5 min-w-0">
            <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">{barChartTitle}</h3>
            <div className="h-64 md:h-72">
              <SpendingBarChart data={barChartData} />
            </div>
          </div>
        </div>

      <FinancialPlanningPanel
        expenses={allExpenses}
        incomes={allIncomes}
      />
    </div>
  );
};

export default Dashboard;