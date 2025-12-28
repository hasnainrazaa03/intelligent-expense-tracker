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
    return (Object.values(budgets) as string[]).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0);
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
    <div className="fixed inset-0 bg-ink/90 backdrop-blur-sm z-[100] flex justify-center items-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-bone border-4 md:border-8 border-ink shadow-neo-gold w-full max-w-2xl max-h-[95vh] flex flex-col transform transition-all" onClick={e => e.stopPropagation()}>
        <div className="p-4 md:p-8 bg-ink border-b-4 md:border-b-8 border-ink flex justify-between items-center flex-shrink-0">
            <h2 className="font-loud text-lg md:text-3xl text-bone leading-none uppercase tracking-tighter truncate pr-4">BUDGET_ALLOCATION_MATRIX</h2>
            <button onClick={onClose} className="text-bone hover:text-usc-gold font-mono text-xl flex-shrink-0"> [X] </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="p-4 md:p-8 h-[60vh] md:h-[50vh] overflow-y-auto bg-white custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8">
                {Object.keys(CATEGORIES).map(category => (
                  <div key={category} className="space-y-1 md:space-y-2">
                    <label htmlFor={`budget-${category}`} className="font-loud text-[9px] md:text-[10px] text-ink/50 uppercase tracking-widest block">{category}_SECTOR</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 md:pl-4 pointer-events-none">
                        <span className="font-loud text-ink/30 text-sm md:text-base">{currencySymbol}</span>
                      </div>
                      <input
                        id={`budget-${category}`}
                        type="number"
                        value={budgets[category] || ''}
                        onChange={e => handleBudgetChange(category, e.target.value)}
                        className="w-full bg-bone border-4 border-ink p-2 md:p-4 pl-8 md:pl-10 font-loud text-base md:text-lg focus:ring-4 md:ring-8 focus:ring-usc-gold focus:outline-none transition-all placeholder:text-ink/10"
                        placeholder="000.00"
                        min="0"
                        step="1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 md:p-8 border-t-4 md:border-t-8 border-ink bg-bone flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 flex-shrink-0">
              <div className="bg-ink p-3 md:p-4 border-4 border-ink shadow-[4px_4px_0px_0px_#FFCC00] w-full md:w-auto">
                <span className="font-loud text-[8px] md:text-[10px] text-bone/60 uppercase block mb-1">AGGREGATE_LIMIT:</span>
                <span className="font-loud text-xl md:text-2xl text-usc-gold">{currencySymbol}{totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              
              <div className="flex space-x-3 md:space-x-4 w-full md:w-auto">
                <button type="button" onClick={onClose} className="flex-1 px-4 md:px-6 py-3 md:py-4 bg-white text-ink border-4 border-ink font-loud text-xs md:text-sm hover:bg-ink hover:text-white transition-all uppercase">
                  CANCEL
                </button>
                <button type="submit" className="flex-1 px-6 md:px-8 py-3 md:py-4 bg-usc-gold text-ink border-4 border-ink font-loud text-base md:text-lg shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all uppercase">
                  SAVE_CHANGES
                </button>
              </div>
            </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetManagerModal;
