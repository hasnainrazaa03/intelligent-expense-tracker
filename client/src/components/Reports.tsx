import React, { useMemo } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Expense, Budget } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { getMainCategory } from '../utils/colorUtils';
import { computeTotalBudgetedSpend } from '../utils/budgetUtils';
import { startOfMonth, endOfMonth, isWithinRange, todayCalendar } from '../utils/dateUtils';
import { ClipboardDocumentListIcon, ChartPieIcon, BanknotesIcon, ExclamationTriangleIcon } from './Icons';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import BudgetActualChart from './reports/BudgetActualChart';
import CategoryDrilldown from './reports/CategoryDrilldown';
import MonthlyCategoryChart from './reports/MonthlyCategoryChart';
import PaymentMethodChart from './reports/PaymentMethodChart';
import RecurringVsOneTimeChart from './reports/RecurringVsOneTimeChart';
import TimePeriodSummaries from './reports/TimePeriodSummaries';
import YearOverYearChart from './reports/YearOverYearChart';
import SectionSkeleton from './SectionSkeleton';
import ChartEmpty from './ChartEmpty';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { emailSummary } from '../services/api';

interface ReportsProps {
  allExpenses: Expense[];
  budgets: Budget[];
  isLoading?: boolean;
}

const Reports: React.FC<ReportsProps> = ({ allExpenses, budgets, isLoading = false }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [emailing, setEmailing] = useState(false);
  const stats = useMemo(() => {
    const totalSpent = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    const categoryTotals: Record<string, number> = {};
    
    allExpenses.forEach(e => {
      const mainCat = getMainCategory(e.category);
      categoryTotals[mainCat] = (categoryTotals[mainCat] || 0) + e.amount;
    });

    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const budgetUtilization = budgets.length > 0
      ? (() => {
          // Match the Dashboard/BudgetTracker definition (CMP-H4): current-month
          // spend in budgeted categories vs total budget, local calendar month.
          const monthStart = startOfMonth();
          const monthEnd = endOfMonth();
          const currentMonthExpenses = allExpenses.filter((e) => isWithinRange(e.date, monthStart, monthEnd));
          const currentMonthSpent = computeTotalBudgetedSpend(budgets.map((b) => b.category), currentMonthExpenses);
          const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
          return totalBudget > 0 ? (currentMonthSpent / totalBudget) * 100 : 0;
        })()
      : 0;

    return { totalSpent, topCategory, budgetUtilization, categoryTotals };
  }, [allExpenses, budgets]);

  // The figures cover ALL expenses, so label the span from the actual data
  // instead of a hardcoded "Fiscal year 2025 / full year" (L1).
  const coverageLabel = useMemo(() => {
    if (allExpenses.length === 0) return 'No data yet';
    const years = allExpenses.map((e) => e.date.slice(0, 4)).filter(Boolean).sort();
    const minY = years[0];
    const maxY = years[years.length - 1];
    return minY === maxY ? `Year ${minY}` : `${minY}–${maxY}`;
  }, [allExpenses]);


  if (isLoading) {
    return <SectionSkeleton title="Loading reports" rows={5} />;
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('USC Financial Audit Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
    
    // Summary table
    (doc as any).autoTable({
      startY: 38,
      head: [['Metric', 'Value']],
      body: [
        ['Total Expenditure', formatCurrency(stats.totalSpent, displayCurrency, conversionRate)],
        ['Top Category', stats.topCategory ? `${stats.topCategory[0]} (${formatCurrency(stats.topCategory[1], displayCurrency, conversionRate)})` : 'N/A'],
        ['Budget Utilization', `${stats.budgetUtilization.toFixed(1)}%`],
      ],
      theme: 'grid',
    });

    // Category breakdown table
    const catRows = (Object.entries(stats.categoryTotals) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => [name, formatCurrency(amount, displayCurrency, conversionRate), `${((amount / stats.totalSpent) * 100).toFixed(1)}%`]);

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Category', 'Amount', '% of Total']],
      body: catRows,
      theme: 'grid',
    });

    doc.save(`usc_audit_report_${todayCalendar()}.pdf`);
  };

  const handleEmailSummary = async () => {
    setEmailing(true);
    try {
      await emailSummary();
      toast.success('Summary emailed to you.');
    } catch (e: any) {
      toast.error(e?.status === 503 ? 'Email delivery isn’t configured on the server.' : 'Could not send the summary.');
    } finally {
      setEmailing(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-8">
      {/* 1. AUDIT HEADER */}
      <div className="border-b border-app-border pb-6 md:pb-8 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-full bg-surface-2 border border-app-border text-app-muted px-3 py-1 text-[10px] md:text-xs font-semibold whitespace-nowrap">{coverageLabel}</span>
            <span className="text-[10px] md:text-xs text-app-faint truncate max-w-[150px] md:max-w-none">All-time audit report</span>
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-app-text leading-tight tracking-tight break-words">
            Annual audit
          </h2>
        </div>
        <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={handleEmailSummary}
            disabled={emailing}
            className="w-full lg:w-auto bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong active:scale-[0.99] transition-all rounded-xl font-semibold px-5 md:px-6 py-3 md:py-3.5 flex items-center justify-center gap-2.5 text-sm md:text-base disabled:opacity-60"
          >
            <BanknotesIcon className="h-5 w-5" />
            {emailing ? 'Sending…' : 'Email me a summary'}
          </button>
          <button
            onClick={handleDownloadPDF}
            className="w-full lg:w-auto bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99] transition-all rounded-xl font-semibold px-6 md:px-8 py-3 md:py-3.5 flex items-center justify-center gap-3 text-sm md:text-base"
          >
            <ClipboardDocumentListIcon className="h-5 w-5 md:h-6 md:w-6" />
            Download PDF
          </button>
        </div>
      </div>

      {/* 2. HERO STATS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Total Expenditure Log */}
        <div className="lg:col-span-2 glass rounded-2xl p-4 md:p-6 relative overflow-hidden group min-w-0">
          <div className="absolute -right-8 -top-8 opacity-[0.06] group-hover:scale-110 transition-transform hidden sm:block">
            <BanknotesIcon className="h-48 w-48 text-app-text" />
          </div>
          <p className="text-[11px] md:text-xs text-app-muted mb-2">Total expenditure · all time</p>
          <h3 className="font-display font-bold text-3xl md:text-4xl text-app-text mb-4 break-all leading-none tabular-nums">
            {formatCurrency(stats.totalSpent, displayCurrency, conversionRate)}
          </h3>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-surface-2 border border-app-border text-app-muted px-3 py-1 text-[10px] md:text-xs font-semibold">Status: audited</span>
            <span className="rounded-full bg-surface-2 border border-app-border text-app-muted px-3 py-1 text-[10px] md:text-xs font-semibold">Period: all time</span>
          </div>
        </div>

        {/* Budget Variance Sticker */}
        <div className="lg:col-span-1 glass rounded-2xl p-4 md:p-6 flex flex-col justify-center">
          <p className="text-[11px] md:text-xs text-app-muted mb-2">Budget load factor · this month</p>
          <h3 className={`font-display font-bold text-3xl md:text-4xl leading-none tabular-nums ${stats.budgetUtilization > 100 ? 'text-danger' : 'text-app-text'}`}>
            {stats.budgetUtilization.toFixed(1)}%
          </h3>
          <div className={`mt-4 md:mt-6 flex items-center gap-2 font-semibold text-[11px] md:text-xs ${stats.budgetUtilization > 100 ? 'text-danger' : 'text-ok'}`}>
            {stats.budgetUtilization > 100 ? (
              <><ExclamationTriangleIcon className="h-4 w-4 md:h-5 md:w-5" /> Critical overrun</>
            ) : (
              <><ChartPieIcon className="h-4 w-4 md:h-5 md:w-5" /> Within tolerance</>
            )}
          </div>
        </div>
      </div>

      {/* 3. CATEGORY BREAKDOWN + BUDGET VS ACTUAL (side by side, equal height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {/* Category Breakdown Ledger */}
        <div className="glass rounded-2xl overflow-hidden flex flex-col">
          <div className="border-b border-app-border p-4 md:p-5 flex justify-between items-center">
            <h4 className="font-display font-semibold text-app-text text-base md:text-lg">Category breakdown</h4>
            <span className="text-app-faint text-[10px] md:text-xs hidden xs:inline">Verified by system</span>
          </div>
          {Object.keys(stats.categoryTotals).length === 0 ? (
            <div className="flex-1 min-h-[18rem] flex items-center justify-center">
              <ChartEmpty />
            </div>
          ) : (
            <div className="flex-1 p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[18rem] max-h-[26rem] overflow-y-auto custom-scrollbar content-start">
              {(Object.entries(stats.categoryTotals) as [string, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([name, amount]) => (
                  <div key={name} className="flex flex-col rounded-xl border border-app-border bg-surface-2 p-3 group min-w-0 h-fit">
                    <p className="text-[10px] text-app-faint mb-0.5">Category</p>
                    <p className="font-display font-semibold text-sm md:text-base text-app-text truncate">
                      {name}
                    </p>
                    <p className="font-display text-xs md:text-sm text-app-muted tabular-nums">
                      {formatCurrency(amount, displayCurrency, conversionRate)}
                    </p>
                    <div className="h-1.5 rounded-full bg-surface border border-app-border mt-2 relative w-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary absolute left-0"
                        style={{ width: `${(amount / stats.totalSpent) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Budget vs Actual */}
        <div className="glass rounded-2xl p-4 md:p-6 flex flex-col">
          <h4 className="font-display font-semibold text-base md:text-lg text-app-text mb-4 border-b border-app-border pb-3">Budget vs actual</h4>
          <div className="flex-1 min-h-[18rem]">
            <BudgetActualChart expenses={allExpenses} budgets={budgets} />
          </div>
        </div>
      </div>

      {/* 4. THREE SMALL CHARTS (payment · recurring · drilldown) — equal-height
          cards with uniform chart bodies so they line up and render cleanly. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        <div className="glass rounded-2xl p-4 md:p-6 min-w-0 flex flex-col">
          <h4 className="font-display font-semibold text-sm md:text-base text-app-text mb-4 border-b border-app-border pb-2">Payment method distribution</h4>
          <div className="flex-1 min-h-[16rem]">
            <PaymentMethodChart expenses={allExpenses} />
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-6 min-w-0 flex flex-col">
          <h4 className="font-display font-semibold text-sm md:text-base text-app-text mb-4 border-b border-app-border pb-2">Recurring vs one-time</h4>
          <div className="flex-1 min-h-[16rem]">
            <RecurringVsOneTimeChart expenses={allExpenses} />
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-6 min-w-0 flex flex-col">
          <h4 className="font-display font-semibold text-sm md:text-base text-app-text mb-4 border-b border-app-border pb-2">Category drilldown</h4>
          <div className="flex-1 min-h-[16rem]">
            <CategoryDrilldown expenses={allExpenses} />
          </div>
        </div>
      </div>

      {/* 5. MONTHLY FLOW + YEAR OVER YEAR (side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-start">
        <div className="glass rounded-2xl p-4 md:p-6 min-w-0">
          <h4 className="font-display font-semibold text-base md:text-lg text-app-text mb-4 border-b border-app-border pb-3">Monthly category flow</h4>
          <div className="h-72 md:h-96">
            <MonthlyCategoryChart expenses={allExpenses} />
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-6 min-w-0">
          <h4 className="font-display font-semibold text-base md:text-lg text-app-text mb-4 border-b border-app-border pb-3">Year over year comparison</h4>
          <div className="h-72 md:h-96">
            <YearOverYearChart expenses={allExpenses} />
          </div>
        </div>
      </div>

      {/* 6. Time Period Summaries */}
      <div className="glass rounded-2xl p-4 md:p-6">
        <h4 className="font-display font-semibold text-base md:text-lg text-app-text mb-4 border-b border-app-border pb-3">Time period summaries</h4>
        <TimePeriodSummaries allExpenses={allExpenses} />
      </div>

      {/* 4. FINAL CERTIFICATION */}
      <div className="flex flex-col items-center justify-center pt-12">
        <div className="w-32 h-32 border border-app-border rounded-full flex items-center justify-center relative group hover:scale-105 transition-transform">
          <div className="text-center font-display font-semibold text-xs text-app-faint">
            Certified<br/>audit
          </div>
        </div>
        <p className="mt-6 text-[11px] text-app-faint tracking-[0.2em]">
          End of statement
        </p>
      </div>
    </div>
  );
};

export default Reports;