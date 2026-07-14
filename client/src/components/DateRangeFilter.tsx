import React from 'react';

export type DateRange = 'this_month' | 'last_month' | 'last_90_days' | 'all_time';

interface DateRangeFilterProps {
  selectedRange: DateRange;
  onChange: (range: DateRange) => void;
}

const ranges: { id: DateRange; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_90_days', label: '90 days' },
  { id: 'all_time', label: 'All time' },
];

// Standalone so it can be used both inside the (lazy) Dashboard and directly in
// the list headers without eager-loading the whole Dashboard chunk.
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ selectedRange, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
      {ranges.map(range => (
        <button
          key={range.id}
          onClick={() => onChange(range.id)}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
            selectedRange === range.id
              ? 'bg-primary text-on-primary shadow-glow'
              : 'text-app-muted hover:text-app-text'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
};
