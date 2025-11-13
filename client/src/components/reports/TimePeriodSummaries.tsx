import React, { useMemo } from 'react';
import { Expense } from '../../types';
import SummaryCard from '../SummaryCard';
import { CalendarDaysIcon } from '../Icons';

interface TimePeriodSummariesProps {
  allExpenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const TimePeriodSummaries: React.FC<TimePeriodSummariesProps> = ({ allExpenses, displayCurrency, conversionRate }) => {

  const summaries = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    const getQuarterStartMonth = (q: number) => q * 3;

    // Current Quarter
    const startOfCurrentQuarter = new Date(currentYear, getQuarterStartMonth(currentQuarter), 1);
    const endOfCurrentQuarter = new Date(currentYear, getQuarterStartMonth(currentQuarter) + 3, 0);

    // Last Quarter
    const lastQuarterYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
    const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
    const startOfLastQuarter = new Date(lastQuarterYear, getQuarterStartMonth(lastQuarter), 1);
    const endOfLastQuarter = new Date(lastQuarterYear, getQuarterStartMonth(lastQuarter) + 3, 0);

    // Current Year
    const startOfCurrentYear = new Date(currentYear, 0, 1);
    const endOfCurrentYear = new Date(currentYear, 11, 31);
    
    // Last Year
    const startOfLastYear = new Date(currentYear - 1, 0, 1);
    const endOfLastYear = new Date(currentYear - 1, 11, 31);
    
    let currentQuarterTotal = 0;
    let lastQuarterTotal = 0;
    let currentYearTotal = 0;
    let lastYearTotal = 0;
    
    allExpenses.forEach(exp => {
      const expDate = new Date(exp.date);
      const expLocalDate = new Date(expDate.getUTCFullYear(), expDate.getUTCMonth(), expDate.getUTCDate());

      if (expLocalDate >= startOfCurrentQuarter && expLocalDate <= endOfCurrentQuarter) {
        currentQuarterTotal += exp.amount;
      }
      if (expLocalDate >= startOfLastQuarter && expLocalDate <= endOfLastQuarter) {
        lastQuarterTotal += exp.amount;
      }
      if (expLocalDate >= startOfCurrentYear && expLocalDate <= endOfCurrentYear) {
        currentYearTotal += exp.amount;
      }
      if (expLocalDate >= startOfLastYear && expLocalDate <= endOfLastYear) {
        lastYearTotal += exp.amount;
      }
    });

    return { currentQuarterTotal, lastQuarterTotal, currentYearTotal, lastYearTotal };
  }, [allExpenses]);

  const currencyProps = { displayCurrency, conversionRate };

  return (
    <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <h3 className="text-lg font-semibold mb-4 text-center text-base-content-secondary dark:text-base-300">Long-Term Summaries</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard title="This Quarter" value={summaries.currentQuarterTotal} icon={<CalendarDaysIcon />} {...currencyProps} />
            <SummaryCard title="Last Quarter" value={summaries.lastQuarterTotal} icon={<CalendarDaysIcon />} {...currencyProps} />
            <SummaryCard title="This Year" value={summaries.currentYearTotal} icon={<CalendarDaysIcon />} {...currencyProps} />
            <SummaryCard title="Last Year" value={summaries.lastYearTotal} icon={<CalendarDaysIcon />} {...currencyProps} />
        </div>
    </div>
  );
};

export default TimePeriodSummaries;
