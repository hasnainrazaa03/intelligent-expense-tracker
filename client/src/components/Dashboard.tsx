import React, { useMemo } from 'react';
import { Expense, Budget, Income } from '../types';
import SummaryCard from './SummaryCard';
import CategoryPieChart from './CategoryPieChart';
import SpendingBarChart from './SpendingBarChart';
import BudgetTracker from './BudgetTracker';
import BudgetPerformanceChart from './BudgetPerformanceChart';
import FinancialPlanningPanel from './FinancialPlanningPanel';
import { getCategoryColor } from '../utils/colorUtils';
import { CalendarDaysIcon, TagIcon, ReceiptPercentIcon, TrendingUpIcon, BanknotesIcon } from './Icons';
import { SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';
import { startOfMonth, endOfMonth, isWithinRange, addMonths, parseCalendarDate, monthKey } from '../utils/dateUtils';
import { formatCurrency } from '../utils/currencyUtils';
import { computeBudgetSpend } from '../utils/budgetUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import SectionSkeleton from './SectionSkeleton';

export type DateRange = 'this_month' | 'last_month' | 'last_90_days' | 'all_time';

interface DateRangeFilterProps {
  selectedRange: DateRange;
  onChange: (range: DateRange) => void;
}

const ranges: { id: DateRange; label: string }[] = [
  { id: 'this_month', label: 'THIS_MONTH' },
  { id: 'last_month', label: 'LAST_MONTH' },
  { id: 'last_90_days', label: '90_DAYS' },
  { id: 'all_time', label: 'ALL_TIME' },
];

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ selectedRange, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-0 bg-ink p-1 border-4 border-ink shadow-neo-gold">
      {ranges.map(range => (
        <button
          key={range.id}
          onClick={() => onChange(range.id)}
          className={`px-4 py-2 text-xs font-loud transition-all whitespace-nowrap ${
            selectedRange === range.id
              ? 'bg-usc-gold text-ink'
              : 'text-bone hover:bg-white/10'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
};

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

  const budgetAlerts = useMemo(() => {
    if (budgets.length === 0) return [] as Array<{ category: string; spent: number; budget: number; pct: number; severity: 'warning' | 'danger' }>;

    // Budget utilization is always a current-calendar-month figure, independent
    // of the dashboard's selected period (CMP-M15), using local month bounds.
    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();
    const monthExpenses = allExpenses.filter((e) => isWithinRange(e.date, monthStart, monthEnd));

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
  }, [budgets, allExpenses]);
  
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
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
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

        return Object.entries(monthlyTotals)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, amount]) => ({
                label: parseCalendarDate(`${key}-01`).toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                amount,
            }));
    }
  }, [expenses, selectedRange]);

  const budgetPerformanceData = useMemo(() => {
    if (budgets.length === 0) return [];
    const totalMonthlyBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const data: { name: string; spent: number; budgeted: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        // addMonths is overflow-safe (naive setMonth wraps on 29-31st, producing
        // duplicate/skipped months — CMP-H6).
        const monthRef = addMonths(now, -i);
        const key = monthKey(`${monthRef.getFullYear()}-${String(monthRef.getMonth() + 1).padStart(2, '0')}-01`);
        const monthName = monthRef.toLocaleString('en-US', { month: 'short' });
        const yearShort = monthRef.getFullYear().toString().slice(-2);
        const totalSpent = allExpenses
            .filter((exp) => monthKey(exp.date) === key)
            .reduce((sum, exp) => sum + exp.amount, 0);
        data.push({ name: `${monthName} '${yearShort}`, spent: totalSpent, budgeted: totalMonthlyBudget });
    }
    return data;
}, [allExpenses, budgets]);

  const barChartTitle = (selectedRange === 'this_month' || selectedRange === 'last_month') ? 'DAILY_SPENDING_TREND' : 'MONTHLY_SPENDING_TREND';

  if (isLoading) {
    return <SectionSkeleton title="Loading dashboard" rows={5} />;
  }

  return (
    <div className="space-y-12">
        {/* 1. LOUD HEADER SECTION */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 overflow-hidden">
          <div className="flex flex-col min-w-0">
            <span className="bg-usc-cardinal text-bone px-2 py-0.5 text-[10px] font-bold w-fit border-2 border-ink mb-2">SYSTEM_STATUS: LIVE</span>
              <h2 className="font-loud text-4xl sm:text-5xl md:text-7xl text-ink leading-[0.9] tracking-tighter uppercase break-words">
                FINANCIAL_HUB
              </h2>
          </div>
          <div className="w-full lg:w-auto flex justify-center lg:justify-end overflow-x-auto no-scrollbar py-2">
            <DateRangeFilter selectedRange={selectedRange} onChange={onDateRangeChange} />
          </div>
      </div>

      {budgetAlerts.length > 0 && (
        <section className="border-4 border-ink bg-white p-4 md:p-6 shadow-neo" aria-live="polite">
          <h3 className="font-loud text-lg md:text-xl uppercase text-ink mb-3">Budget Alerts</h3>
          <div className="space-y-2">
            {budgetAlerts.map((alert) => (
              <div
                key={alert.category}
                className={`border-2 border-ink px-3 py-2 font-bold text-xs md:text-sm uppercase ${alert.severity === 'danger' ? 'bg-usc-cardinal text-bone' : 'bg-usc-gold text-ink'}`}
              >
                {alert.category}: {formatCurrency(alert.spent, displayCurrency, conversionRate, true)} / {formatCurrency(alert.budget, displayCurrency, conversionRate, true)} ({alert.pct.toFixed(0)}%)
              </div>
            ))}
          </div>
        </section>
      )}

        {/* 2. BENTO GRID: SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="md:col-span-1 border-4 border-ink shadow-neo bg-bone hover:-translate-y-1 transition-transform">
              <SummaryCard title="EXPENSES" value={periodTotalExpense} icon={<CalendarDaysIcon className="h-6 w-6" />} percentageChange={periodChange} />
          </div>

          <div className="md:col-span-1 border-4 border-ink shadow-neo bg-bone hover:-translate-y-1 transition-transform">
              <SummaryCard title="INCOME" value={periodTotalIncome} icon={<BanknotesIcon className="h-6 w-6" />} />
          </div>

          <div className="md:col-span-1 border-4 border-ink shadow-neo bg-bone hover:-translate-y-1 transition-transform">
              <SummaryCard title="NET_FLOW" value={netFlow} icon={<TrendingUpIcon className="h-6 w-6" />} isNetFlow={true} />
          </div>

          {/* The RED BOX - Cleaned of dark variants */}
          <div className="md:col-span-1 border-4 border-ink shadow-neo-cardinal bg-usc-cardinal text-white flex flex-col justify-center p-5 md:p-6 relative overflow-hidden group hover:bg-usc-cardinal/90 transition-colors min-w-0">
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform hidden sm:block">
                <TagIcon className="h-32 w-32 text-white" />
            </div>
            <p className="text-[10px] md:text-xs font-loud mb-1 text-white/70 uppercase">TOP_CATEGORY</p>
            <p className="text-xl md:text-2xl font-loud text-white uppercase truncate md:whitespace-normal">
              {topCategory}
            </p>
        </div>
      </div>

        {/* 3. TICKET STUB: BUDGET PERFORMANCE */}
        <div className="bg-bone border-4 border-ink shadow-neo relative overflow-hidden md:overflow-visible">
            {/* Ticket Perforation Left */}
            <div className="hidden sm:block absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-ink rounded-full z-20" />
            {/* Ticket Perforation Right */}
            <div className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-ink rounded-full z-20" />
            
            <div className="p-5 md:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-8 border-b-4 border-ink pb-4 gap-4">
                <h3 className="font-loud text-2xl md:text-3xl text-ink uppercase">BUDGET_PROTOCOLS</h3>
                <div className="text-left sm:text-right flex flex-row sm:flex-col gap-4 sm:gap-0">
                    <p className="text-[8px] md:text-[10px] font-mono leading-none text-ink opacity-40">ID: USC-8849-TRK</p>
                    <p className="text-[8px] md:text-[10px] font-mono leading-none text-ink opacity-40">AUTH: TROJAN_SECURE</p>
                </div>
            </div>
              <BudgetTracker expenses={expenses} budgets={budgets} />
          </div>

            {/* Perforated Bottom Section */}
            <div className="border-t-4 border-dashed border-ink/20 p-4 md:p-6 bg-black/5">
              <div className="h-48 md:h-64 min-w-0">
                <h4 className="text-center font-loud text-[10px] md:text-sm mb-4 text-ink opacity-50 italic uppercase">HISTORICAL_ANALYTICS // 6_MONTH_WINDOW</h4>
                  <BudgetPerformanceChart data={budgetPerformanceData} />
              </div>
          </div>
      </div>

        {/* 4. ANALYTICS BENTO: CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-8">
          <div className="lg:col-span-2 bg-bone border-4 border-ink p-5 md:p-8 shadow-neo relative overflow-hidden min-w-0">
              <div className="absolute top-0 right-0 bg-ink text-bone px-2 py-0.5 font-loud text-[8px] md:text-[10px]">DATA_VIZ_01</div>
              <h3 className="font-loud text-lg md:text-xl mb-6 border-b-2 border-ink pb-2 text-ink uppercase">CATEGORICAL_SPLIT</h3>
              <div className="h-64 md:h-72">
                  <CategoryPieChart data={categoryData} />
              </div>
          </div>
          
          <div className="lg:col-span-3 bg-bone border-4 border-ink p-5 md:p-8 shadow-neo-gold relative overflow-hidden min-w-0">
            <div className="absolute top-0 right-0 bg-usc-gold text-ink px-2 py-0.5 font-loud text-[8px] md:text-[10px]">DATA_VIZ_02</div>
            <h3 className="font-loud text-lg md:text-xl mb-6 border-b-2 border-ink pb-2 text-ink uppercase">{barChartTitle}</h3>
            <div className="h-64 md:h-72">
                <SpendingBarChart data={barChartData} />
            </div>
        </div>
      </div>

      <FinancialPlanningPanel
        expenses={allExpenses}
        incomes={allIncomes}
      />

        {/* 5. FOOTER STAMP */}
        <div className="flex justify-center pt-8">
          <div className="border-4 border-ink/20 rounded-full px-6 py-2 text-ink/20 font-loud text-sm tracking-widest select-none uppercase">
              PROPERTY OF UNIVERSITY OF SOUTHERN CALIFORNIA // FINANCIAL DIVISION
          </div>
      </div>
    </div>
  );
};

export default Dashboard;