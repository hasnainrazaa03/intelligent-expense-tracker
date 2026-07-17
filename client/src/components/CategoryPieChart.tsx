import React, { useMemo, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
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

const CustomTooltip = ({ active, payload, total, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    const v = payload[0].value;
    const pct = total > 0 ? (v / total) * 100 : 0;
    return (
      <div className="modal-surface border border-app-border rounded-xl px-3 py-2 shadow-soft">
        <p className="text-[11px] font-medium text-app-muted mb-1 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: payload[0].payload.fill }} />
          {payload[0].name}
        </p>
        <p className="font-display text-sm font-bold text-app-text tabular-nums">
          {formatCurrency(v, displayCurrency, conversionRate)} <span className="text-app-muted font-medium text-xs">· {pct.toFixed(1)}%</span>
        </p>
      </div>
    );
  }
  return null;
};

/** Donut with a live total in the centre and a clickable legend (each row shows
 *  the category's share; clicking hides/shows its slice, with a Show-all reset). */
const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ data }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { theme } = useTheme();
  const c = getChartColors(theme);
  const [hidden, setHidden] = useState<string[]>([]);
  const isMobile = useIsMobile();

  const visible = useMemo(() => data.filter((d) => !hidden.includes(d.name)), [data, hidden]);
  const totalAll = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const visibleTotal = useMemo(() => visible.reduce((s, d) => s + d.value, 0), [visible]);
  const toggle = (name: string) =>
    setHidden((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-sm text-app-faint">No data available</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-full gap-3 md:gap-4">
      {/* Donut + centre total */}
      <div className="relative flex-1 min-h-[11rem]">
        {visible.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visible}
                  innerRadius={isMobile ? 46 : 62}
                  outerRadius={isMobile ? 66 : 84}
                  paddingAngle={3}
                  strokeWidth={2}
                  stroke={c.surface}
                  dataKey="value"
                >
                  {visible.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} onClick={() => toggle(entry.name)} style={{ cursor: 'pointer' }} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip total={totalAll} displayCurrency={displayCurrency} conversionRate={conversionRate} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-[0.15em] text-app-faint">{hidden.length ? 'Shown' : 'Total'}</span>
              <span className="font-display text-base md:text-lg font-bold text-app-text tabular-nums">
                {formatCurrency(visibleTotal, displayCurrency, conversionRate, true)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-app-muted">All categories hidden</p>
            <button onClick={() => setHidden([])} className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary font-semibold text-xs shadow-glow hover:brightness-110 transition-all">
              Show all
            </button>
          </div>
        )}
      </div>

      {/* Clickable legend */}
      <div className="md:w-44 flex-shrink-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-app-faint">Categories</span>
          {hidden.length > 0 && (
            <button onClick={() => setHidden([])} className="text-[11px] font-semibold text-primary hover:underline">Show all</button>
          )}
        </div>
        <div className="space-y-0.5 overflow-y-auto custom-scrollbar pr-0.5 max-h-40 md:max-h-none">
          {data.map((item) => {
            const isHidden = hidden.includes(item.name);
            const pct = totalAll > 0 ? (item.value / totalAll) * 100 : 0;
            return (
              <button
                key={item.name}
                onClick={() => toggle(item.name)}
                aria-pressed={!isHidden}
                title={`${item.name}: ${formatCurrency(item.value, displayCurrency, conversionRate)} (${pct.toFixed(1)}%) — click to ${isHidden ? 'show' : 'hide'}`}
                className={`w-full flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2 transition-colors ${isHidden ? 'opacity-45' : ''}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className={`text-xs text-app-text truncate ${isHidden ? 'line-through' : ''}`}>{item.name}</span>
                </span>
                <span className="text-[11px] text-app-muted tabular-nums flex-shrink-0">{pct.toFixed(0)}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CategoryPieChart;
