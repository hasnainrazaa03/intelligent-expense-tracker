import React, { useMemo } from 'react';
import { Expense } from '../types';
import { SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';
import { TableCellsIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';

interface PivotAnalysisProps {
  expenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const PivotAnalysis: React.FC<PivotAnalysisProps> = ({ expenses, displayCurrency, conversionRate }) => {
  const pivotData = useMemo(() => {
    const data: { [category: string]: { [month: string]: number } } = {};
    const monthSet = new Set<string>();

    expenses.forEach(exp => {
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
      const date = new Date(exp.date);
      const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      
      monthSet.add(monthKey);
      
      if (!data[mainCategory]) {
        data[mainCategory] = {};
      }
      data[mainCategory][monthKey] = (data[mainCategory][monthKey] || 0) + exp.amount;
    });

    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        const dateA = new Date(`01 ${a}`);
        const dateB = new Date(`01 ${b}`);
        return dateA.getTime() - dateB.getTime();
    });

    return { data, sortedMonths };
  }, [expenses]);

  const categoryTotals: { [key: string]: number } = useMemo(() => {
      const totals: { [key: string]: number } = {};
      for (const category in pivotData.data) {
          // FIX: Use Number(amount) to ensure the value is a number before the arithmetic operation.
          totals[category] = Object.values(pivotData.data[category]).reduce((sum, amount) => sum + Number(amount), 0);
      }
      return totals;
  }, [pivotData.data]);

  const monthTotals: { [key: string]: number } = useMemo(() => {
      const totals: { [key: string]: number } = {};
      pivotData.sortedMonths.forEach(month => {
          let monthTotal = 0;
          for (const category in pivotData.data) {
              monthTotal += pivotData.data[category][month] || 0;
          }
          totals[month] = monthTotal;
      });
      return totals;
  }, [pivotData.data, pivotData.sortedMonths]);

  const grandTotal = useMemo(() => Object.values(monthTotals).reduce((sum, amount) => sum + amount, 0), [monthTotals]);

  if (expenses.length === 0) {
    return (
       <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg text-center">
            <h2 className="text-2xl font-bold mb-2 text-base-content dark:text-base-100">Pivot Analysis</h2>
            <p className="text-base-content-secondary dark:text-base-300">No expense data available to create an analysis.</p>
       </div>
    );
  }

  return (
    <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
      <div className="flex items-center mb-6">
        <TableCellsIcon className="h-6 w-6 text-brand-primary" />
        <h2 className="text-2xl font-bold ml-3 text-base-content dark:text-base-100">Pivot Analysis</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-base-content-secondary dark:text-base-300">
          <thead className="text-xs text-base-content dark:text-base-200 uppercase bg-base-200 dark:bg-dark-300">
            <tr>
              <th scope="col" className="px-6 py-3 rounded-tl-lg">Category</th>
              {pivotData.sortedMonths.map(month => (
                <th key={month} scope="col" className="px-6 py-3 text-right">{month}</th>
              ))}
              <th scope="col" className="px-6 py-3 rounded-tr-lg text-right font-bold">Category Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(pivotData.data).sort().map((category, index) => (
              <tr key={category} className="border-b border-base-200 dark:border-dark-300 hover:bg-base-200/50 dark:hover:bg-dark-300/50">
                <th scope="row" className="px-6 py-4 font-medium text-base-content dark:text-base-100 whitespace-nowrap">{category}</th>
                {pivotData.sortedMonths.map(month => (
                  <td key={`${category}-${month}`} className="px-6 py-4 text-right">
                    {pivotData.data[category][month] ? formatCurrency(pivotData.data[category][month], displayCurrency, conversionRate) : '-'}
                  </td>
                ))}
                <td className="px-6 py-4 text-right font-bold text-base-content dark:text-base-200">{formatCurrency(categoryTotals[category], displayCurrency, conversionRate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-bold text-base-content dark:text-base-200 bg-base-200 dark:bg-dark-300">
            <tr>
              <th scope="row" className="px-6 py-3 rounded-bl-lg">Monthly Total</th>
              {pivotData.sortedMonths.map(month => (
                  <td key={`total-${month}`} className="px-6 py-3 text-right">{formatCurrency(monthTotals[month], displayCurrency, conversionRate)}</td>
              ))}
              <td className="px-6 py-3 rounded-br-lg text-right text-lg">{formatCurrency(grandTotal, displayCurrency, conversionRate)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PivotAnalysis;
