import React, { useMemo } from 'react';
import { Expense } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';

interface PaymentMethodChartProps {
  expenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const COLORS = ['#14b8a6', '#0f766e', '#f97316', '#eab308', '#84cc16', '#22c55e', '#3b82f6', '#8b5cf6', '#a8a29e'];

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

const PaymentMethodChart: React.FC<PaymentMethodChartProps> = ({ expenses, displayCurrency, conversionRate }) => {
  const data = useMemo(() => {
    const paymentMethodTotals = expenses.reduce((acc, exp) => {
      const method = exp.paymentMethod || 'Unspecified';
      // FIX: Ensure exp.amount is treated as a number for the arithmetic operation.
      acc[method] = (acc[method] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(paymentMethodTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
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
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} />
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

export default PaymentMethodChart;
