import React, { useState, useEffect } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';
import { useTheme } from '../hooks/useTheme';
import { getChartColors } from '../utils/chartTheme';
import ChartEmpty from './ChartEmpty';

interface ChartData {
  label: string;
  amount: number;
}

interface SpendingBarChartProps {
  data: ChartData[];
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass glass-blur rounded-xl px-3 py-2 z-50">
        <p className="text-[11px] font-medium text-app-muted mb-1">{label}</p>
        <p className="font-display text-sm font-bold text-app-text tabular-nums">
          {formatCurrency(payload[0].value, displayCurrency, conversionRate)}
        </p>
      </div>
    );
  }
  return null;
};

const SpendingBarChart: React.FC<SpendingBarChartProps> = ({ data }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { theme } = useTheme();
  const c = getChartColors(theme);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Treat an all-zero series as empty too: the daily-trend and net-worth
    // series always have a fixed number of buckets (days / 6 months), so a brand
    // new account would otherwise render a flat row of zero bars (a blank box)
    // instead of a clear "No data available".
    if (data.length === 0 || data.every((d) => !Number(d.amount))) {
        return <ChartEmpty />;
    }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        // Reclaiming horizontal space for mobile
        margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />

        <XAxis
          dataKey="label"
          tick={{ fill: c.tick, fontSize: 10 }}
          axisLine={{ stroke: c.axisLine }}
          tickLine={false}
          interval={isMobile ? (data.length > 10 ? 4 : 0) : 0}
        />
        <YAxis
          tick={{ fill: c.tick, fontSize: 10 }}
          tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)}
          axisLine={false}
          tickLine={false}
          width={45}
        />

        <Tooltip
          content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate}/>}
          cursor={{ fill: c.cursor }}
        />

        <Bar
          dataKey="amount"
          fill={c.primary}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default SpendingBarChart;
