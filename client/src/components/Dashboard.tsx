import React, { useMemo } from 'react';
import { Expense, Budget, Income } from '../types';
import SummaryCard from './SummaryCard';
import CategoryPieChart from './CategoryPieChart';
import SpendingBarChart from './SpendingBarChart';
import BudgetTracker from './BudgetTracker';
import BudgetPerformanceChart from './BudgetPerformanceChart';
import { getCategoryColor } from '../utils/colorUtils';
import { CalendarDaysIcon, TagIcon, ReceiptPercentIcon, TrendingUpIcon, BanknotesIcon } from './Icons';
import { SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

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
  allExpenses: Expense[];
  previousPeriodExpenses: Expense[];
  selectedRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  budgets: Budget[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  expenses, incomes, allExpenses, previousPeriodExpenses, 
  selectedRange, onDateRangeChange, budgets, displayCurrency, conversionRate 
}) => {
  
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
    const getUTCDate = (dateString: string) => new Date(dateString);
    
    if (selectedRange === 'this_month' || selectedRange === 'last_month') {
        const dailyTotals: { [key: number]: number } = {};
        expenses.forEach(expense => {
            const day = getUTCDate(expense.date).getUTCDate();
            dailyTotals[day] = (dailyTotals[day] || 0) + Number(expense.amount);
        });

        const now = new Date();
        const year = (selectedRange === 'this_month' || now.getUTCMonth() !== 0) ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
        const month = selectedRange === 'this_month' ? now.getUTCMonth() : now.getUTCMonth() - 1;
        const daysInMonth = new Date(year, month + 1, 0).getUTCDate();
        
        return Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            return { label: `${day}`, amount: dailyTotals[day] || 0 };
        });

    } else {
        const monthlyTotals: { [key: string]: { amount: number; date: Date } } = {};
        expenses.forEach(expense => {
            const expDate = getUTCDate(expense.date);
            const key = `${expDate.getUTCFullYear()}-${expDate.getUTCMonth()}`;
            if (!monthlyTotals[key]) {
                monthlyTotals[key] = { amount: 0, date: new Date(Date.UTC(expDate.getUTCFullYear(), expDate.getUTCMonth(), 1)) };
            }
            monthlyTotals[key].amount += Number(expense.amount);
        });

        return Object.values(monthlyTotals)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(monthData => ({
                label: monthData.date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
                amount: monthData.amount
            }));
    }
  }, [expenses, selectedRange]);

  const budgetPerformanceData = useMemo(() => {
    if (budgets.length === 0) return [];
    const totalMonthlyBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const data: { name: string; spent: number; budgeted: number }[] = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date(); date.setMonth(now.getMonth() - i);
        const year = date.getFullYear(); const month = date.getMonth();
        const monthName = date.toLocaleString('en-US', { month: 'short' });
        const yearShort = year.toString().slice(-2);
        const startOfMonth = new Date(year, month, 1); startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(year, month + 1, 0); endOfMonth.setHours(23, 59, 59, 999);
        const monthlyExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            const expLocalDate = new Date(expDate.getUTCFullYear(), expDate.getUTCMonth(), expDate.getUTCDate());
            return expLocalDate >= startOfMonth && expLocalDate <= endOfMonth;
        });
        const totalSpent = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        data.push({ name: `${monthName} '${yearShort}`, spent: totalSpent, budgeted: totalMonthlyBudget });
    }
    return data;
}, [allExpenses, budgets]);

  const barChartTitle = (selectedRange === 'this_month' || selectedRange === 'last_month') ? 'DAILY_SPENDING_TREND' : 'MONTHLY_SPENDING_TREND';
  const currencyProps = { displayCurrency, conversionRate };

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

        {/* 2. BENTO GRID: SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="md:col-span-1 border-4 border-ink shadow-neo bg-bone hover:-translate-y-1 transition-transform">
              <SummaryCard title="EXPENSES" value={periodTotalExpense} icon={<CalendarDaysIcon className="h-6 w-6" />} percentageChange={periodChange} {...currencyProps} />
          </div>

          <div className="md:col-span-1 border-4 border-ink shadow-neo bg-bone hover:-translate-y-1 transition-transform">
              <SummaryCard title="INCOME" value={periodTotalIncome} icon={<BanknotesIcon className="h-6 w-6" />} {...currencyProps} />
          </div>

          <div className="md:col-span-1 border-4 border-ink shadow-neo bg-bone hover:-translate-y-1 transition-transform">
              <SummaryCard title="NET_FLOW" value={netFlow} icon={<TrendingUpIcon className="h-6 w-6" />} isNetFlow={true} {...currencyProps} />
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
              <BudgetTracker expenses={expenses} budgets={budgets} {...currencyProps} />
          </div>

            {/* Perforated Bottom Section */}
            <div className="border-t-4 border-dashed border-ink/20 p-4 md:p-6 bg-black/5">
              <div className="h-48 md:h-64 min-w-0">
                <h4 className="text-center font-loud text-[10px] md:text-sm mb-4 text-ink opacity-50 italic uppercase">HISTORICAL_ANALYTICS // 6_MONTH_WINDOW</h4>
                  <BudgetPerformanceChart data={budgetPerformanceData} {...currencyProps} />
              </div>
          </div>
      </div>

        {/* 4. ANALYTICS BENTO: CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-8">
          <div className="lg:col-span-2 bg-bone border-4 border-ink p-5 md:p-8 shadow-neo relative overflow-hidden min-w-0">
              <div className="absolute top-0 right-0 bg-ink text-bone px-2 py-0.5 font-loud text-[8px] md:text-[10px]">DATA_VIZ_01</div>
              <h3 className="font-loud text-lg md:text-xl mb-6 border-b-2 border-ink pb-2 text-ink uppercase">CATEGORICAL_SPLIT</h3>
              <div className="h-64 md:h-72">
                  <CategoryPieChart data={categoryData} {...currencyProps} />
              </div>
          </div>
          
          <div className="lg:col-span-3 bg-bone border-4 border-ink p-5 md:p-8 shadow-neo-gold relative overflow-hidden min-w-0">
            <div className="absolute top-0 right-0 bg-usc-gold text-ink px-2 py-0.5 font-loud text-[8px] md:text-[10px]">DATA_VIZ_02</div>
            <h3 className="font-loud text-lg md:text-xl mb-6 border-b-2 border-ink pb-2 text-ink uppercase">{barChartTitle}</h3>
            <div className="h-64 md:h-72">
                <SpendingBarChart data={barChartData} {...currencyProps} />
            </div>
        </div>
      </div>

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