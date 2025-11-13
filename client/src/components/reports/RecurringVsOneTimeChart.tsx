import React, { useMemo } from 'react';
import { Expense } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';

interface RecurringVsOneTimeChartProps {
  expenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const COLORS = ['#ef4444', '#3b82f6'];

const CustomTooltip = ({ active, payload, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-base-100 dark:bg-dark-300 p-2 border border-base-300 dark:border-dark-100 rounded-md shadow-lg">
        <p className="font-bold">{`${payload[0].name}`}</p>
        <p style={{ color: payload[0].payload.fill }}>{`Amount: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};


const RecurringVsOneTimeChart: React.FC<RecurringVsOneTimeChartProps> = ({ expenses, displayCurrency, conversionRate }) => {
  const data = useMemo(() => {
    const totals = expenses.reduce(
      (acc, exp) => {
        if (exp.isRecurring) {
          acc.recurring += exp.amount;
        } else {
          acc.oneTime += exp.amount;
        }
        return acc;
      },
      { recurring: 0, oneTime: 0 }
    );
    
    return [
      { name: 'Recurring', value: totals.recurring },
      { name: 'One-Time', value: totals.oneTime },
    ].filter(d => d.value > 0);
  }, [expenses]);
  
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-base-content-secondary dark:text-gray-400">No data to display.</div>;
  }
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          labelLine={false}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate}/>} />
        <Legend 
            iconSize={10} 
            wrapperStyle={{
                paddingTop: '15px', 
                fontSize: '12px', 
                lineHeight: '20px',
                bottom: 0,
            }} 
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default RecurringVsOneTimeChart;
