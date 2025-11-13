
import React, { useMemo } from 'react';
import { Expense, Budget } from '../types';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';
import { getCategoryColor } from '../utils/colorUtils';
import { BanknotesIcon, ExclamationTriangleIcon } from './Icons';
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
  
  let progressBarColor: string;
  if (isOverBudget) {
    // Use brighter colors for dark mode for better contrast
    progressBarColor = 'bg-red-500 dark:bg-red-400';
  } else if (percentage > 95) {
    progressBarColor = 'bg-red-500 dark:bg-red-400';
  } else if (percentage > 75) {
    progressBarColor = 'bg-yellow-500 dark:bg-yellow-400';
  } else {
    // Assumes teal-400 is a good lighter version of brand-primary for dark mode
    progressBarColor = 'bg-brand-primary dark:bg-teal-400'; 
  }

  const categoryColor = getCategoryColor(category);

  return (
    <div className="flex items-center space-x-4">
       <div className="w-2.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />
        <div className="flex-grow">
            <div className="flex justify-between items-baseline mb-1">
                <span className="font-semibold text-base-content dark:text-base-100">{category}</span>
                <div className={`flex items-center space-x-1 text-sm font-medium ${isOverBudget ? 'text-red-500 dark:text-red-400' : 'text-base-content-secondary dark:text-base-300'}`}>
                    {isOverBudget && <ExclamationTriangleIcon className="h-4 w-4"/>}
                    <span className={`font-bold ${isOverBudget ? '' : 'text-base-content dark:text-base-200'}`}>{formatCurrency(spent, displayCurrency, conversionRate)}</span>
                    <span>/</span>
                    <span>{formatCurrency(budget, displayCurrency, conversionRate)}</span>
                </div>
            </div>
            <div className="w-full bg-base-200 dark:bg-dark-300 rounded-full h-2.5">
                <div 
                    className={`${progressBarColor} h-2.5 rounded-full transition-all duration-500`} 
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                />
            </div>
        </div>
    </div>
  );
};


const BudgetTracker: React.FC<BudgetTrackerProps> = ({ expenses, budgets, displayCurrency, conversionRate }) => {
  const spendingByMainCategory = useMemo(() => {
    return expenses.reduce((acc, exp) => {
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
      acc[mainCategory] = (acc[mainCategory] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });
  }, [expenses]);

  const { totalBudgeted, totalSpentInBudgetedCategories } = useMemo(() => {
    const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amount, 0);
    const totalSpentInBudgetedCategories = budgets.reduce((sum, budget) => {
        return sum + (spendingByMainCategory[budget.category] || 0);
    }, 0);
    
    return { totalBudgeted, totalSpentInBudgetedCategories };
  }, [budgets, spendingByMainCategory]);
  
  if (budgets.length === 0) {
    return (
        <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg text-center">
             <h2 className="text-2xl font-bold mb-2 text-base-content dark:text-base-100">Budget Status</h2>
             <p className="text-base-content-secondary dark:text-base-300">You haven't set any budgets yet.</p>
             <p className="text-sm text-base-content-secondary dark:text-base-300">Click "Manage Budgets" in the header to get started!</p>
        </div>
    );
  }

  const totalPercentage = totalBudgeted > 0 ? (totalSpentInBudgetedCategories / totalBudgeted) * 100 : 0;
  const isTotalOverBudget = totalPercentage > 100;
  
  let totalProgressBarColor: string;
  if (isTotalOverBudget) {
    totalProgressBarColor = 'bg-red-500 dark:bg-red-400';
  } else if (totalPercentage > 95) {
    totalProgressBarColor = 'bg-red-500 dark:bg-red-400';
  } else if (totalPercentage > 75) {
    totalProgressBarColor = 'bg-yellow-500 dark:bg-yellow-400';
  } else {
    totalProgressBarColor = 'bg-brand-primary dark:bg-teal-400'; 
  }

  return (
    <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
      <div className="flex items-center mb-4">
        <BanknotesIcon className="h-6 w-6 text-brand-primary" />
        <h2 className="text-2xl font-bold ml-2 text-base-content dark:text-base-100">Budget Status</h2>
      </div>
      <div className="space-y-5">
        {budgets.map(budget => (
          <BudgetProgressItem
            key={budget.category}
            category={budget.category}
            spent={spendingByMainCategory[budget.category] || 0}
            budget={budget.amount}
            displayCurrency={displayCurrency}
            conversionRate={conversionRate}
          />
        ))}
      </div>
      
      {budgets.length > 0 && (
        <div className="mt-6 pt-5 border-t border-base-200 dark:border-dark-300">
            <div className="flex items-center space-x-4">
                <div className="w-2.5 h-10 rounded-full flex-shrink-0 bg-gray-400 dark:bg-gray-500" />
                <div className="flex-grow">
                    <div className="flex justify-between items-baseline mb-1">
                        <span className="font-semibold text-base-content dark:text-base-100">Total Budgeted Spending</span>
                        <div className={`flex items-center space-x-1 text-sm font-medium ${isTotalOverBudget ? 'text-red-500 dark:text-red-400' : 'text-base-content-secondary dark:text-base-300'}`}>
                            {isTotalOverBudget && <ExclamationTriangleIcon className="h-4 w-4"/>}
                            <span className={`font-bold ${isTotalOverBudget ? '' : 'text-base-content dark:text-base-200'}`}>{formatCurrency(totalSpentInBudgetedCategories, displayCurrency, conversionRate)}</span>
                            <span>/</span>
                            <span>{formatCurrency(totalBudgeted, displayCurrency, conversionRate)}</span>
                        </div>
                    </div>
                    <div className="w-full bg-base-200 dark:bg-dark-300 rounded-full h-2.5">
                        <div 
                            className={`${totalProgressBarColor} h-2.5 rounded-full transition-all duration-500`} 
                            style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default BudgetTracker;
