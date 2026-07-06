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
      <div className="bg-white border-2 border-ink p-2 shadow-neo">
        <p className="font-bold text-ink">{label}</p>
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
    
  // The parent (Reports) already provides the card, title, and sized container,
  // so render only the chart filling that space — previously this component drew
  // its own card + duplicate title + fixed h-[400px], overflowing the container
  // and double-rendering the heading (CMP-M16).
  return (
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
  );
};

export default BudgetActualChart;
