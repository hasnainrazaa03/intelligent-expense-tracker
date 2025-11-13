import React, { useMemo } from 'react';
import { Expense } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP, CATEGORY_COLORS } from '../../constants';

interface MonthlyCategoryChartProps {
  expenses: Expense[];
}

const MonthlyCategoryChart: React.FC<MonthlyCategoryChartProps> = ({ expenses }) => {
  const data = useMemo(() => {
    const monthlyData: { [month: string]: { name: string, [category: string]: number | string } } = {};
    
    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[expense.category] || 'Miscellaneous';
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { name: monthKey };
      }
      
      monthlyData[monthKey][mainCategory] = (monthlyData[monthKey][mainCategory] || 0) as number + expense.amount;
    });

    return Object.values(monthlyData).sort((a, b) => {
        const dateA = new Date(`01 ${a.name}`);
        const dateB = new Date(`01 ${b.name}`);
        return dateA.getTime() - dateB.getTime();
    });

  }, [expenses]);
  
  if (data.length === 0) return <div className="flex items-center justify-center h-full text-base-content-secondary dark:text-gray-400">Not enough data to display.</div>;

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
        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
        <Tooltip
            cursor={{fill: 'rgba(20, 184, 166, 0.1)'}}
            contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid #ccc',
                borderRadius: '8px',
            }}
        />
        <Legend wrapperStyle={{fontSize: '12px'}}/>
        {Object.keys(CATEGORIES).map(category => (
            <Bar key={category} dataKey={category} stackId="a" fill={CATEGORY_COLORS[category]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default MonthlyCategoryChart;
