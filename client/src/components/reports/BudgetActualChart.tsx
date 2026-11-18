import React, { useMemo } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Expense, Budget } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';
import { seriesValue } from '../../utils/chartPayload';
import { computeBudgetSpend, budgetLabel } from '../../utils/budgetUtils';
import { startOfMonth, endOfMonth, isWithinRange, parseCalendarDate } from '../../utils/dateUtils';
import { useToday } from '../../hooks/useToday';
import ChartEmpty from '../ChartEmpty';
import { ChartTable } from './ChartTable';

interface BudgetActualChartProps {
  expenses: Expense[];
  /** Show the numbers as a table instead of the chart (U5). */
  asTable?: boolean;
  budgets: Budget[];
  /**
   * The report's period: `expenses` are already narrowed to it, and it spans
   * this many months. Budgets are monthly, so "actual" is the average month.
   * Without it, the chart shows the current calendar month.
   */
  periodMonths?: number;
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip rounded-xl px-3 py-2.5">
        <p className="text-[11px] font-medium text-app-muted mb-1">{label}</p>
        <p className="text-sm tabular-nums" style={{color: '#14b8a6'}}>{`Actual: ${formatCurrency(seriesValue(payload, 'actual'), displayCurrency, conversionRate)}`}</p>
        <p className="text-sm tabular-nums" style={{color: '#a8a29e'}}>{`Budget: ${formatCurrency(seriesValue(payload, 'budget'), displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};

const BudgetActualChart: React.FC<BudgetActualChartProps> = ({ expenses, budgets, periodMonths, asTable = false }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const today = useToday();

  const data = useMemo(() => {
    if (budgets.length === 0) return [];

    // Shared matcher so subcategory budgets populate and main-category budgets
    // aggregate their subcategories (CMP-H4/CMP-M13).
    const inPeriod = periodMonths
      ? expenses
      : expenses.filter((exp) => isWithinRange(exp.date, startOfMonth(parseCalendarDate(today)), endOfMonth(parseCalendarDate(today))));
    const months = Math.max(1, periodMonths ?? 1);

    const budgetCategories = budgets.map((b) => b.category);
    return budgets.map(budget => ({
      name: budgetLabel(budget.category, budgetCategories),
      actual: Math.round((computeBudgetSpend(budget.category, inPeriod, budgetCategories) / months) * 100) / 100,
      budget: budget.amount,
    }));
  }, [expenses, budgets, periodMonths, today]);
  if (asTable) return <ChartTable caption="Budget vs actual" columns={[{ key: 'name', label: 'Budget' }, { key: 'actual', label: 'Spent', money: true }, { key: 'budget', label: 'Budget', money: true }]} rows={data} />;

  if (budgets.length === 0) {
    return <ChartEmpty />;
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
                left: 0,
                bottom: 20,
                }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.3)" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fill: '#64748b', fontSize: 12 }} interval={0} />
                <YAxis width="auto" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} />
                <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} cursor={{fill: 'rgba(20, 184, 166, 0.1)'}} />
                <Legend wrapperStyle={{paddingTop: '20px'}}/>
                <Bar dataKey="actual" name="Actual Spending" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="budget" name="Budget" fill="#a8a29e" radius={[4, 4, 0, 0]} />
            </BarChart>
            </ResponsiveContainer>
  );
};

export default BudgetActualChart;
