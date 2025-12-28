import React, { useMemo, useState } from 'react';
import { Expense } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { TableCellsIcon, ClipboardDocumentListIcon } from './Icons'; // Swapped to icons you have

interface PivotAnalysisProps {
  expenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const PivotAnalysis: React.FC<PivotAnalysisProps> = ({ expenses, displayCurrency, conversionRate }) => {
  const [groupBy, setGroupBy] = useState<'category' | 'month' | 'paymentMethod'>('category');

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
      .sort((a, b) => b.total - a.total);
  }, [expenses, groupBy]);

  const totalVolume = pivotData.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. TECHNICAL HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b-4 md:border-b-8 border-ink pb-6 overflow-hidden">
        <div className="min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <span className="bg-usc-gold text-ink px-1.5 py-0.5 font-loud text-[8px] md:text-[10px] border-2 border-ink shadow-[2px_2px_0px_0px_#111111]">
              ENGINE_v4.0
            </span>
            <span className="font-mono text-[8px] md:text-[10px] opacity-40 uppercase tracking-widest text-ink truncate">Data_Pivot_Processing</span>
          </div>
          <h2 className="font-loud text-4xl sm:text-5xl md:text-7xl text-ink leading-none tracking-tighter uppercase break-words">
            MATRIX_ANALYSIS
          </h2>
        </div>

        {/* 2. MODE SELECTOR */}
        <div className="flex bg-ink p-1 border-4 border-ink shadow-neo w-full lg:w-auto overflow-x-auto no-scrollbar">
          {(['category', 'month', 'paymentMethod'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setGroupBy(mode)}
              className={`px-4 md:px-6 py-2 font-loud text-[10px] md:text-xs transition-all whitespace-nowrap flex-1 ${
                groupBy === mode ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 3. THE LEDGER TABLE */}
      <div className="bg-white border-4 border-ink shadow-neo overflow-hidden relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
          <TableCellsIcon className="h-96 w-96 text-ink" />
        </div>

        <table className="w-full text-left relative z-10 border-collapse">
          <thead>
            <tr className="bg-ink text-bone border-b-4 border-ink">
              <th className="p-3 md:p-6 font-loud text-[10px] md:text-sm tracking-widest text-bone">DATA_POINT</th>
              <th className="p-3 md:p-6 font-loud text-[10px] md:text-sm tracking-widest text-right text-bone">VOLUME_SUM</th>
              <th className="hidden md:table-cell p-6 font-loud text-sm tracking-widest text-right text-bone">FREQ_COUNT</th>
              <th className="hidden md:table-cell p-6 font-loud text-sm tracking-widest text-right text-bone whitespace-nowrap">MEAN_VAL</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 md:divide-y-4 divide-ink/10">
            {pivotData.map((row) => (
              <tr key={row.name} className="hover:bg-usc-gold/5 transition-colors group">
                <td className="p-3 md:p-6 font-loud text-sm md:text-xl text-ink uppercase border-r-2 md:border-r-4 border-ink/5 truncate max-w-[120px] md:max-w-none">
                  {row.name.replace('-', '/')}
                </td>
                <td className="p-3 md:p-6 text-right border-r-0 md:border-r-4 md:border-ink/5">
                  <span className="font-loud text-base md:text-2xl text-usc-cardinal block">
                    {formatCurrency(row.total, displayCurrency, conversionRate)}
                  </span>
                  <div className="h-1 bg-ink/10 mt-1 relative w-full">
                    <div 
                      className="h-full bg-usc-gold absolute top-0 left-0" 
                      style={{ width: `${(row.total / totalVolume) * 100}%` }}
                  />
                </div>
                </td>
                <td className="hidden md:table-cell p-6 text-right font-mono text-sm font-bold opacity-60 text-ink border-r-4 border-ink/5">
                  {row.count.toString().padStart(3, '0')}
                </td>
                <td className="hidden md:table-cell p-6 text-right font-loud text-lg opacity-80 text-ink">
                  {formatCurrency(row.avg, displayCurrency, conversionRate)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bone border-t-4 border-ink">
              <td className="p-3 md:p-6 font-loud text-sm md:text-2xl uppercase text-ink">AGGREGATE_TOTAL</td>
              <td className="p-3 md:p-6 text-right font-loud text-lg md:text-3xl text-ink">
                {formatCurrency(totalVolume, displayCurrency, conversionRate)}
              </td>
              <td colSpan={2} className="hidden md:table-cell p-6 text-right italic font-mono text-[10px] opacity-40 text-ink">
                EOF // USC_FIN_ANALYSIS_STAMP
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. EXPORT CALLOUT */}
      <div className="flex justify-end pt-4">
        <button className="w-full md:w-auto flex items-center justify-center space-x-2 bg-bone border-4 border-ink px-6 py-4 font-loud text-xs md:text-sm text-ink shadow-neo active:translate-y-1 transition-all uppercase">
          <ClipboardDocumentListIcon className="h-5 w-5" />
          <span>DOWNLOAD_CSV_MANIFEST</span>
        </button>
    </div>
    </div>
  );
};

export default PivotAnalysis;