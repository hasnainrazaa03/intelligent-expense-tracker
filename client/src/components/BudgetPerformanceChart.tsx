import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../utils/currencyUtils';

interface ChartData {
  name: string;
  spent: number;
  budgeted: number;
}

interface BudgetPerformanceChartProps {
  data: ChartData[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      // Reduced padding and border thickness for mobile
      <div className="bg-white border-2 md:border-4 border-ink p-2 md:p-3 shadow-neo z-50">
        <p className="font-loud text-[10px] md:text-xs mb-1 md:mb-2 border-b-2 border-ink pb-1">{label}</p>
        <p className="font-bold text-usc-cardinal text-[10px] md:text-sm">
          {`SPENT: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}
        </p>
        <p className="font-bold text-ink/60 text-[10px] md:text-sm">
          {`BUDGET: ${formatCurrency(payload[1].value, displayCurrency, conversionRate)}`}
        </p>
      </div>
    );
  }
  return null;
};


const BudgetPerformanceChart: React.FC<BudgetPerformanceChartProps> = ({ data, displayCurrency, conversionRate }) => {
    if (data.length === 0) {
        return (
          <div className="flex items-center justify-center h-full font-loud text-xs text-ink/30 italic uppercase">
            Insufficient_Data_Stream
          </div>
        );
    }
    
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 10, right: 5, left: -15, bottom: 0 }}
      >
        {/* Hard vertical and horizontal grid lines */}
        <CartesianGrid strokeDasharray="0" stroke="#111111" strokeOpacity={0.05} />
        
        <XAxis 
          dataKey="name" 
          tick={{ fill: '#111111', fontSize: 8, fontWeight: 900 }}
          axisLine={{ stroke: '#111111', strokeWidth: 2 }}
          tickLine={{ stroke: '#111111' }}
          interval="preserveStartEnd"
        />
        <YAxis 
          tick={{ fill: '#111111', fontSize: 8, fontWeight: 900 }} 
          tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} 
          axisLine={{ stroke: '#111111', strokeWidth: 2 }}
          width={40}
        />
        
        <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} cursor={{ stroke: '#111111', strokeWidth: 2 }} position={{ y: 0 }} />
        
        <Legend 
          wrapperStyle={{ 
            paddingTop: '10px', 
            fontWeight: 900, 
            fontSize: '8px', 
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
          iconSize={8}
        />

        {/* Actual Spending: USC Cardinal with thick line */}
        <Line 
          type="stepAfter" 
          dataKey="spent" 
          name="Actual_Spent" 
          stroke="#990000" 
          strokeWidth={window.innerWidth < 768 ? 2 : 4} 
          dot={{ r: 3, fill: '#990000', strokeWidth: 1, stroke: '#FFFFFF' }}
          activeDot={{ r: 6, stroke: '#111111', strokeWidth: 2 }}
        />
        
        {/* Budget: Heavy Dashed Black Line */}
        <Line 
          type="monotone" 
          dataKey="budgeted" 
          name="Projected_Limit" 
          stroke="#111111" 
          strokeWidth={1} 
          strokeDasharray="4 4" 
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default BudgetPerformanceChart;
