import React, { useState, useEffect, useMemo } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Budget } from '../types';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

interface BudgetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (budgets: Budget[]) => void;
  currentBudgets: Budget[];
}

const BudgetManagerModal: React.FC<BudgetManagerModalProps> = ({ isOpen, onClose, onSave, currentBudgets }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [budgets, setBudgets] = useState<{ [key: string]: string }>({});
  const [isDirty, setIsDirty] = useState(false);

  // Close, but guard against discarding unsaved edits on an accidental
  // backdrop click. Explicit [X]/CANCEL still close directly.
  const handleRequestClose = () => {
    if (isDirty && !window.confirm('Discard your unsaved budget changes?')) return;
    onClose();
  };

  const budgetTemplates: Record<string, Record<string, number>> = {
    student_essential: {
      Housing: 800,
      Groceries: 350,
      Dining_Out: 180,
      Transportation: 160,
      Tuition: 1200,
      Subscriptions: 40,
    },
    balanced_growth: {
      Housing: 950,
      Groceries: 420,
      Dining_Out: 220,
      Transportation: 180,
      Savings: 400,
      Entertainment: 120,
    },
    cost_control: {
      Housing: 780,
      Groceries: 320,
      Dining_Out: 120,
      Transportation: 130,
      Utilities: 120,
      Subscriptions: 25,
    },
  };

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
    setIsDirty(false);
  }, [currentBudgets, isOpen, displayCurrency, conversionRate]);

  const totalBudget = useMemo(() => {
    return (Object.values(budgets) as string[]).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0);
  }, [budgets]);
  
  const handleBudgetChange = (category: string, amount: string) => {
    setBudgets(prev => ({...prev, [category]: amount }));
    setIsDirty(true);
  };

  const handleApplyTemplate = (templateKey: keyof typeof budgetTemplates) => {
    const template = budgetTemplates[templateKey];
    const mapped = Object.entries(template).reduce((acc, [category, amount]) => {
      const categoryName = category.replace(/_/g, ' ');
      const displayAmount = displayCurrency === 'INR' && conversionRate ? amount * conversionRate : amount;
      acc[categoryName] = displayAmount.toFixed(2);
      return acc;
    }, {} as Record<string, string>);
    setBudgets((prev) => ({ ...prev, ...mapped }));
    setIsDirty(true);
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex justify-center items-center p-4" onClick={handleRequestClose}>
      <div className="glass glass-blur rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 sm:p-6 border-b border-app-border flex justify-between items-center flex-shrink-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-app-text truncate pr-4">Manage budgets</h2>
            <button onClick={handleRequestClose} aria-label="Close budget manager" className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors flex-shrink-0">
              <span className="text-lg leading-none">&times;</span>
            </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
            <div className="flex-grow overflow-y-auto p-5 sm:p-6 space-y-5">
              <div className="rounded-xl border border-app-border bg-surface-2 p-4">
                <h3 className="text-[11px] font-medium tracking-[0.12em] text-app-muted mb-3 block uppercase">Budget templates</h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleApplyTemplate('student_essential')} className="bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all rounded-xl font-semibold px-3 py-1.5 text-xs">Student essential</button>
                  <button type="button" onClick={() => handleApplyTemplate('balanced_growth')} className="bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all rounded-xl font-semibold px-3 py-1.5 text-xs">Balanced growth</button>
                  <button type="button" onClick={() => handleApplyTemplate('cost_control')} className="bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all rounded-xl font-semibold px-3 py-1.5 text-xs">Cost control</button>
                </div>
              </div>

              {Object.keys(groupedCategories).sort().map(parent => (
                <div key={parent} className="rounded-xl border border-app-border bg-surface-2 p-4 md:p-6">
                  {/* CATEGORY HEADER */}
                  <div className="flex justify-between items-end border-b border-app-border pb-4 mb-6">
                    <div>
                      <label className="text-[11px] font-medium tracking-[0.12em] text-app-muted mb-1 block uppercase">Category</label>
                      <h3 className="font-display text-xl md:text-2xl font-bold text-app-text leading-none">{parent}</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-medium tracking-[0.12em] text-app-muted block mb-1 uppercase">Total</span>
                      <span className="font-display text-lg font-bold text-app-text tabular-nums">
                        {currencySymbol}{getCategoryTotal(parent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* SUB-SECTOR GRID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* General/Other Category Input */}
                    <div className="rounded-xl border border-app-border bg-surface p-3">
                      <label className="text-[11px] font-medium tracking-[0.12em] text-app-muted mb-2 block uppercase">General {parent}</label>
                      <div className="flex items-center">
                        <span className="text-sm text-app-faint mr-2">{currencySymbol}</span>
                        <input
                          type="number"
                          value={budgets[parent] || ''}
                          onChange={e => handleBudgetChange(parent, e.target.value)}
                          className="w-full bg-transparent text-sm text-app-text placeholder:text-app-faint focus:outline-none tabular-nums transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Specific Subcategories */}
                    {groupedCategories[parent].map(sub => (
                      <div key={sub} className="rounded-xl border border-app-border bg-surface p-3">
                        <label className="text-[11px] font-medium tracking-[0.12em] text-app-muted mb-2 block uppercase">{sub}</label>
                        <div className="flex items-center">
                          <span className="text-sm text-app-faint mr-2">{currencySymbol}</span>
                          <input
                            type="number"
                            value={budgets[sub] || ''}
                            onChange={e => handleBudgetChange(sub, e.target.value)}
                            className="w-full bg-transparent text-sm text-app-text placeholder:text-app-faint focus:outline-none tabular-nums transition-all"
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

            <div className="p-5 sm:p-6 border-t border-app-border flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
              <div className="rounded-xl border border-app-border bg-surface-2 px-4 py-3 w-full md:w-auto">
                <span className="text-[11px] font-medium tracking-[0.12em] text-app-muted block mb-1 uppercase">Total budget</span>
                <span className="font-display text-xl md:text-2xl font-bold text-primary tabular-nums">{currencySymbol}{totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                <button type="button" onClick={onClose} className="flex-1 md:flex-none px-6 py-3 bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all rounded-xl font-semibold">
                  Cancel
                </button>
                <button type="submit" className="flex-1 md:flex-none px-6 py-3 bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99] transition-all rounded-xl font-semibold">
                  Save changes
                </button>
              </div>
            </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetManagerModal;