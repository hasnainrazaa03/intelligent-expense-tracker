import React, { useState, useEffect, useMemo } from 'react';
import { Budget } from '../types';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

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

  // 1. Group subcategories under their parents
  const groupedCategories = useMemo(() => {
    const groups: Record<string, string[]> = {};
    
    // Initialize with main categories from CATEGORIES object keys
    Object.keys(CATEGORIES).forEach(cat => {
      groups[cat] = [];
    });

    // Map subcategories to their parents based on the constant map
    Object.entries(SUBCATEGORY_TO_CATEGORY_MAP).forEach(([sub, parent]) => {
      if (groups[parent]) {
        groups[parent].push(sub);
      }
    });

    return groups;
  }, []);

  // 2. Helper to calculate total for a category header (Subcategories + General)
  const getCategoryTotal = (parentCategory: string) => {
    const children = groupedCategories[parentCategory] || [];
    const childrenSum = children.reduce((sum, sub) => sum + (parseFloat(budgets[sub]) || 0), 0);
    const parentDirect = parseFloat(budgets[parentCategory]) || 0;
    return childrenSum + parentDirect;
  };

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
        let val = parseFloat(amountStr) || 0;
        
        // Fix: Precision and Currency Drift prevention
        let amountInUSD = displayCurrency === 'INR' && conversionRate 
          ? val / conversionRate 
          : val;
        
        amountInUSD = Math.round((amountInUSD + Number.EPSILON) * 100) / 100;
        
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
            <div className="p-4 md:p-8 h-[60vh] md:h-[50vh] overflow-y-auto bg-white custom-scrollbar space-y-12">
              {Object.keys(groupedCategories).sort().map(parent => (
                <div key={parent} className="border-4 border-ink p-4 md:p-6 bg-bone shadow-neo">
                  {/* CATEGORY HEADER */}
                  <div className="flex justify-between items-end border-b-4 border-ink pb-4 mb-6">
                    <div>
                      <label className="font-loud text-[8px] md:text-[10px] text-ink/40 uppercase tracking-widest block">CATEGORY_HEADER</label>
                      <h3 className="font-loud text-xl md:text-2xl text-usc-cardinal leading-none">{parent.toUpperCase()}</h3>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[8px] md:text-[10px] text-ink/40 uppercase block mb-1">AGGREGATE_VALUATION</span>
                      <span className="font-loud text-lg text-ink">
                        {currencySymbol}{getCategoryTotal(parent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* SUB-SECTOR GRID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    {/* General/Other Category Input */}
                    <div className="bg-white/50 p-3 border-2 border-dashed border-ink/20">
                      <label className="font-loud text-[8px] text-ink/40 uppercase mb-2 block">GENERAL_{parent.toUpperCase()}</label>
                      <div className="flex items-center">
                        <span className="font-loud text-xs opacity-30 mr-2">{currencySymbol}</span>
                        <input
                          type="number"
                          value={budgets[parent] || ''}
                          onChange={e => handleBudgetChange(parent, e.target.value)}
                          className="w-full bg-transparent font-loud text-sm focus:outline-none border-b-2 border-transparent focus:border-ink transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Specific Subcategories */}
                    {groupedCategories[parent].map(sub => (
                      <div key={sub} className="bg-white p-3 border-2 border-ink shadow-neo">
                        <label className="font-loud text-[8px] text-ink/60 uppercase mb-2 block">{sub.replace(/\s+/g, '_')}_SECTOR</label>
                        <div className="flex items-center">
                          <span className="font-loud text-xs opacity-30 mr-2">{currencySymbol}</span>
                          <input
                            type="number"
                            value={budgets[sub] || ''}
                            onChange={e => handleBudgetChange(sub, e.target.value)}
                            className="w-full bg-transparent font-loud text-sm focus:outline-none"
                            placeholder="0.00"
                            step="0.01"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 md:p-8 border-t-4 md:border-t-8 border-ink bg-bone flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 flex-shrink-0">
              <div className="bg-ink p-3 md:p-4 border-4 border-ink shadow-[4px_4px_0px_0px_#FFCC00] w-full md:w-auto">
                <span className="font-loud text-[8px] md:text-[10px] text-bone/60 uppercase block mb-1">GLOBAL_LEDGER_LIMIT:</span>
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