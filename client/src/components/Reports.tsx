import React, { useMemo } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Expense, Budget } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { pdfSafeCells } from '../utils/exportUtils';
import { getMainCategory } from '../utils/colorUtils';
import { computeTotalBudgetedSpend } from '../utils/budgetUtils';
import { todayCalendar } from '../utils/dateUtils';
import { describePeriod } from '../utils/reportPeriod';
import useDateRangeFilter from '../hooks/useDateRangeFilter';
import type { DateRange } from './DateRangeFilter';
import { ClipboardDocumentListIcon, ChartPieIcon, BanknotesIcon, ExclamationTriangleIcon } from './Icons';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable'; // 4+: function API, no prototype patch
import BudgetActualChart from './reports/BudgetActualChart';
import CategoryDrilldown from './reports/CategoryDrilldown';
import MonthlyCategoryChart from './reports/MonthlyCategoryChart';
import PaymentMethodChart from './reports/PaymentMethodChart';
import AccountChart from './reports/AccountChart';
import RecurringVsOneTimeChart from './reports/RecurringVsOneTimeChart';
import TimePeriodSummaries from './reports/TimePeriodSummaries';
import YearOverYearChart from './reports/YearOverYearChart';
import SectionSkeleton from './SectionSkeleton';
import ChartEmpty from './ChartEmpty';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { emailSummary } from '../services/api';
import { useCategories } from '../hooks/useCategories';
import { useToday } from '../hooks/useToday';
import { buildBudgetPerformance } from '../utils/chartData';
import { ChartCard } from './reports/ChartTable';
import BudgetPerformanceChart from './BudgetPerformanceChart';

interface ReportsProps {
  allExpenses: Expense[];
  budgets: Budget[];
  isLoading?: boolean;
  /** The period, shared by every Insights section and switched in their bar (U5). */
  range: DateRange;
}

const NO_INCOMES: never[] = [];

const Reports: React.FC<ReportsProps> = ({ allExpenses, budgets, isLoading = false, range }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { subToMain } = useCategories();
  const [emailing, setEmailing] = useState(false);

  // The period the figures cover. Reports used to be all-time only (improvement 17).
  const { filteredExpenses: expenses } = useDateRangeFilter(allExpenses, NO_INCOMES, range);
  const period = useMemo(() => describePeriod(range, allExpenses.map((e) => e.date)), [range, allExpenses]);

  const stats = useMemo(() => {
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const categoryTotals: Record<string, number> = {};
    expenses.forEach((e) => {
      const mainCat = getMainCategory(e.category, subToMain);
      categoryTotals[mainCat] = (categoryTotals[mainCat] || 0) + e.amount;
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

    // Budgets are monthly: compare them with the period's average month.
    // Spend counts in budgeted categories only, as on the dashboard (CMP-H4).
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const budgetedSpend = computeTotalBudgetedSpend(budgets.map((b) => b.category), expenses);
    const budgetUtilization = totalBudget > 0 ? (budgetedSpend / period.months / totalBudget) * 100 : 0;

    return { totalSpent, topCategory, budgetUtilization, categoryTotals };
  }, [expenses, budgets, period.months, subToMain]);
  const periodText = `${period.label} · ${period.span}`;
  const today = useToday();
  const performance = useMemo(() => buildBudgetPerformance(allExpenses, budgets, today), [allExpenses, budgets, today]);


  if (isLoading) {
    return <SectionSkeleton title="Loading reports" rows={5} />;
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Spending report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Period: ${periodText}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 36);

    // Summary table
    autoTable(doc, {
      startY: 42,
      head: [['Metric', 'Value']],
      body: [
        ['Total spent', formatCurrency(stats.totalSpent, displayCurrency, conversionRate)],
        ['Top category', stats.topCategory ? `${stats.topCategory[0]} (${formatCurrency(stats.topCategory[1], displayCurrency, conversionRate)})` : 'N/A'],
        [period.months > 1 ? 'Budget used (average month)' : 'Budget used', budgets.length ? `${stats.budgetUtilization.toFixed(1)}%` : 'No budgets set'],
      ],
      theme: 'grid',
      ...pdfSafeCells,
    });

    // Category breakdown table
    const catRows = (Object.entries(stats.categoryTotals) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => [name, formatCurrency(amount, displayCurrency, conversionRate), `${((amount / stats.totalSpent) * 100).toFixed(1)}%`]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Category', 'Amount', '% of Total']],
      body: catRows,
      theme: 'grid',
      ...pdfSafeCells,
    });

    doc.save(`spending_report_${todayCalendar()}.pdf`);
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
        <div className="min-w-0 space-y-3">
          <span className="inline-block rounded-full bg-surface-2 border border-app-border text-app-muted px-3 py-1 text-[10px] md:text-xs font-semibold">{periodText}</span>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-app-text leading-tight tracking-tight break-words">
            Spending report
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
          <p className="text-[11px] md:text-xs text-app-muted mb-2">Total spent · {period.label.toLowerCase()}</p>
          <h3 className="font-display font-bold text-3xl md:text-4xl text-app-text mb-4 break-all leading-none tabular-nums">
            {formatCurrency(stats.totalSpent, displayCurrency, conversionRate)}
          </h3>
          <p className="text-[11px] md:text-xs text-app-muted">
            {expenses.length} expense{expenses.length === 1 ? '' : 's'} · {period.span}
          </p>
        </div>

        {/* Budget used */}
        <div className="lg:col-span-1 glass rounded-2xl p-4 md:p-6 flex flex-col justify-center">
          <p className="text-[11px] md:text-xs text-app-muted mb-2">Budget used{period.months > 1 ? ' · average month' : ` · ${period.label.toLowerCase()}`}</p>
          {budgets.length === 0 ? (
            <p className="text-sm text-app-muted">No budgets set yet.</p>
          ) : (
            <>
              <h3 className={`font-display font-bold text-3xl md:text-4xl leading-none tabular-nums ${stats.budgetUtilization > 100 ? 'text-danger' : 'text-app-text'}`}>
                {stats.budgetUtilization.toFixed(1)}%
              </h3>
              <div className={`mt-4 md:mt-6 flex items-center gap-2 font-semibold text-[11px] md:text-xs ${stats.budgetUtilization > 100 ? 'text-danger' : 'text-ok'}`}>
                {stats.budgetUtilization > 100 ? (
                  <><ExclamationTriangleIcon className="h-4 w-4 md:h-5 md:w-5" /> Over budget</>
                ) : (
                  <><ChartPieIcon className="h-4 w-4 md:h-5 md:w-5" /> Within budget</>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Grouped under short headings (U5); every chart has "Show as table". */}
      <h3 className="font-display text-lg md:text-xl font-bold text-app-text pt-2">Overview</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <ChartCard title={<>Budget vs actual{period.months > 1 ? ' · average month' : ''}</>} bodyClassName="flex-1 min-h-[18rem]">
          {(asTable) => <BudgetActualChart expenses={expenses} budgets={budgets} periodMonths={period.months} asTable={asTable} />}
        </ChartCard>
        <ChartCard title={<>Last 6 months <span className="text-app-faint text-xs font-normal">· spent against budget</span></>} bodyClassName="h-72">
          {(asTable) => <BudgetPerformanceChart data={performance} asTable={asTable} />}
        </ChartCard>
      </div>

      <h3 className="font-display text-lg md:text-xl font-bold text-app-text pt-2">Categories</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {/* Category Breakdown Ledger */}
        <div className="glass rounded-2xl overflow-hidden flex flex-col">
          <div className="border-b border-app-border p-4 md:p-5 flex justify-between items-center">
            <h4 className="font-display font-semibold text-app-text text-base md:text-lg">Category breakdown</h4>
          </div>
          {Object.keys(stats.categoryTotals).length === 0 ? (
            <div className="flex-1 min-h-[18rem] flex items-center justify-center">
              <ChartEmpty />
            </div>
          ) : (
            // Scrolls on its own, so it must be focusable for keyboard scrolling (4b).
            <div tabIndex={0} role="region" aria-label="Category breakdown" className="flex-1 p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[18rem] max-h-[26rem] overflow-y-auto custom-scrollbar content-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-b-2xl">
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
        <ChartCard title="Category drill-down" bodyClassName="flex-1 min-h-[18rem]">
          {(asTable) => <CategoryDrilldown expenses={expenses} asTable={asTable} />}
        </ChartCard>
      </div>
      <ChartCard title={<>Monthly category flow <span className="text-app-faint text-xs font-normal">· all history</span></>} bodyClassName="h-72 md:h-96">
        {(asTable) => <MonthlyCategoryChart expenses={allExpenses} asTable={asTable} />}
      </ChartCard>

      <h3 className="font-display text-lg md:text-xl font-bold text-app-text pt-2">Payment methods and accounts</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <ChartCard title="Payment method distribution" bodyClassName="flex-1 min-h-[16rem]">
          {(asTable) => <PaymentMethodChart expenses={expenses} asTable={asTable} />}
        </ChartCard>
        <ChartCard title="Spend by account or card" bodyClassName="flex-1 min-h-[16rem]">
          {(asTable) => <AccountChart expenses={expenses} asTable={asTable} />}
        </ChartCard>
      </div>

      <h3 className="font-display text-lg md:text-xl font-bold text-app-text pt-2">Recurring vs one-time</h3>
      <ChartCard title="Recurring charges and one-off spending" bodyClassName="min-h-[16rem]">
        {(asTable) => <RecurringVsOneTimeChart expenses={expenses} asTable={asTable} />}
      </ChartCard>

      <h3 className="font-display text-lg md:text-xl font-bold text-app-text pt-2">Period summaries</h3>
      <div className="glass rounded-2xl p-4 md:p-6">
        <h4 className="font-display font-semibold text-base md:text-lg text-app-text mb-4 border-b border-app-border pb-3">Time period summaries <span className="text-app-faint text-xs font-normal">· all history</span></h4>
        <TimePeriodSummaries allExpenses={allExpenses} />
      </div>

      <h3 className="font-display text-lg md:text-xl font-bold text-app-text pt-2">Year over year</h3>
      <ChartCard title={<>Year over year comparison <span className="text-app-faint text-xs font-normal">· all history</span></>} bodyClassName="h-72 md:h-96">
        {(asTable) => <YearOverYearChart expenses={allExpenses} asTable={asTable} />}
      </ChartCard>

    </div>
  );
};

export default Reports;