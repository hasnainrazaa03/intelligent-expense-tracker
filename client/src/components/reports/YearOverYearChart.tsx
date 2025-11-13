import React, { useMemo } from 'react';
import { Expense } from '../../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';

interface YearOverYearChartProps {
  expenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const COLORS = ['#14b8a6', '#f97316', '#3b82f6', '#ef4444', '#8b5cf6'];

const YearOverYearChart: React.FC<YearOverYearChartProps> = ({ expenses, displayCurrency, conversionRate }) => {

  const { data, years } = useMemo(() => {
    // FIX: Update type to allow string for 'name' property and number for year properties, resolving the index signature error.
    const monthlyData: { [month: string]: { name: string; [key: string]: string | number } } = {};
    const yearSet = new Set<string>();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    monthNames.forEach(month => {
        monthlyData[month] = { name: month };
    });

    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const year = date.getUTCFullYear().toString();
      const month = monthNames[date.getUTCMonth()];
      
      yearSet.add(year);

      if (!monthlyData[month][year]) {
        monthlyData[month][year] = 0;
      }
      // FIX: Cast to number for arithmetic operation due to the updated, more flexible type.
      monthlyData[month][year] = (monthlyData[month][year] as number) + expense.amount;
    });
    
    const sortedYears = Array.from(yearSet).sort();

    return { data: Object.values(monthlyData), years: sortedYears };
  }, [expenses]);
  
  if (years.length < 1) {
    return <div className="flex items-center justify-center h-full text-base-content-secondary dark:text-gray-400">Not enough data for year-over-year comparison.</div>;
  }
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 20,
          left: -10,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.3)" />
        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} />
        <Tooltip 
             cursor={{fill: 'rgba(20, 184, 166, 0.1)'}}
            formatter={(value: number) => formatCurrency(value, displayCurrency, conversionRate)}
            contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid #ccc',
                borderRadius: '8px',
            }}
        />
        <Legend />
        {years.map((year, index) => (
            <Line 
                key={year} 
                type="monotone" 
                dataKey={year} 
                stroke={COLORS[index % COLORS.length]} 
                strokeWidth={2}
                activeDot={{ r: 6 }}
            />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default YearOverYearChart;
