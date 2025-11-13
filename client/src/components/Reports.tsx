import React from 'react';
import { Expense, Budget } from '../types';
import TimePeriodSummaries from './reports/TimePeriodSummaries';
import BudgetActualChart from './reports/BudgetActualChart';
import PaymentMethodChart from './reports/PaymentMethodChart';
import RecurringVsOneTimeChart from './reports/RecurringVsOneTimeChart';
import MonthlyCategoryChart from './reports/MonthlyCategoryChart';
import YearOverYearChart from './reports/YearOverYearChart';
import CategoryDrilldown from './reports/CategoryDrilldown';

interface ReportsProps {
  allExpenses: Expense[];
  budgets: Budget[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const Reports: React.FC<ReportsProps> = ({ allExpenses, budgets, displayCurrency, conversionRate }) => {
    if (allExpenses.length === 0) {
        return (
             <div className="bg-base-100 dark:bg-dark-200 p-8 rounded-2xl shadow-lg text-center">
                <h1 className="text-3xl font-bold text-base-content dark:text-base-100">Reports Dashboard</h1>
                <p className="mt-4 text-base-content-secondary dark:text-base-300">There is no expense data to report on yet.</p>
                <p className="text-sm text-base-content-secondary dark:text-gray-500">Add some expenses to see your financial reports!</p>
            </div>
        )
    }
  
  const currencyProps = { displayCurrency, conversionRate };

  return (
    <div className="space-y-8">
        <div className="text-center">
            <h1 className="text-4xl font-extrabold text-base-content dark:text-base-100 tracking-tight">Reports Dashboard</h1>
            <p className="mt-2 text-lg text-base-content-secondary dark:text-base-300">Your complete financial overview.</p>
        </div>

      <TimePeriodSummaries allExpenses={allExpenses} {...currencyProps} />
      
      <BudgetActualChart expenses={allExpenses} budgets={budgets} {...currencyProps} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg h-[400px]">
          <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">Spending by Payment Method</h3>
          <PaymentMethodChart expenses={allExpenses} {...currencyProps} />
        </div>
        <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg h-[400px]">
          <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">Recurring vs. One-Time</h3>
          <RecurringVsOneTimeChart expenses={allExpenses} {...currencyProps} />
        </div>
      </div>

      <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <div className="h-[400px]">
          <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">Monthly Spending by Category</h3>
          <MonthlyCategoryChart expenses={allExpenses} />
        </div>
      </div>
      
       <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <div className="h-[400px]">
          <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">Year-Over-Year Comparison</h3>
          <YearOverYearChart expenses={allExpenses} {...currencyProps} />
        </div>
      </div>

       <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
          <h3 className="text-lg font-semibold mb-4 text-center text-base-content-secondary dark:text-base-300">Category Drill-Down</h3>
          <CategoryDrilldown expenses={allExpenses} {...currencyProps} />
      </div>

    </div>
  );
};

export default Reports;
