import React from 'react';
import { ArrowUpIcon, ArrowDownIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';
import { useCurrency } from '../contexts/CurrencyContext';

type Accent = 'indigo' | 'green' | 'rose' | 'amber' | 'sky';

interface SummaryCardProps {
  title: string;
  value: number | string;
  isString?: boolean;
  icon: React.ReactNode;
  percentageChange?: number;
  isNetFlow?: boolean;
  accent?: Accent;
}

const ACCENT: Record<Accent, { chip: string; text: string }> = {
  indigo: { chip: 'bg-[color:var(--color-cat-indigo)]/15 text-[color:var(--color-cat-indigo)]', text: '' },
  green: { chip: 'bg-ok/15 text-ok', text: '' },
  rose: { chip: 'bg-[color:var(--color-cat-rose)]/15 text-[color:var(--color-cat-rose)]', text: '' },
  amber: { chip: 'bg-warn/15 text-warn', text: '' },
  sky: { chip: 'bg-[color:var(--color-cat-sky)]/15 text-[color:var(--color-cat-sky)]', text: '' },
};

const SummaryCard: React.FC<SummaryCardProps> = ({
  title, value, isString = false, icon, percentageChange, isNetFlow = false, accent = 'indigo'
}) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const isNumeric = !isString && typeof value === 'number';

  const showSign = isNetFlow && isNumeric && (value as number) < 0;
  const formattedValue = isNumeric
    ? `${showSign ? '-' : ''}${formatCurrency(Math.abs(value as number), displayCurrency, conversionRate)}`
    : value;

  let valueColor = 'text-app-text';
  if (isNetFlow && isNumeric) {
    if ((value as number) > 0) valueColor = 'text-ok';
    if ((value as number) < 0) valueColor = 'text-danger';
  }

  const label = title.replace(/_/g, ' ');

  const renderDelta = () => {
    if (percentageChange === undefined || !isFinite(percentageChange)) return null;
    const isUp = percentageChange >= 0;
    const Icon = isUp ? ArrowUpIcon : ArrowDownIcon;
    return (
      <div className={`mt-2.5 inline-flex items-center gap-1 text-xs font-semibold ${isUp ? 'text-ok' : 'text-danger'}`}>
        <Icon className="h-3.5 w-3.5" />
        {Math.abs(percentageChange).toFixed(1)}%
        <span className="text-app-muted font-medium">vs last month</span>
      </div>
    );
  };

  return (
    <div className="glass rounded-2xl p-4 h-full flex flex-col justify-between transition-all hover:-translate-y-0.5">
      <div className="flex items-center gap-2.5">
        <div className={`grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 ${ACCENT[accent].chip}`}>
          {React.cloneElement(icon as React.ReactElement, { className: 'h-5 w-5' })}
        </div>
        <span className="text-xs md:text-[13px] font-medium text-app-muted capitalize">{label.toLowerCase()}</span>
      </div>
      <div className="mt-2.5">
        <h4 className={`font-display text-xl md:text-2xl font-bold leading-none tracking-tight tabular-nums break-words ${valueColor}`}>
          {formattedValue}
        </h4>
        {renderDelta()}
      </div>
    </div>
  );
};

export default SummaryCard;
