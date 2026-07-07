import React, { useState, useEffect, useMemo } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Budget } from '../types';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';
import { Modal, Button, Label } from './ui';
import ConfirmationDialog from './ConfirmationDialog';

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
  const [showDiscard, setShowDiscard] = useState(false);

  // Close, guarding unsaved edits with an in-app dialog (no native window.confirm).
  const handleRequestClose = () => {
    if (isDirty) { setShowDiscard(true); return; }
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
    // Replace the whole allocation with the chosen template — don't merge, or
    // categories from a previously-clicked template linger (bug #2).
    setBudgets(mapped);
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

  const currencySymbol = displayCurrency === 'INR' ? '₹' : '$';

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={handleRequestClose}
      title="Manage budgets"
      size="xl"
      footer={
        <div className="w-full flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="rounded-xl border border-app-border bg-surface-2 px-4 py-3 w-full md:w-auto">
            <span className="text-[11px] font-medium tracking-[0.12em] text-app-muted block mb-1 uppercase">Total budget</span>
            <span className="font-display text-xl md:text-2xl font-bold text-primary tabular-nums">{currencySymbol}{totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <Button variant="secondary" onClick={handleRequestClose} className="flex-1 md:flex-none px-6 py-3">
              Cancel
            </Button>
            <Button type="submit" form="budget-form" className="flex-1 md:flex-none px-6 py-3">
              Save changes
            </Button>
          </div>
        </div>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit} className="space-y-5">
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
                      <Label>General {parent}</Label>
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
                        <Label>{sub}</Label>
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
      </form>
    </Modal>
    <ConfirmationDialog
      isOpen={showDiscard}
      onClose={() => setShowDiscard(false)}
      onConfirm={() => { setShowDiscard(false); onClose(); }}
      title="Discard changes?"
    >
      You have unsaved budget changes. Close without saving?
    </ConfirmationDialog>
    </>
  );
};

export default BudgetManagerModal;