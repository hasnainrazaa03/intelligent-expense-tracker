import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '../app/routes';
import { useCurrency } from '../contexts/CurrencyContext';
import { Expense } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { todayCalendar } from '../utils/dateUtils';
import { TableCellsIcon, ClipboardDocumentListIcon } from './Icons'; // Swapped to icons you have

interface PivotAnalysisProps {
  expenses: Expense[];
}

const PivotAnalysis: React.FC<PivotAnalysisProps> = ({ expenses }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [groupBy, setGroupBy] = useState<'category' | 'month' | 'paymentMethod'>('category');
  // Sortable columns (U5): click a heading; again to flip the order.
  const [sort, setSort] = useState<{ key: 'name' | 'total' | 'count' | 'avg'; desc: boolean }>({ key: 'total', desc: true });

  const pivotData = useMemo(() => {
    const groups: Record<string, { total: number; count: number; avg: number }> = {};

    expenses.forEach((exp) => {
      let key = exp.category;
      if (groupBy === 'month') key = exp.date.substring(0, 7); // YYYY-MM
      if (groupBy === 'paymentMethod') key = exp.paymentMethod || 'UNSPECIFIED';

      if (!groups[key]) {
        groups[key] = { total: 0, count: 0, avg: 0 };
      }
      groups[key].total += exp.amount;
      groups[key].count += 1;
    });

    return Object.entries(groups)
      .map(([name, data]) => ({
        name,
        ...data,
        avg: data.total / data.count,
      }))
      .sort((a, b) => {
        const by = sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key];
        return sort.desc ? -by : by;
      });
  }, [expenses, groupBy, sort]);
  const sortBy = (key: typeof sort.key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }));
  const ariaSort = (key: typeof sort.key) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none');
  const head = (key: typeof sort.key, label: string) => (
    <button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded">
      {label}<span aria-hidden="true">{sort.key === key ? (sort.desc ? '↓' : '↑') : ''}</span>
    </button>
  );
  // A category or payment method opens Transactions filtered to it.
  const rowLink = (name: string) =>
    groupBy === 'category' ? `${PATHS.transactionsExpenses}?category=${encodeURIComponent(name)}`
    : groupBy === 'paymentMethod' && name !== 'UNSPECIFIED' ? `${PATHS.transactionsExpenses}?method=${encodeURIComponent(name)}`
    : null;

  const totalVolume = pivotData.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-app-border pb-6 overflow-hidden">
        <div className="min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-[8px] md:text-[10px] uppercase tracking-widest text-app-faint truncate">Group and total your spending</span>
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-app-text leading-tight tracking-tight break-words">
            Breakdown
          </h2>
        </div>

        {/* 2. MODE SELECTOR */}
        <div className="flex gap-1 rounded-xl bg-surface-2 border border-app-border p-1 w-full lg:w-auto overflow-x-auto no-scrollbar">
          {(['category', 'month', 'paymentMethod'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setGroupBy(mode)}
              className={`rounded-lg px-4 md:px-6 py-2 font-semibold text-[10px] md:text-xs transition-all whitespace-nowrap flex-1 ${
                groupBy === mode ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'
              }`}
            >
              {mode === 'paymentMethod' ? 'Payment method' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* 3. THE LEDGER TABLE */}
      <div className="glass rounded-2xl overflow-hidden relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
          <TableCellsIcon className="h-96 w-96 text-app-text" />
        </div>

        <table className="w-full text-left relative z-10 border-collapse">
          <thead>
            <tr className="text-app-muted text-xs uppercase tracking-wide border-b border-app-border">
              <th aria-sort={ariaSort('name')} className="p-3 md:p-4 font-semibold text-[10px] md:text-sm tracking-wide">{head('name', groupBy === 'paymentMethod' ? 'Payment method' : groupBy === 'month' ? 'Month' : 'Category')}</th>
              <th aria-sort={ariaSort('total')} className="p-3 md:p-4 font-semibold text-[10px] md:text-sm tracking-wide text-right">{head('total', 'Total')}</th>
              <th aria-sort={ariaSort('count')} className="hidden md:table-cell p-6 font-semibold text-sm tracking-wide text-right">{head('count', 'Transactions')}</th>
              <th aria-sort={ariaSort('avg')} className="hidden md:table-cell p-6 font-semibold text-sm tracking-wide text-right whitespace-nowrap">{head('avg', 'Average')}</th>
            </tr>
          </thead>
          <tbody>
            {pivotData.map((row) => (
              <tr key={row.name} className="border-b border-app-border odd:bg-surface-2/40 hover:bg-surface-2/60 transition-colors group">
                <td className="p-3 md:p-4 font-display font-semibold text-sm md:text-base text-app-text truncate max-w-[120px] md:max-w-none">
                  {rowLink(row.name)
                    ? <Link to={rowLink(row.name)!} className="hover:text-primary hover:underline underline-offset-2">{row.name}</Link>
                    : row.name.replace('-', '/')}
                </td>
                <td className="p-3 md:p-4 text-right">
                  <span className="font-display font-bold text-sm md:text-lg text-app-text tabular-nums block">
                    {formatCurrency(row.total, displayCurrency, conversionRate)}
                  </span>
                  <div className="h-1 bg-surface-2 rounded-full mt-1 relative w-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full absolute top-0 left-0"
                      style={{ width: `${(row.total / totalVolume) * 100}%` }}
                  />
                </div>
                </td>
                <td className="hidden md:table-cell p-4 text-right text-sm text-app-muted tabular-nums">
                  {row.count}
                </td>
                <td className="hidden md:table-cell p-4 text-right font-display font-semibold text-base text-app-muted tabular-nums">
                  {formatCurrency(row.avg, displayCurrency, conversionRate)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-app-border bg-surface-2/40">
              <td className="p-3 md:p-4 font-display font-bold text-sm md:text-lg text-app-text">Total</td>
              <td className="p-3 md:p-4 text-right font-display font-bold text-base md:text-xl text-app-text tabular-nums">
                {formatCurrency(totalVolume, displayCurrency, conversionRate)}
              </td>
              <td colSpan={2} className="hidden md:table-cell p-6" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. EXPORT CALLOUT */}
      <div className="flex justify-end pt-4">
        <button
          onClick={() => {
            // Generate CSV from pivot data
            const headers = ['Data Point', 'Total', 'Count', 'Average'];
            const rows = pivotData.map(row => [
              row.name,
              row.total.toFixed(2),
              row.count.toString(),
              row.avg.toFixed(2),
            ]);
            const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `pivot_analysis_${groupBy}_${todayCalendar()}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="w-full md:w-auto flex items-center justify-center space-x-2 bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong px-6 py-4 rounded-xl font-semibold text-xs md:text-sm active:scale-[0.99] transition-all"
        >
          <ClipboardDocumentListIcon className="h-5 w-5" />
          <span>Download CSV</span>
        </button>
    </div>
    </div>
  );
};

export default PivotAnalysis;