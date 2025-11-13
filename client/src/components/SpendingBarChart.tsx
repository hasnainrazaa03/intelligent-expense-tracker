import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';

interface ChartData {
  label: string;
  amount: number;
}

interface SpendingBarChartProps {
  data: ChartData[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-base-100 dark:bg-dark-300 p-2 border border-base-300 dark:border-dark-100 rounded-md shadow-lg">
        <p className="font-bold">{`${label}`}</p>
        <p className="text-brand-primary">{`Spent: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};

const SpendingBarChart: React.FC<SpendingBarChartProps> = ({ data, displayCurrency, conversionRate }) => {
    if (data.length === 0) {
        return <div className="flex items-center justify-center h-full text-base-content-secondary dark:text-gray-400">No data to display.</div>;
    }
    
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{
          top: 5,
          right: 20,
          left: -10,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.3)" />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} />
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate}/>} cursor={{fill: 'rgba(20, 184, 166, 0.1)'}} />
        <Bar dataKey="amount" fill="#14b8a6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default SpendingBarChart;
