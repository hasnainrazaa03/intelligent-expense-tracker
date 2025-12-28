
import React from 'react';
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
    if (data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full font-loud text-xs text-ink/30 italic">
            NO_DATA_AVAILABLE
          </div>
        );
    }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          innerRadius={window.innerWidth < 768 ? 45 : 60}
          outerRadius={window.innerWidth < 768 ? 65 : 80}
          paddingAngle={5}
          strokeWidth={window.innerWidth < 768 ? 2 : 4}
          stroke="#111111"
          dataKey="value"
          isAnimationActive={true}
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              // USC Palette Cycle: Cardinal, Gold, Ink, and a Darkened Bone
              fill={[ '#990000', '#FFCC00', '#111111', '#CCCCCC' ][index % 4]} 
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
                  width: '100%'
                }
              : {
                  paddingLeft: '20px',
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase'
                }
          } 
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default CategoryPieChart;
