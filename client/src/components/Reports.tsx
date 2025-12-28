import React, { useMemo } from 'react';
import { Expense, Budget } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';
import { ClipboardDocumentListIcon, ChartPieIcon, BanknotesIcon, ExclamationTriangleIcon } from './Icons';

interface ReportsProps {
  allExpenses: Expense[];
  budgets: Budget[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const Reports: React.FC<ReportsProps> = ({ allExpenses, budgets, displayCurrency, conversionRate }) => {
  const stats = useMemo(() => {
    const totalSpent = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    const categoryTotals: Record<string, number> = {};
    
    allExpenses.forEach(e => {
      const mainCat = SUBCATEGORY_TO_CATEGORY_MAP[e.category] || 'Miscellaneous';
      categoryTotals[mainCat] = (categoryTotals[mainCat] || 0) + e.amount;
    });

    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const budgetUtilization = budgets.length > 0 
      ? (totalSpent / budgets.reduce((sum, b) => sum + b.amount, 0)) * 100 
      : 0;

    return { totalSpent, topCategory, budgetUtilization, categoryTotals };
  }, [allExpenses, budgets]);

  const currencyProps = { displayCurrency, conversionRate };

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20">
      {/* 1. AUDIT HEADER */}
      <div className="border-b-4 md:border-b-8 border-ink pb-6 md:pb-8 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div className="min-w-0">
          <div className="flex items-center space-x-2 mb-3">
            <span className="bg-usc-cardinal text-bone px-2 py-1 font-loud text-[8px] md:text-[10px] border-2 border-ink whitespace-nowrap">FISCAL_YEAR_2025</span>
            <span className="font-mono text-[8px] md:text-[10px] opacity-40 uppercase tracking-tighter text-ink truncate max-w-[150px] md:max-w-none">Report_Reference: {Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
          </div>
          <h2 className="font-loud text-4xl sm:text-6xl md:text-8xl text-ink leading-[0.85] tracking-tighter uppercase break-words">
            Annual_Audit
          </h2>
        </div>
        <button className="w-full lg:w-auto bg-ink text-usc-gold font-loud px-6 md:px-8 py-3 md:py-4 border-4 border-ink shadow-neo active:translate-y-1 transition-all flex items-center justify-center gap-3 text-xs md:text-base">
          <ClipboardDocumentListIcon className="h-5 w-5 md:h-6 md:w-6" />
          GET_HARD_COPY_(PDF)
        </button>
      </div>

      {/* 2. BENTO ANALYTICS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        
        {/* Total Expenditure Log */}
        <div className="lg:col-span-2 bg-bone border-4 border-ink p-5 md:p-8 shadow-neo relative overflow-hidden group min-w-0">
          <div className="absolute -right-8 -top-8 opacity-5 group-hover:scale-110 transition-transform hidden sm:block">
            <BanknotesIcon className="h-48 w-48 text-ink" />
          </div>
          <p className="font-loud text-[10px] md:text-xs opacity-40 mb-2 uppercase text-ink">TOTAL_EXPENDITURE_LOG</p>
          <h3 className="font-loud text-3xl sm:text-5xl md:text-8xl text-usc-cardinal mb-6 break-all leading-none">
            {formatCurrency(stats.totalSpent, displayCurrency, conversionRate)}
          </h3>
          <div className="flex flex-wrap gap-3">
            <span className="bg-ink text-bone px-2 py-1 font-bold text-[8px] md:text-[10px] border-2 border-ink">STATUS: AUDITED</span>
            <span className="bg-usc-gold text-ink px-2 py-1 font-bold text-[8px] md:text-[10px] border-2 border-ink uppercase">Period: FULL_YEAR</span>
          </div>
        </div>

        {/* Budget Variance Sticker */}
        <div className={`lg:col-span-1 border-4 border-ink p-5 md:p-8 shadow-neo flex flex-col justify-center ${stats.budgetUtilization > 100 ? 'bg-usc-cardinal text-bone' : 'bg-usc-gold text-ink'}`}>
          <p className="font-loud text-[10px] md:text-xs uppercase opacity-70 mb-2">BUDGET_LOAD_FACTOR</p>
          <h3 className="font-loud text-5xl md:text-6xl leading-none">
            {stats.budgetUtilization.toFixed(1)}%
          </h3>
          <div className="mt-4 md:mt-6 flex items-center gap-2 font-bold text-[10px] md:text-xs uppercase">
            {stats.budgetUtilization > 100 ? (
              <><ExclamationTriangleIcon className="h-4 w-4 md:h-5 md:w-5" /> CRITICAL_OVERRUN</>
            ) : (
              <><ChartPieIcon className="h-4 w-4 md:h-5 md:w-5" /> WITHIN_TOLERANCE</>
            )}
          </div>
        </div>

        {/* Category Breakdown Ledger */}
        <div className="lg:col-span-3 bg-white border-4 border-ink shadow-neo overflow-hidden">
          <div className="bg-ink p-3 md:p-4 flex justify-between items-center">
            <h4 className="font-loud text-bone text-base md:text-xl uppercase tracking-widest">Sector_Breakdown</h4>
            <span className="text-bone/40 font-mono text-[8px] md:text-[10px] hidden xs:inline">VERIFIED_BY_SYSTEM_CORE</span>
          </div>
          <div className="p-5 md:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
            {(Object.entries(stats.categoryTotals) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([name, amount]) => (
                <div key={name} className="flex flex-col border-l-4 border-ink pl-4 md:pl-6 py-1 md:py-2 group min-w-0">
                  <p className="font-loud text-[8px] md:text-[10px] opacity-40 uppercase mb-1 text-ink">Sector_Class</p>
                  <p className="font-loud text-lg md:text-2xl text-ink group-hover:text-usc-cardinal transition-colors truncate uppercase">
                    {name.toUpperCase()}
                  </p>
                  <p className="font-loud text-base md:text-xl text-ink opacity-60">
                    {formatCurrency(amount, displayCurrency, conversionRate)}
                  </p>
                  <div className="h-1 bg-ink/10 mt-3 md:mt-4 relative w-full">
                    <div 
                      className="h-full bg-usc-gold absolute left-0"
                      style={{ width: `${(amount / stats.totalSpent) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* 3. FINAL CERTIFICATION */}
      <div className="flex flex-col items-center justify-center pt-12">
        <div className="w-32 h-32 border-8 border-ink/10 rounded-full flex items-center justify-center relative rotate-12 group hover:rotate-0 transition-transform">
          <div className="text-center font-loud text-xs text-ink/10">
            TROJAN<br/>CERTIFIED<br/>AUDIT
          </div>
        </div>
        <p className="mt-6 font-mono text-[9px] opacity-30 text-ink uppercase tracking-[0.3em]">
          End_of_Statement // Fight_On
        </p>
      </div>
    </div>
  );
};

export default Reports;