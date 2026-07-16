import React, { useMemo } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Expense } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';
import { PAYMENT_METHODS } from '../../constants';

// Canonical display label per lowercased payment method, so "Cash"/"CASH"/"cash"
// collapse into one slice instead of three. Known methods snap to their proper
// casing from PAYMENT_METHODS; anything else keeps its first-seen label.
const CANONICAL_METHOD: Record<string, string> = PAYMENT_METHODS.reduce(
  (acc, m) => { acc[m.toLowerCase()] = m; return acc; },
  {} as Record<string, string>
);

interface PaymentMethodChartProps {
  expenses: Expense[];
}

const COLORS = ['#14b8a6', '#0f766e', '#f97316', '#eab308', '#84cc16', '#22c55e', '#3b82f6', '#8b5cf6', '#a8a29e'];

const CustomTooltip = ({ active, payload, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2.5 rounded-lg border border-app-border shadow-soft text-xs text-app-text" style={{ background: 'var(--modal-surface)' }}>
        <p className="font-bold">{`${payload[0].name}`}</p>
        <p style={{ color: payload[0].payload.fill }}>{`Amount: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};

const PaymentMethodChart: React.FC<PaymentMethodChartProps> = ({ expenses }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const data = useMemo(() => {
    // Group by a case-insensitive key so different casings of the same method
    // merge; keep a canonical label (known methods snap to PAYMENT_METHODS casing,
    // others keep the first casing seen).
    const totals: Record<string, { label: string; value: number }> = {};
    for (const exp of expenses) {
      const raw = (exp.paymentMethod || '').trim();
      const key = raw ? raw.toLowerCase() : 'unspecified';
      const label = raw ? (CANONICAL_METHOD[key] || raw) : 'Unspecified';
      if (!totals[key]) totals[key] = { label, value: 0 };
      totals[key].value += Number(exp.amount);
    }

    return Object.values(totals)
      .map(({ label, value }) => ({ name: label, value }))
      .sort((a, b) => b.value - a.value)
      // Assign the slice color here (post-sort) so the Cell and the tooltip's
      // colored amount agree.
      .map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
  }, [expenses]);
  
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-app-muted">No data to display.</div>;
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
            <Cell key={`cell-${index}`} fill={entry.fill} />
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
