import React, { useMemo, useState } from 'react';
import { Expense, Budget } from '../types';
import { ExclamationTriangleIcon, ChartPieIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';
import { computeBudgetSpend, computeTotalBudgetedSpend } from '../utils/budgetUtils';
import { monthKey } from '../utils/dateUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import ChartEmpty from './ChartEmpty';

interface BudgetTrackerProps {
  /** ALL of the user's expenses — the tracker filters to the selected month itself. */
  expenses: Expense[];
  budgets: Budget[];
}

const BudgetProgressItem: React.FC<{ category: string; spent: number; budget: number; }> = ({ category, spent, budget }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const isOverBudget = percentage > 100;

  let gaugeColor = 'bg-primary';
  let textColor = 'text-app-text';

  if (isOverBudget) {
    gaugeColor = 'bg-danger';
    textColor = 'text-danger';
  } else if (percentage > 80) {
    gaugeColor = 'bg-warn';
  }

  return (
    <div className="space-y-2 group">
      <div className="flex justify-between items-end gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-app-faint uppercase tracking-[0.16em] leading-none mb-1.5">Category</span>
          <span className={`font-display text-sm md:text-base font-semibold leading-none truncate ${textColor}`}>{category}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="flex items-center justify-end gap-1">
            {isOverBudget && <ExclamationTriangleIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-danger" />}
            <span className="font-display text-sm md:text-base font-semibold leading-none text-app-text tabular-nums">
                {formatCurrency(spent, displayCurrency, conversionRate, true)}
            </span>
            <span className="text-[10px] md:text-xs text-app-faint tabular-nums">/ {formatCurrency(budget, displayCurrency, conversionRate, true)}</span>
          </div>
          <p className={`text-[10px] md:text-[11px] font-medium mt-1 ${isOverBudget ? 'text-danger' : 'text-app-muted'}`}>
            {percentage.toFixed(1)}% used
          </p>
        </div>
      </div>

      {/* The gauge */}
      <div className="h-2.5 rounded-full bg-surface-2 border border-app-border relative overflow-hidden">
        <div
          className={`${gaugeColor} h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};

const BudgetTracker: React.FC<BudgetTrackerProps> = ({ expenses, budgets }) => {
  const { displayCurrency, conversionRate } = useCurrency();

  // Budget amounts are a single ongoing plan; only the *usage* is per-month, so
  // this selector scopes which month's spending is measured against the plan.
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const selectedKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const currentKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const isCurrentMonth = selectedKey === currentKey;
  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  // Month options run from the earliest recorded expense up to the current month.
  const monthOptions = useMemo(() => {
    let earliest = new Date();
    earliest = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    for (const e of expenses) {
      const [y, m] = e.date.split('-').map(Number);
      if (y && m) { const d = new Date(y, m - 1, 1); if (d < earliest) earliest = d; }
    }
    const opts: Array<{ key: string; label: string }> = [];
    const now = new Date();
    for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= earliest; d.setMonth(d.getMonth() - 1)) {
      opts.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }, [expenses]);

  const monthLabel = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const { categorySpending, totalSpentInBudgetedCategories, totalBudgeted } = useMemo(() => {
    // Only the selected month's expenses count toward "used".
    const monthExpenses = expenses.filter((e) => monthKey(e.date) === selectedKey);
    // Per-budget spend uses the shared matcher so a subcategory budget (e.g.
    // "Groceries") is populated correctly and a main-category budget aggregates
    // its subcategories (CMP-H4). The total counts each expense once.
    const spending: { [key: string]: number } = {};
    budgets.forEach((b) => {
      spending[b.category] = computeBudgetSpend(b.category, monthExpenses);
    });

    const totalSpent = computeTotalBudgetedSpend(budgets.map((b) => b.category), monthExpenses);
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);

    return { categorySpending: spending, totalSpentInBudgetedCategories: totalSpent, totalBudgeted: totalBudget };
  }, [expenses, budgets, selectedKey]);

  const isTotalOverBudget = totalSpentInBudgetedCategories > totalBudgeted;
  const totalPercentage = totalBudgeted > 0 ? (totalSpentInBudgetedCategories / totalBudgeted) * 100 : 0;

  if (budgets.length === 0) return <ChartEmpty message="No budgets set yet" />;

  return (
    <div className="space-y-7">
      <div className="rounded-2xl p-5 md:p-6 bg-surface-2 border border-app-border relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-[0.06] hidden sm:block pointer-events-none">
          <ChartPieIcon className="h-44 w-44 text-app-text" />
        </div>

        <div className="relative z-10">
            <div className="flex justify-between items-start gap-3 mb-4 md:mb-5">
                <div className="min-w-0">
                    <h3 className="font-display text-lg md:text-xl font-bold leading-none text-app-text">Total load capacity</h3>
                    <p className="text-[11px] text-app-muted mt-1.5">Usage in {monthLabel}{isCurrentMonth ? ' · this month' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous budget month"
                    className="grid place-items-center w-7 h-7 rounded-lg border border-app-border bg-surface text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <select
                    value={selectedKey}
                    onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setMonth(new Date(y, m - 1, 1)); }}
                    aria-label="Jump to budget month"
                    className="bg-surface border border-app-border rounded-lg px-2 py-1 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {monthOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <button
                    onClick={() => shiftMonth(1)}
                    disabled={isCurrentMonth}
                    aria-label="Next budget month"
                    className="grid place-items-center w-7 h-7 rounded-lg border border-app-border bg-surface text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors disabled:opacity-40 disabled:hover:text-app-muted"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-3 gap-2">
                <p className="font-display text-2xl md:text-3xl font-bold text-app-text leading-none tabular-nums">
                  {totalPercentage.toFixed(0)}<span className="text-lg md:text-xl text-app-muted">%</span>
                </p>
                <div className="text-left sm:text-right text-xs md:text-sm tabular-nums">
                  <span className={`font-semibold ${isTotalOverBudget ? 'text-danger' : 'text-app-text'}`}>
                      {formatCurrency(totalSpentInBudgetedCategories, displayCurrency, conversionRate)}
                  </span>
                  <span className="text-app-muted block sm:inline sm:ml-2">of {formatCurrency(totalBudgeted, displayCurrency, conversionRate)}</span>
              </div>
          </div>

            <div className="h-3 rounded-full bg-surface border border-app-border relative overflow-hidden">
              <div
                  className={`h-full rounded-full transition-all duration-1000 ${isTotalOverBudget ? 'bg-danger' : 'bg-primary'}`}
                    style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-8 gap-y-5">
        {budgets.map((budget) => (
          <BudgetProgressItem
            key={budget.category}
            category={budget.category}
            budget={budget.amount}
            spent={categorySpending[budget.category] || 0}
          />
        ))}
      </div>
    </div>
  );
};

export default BudgetTracker;