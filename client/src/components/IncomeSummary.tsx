import React, { useMemo } from 'react';
import { Income } from '../types';
import SummaryCard from './SummaryCard';
import SpendingBarChart from './SpendingBarChart';
import { BanknotesIcon, TagIcon, ChartPieIcon } from './Icons';
import { addMonths, monthKey } from '../utils/dateUtils';

interface IncomeSummaryProps {
  /** Incomes for the currently selected period. */
  incomes: Income[];
  /** All incomes, used for the 6-month trend. */
  allIncomes: Income[];
}

/** Compact income overview shown above the Income list — gives the Income tab its
 *  own identity (distinct from the expense-centric Financial hub). */
const IncomeSummary: React.FC<IncomeSummaryProps> = ({ incomes, allIncomes }) => {
  const { total, topSource, sourceCount } = useMemo(() => {
    const total = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const byCategory: Record<string, number> = {};
    incomes.forEach((i) => { byCategory[i.category] = (byCategory[i.category] || 0) + Number(i.amount); });
    const top = (Object.entries(byCategory) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    return { total, topSource: top, sourceCount: Object.keys(byCategory).length };
  }, [incomes]);

  const trend = useMemo(() => {
    const now = new Date();
    const data: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = addMonths(now, -i);
      const key = monthKey(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`);
      const amount = allIncomes
        .filter((inc) => monthKey(inc.date) === key)
        .reduce((sum, inc) => sum + Number(inc.amount), 0);
      data.push({ label: ref.toLocaleString('en-US', { month: 'short', year: '2-digit' }), amount });
    }
    return data;
  }, [allIncomes]);

  return (
    <div className="space-y-4 md:space-y-5 mb-6 md:mb-8">
      {/* Tab heading — mirrors the Expenses tab's "Financial hub" so the Income
          tab clearly announces what it is rather than opening on bare cards. */}
      <div className="flex flex-col min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.18em] uppercase text-app-muted mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ok shadow-glow" />
          Income overview
        </span>
        <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight tracking-tight break-words">
          Income hub
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
        <SummaryCard title="TOTAL_INCOME" value={total} icon={<BanknotesIcon className="h-6 w-6" />} accent="green" />
        <SummaryCard title="TOP_SOURCE" value={topSource} isString icon={<TagIcon className="h-6 w-6" />} accent="indigo" />
        <SummaryCard title="SOURCES" value={String(sourceCount)} isString icon={<ChartPieIcon className="h-6 w-6" />} accent="sky" />
      </div>
      <div className="glass rounded-2xl p-4 md:p-5 min-w-0">
        <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">Income trend · 6-month window</h3>
        <div className="h-44 md:h-52">
          <SpendingBarChart data={trend} />
        </div>
      </div>
    </div>
  );
};

export default IncomeSummary;
