import React, { useMemo } from 'react';
import { Expense, Budget } from '../types';
import { BanknotesIcon, ExclamationTriangleIcon, ChartPieIcon } from './Icons'; // Swapped to ChartPieIcon
import { formatCurrency } from '../utils/currencyUtils';
import { computeBudgetSpend, computeTotalBudgetedSpend } from '../utils/budgetUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import ChartEmpty from './ChartEmpty';

interface BudgetTrackerProps {
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
  const { categorySpending, totalSpentInBudgetedCategories, totalBudgeted } = useMemo(() => {
    // Per-budget spend uses the shared matcher so a subcategory budget (e.g.
    // "Groceries") is populated correctly and a main-category budget aggregates
    // its subcategories (CMP-H4). The total counts each expense once.
    const spending: { [key: string]: number } = {};
    budgets.forEach((b) => {
      spending[b.category] = computeBudgetSpend(b.category, expenses);
    });

    const totalSpent = computeTotalBudgetedSpend(budgets.map((b) => b.category), expenses);
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);

    return { categorySpending: spending, totalSpentInBudgetedCategories: totalSpent, totalBudgeted: totalBudget };
  }, [expenses, budgets]);

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
            <div className="flex justify-between items-start mb-4 md:mb-5">
                <div>
                    <h3 className="font-display text-lg md:text-xl font-bold leading-none text-app-text">Total load capacity</h3>
                    <p className="text-[11px] text-app-muted mt-1.5">Aggregate across all budgets</p>
                </div>
                <div className={`grid place-items-center w-9 h-9 rounded-xl flex-shrink-0 ${isTotalOverBudget ? 'bg-danger/15 text-danger' : 'bg-ok/15 text-ok'}`}>
                  <BanknotesIcon className="h-5 w-5" />
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