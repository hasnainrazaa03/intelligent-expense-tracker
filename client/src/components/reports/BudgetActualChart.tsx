import React, { useMemo } from 'react';
import { Expense, Budget } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';
import { computeBudgetSpend } from '../../utils/budgetUtils';
import { startOfMonth, endOfMonth, isWithinRange } from '../../utils/dateUtils';

interface BudgetActualChartProps {
  expenses: Expense[];
  budgets: Budget[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-base-100 dark:bg-dark-300 p-2 border border-base-300 dark:border-dark-100 rounded-md shadow-lg">
        <p className="font-bold">{label}</p>
        <p style={{color: payload[0].fill}}>{`Actual: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
        <p style={{color: payload[1].fill}}>{`Budget: ${formatCurrency(payload[1].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};

const BudgetActualChart: React.FC<BudgetActualChartProps> = ({ expenses, budgets, displayCurrency, conversionRate }) => {
    
  const data = useMemo(() => {
    if (budgets.length === 0) return [];

    // Current calendar month, shared matcher so subcategory budgets populate and
    // main-category budgets aggregate their subcategories (CMP-H4/CMP-M13).
    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();
    const monthlyExpenses = expenses.filter((exp) => isWithinRange(exp.date, monthStart, monthEnd));

    return budgets.map(budget => ({
      name: budget.category,
      actual: computeBudgetSpend(budget.category, monthlyExpenses),
      budget: budget.amount,
    }));
  }, [expenses, budgets]);

  if (budgets.length === 0) {
    return null; // Don't render the card if no budgets are set
  }
    
  return (
     <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <div className="h-[400px]">
            <h3 className="text-lg font-semibold mb-2 text-center text-base-content-secondary dark:text-base-300">This Month: Budget vs. Actual</h3>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart
                data={data}
                margin={{
                top: 5,
                right: 20,
                left: -10,
                bottom: 20,
                }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.3)" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fill: '#64748b', fontSize: 12 }} interval={0} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} />
                <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} cursor={{fill: 'rgba(20, 184, 166, 0.1)'}} />
                <Legend wrapperStyle={{paddingTop: '20px'}}/>
                <Bar dataKey="actual" name="Actual Spending" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="budget" name="Budget" fill="#a8a29e" radius={[4, 4, 0, 0]} />
            </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
};

export default BudgetActualChart;
