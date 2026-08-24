import React, { useMemo } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Expense } from '../../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../../utils/currencyUtils';
import { seriesValue } from '../../utils/chartPayload';

interface AccountChartProps {
  expenses: Expense[];
}

const COLORS = ['#6d5cf0', '#0284c7', '#d97706', '#16a34a', '#ec4899', '#9333ea', '#0d9488', '#64748b'];

const UNASSIGNED = 'Unassigned';

const CustomTooltip = ({ active, payload, displayCurrency, conversionRate }: any) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="p-2.5 rounded-lg border border-app-border shadow-soft text-xs text-app-text" style={{ background: 'var(--modal-surface)' }}>
      <p className="font-bold">{entry.name}</p>
      <p style={{ color: entry.payload.fill }}>
        {formatCurrency(seriesValue(payload, 'value') || entry.value, displayCurrency, conversionRate)}
      </p>
    </div>
  );
};

/**
 * Spend split by the account/card it came from. `paymentMethod` can't answer
 * this — two different credit cards are both "Credit Card" — so this groups on
 * the `account` field instead.
 */
const AccountChart: React.FC<AccountChartProps> = ({ expenses }) => {
  const { displayCurrency, conversionRate } = useCurrency();

  const data = useMemo(() => {
    // Group case-insensitively so "Discover" and "discover" don't split, keeping
    // the first-seen casing as the label.
    const totals: Record<string, { label: string; value: number }> = {};
    for (const e of expenses) {
      const raw = (e.account || '').trim();
      const key = raw ? raw.toLowerCase() : UNASSIGNED.toLowerCase();
      const label = raw || UNASSIGNED;
      if (!totals[key]) totals[key] = { label, value: 0 };
      totals[key].value += Number(e.amount) || 0;
    }
    return Object.values(totals)
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((d) => ({ name: d.label, value: Number(d.value.toFixed(2)) }));
  }, [expenses]);

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-sm text-app-faint">No spending to break down yet</div>;
  }

  // Nothing has been assigned an account, so the chart would be a single
  // "Unassigned" circle — say what to do instead of drawing it.
  if (data.length === 1 && data[0].name === UNASSIGNED) {
    return (
      <div className="flex items-center justify-center h-full text-center text-sm text-app-faint px-4">
        Set an account on your expenses (or on your next statement import) to see spend split by card.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="45%" paddingAngle={2}>
          {data.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.name === UNASSIGNED ? '#64748b' : COLORS[i % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} />
        <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={9} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default AccountChart;
