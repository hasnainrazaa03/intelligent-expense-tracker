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
      <div className="bg-white border-2 md:border-4 border-ink p-2 md:p-3 shadow-neo z-50">
        <p className="font-loud text-[10px] md:text-xs mb-1 border-b-2 border-ink pb-1 uppercase">{label}</p>
        <p className="font-bold text-[10px] md:text-sm text-ink">
          {formatCurrency(payload[0].value, displayCurrency, conversionRate)}
        </p>
      </div>
    );
  }
  return null;
};

const SpendingBarChart: React.FC<SpendingBarChartProps> = ({ data, displayCurrency, conversionRate }) => {
    if (data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full font-loud text-xs text-ink/30 italic uppercase">
            NO_DATA_STREAM_FOUND
          </div>
        );
    }
    
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        // Reclaiming horizontal space for mobile
        margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="0" stroke="#111111" strokeOpacity={0.05} />
        
        <XAxis 
          dataKey="label" 
          tick={{ fill: '#111111', fontSize: 8, fontWeight: 900 }} 
          axisLine={{ stroke: '#111111', strokeWidth: 2 }}
          tickLine={{ stroke: '#111111', strokeWidth: 1 }}
          interval={window.innerWidth < 768 ? (data.length > 10 ? 4 : 0) : 0}
        />
        <YAxis 
          tick={{ fill: '#111111', fontSize: 8, fontWeight: 900 }} 
          tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} 
          axisLine={{ stroke: '#111111', strokeWidth: 2 }}
          tickLine={{ stroke: '#111111', strokeWidth: 1 }}
          width={45} 
        />
        
        <Tooltip 
          content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate}/>} 
          cursor={{ fill: '#111111', fillOpacity: 0.05 }} 
        />
        
        <Bar 
          dataKey="amount" 
          fill="#FFCC00" 
          stroke="#111111" 
          strokeWidth={window.innerWidth < 768 ? 1.5 : 3}
          radius={[0, 0, 0, 0]} 
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default SpendingBarChart;
