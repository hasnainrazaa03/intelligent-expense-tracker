import React, { useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../utils/currencyUtils';

export interface ChartColumn { key: string; label: string; money?: boolean }

/**
 * A chart's numbers as a table (U5): "Show as table" on every report chart, so
 * the exact values can be read, copied, and reached by a screen reader.
 */
export const ChartTable: React.FC<{ caption: string; columns: ChartColumn[]; rows: Record<string, unknown>[] }> = ({ caption, columns, rows }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const cell = (c: ChartColumn, v: unknown) => {
    if (c.money) return typeof v === 'number' ? formatCurrency(v, displayCurrency, conversionRate) : '—';
    return v === undefined || v === null || v === '' ? '—' : String(v);
  };
  if (rows.length === 0) return <p className="text-sm text-app-muted">No data for this period.</p>;
  return (
    <div tabIndex={0} role="region" aria-label={caption} className="overflow-auto max-h-80 rounded-xl border border-app-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" className={`px-3 py-2 text-xs font-semibold text-app-muted whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-app-border">
              {columns.map((c, i) => i === 0
                ? <th key={c.key} scope="row" className="px-3 py-2 text-left font-medium text-app-text whitespace-nowrap">{cell(c, r[c.key])}</th>
                : <td key={c.key} className="px-3 py-2 text-right tabular-nums text-app-text whitespace-nowrap">{cell(c, r[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** A report chart's card: its title, and a switch between the chart and its table. */
export const ChartCard: React.FC<{
  title: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: (asTable: boolean) => React.ReactNode;
}> = ({ title, className = '', bodyClassName = '', children }) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className={`glass rounded-2xl p-4 md:p-6 min-w-0 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4 border-b border-app-border pb-2.5">
        <h4 className="font-display font-semibold text-sm md:text-base text-app-text">{title}</h4>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="flex-shrink-0 text-xs font-semibold text-primary hover:underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          {asTable ? 'Show as chart' : 'Show as table'}
        </button>
      </div>
      <div className={asTable ? 'min-w-0' : bodyClassName}>{children(asTable)}</div>
    </div>
  );
};
