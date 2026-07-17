import React, { useMemo } from 'react';
import { Income, Expense } from '../types';
import SummaryCard from './SummaryCard';
import SpendingBarChart from './SpendingBarChart';
import CategoryPieChart from './CategoryPieChart';
import ChartEmpty from './ChartEmpty';
import { DateRangeFilter, type DateRange } from './DateRangeFilter';
import { BanknotesIcon, TagIcon, ChartPieIcon, TrendingUpIcon } from './Icons';
import { addMonths, monthKey } from '../utils/dateUtils';
import { formatCurrency } from '../utils/currencyUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface IncomeSummaryProps {
  /** Incomes for the currently selected income period. */
  incomes: Income[];
  /** All incomes, used for the 6-month trend + comparisons. */
  allIncomes: Income[];
  /** All expenses, for the income-vs-expense comparison. */
  allExpenses: Expense[];
  selectedRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

// A distinct palette for income sources (separate from the expense category ramp).
const SOURCE_COLORS = ['#16a34a', '#0d9488', '#0284c7', '#6d5cf0', '#9333ea', '#d97706', '#64748b', '#ec4899'];

/** The Income hub — the income counterpart to the expense Financial hub, with its
 *  own date filter, summary cards, and income-focused charts. */
const IncomeSummary: React.FC<IncomeSummaryProps> = ({ incomes, allIncomes, allExpenses, selectedRange, onDateRangeChange }) => {
  const { displayCurrency, conversionRate } = useCurrency();

  const { total, topSource, sourceCount, avgEntry, bySource } = useMemo(() => {
    const total = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const byCategory: Record<string, number> = {};
    incomes.forEach((i) => { byCategory[i.category] = (byCategory[i.category] || 0) + Number(i.amount); });
    const entries = (Object.entries(byCategory) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const bySource = entries.map(([name, value], i) => ({ name, value, fill: SOURCE_COLORS[i % SOURCE_COLORS.length] }));
    return {
      total,
      topSource: entries[0]?.[0] || 'N/A',
      sourceCount: entries.length,
      avgEntry: incomes.length ? total / incomes.length : 0,
      bySource,
    };
  }, [incomes]);

  const trend = useMemo(() => {
    const now = new Date();
    const data: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = addMonths(now, -i);
      const key = monthKey(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`);
      const amount = allIncomes.filter((inc) => monthKey(inc.date) === key).reduce((s, inc) => s + Number(inc.amount), 0);
      data.push({ label: ref.toLocaleString('en-US', { month: 'short', year: '2-digit' }), amount });
    }
    return data;
  }, [allIncomes]);

  const incomeVsExpense = useMemo(() => {
    const now = new Date();
    const data: { name: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = addMonths(now, -i);
      const key = monthKey(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`);
      const income = allIncomes.filter((x) => monthKey(x.date) === key).reduce((s, x) => s + Number(x.amount), 0);
      const expense = allExpenses.filter((x) => monthKey(x.date) === key).reduce((s, x) => s + Number(x.amount), 0);
      data.push({ name: ref.toLocaleString('en-US', { month: 'short', year: '2-digit' }), income, expense });
    }
    return data;
  }, [allIncomes, allExpenses]);

  const hasIncome = incomes.length > 0;

  return (
    <div className="space-y-5 md:space-y-6 mb-6 md:mb-8">
      {/* Header + own date filter (independent of the Financial hub). */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-4">
        <div className="flex flex-col min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.18em] uppercase text-app-muted mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ok shadow-glow" />
            Income overview
          </span>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight tracking-tight break-words">
            Income hub
          </h2>
        </div>
        <div className="w-full lg:w-auto flex justify-center lg:justify-end overflow-x-auto no-scrollbar py-1">
          <DateRangeFilter selectedRange={selectedRange} onChange={onDateRangeChange} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <SummaryCard title="TOTAL_INCOME" value={total} icon={<BanknotesIcon className="h-6 w-6" />} accent="green" />
        <SummaryCard title="TOP_SOURCE" value={topSource} isString icon={<TagIcon className="h-6 w-6" />} accent="indigo" />
        <SummaryCard title="SOURCES" value={String(sourceCount)} isString icon={<ChartPieIcon className="h-6 w-6" />} accent="sky" />
        <SummaryCard title="AVG_ENTRY" value={avgEntry} icon={<TrendingUpIcon className="h-6 w-6" />} accent="amber" />
      </div>

      {/* Income by source + Income trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div className="glass rounded-2xl p-4 md:p-5 min-w-0 flex flex-col">
          <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">Income by source</h3>
          <div className="flex-1 min-h-[16rem]">
            {hasIncome ? <CategoryPieChart data={bySource} /> : <ChartEmpty />}
          </div>
        </div>
        <div className="glass rounded-2xl p-4 md:p-5 min-w-0 flex flex-col">
          <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">Income trend · 6-month window</h3>
          <div className="flex-1 min-h-[16rem]">
            <SpendingBarChart data={trend} />
          </div>
        </div>
      </div>

      {/* Income vs Expenses (6-month) */}
      <div className="glass rounded-2xl p-4 md:p-5 min-w-0">
        <h3 className="font-display text-base md:text-lg font-semibold mb-5 text-app-text">Income vs expenses · 6-month window</h3>
        <div className="h-64 md:h-72">
          {incomeVsExpense.some((d) => d.income > 0 || d.expense > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeVsExpense} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.25)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'rgba(100,116,139,0.3)' }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, displayCurrency, conversionRate, true)} axisLine={false} tickLine={false} width={50} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--modal-surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--app-text)' }}
                  labelStyle={{ color: 'var(--app-text)' }}
                  formatter={(v: number) => formatCurrency(v, displayCurrency, conversionRate)}
                  cursor={{ fill: 'rgba(100,116,139,0.08)' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="income" name="Income" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" name="Expenses" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty />}
        </div>
      </div>

      {/* Top sources ranked list */}
      <div className="glass rounded-2xl p-4 md:p-5 min-w-0">
        <h3 className="font-display text-base md:text-lg font-semibold mb-4 text-app-text">Top sources · this period</h3>
        {hasIncome ? (
          <div className="space-y-2.5">
            {bySource.slice(0, 6).map((s) => (
              <div key={s.name}>
                <div className="flex justify-between items-center mb-1 gap-2">
                  <span className="text-sm font-medium text-app-text truncate flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.fill }} />
                    {s.name}
                  </span>
                  <span className="text-sm font-semibold text-app-text tabular-nums flex-shrink-0">
                    {formatCurrency(s.value, displayCurrency, conversionRate)}
                    <span className="text-app-muted text-xs ml-1.5">{total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 border border-app-border overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${total > 0 ? (s.value / total) * 100 : 0}%`, backgroundColor: s.fill }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="min-h-[8rem]"><ChartEmpty /></div>
        )}
      </div>
    </div>
  );
};

export default IncomeSummary;
