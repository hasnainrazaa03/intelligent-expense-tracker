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
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90_days', label: 'Last 90 Days' },
  { id: 'all_time', label: 'All Time' },
];

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ selectedRange, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-base-200 dark:bg-dark-300 p-1 rounded-lg">
      {ranges.map(range => (
        <button
          key={range.id}
          onClick={() => onChange(range.id)}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
            selectedRange === range.id
              ? 'bg-brand-primary text-white shadow'
              : 'text-base-content-secondary dark:text-base-300 hover:bg-base-300/50 dark:hover:bg-dark-100'
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

const Dashboard: React.FC<DashboardProps> = ({ expenses, incomes, allExpenses, previousPeriodExpenses, selectedRange, onDateRangeChange, budgets, displayCurrency, conversionRate }) => {
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

    const topCategory = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';
    
    return { periodTotalExpense, periodTotalIncome, topCategory, periodChange, netFlow };
  }, [expenses, incomes, previousPeriodExpenses]);

  const categoryData = useMemo(() => {
    const mainCategoryTotals = expenses.reduce((acc, exp) => {
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
      acc[mainCategory] = (acc[mainCategory] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(mainCategoryTotals)
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

  const barChartTitle = (selectedRange === 'this_month' || selectedRange === 'last_month') ? 'Daily Spending Trend' : 'Monthly Spending Trend';
  const currencyProps = { displayCurrency, conversionRate };

  return (
    <div className="space-y-8">
        <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <h2 className="text-2xl font-bold text-base-content dark:text-base-100">Dashboard</h2>
                <DateRangeFilter selectedRange={selectedRange} onChange={onDateRangeChange} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryCard title="Total Expenses" value={periodTotalExpense} icon={<CalendarDaysIcon />} percentageChange={periodChange} {...currencyProps} />
                <SummaryCard title="Total Income" value={periodTotalIncome} icon={<BanknotesIcon />} {...currencyProps} />
                <SummaryCard title="Net Flow" value={netFlow} icon={<TrendingUpIcon />} isNetFlow={true} {...currencyProps} />
                <SummaryCard title="Top Category" value={topCategory} isString={true} icon={<TagIcon />} {...currencyProps} />
            </div>
        </div>

        <BudgetTracker expenses={expenses} budgets={budgets} {...currencyProps} />
        
        {budgets.length > 0 && (
            <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
                <div className="h-80">
                <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">Historical Budget Performance</h3>
                <BudgetPerformanceChart data={budgetPerformanceData} {...currencyProps} />
                </div>
            </div>
        )}

        <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2 h-80">
                <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">Spending by Category</h3>
                <CategoryPieChart data={categoryData} {...currencyProps} />
                </div>
                <div className="lg:col-span-3 h-80">
                <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">{barChartTitle}</h3>
                <SpendingBarChart data={barChartData} {...currencyProps} />
                </div>
            </div>
        </div>
    </div>
  );
};

export default Dashboard;
