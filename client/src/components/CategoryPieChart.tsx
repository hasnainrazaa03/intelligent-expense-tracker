
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';

interface ChartData {
  name: string;
  value: number;
  fill: string;
  [key: string]: any;
}

interface CategoryPieChartProps {
  data: ChartData[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const CustomTooltip = ({ active, payload, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border-2 md:border-4 border-ink p-2 md:p-3 shadow-neo z-50">
        <p className="font-loud text-[10px] md:text-xs mb-1 border-b-2 border-ink pb-1">{payload[0].name}</p>
        <p className="font-bold text-[10px] md:text-sm" style={{ color: payload[0].payload.fill }}>
          {formatCurrency(payload[0].value, displayCurrency, conversionRate)}
        </p>
      </div>
    );
  }
  return null;
};

const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ data, displayCurrency, conversionRate }) => {
    const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);

    const interactiveData = useMemo(() => {
      return data.filter((item) => !hiddenCategories.includes(item.name));
    }, [data, hiddenCategories]);

    const toggleCategory = (name: string) => {
      setHiddenCategories((prev) =>
        prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
      );
    };

    if (data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full font-loud text-xs text-ink/60 italic">
            NO_DATA_AVAILABLE
          </div>
        );
    }

    if (interactiveData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="font-loud text-xs text-ink/70 italic">ALL_CATEGORIES_HIDDEN</p>
          <button
            onClick={() => setHiddenCategories([])}
            className="px-3 py-1 border-2 border-ink bg-usc-gold font-loud text-[10px]"
          >
            RESET_FILTERS
          </button>
        </div>
      );
    }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={interactiveData}
          innerRadius={window.innerWidth < 768 ? 45 : 60}
          outerRadius={window.innerWidth < 768 ? 65 : 80}
          paddingAngle={5}
          strokeWidth={window.innerWidth < 768 ? 2 : 4}
          stroke="#111111"
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
          iconType="rect"
          iconSize={window.innerWidth < 768 ? 8 : 10}
          layout={window.innerWidth < 768 ? 'horizontal' : 'vertical'}
          align="center"
          verticalAlign={window.innerWidth < 768 ? 'bottom' : 'middle'}
          wrapperStyle={
            window.innerWidth < 768
              ? {
                  paddingTop: '10px',
                  fontSize: '8px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  width: '100%',
                }
              : {
                  paddingLeft: '20px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                }
          }
          formatter={(value: string) => {
            const isHidden = hiddenCategories.includes(value);
            return (
              <span
                onClick={() => toggleCategory(value)}
                style={{
                  cursor: 'pointer',
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
