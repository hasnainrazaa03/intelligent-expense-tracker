import React, { useState, useEffect, useMemo } from 'react';
import { Budget } from '../types';
import { CATEGORIES } from '../constants';

interface BudgetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (budgets: Budget[]) => void;
  currentBudgets: Budget[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const BudgetManagerModal: React.FC<BudgetManagerModalProps> = ({ isOpen, onClose, onSave, currentBudgets, displayCurrency, conversionRate }) => {
  const [budgets, setBudgets] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const budgetMap = currentBudgets.reduce((acc, budget) => {
      let displayAmount = budget.amount;
      if (displayCurrency === 'INR' && conversionRate) {
        displayAmount *= conversionRate;
      }
      acc[budget.category] = displayAmount > 0 ? displayAmount.toFixed(2) : '';
      return acc;
    }, {} as { [key: string]: string });
    setBudgets(budgetMap);
  }, [currentBudgets, isOpen, displayCurrency, conversionRate]);

  const totalBudget = useMemo(() => {
    return Object.values(budgets).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0);
  }, [budgets]);
  
  const handleBudgetChange = (category: string, amount: string) => {
    setBudgets(prev => ({...prev, [category]: amount }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedBudgets: Budget[] = Object.entries(budgets)
      .map(([category, amountStr]: [string, string]) => {
        let amountInUSD = parseFloat(amountStr) || 0;
        if (displayCurrency === 'INR' && conversionRate && amountInUSD > 0) {
          amountInUSD /= conversionRate;
        }
        return { category, amount: amountInUSD };
      })
      .filter(b => b.amount > 0);
      
    onSave(formattedBudgets);
  };

  if (!isOpen) return null;

  const currencySymbol = displayCurrency === 'INR' ? '₹' : '$';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-base-100 dark:bg-dark-200 rounded-2xl shadow-xl w-full max-w-2xl m-4" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-base-200 dark:border-dark-300">
            <h2 className="text-2xl font-bold text-base-content dark:text-base-100">Manage Monthly Budgets</h2>
        </div>
        
        <form onSubmit={handleSubmit}>
            <div className="p-6 h-[50vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    {Object.keys(CATEGORIES).map(category => (
                        <div key={category}>
                            <label htmlFor={`budget-${category}`} className="block text-sm font-medium text-base-content-secondary dark:text-base-300">{category}</label>
                            <div className="mt-1 relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <span className="text-gray-500 sm:text-sm">{currencySymbol}</span>
                                </div>
                                <input
                                    id={`budget-${category}`}
                                    type="number"
                                    value={budgets[category] || ''}
                                    onChange={e => handleBudgetChange(category, e.target.value)}
                                    className="block w-full bg-base-200 dark:bg-dark-300 border border-base-300 dark:border-dark-100 rounded-md shadow-sm focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-base-content dark:text-base-200 pl-7 pr-3 py-2.5"
                                    placeholder="0.00"
                                    min="0"
                                    step="1"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="flex justify-between items-center p-4 bg-base-200/50 dark:bg-dark-300/50 rounded-b-2xl space-x-3">
                <div>
                    <span className="text-sm font-medium text-base-content-secondary dark:text-base-300">Total Budget: </span>
                    <span className="font-bold text-lg text-base-content dark:text-base-100">{currencySymbol}{totalBudget.toFixed(2)}</span>
                </div>
                <div className="flex space-x-3">
                  <button type="button" onClick={onClose} className="px-4 py-2 bg-base-200 dark:bg-dark-300 text-base-content dark:text-base-200 rounded-md hover:bg-base-300 dark:hover:bg-dark-100 transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary transition-colors">
                    Save Budgets
                  </button>
                </div>
            </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetManagerModal;
