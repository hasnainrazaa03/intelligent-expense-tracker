
import React, { useMemo, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTheme } from '../hooks/useTheme';
import { getChartColors } from '../utils/chartTheme';

// Track the mobile breakpoint reactively so rotating the device / resizing
// re-lays-out the chart (CMP-M25: window.innerWidth was read once at render).
const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
};

interface ChartData {
  name: string;
  value: number;
  fill: string;
  [key: string]: any;
}

interface CategoryPieChartProps {
  data: ChartData[];
}

const CustomTooltip = ({ active, payload, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass glass-blur rounded-xl px-3 py-2 z-50">
        <p className="text-[11px] font-medium text-app-muted mb-1 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: payload[0].payload.fill }} />
          {payload[0].name}
        </p>
        <p className="font-display text-sm font-bold text-app-text tabular-nums">
          {formatCurrency(payload[0].value, displayCurrency, conversionRate)}
        </p>
      </div>
    );
  }
  return null;
};

const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ data }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { theme } = useTheme();
  const c = getChartColors(theme);
    const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
    const isMobile = useIsMobile();

    const interactiveData = useMemo(() => {
      return data.filter((item) => !hiddenCategories.includes(item.name));
    }, [data, hiddenCategories]);

    // Legend is built from the FULL dataset (not the filtered pie data) so hidden
    // categories still appear — struck-through and clickable to restore. Without
    // this, hiding a slice removed it from the legend and there was no way back
    // until every category was hidden (CMP-H7).
    const legendPayload = useMemo(
      () =>
        data.map((item) => ({
          value: item.name,
          type: 'rect' as const,
          id: item.name,
          color: hiddenCategories.includes(item.name) ? c.tick : item.fill,
        })),
      [data, hiddenCategories]
    );

    const toggleCategory = (name: string) => {
      setHiddenCategories((prev) =>
        prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
      );
    };

    if (data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full text-sm text-app-faint">
            No data available
          </div>
        );
    }

    if (interactiveData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-sm text-app-muted">All categories hidden</p>
          <button
            onClick={() => setHiddenCategories([])}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary font-semibold text-xs shadow-glow hover:brightness-110 transition-all"
          >
            Reset filters
          </button>
        </div>
      );
    }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={interactiveData}
          innerRadius={isMobile ? 45 : 60}
          outerRadius={isMobile ? 65 : 80}
          paddingAngle={3}
          strokeWidth={2}
          stroke={c.surface}
          dataKey="value"
          isAnimationActive={true}
        >
          {interactiveData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.fill}
              onClick={() => toggleCategory(entry.name)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} />
        <Legend
          payload={legendPayload}
          iconType="rect"
          iconSize={isMobile ? 8 : 10}
          layout={isMobile ? 'horizontal' : 'vertical'}
          align={isMobile ? 'center' : 'right'}
          verticalAlign={isMobile ? 'bottom' : 'middle'}
          wrapperStyle={
            isMobile
              ? {
                  paddingTop: '10px',
                  fontSize: '11px',
                  width: '100%',
                }
              : {
                  paddingLeft: '16px',
                  fontSize: '12px',
                  lineHeight: '1.8',
                }
          }
          formatter={(value: string) => {
            const isHidden = hiddenCategories.includes(value);
            return (
              <span
                onClick={() => toggleCategory(value)}
                style={{
                  cursor: 'pointer',
                  color: c.tick,
                  opacity: isHidden ? 0.35 : 1,
                  textDecoration: isHidden ? 'line-through' : 'none',
                }}
              >
                {value}
              </span>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default CategoryPieChart;
