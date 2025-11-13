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

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, isString = false, icon, percentageChange, isNetFlow = false, displayCurrency, conversionRate }) => {
  const isNumeric = !isString && typeof value === 'number';
  const formattedValue = isNumeric
    ? formatCurrency(Math.abs(value as number), displayCurrency, conversionRate)
    : value;

  let valueColor = 'text-base-content dark:text-base-100';
  if (isNetFlow && isNumeric) {
    if (value > 0) valueColor = 'text-green-600 dark:text-green-400';
    if (value < 0) valueColor = 'text-red-600 dark:text-red-400';
  }

  const renderPercentageChange = () => {
    if (percentageChange === undefined || !isFinite(percentageChange)) {
      return null;
    }

    const isPositive = percentageChange >= 0;
    const colorClass = isPositive ? 'text-red-500' : 'text-green-500';
    const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon;

    return (
      <div className={`flex items-center text-xs font-semibold ${colorClass}`}>
        <Icon className="h-3 w-3 mr-0.5" />
        <span>{Math.abs(percentageChange).toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="bg-base-200 dark:bg-dark-300 p-6 rounded-xl flex items-center space-x-4 transition-shadow hover:shadow-md">
      <div className="bg-brand-primary/20 text-brand-primary rounded-full p-3">
        {icon}
      </div>
      <div>
        <p className="text-sm text-base-content-secondary dark:text-base-300">{title}</p>
        <div className="flex items-baseline space-x-2">
            <p className={`text-2xl font-bold ${valueColor}`}>
              {isNetFlow && isNumeric && (value as number) < 0 ? '-' : ''}
              {formattedValue}
            </p>
            {renderPercentageChange()}
        </div>
      </div>
    </div>
  );
};

export default SummaryCard;
