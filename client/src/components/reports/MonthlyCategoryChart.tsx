import React, { useMemo, useState } from 'react';
import { Expense } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP, CATEGORY_COLORS } from '../../constants';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../utils/currencyUtils';

interface MonthlyCategoryChartProps {
  expenses: Expense[];
}

const MonthlyCategoryChart: React.FC<MonthlyCategoryChartProps> = ({ expenses }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  // Categories the user has clicked off in the legend. Hidden series are dropped
  // from the stack (so the bars re-scale) and greyed in the legend.
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (category: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  const data = useMemo(() => {
    const monthlyData: { [month: string]: { name: string, __sort: number, [category: string]: number | string } } = {};

    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[expense.category] || 'Miscellaneous';

      if (!monthlyData[monthKey]) {
        // Numeric sort key (year*12 + month) — reliable across engines, unlike
        // parsing the "Jan 25" display label which was Invalid Date in Safari.
        monthlyData[monthKey] = { name: monthKey, __sort: date.getUTCFullYear() * 12 + date.getUTCMonth() };
      }

      monthlyData[monthKey][mainCategory] = (monthlyData[monthKey][mainCategory] || 0) as number + expense.amount;
    });

    return Object.values(monthlyData).sort((a, b) => a.__sort - b.__sort);
  }, [expenses]);

  if (data.length === 0) return <div className="flex items-center justify-center h-full text-app-muted">Not enough data to display.</div>;

  const categories = Object.keys(CATEGORIES);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.3)" />
        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
        {/* Amounts are stored in USD; the axis has to follow the display currency
            like every other chart, or the numbers silently contradict the toggle. */}
        <YAxis
          tick={{ fill: '#64748b', fontSize: 12 }}
          tickFormatter={(value) => formatCurrency(Number(value), displayCurrency, conversionRate, true)}
        />
        <Tooltip
            cursor={{fill: 'rgba(20, 184, 166, 0.1)'}}
            formatter={(value) => formatCurrency(Number(value), displayCurrency, conversionRate)}
            contentStyle={{
                backgroundColor: 'var(--modal-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
            }}
            itemStyle={{ color: 'var(--app-text)' }}
            labelStyle={{ color: 'var(--app-text)' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px' }}
          onClick={(entry: any) => { if (entry?.dataKey) toggle(String(entry.dataKey)); }}
          formatter={(value: string) => (
            <span
              style={{
                color: hidden.has(value) ? 'var(--app-faint, #64748b)' : undefined,
                textDecoration: hidden.has(value) ? 'line-through' : undefined,
                opacity: hidden.has(value) ? 0.55 : 1,
                cursor: 'pointer',
              }}
            >
              {value}
            </span>
          )}
        />
        {categories.map(category => (
            <Bar
              key={category}
              dataKey={category}
              stackId="a"
              fill={CATEGORY_COLORS[category]}
              // `hide` keeps the series (and its legend entry) registered while
              // removing it from the stack, so it can be clicked back on.
              hide={hidden.has(category)}
            />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default MonthlyCategoryChart;
