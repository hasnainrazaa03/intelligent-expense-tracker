import React, { useState, useEffect } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';
import { useTheme } from '../hooks/useTheme';
import { getChartColors } from '../utils/chartTheme';

interface ChartData {
  name: string;
  spent: number;
  budgeted: number;
}

interface BudgetPerformanceChartProps {
  data: ChartData[];
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass glass-blur rounded-xl px-3 py-2 z-50">
        <p className="text-[11px] font-medium text-app-muted mb-1.5">{label}</p>
        <p className="font-display text-sm font-bold text-danger tabular-nums">
          {`Spent: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}
        </p>
        <p className="text-xs font-medium text-app-muted tabular-nums">
          {`Budget: ${formatCurrency(payload[1].value, displayCurrency, conversionRate)}`}
        </p>
      </div>
    );
  }
  return null;
};


const BudgetPerformanceChart: React.FC<BudgetPerformanceChartProps> = ({ data }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { theme } = useTheme();
  const c = getChartColors(theme);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full text-sm text-app-faint">
            Not enough data yet
          </div>
        );
    }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 10, right: 5, left: -15, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />

        <XAxis
          dataKey="name"
          tick={{ fill: c.tick, fontSize: 10 }}
          axisLine={{ stroke: c.axisLine }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: c.tick, fontSize: 10 }}
          tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)}
          axisLine={false}
          tickLine={false}
          width={40}
        />

        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} cursor={{ stroke: c.axisLine, strokeWidth: 1 }} position={{ y: 0 }} />

        <Legend
          wrapperStyle={{
            paddingTop: '10px',
            fontSize: '11px',
            color: c.tick,
          }}
          iconSize={9}
        />

        {/* Actual spending */}
        <Line
          type="stepAfter"
          dataKey="spent"
          name="Spent"
          stroke={c.danger}
          strokeWidth={isMobile ? 2 : 2.5}
          dot={{ r: 2.5, fill: c.danger, strokeWidth: 0 }}
          activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }}
        />

        {/* Budget limit */}
        <Line
          type="monotone"
          dataKey="budgeted"
          name="Budget"
          stroke={c.tick}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default BudgetPerformanceChart;
