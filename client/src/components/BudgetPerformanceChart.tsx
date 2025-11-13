

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';

interface ChartData {
  name: string;
  spent: number;
  budgeted: number;
}

interface BudgetPerformanceChartProps {
  data: ChartData[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-base-100 dark:bg-dark-300 p-2 border border-base-300 dark:border-dark-100 rounded-md shadow-lg">
        <p className="font-bold">{label}</p>
        <p className="text-brand-primary">{`Spent: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
        <p className="text-stone-500">{`Budget: ${formatCurrency(payload[1].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};


const BudgetPerformanceChart: React.FC<BudgetPerformanceChartProps> = ({ data, displayCurrency, conversionRate }) => {
    if (data.length === 0) {
        return <div className="flex items-center justify-center h-full text-base-content-secondary dark:text-gray-400">Not enough data to display performance.</div>;
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
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} />
        <Legend wrapperStyle={{fontSize: '14px'}}/>
        <Line type="monotone" dataKey="spent" name="Actual Spending" stroke="#14b8a6" strokeWidth={2} activeDot={{ r: 6 }}/>
        <Line type="monotone" dataKey="budgeted" name="Budget" stroke="#a8a29e" strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default BudgetPerformanceChart;
