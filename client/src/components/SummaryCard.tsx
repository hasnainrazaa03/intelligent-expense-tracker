import React from 'react';
import { ArrowUpIcon, ArrowDownIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';

interface SummaryCardProps {
  title: string;
  value: number | string;
  isString?: boolean;
  icon: React.ReactNode;
  percentageChange?: number;
  isNetFlow?: boolean;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ 
  title, value, isString = false, icon, percentageChange, 
  isNetFlow = false, displayCurrency, conversionRate 
}) => {
  const isNumeric = !isString && typeof value === 'number';
  
  // Format the value
  const formattedValue = isNumeric
    ? formatCurrency(Math.abs(value as number), displayCurrency, conversionRate)
    : value;

  // Neo-Brutalist Color Logic
  let valueColor = 'text-ink'; 

  if (isNetFlow && isNumeric) {
    if (value > 0) valueColor = 'text-green-600';
    // USC Cardinal for negative flow (High Contrast)
    if (value < 0) valueColor = 'text-usc-cardinal';
  }

  const renderPercentageChange = () => {
    if (percentageChange === undefined || !isFinite(percentageChange)) {
      return null;
    }

    const isPositive = percentageChange >= 0;
    // Streetwear "Status Tag" look
    const tagBg = isPositive ? 'bg-usc-cardinal' : 'bg-green-600';
    const tagText = 'text-bone';
    const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon;

    return (
      <div className={`mt-2 flex items-center w-fit px-2 py-0.5 border-2 border-ink shadow-[2px_2px_0px_0px_#111111] ${tagBg} ${tagText}`}>
        <Icon className="h-3 w-3 mr-1 stroke-[3px]" />
        <span className="font-loud text-[10px]">{Math.abs(percentageChange).toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="h-full p-4 md:p-6 bg-bone flex flex-col justify-between group transition-all relative overflow-hidden">
      {/* Top Row: Icon and Title */}
      <div className="flex items-start justify-between mb-3 md:mb-4 gap-2">
        <div className="bg-usc-gold text-ink p-1.5 md:p-2 border-2 border-ink shadow-[2px_2px_0px_0px_#111111] md:shadow-[3px_3px_0px_0px_#111111] group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:shadow-none transition-all flex-shrink-0">
          {React.cloneElement(icon as React.ReactElement, { className: 'h-5 w-5 md:h-6 md:w-6 stroke-[2.5px]' })}
        </div>
        <span className="font-loud text-[9px] md:text-[10px] text-ink/60 tracking-widest uppercase text-right leading-tight truncate md:whitespace-normal">
          {title.replace(/\s+/g, '_')}
        </span>
      </div>

      {/* Bottom Row: Value and Trend */}
      <div className="min-w-0">
        <h4 className={`font-loud text-xl sm:text-2xl md:text-3xl leading-none break-all sm:break-words ${valueColor}`}>
          {formattedValue}
        </h4>
        {renderPercentageChange()}
      </div>

      {/* Decorative Technical ID (Streetwear Detail) */}
      <div className="absolute bottom-1 right-2 opacity-10 pointer-events-none hidden xs:block">
      <span className="font-mono text-[7px] md:text-[8px] text-ink">
          METRIC_REF_{title.slice(0,3).toUpperCase()}
        </span>
      </div>
    </div>
  );
};

export default SummaryCard;