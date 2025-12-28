import React, { useMemo } from 'react';
import { Expense, Budget } from '../types';
import { SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';
import { BanknotesIcon, ExclamationTriangleIcon, ChartPieIcon } from './Icons'; // Swapped to ChartPieIcon
import { formatCurrency } from '../utils/currencyUtils';

interface BudgetTrackerProps {
  expenses: Expense[];
  budgets: Budget[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const BudgetProgressItem: React.FC<{ category: string; spent: number; budget: number; displayCurrency: 'USD' | 'INR'; conversionRate: number | null; }> = ({ category, spent, budget, displayCurrency, conversionRate }) => {
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const isOverBudget = percentage > 100;
  
  // High-Contrast Light Mode Logic
  let gaugeColor = 'bg-ink'; 
  let textColor = 'text-ink';
  
  if (isOverBudget) {
    gaugeColor = 'bg-usc-cardinal';
    textColor = 'text-usc-cardinal';
  } else if (percentage > 80) {
    gaugeColor = 'bg-usc-gold';
  }

  return (
    <div className="space-y-2 md:space-y-3 group">
      <div className="flex justify-between items-end gap-2">
        <div className="flex flex-col min-w-0">
          <span className="font-loud text-[8px] md:text-[10px] text-ink/40 uppercase tracking-widest leading-none mb-1">Sector_Class</span>
          <span className={`font-loud text-base md:text-lg leading-none uppercase truncate ${textColor}`}>{category}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="flex items-center justify-end space-x-1">
            {isOverBudget && <ExclamationTriangleIcon className="h-3 w-3 md:h-4 md:w-4 text-usc-cardinal animate-pulse" />}
            <span className="font-loud text-sm md:text-lg leading-none text-ink">
                {formatCurrency(spent, displayCurrency, conversionRate, true)}
            </span>
            <span className="font-bold text-[8px] md:text-[10px] text-ink/30 uppercase">/ {formatCurrency(budget, displayCurrency, conversionRate, true)}</span>
          </div>
          <p className={`font-mono text-[8px] md:text-[9px] font-bold ${isOverBudget ? 'text-usc-cardinal' : 'text-ink/40'}`}>
            LOAD: {percentage.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* The Gauge: High contrast bone background with ink/cardinal fill */}
      <div className="h-5 md:h-6 border-[3px] md:border-4 border-ink bg-white relative overflow-hidden shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
        <div 
          className={`${gaugeColor} h-full transition-all duration-700 ease-out border-r-[3px] md:border-r-4 border-ink`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
        {/* Technical Grid Overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[linear-gradient(90deg,transparent_95%,#000_95%)] bg-[length:15px_100%] md:bg-[length:20px_100%]" />
      </div>
    </div>
  );
};

const BudgetTracker: React.FC<BudgetTrackerProps> = ({ expenses, budgets, displayCurrency, conversionRate }) => {
  const { categorySpending, totalSpentInBudgetedCategories, totalBudgeted } = useMemo(() => {
    const spending: { [key: string]: number } = {};
    
    expenses.forEach(exp => {
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
      spending[mainCategory] = (spending[mainCategory] || 0) + exp.amount;
    });

    const budgetedCategories = budgets.map(b => b.category);
    const totalSpent = Object.entries(spending)
      .filter(([cat]) => budgetedCategories.includes(cat))
      .reduce((sum, [, amount]) => sum + amount, 0);

    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);

    return { categorySpending: spending, totalSpentInBudgetedCategories: totalSpent, totalBudgeted: totalBudget };
  }, [expenses, budgets]);

  const isTotalOverBudget = totalSpentInBudgetedCategories > totalBudgeted;
  const totalPercentage = totalBudgeted > 0 ? (totalSpentInBudgetedCategories / totalBudgeted) * 100 : 0;

  if (budgets.length === 0) return null;

  return (
    <div className="space-y-10">
      <div className="bg-ink p-5 md:p-8 border-4 border-ink shadow-neo-gold text-bone relative overflow-hidden">
        <div className="absolute -right-10 -top-10 opacity-10 hidden sm:block">
          <ChartPieIcon className="h-48 w-48 text-bone" />
        </div>
        
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-4 md:mb-6">
                <div>
                    <h3 className="font-loud text-xl md:text-3xl leading-none text-bone">TOTAL_LOAD_CAPACITY</h3>
                    <p className="text-[9px] md:text-[10px] font-mono opacity-50 uppercase mt-1 tracking-tighter text-bone/60">Aggregate_Protocol_Active</p>
                </div>
                <div className={`p-1.5 md:p-2 border-2 border-bone flex-shrink-0 ${isTotalOverBudget ? 'bg-usc-cardinal' : 'bg-green-600'}`}>
                  <BanknotesIcon className="h-4 w-4 md:h-6 md:w-6 text-bone" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-2 gap-2">
                <p className="font-loud text-3xl md:text-5xl text-bone leading-none">
                  {totalPercentage.toFixed(0)}<span className="text-lg md:text-xl opacity-50">%</span>
                </p>
                <div className="text-left sm:text-right font-loud text-[10px] md:text-sm">
                  <span className={isTotalOverBudget ? 'text-usc-cardinal' : 'text-usc-gold'}>
                      {formatCurrency(totalSpentInBudgetedCategories, displayCurrency, conversionRate)}
                  </span>
                  <span className="opacity-30 block sm:inline sm:ml-2 text-bone/50 uppercase">LIMIT: {formatCurrency(totalBudgeted, displayCurrency, conversionRate)}</span>
              </div>
          </div>

            <div className="h-3 md:h-4 bg-bone/10 border-2 border-bone relative">
              <div 
                  className={`h-full transition-all duration-1000 ${isTotalOverBudget ? 'bg-usc-cardinal' : 'bg-usc-gold'}`}
                    style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                />
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
        {budgets.map((budget) => (
          <BudgetProgressItem
            key={budget.category}
            category={budget.category}
            budget={budget.amount}
            spent={categorySpending[budget.category] || 0}
            displayCurrency={displayCurrency}
            conversionRate={conversionRate}
          />
        ))}
      </div>
    </div>
  );
};

export default BudgetTracker;