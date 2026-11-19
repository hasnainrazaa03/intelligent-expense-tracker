import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { Budget, Expense, Income, Semester } from '../../types';
import { DateRangeFilter, type DateRange } from '../DateRangeFilter';
import SpendingBarChart from '../SpendingBarChart';
import SectionSkeleton from '../SectionSkeleton';
import ChartEmpty from '../ChartEmpty';
import { Button } from '../ui';
import { RecurringNotice } from '../shell/Banners';
import { ArrowDownIcon, ArrowUpIcon, SparklesIcon } from '../Icons';
import type { RecurringSuggestions } from '../../hooks/useRecurringSuggestions';
import { upToCutoff } from '../../hooks/useDateRangeFilter';
import { useToday } from '../../hooks/useToday';
import { useCategories } from '../../hooks/useCategories';
import { useSetting } from '../../hooks/useSetting';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { computeTotalBudgetedSpend, budgetLabel } from '../../utils/budgetUtils';
import { endOfMonth, isWithinRange, parseCalendarDate, startOfMonth } from '../../utils/dateUtils';
import { getCategoryColor, getMainCategory } from '../../utils/colorUtils';
import { buildBarChartData } from '../../utils/chartData';
import { AI_PROMPTS } from '../../utils/aiPrompts';
import { budgetsAtRisk, monthPlan, percentChange, recentTransactions, upcomingRecurring } from '../../utils/homeSummary';
import { PATHS } from '../../app/routes';

/**
 * Home (U3): how this month is going and what needs attention, in the first
 * screen; everything else is one tap away. Top to bottom: the month against
 * its budget, income / spent / net, budgets at risk, what's coming up, recent
 * entries, spending by category, daily spending, and a box to ask the AI.
 */
interface HomeOverviewProps {
  /** In the selected period, tuition removed when hidden. */
  expenses: Expense[];
  incomes: Income[];
  previousExpenses: Expense[];
  previousIncomes: Income[];
  /** Compare only what's dated up to this day with the previous period. */
  comparisonCutoff?: string | null;
  /** Every entry, tuition removed when hidden. */
  allExpenses: Expense[];
  allIncomes: Income[];
  budgets: Budget[];
  semesters: Semester[];
  hideTuition: boolean;
  selectedRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  recurring: RecurringSuggestions;
  isLoading: boolean;
  onEditExpense: (expense: Expense) => void;
  onEditIncome: (income: Income) => void;
  onAddExpense: () => void;
  onImportStatement: () => void;
}

const RANGE_WORDS: Record<DateRange, string> = {
  this_month: 'this month',
  last_month: 'last month',
  last_90_days: 'in the last 90 days',
  all_time: 'in total',
};

const card = 'glass rounded-2xl p-4 md:p-5 min-w-0';
const cardTitle = 'font-display text-base font-semibold text-app-text';
const linkCls = 'text-xs font-semibold text-primary hover:underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

const Change: React.FC<{ value: number | undefined; upIsGood: boolean }> = ({ value, upIsGood }) => {
  if (value === undefined) return <span className="text-[11px] text-app-faint">No earlier data</span>;
  if (!Number.isFinite(value)) return <span className="text-[11px] text-app-muted">New this period</span>;
  const up = value >= 0;
  const good = up === upIsGood;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${good ? 'text-ok' : 'text-danger'}`}>
      {up ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
      {Math.abs(value).toFixed(0)}%
      <span className="text-app-muted font-normal ml-0.5">vs before</span>
    </span>
  );
};

const HomeOverview: React.FC<HomeOverviewProps> = ({
  expenses, incomes, previousExpenses, previousIncomes, comparisonCutoff, allExpenses, allIncomes,
  budgets, semesters, hideTuition, selectedRange, onDateRangeChange, recurring, isLoading,
  onEditExpense, onEditIncome, onAddExpense, onImportStatement,
}) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const money = (n: number) => formatCurrency(n, displayCurrency, conversionRate);
  const today = useToday();
  const { subToMain } = useCategories();
  const paused = useSetting('pausedRecurring');
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');

  // Budgets are monthly, so the budget side is always the current calendar
  // month, whatever period is picked.
  const monthExpenses = useMemo(() => {
    const now = parseCalendarDate(today);
    return allExpenses.filter((e) => isWithinRange(e.date, startOfMonth(now), endOfMonth(now)));
  }, [allExpenses, today]);
  const totalBudget = useMemo(() => budgets.reduce((s, b) => s + b.amount, 0), [budgets]);
  const plan = useMemo(
    () => monthPlan(totalBudget, computeTotalBudgetedSpend(budgets.map((b) => b.category), monthExpenses), today),
    [budgets, monthExpenses, totalBudget, today],
  );
  const risks = useMemo(() => budgetsAtRisk(budgets, monthExpenses), [budgets, monthExpenses]);

  const totals = useMemo(() => {
    const spent = sum(expenses);
    const income = sum(incomes);
    const spentNow = sum(upToCutoff(expenses, comparisonCutoff));
    const incomeNow = sum(upToCutoff(incomes, comparisonCutoff));
    const spentBefore = sum(previousExpenses);
    const incomeBefore = sum(previousIncomes);
    return {
      spent,
      income,
      net: income - spent,
      netBefore: incomeBefore - spentBefore,
      spentChange: percentChange(spentNow, spentBefore),
      incomeChange: percentChange(incomeNow, incomeBefore),
      spentBefore,
      spentNow,
    };
  }, [expenses, incomes, previousExpenses, previousIncomes, comparisonCutoff]);

  const upcoming = useMemo(() => upcomingRecurring(allExpenses, today, 14, paused ?? {}), [allExpenses, today, paused]);
  const tuitionLeft = useMemo(() => {
    if (hideTuition) return null;
    const unpaid = semesters.flatMap((s) => s.installments.filter((i) => i.status === 'unpaid'));
    return unpaid.length ? { count: unpaid.length, amount: sum(unpaid) } : null;
  }, [semesters, hideTuition]);
  const recent = useMemo(() => recentTransactions(allExpenses, allIncomes, 5), [allExpenses, allIncomes]);

  const categories = useMemo(() => {
    const byMain = new Map<string, number>();
    for (const e of expenses) {
      const main = getMainCategory(e.category, subToMain);
      byMain.set(main, (byMain.get(main) ?? 0) + Number(e.amount));
    }
    return [...byMain.entries()]
      .map(([name, value]) => ({ name, value, fill: getCategoryColor(name, subToMain) }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, subToMain]);

  const isMonth = selectedRange === 'this_month' || selectedRange === 'last_month';
  const barData = useMemo(() => buildBarChartData(expenses, selectedRange, today), [expenses, selectedRange, today]);
  const daysInMonth = useMemo(() => {
    const d = parseCalendarDate(today);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }, [today]);

  if (isLoading) return <SectionSkeleton title="Loading your overview" rows={5} />;

  const isEmpty = allExpenses.length === 0 && allIncomes.length === 0;
  const longRangeMonths = selectedRange === 'last_90_days' ? 3 : selectedRange === 'all_time'
    ? Math.max(1, new Set(allExpenses.map((e) => e.date.slice(0, 7))).size)
    : 1;
  const ask = (text: string) => { if (text.trim()) navigate(PATHS.insights('ask'), { state: { ask: text.trim() } }); };
  const dateLabel = parseCalendarDate(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // --- 1. The main card -------------------------------------------------------
  const mainCard = (() => {
    if (isEmpty) {
      return (
        <>
          <p className="text-sm text-app-muted">Nothing recorded yet</p>
          <p className="font-display text-2xl md:text-3xl font-bold text-app-text mt-1">Start with your first expense</p>
          <p className="text-sm text-app-muted mt-2 max-w-prose">Add one by hand, or import a bank statement to bring in weeks at once. Set budgets to see what's left each month.</p>
          <div className="flex flex-wrap gap-2.5 mt-4">
            <Button onClick={onAddExpense}>Add an expense</Button>
            <Button variant="secondary" onClick={onImportStatement}>Import a statement</Button>
            <Link to={PATHS.budgetsEdit} className="inline-flex items-center text-sm font-semibold px-4 py-2.5 rounded-xl text-app-muted hover:text-app-text">Set budgets</Link>
          </div>
        </>
      );
    }
    if (selectedRange === 'this_month' && totalBudget > 0) {
      const over = plan.over > 0;
      return (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-app-muted">Budget this month</p>
            <Link to={PATHS.budgets} className={linkCls}>See budgets</Link>
          </div>
          <p className="mt-2 tabular-nums">
            <span className={`font-display text-3xl md:text-4xl font-bold ${over ? 'text-danger' : 'text-app-text'}`}>{money(plan.spent)}</span>
            <span className="text-sm text-app-muted ml-2">of {money(plan.budget)}</span>
          </p>
          <div
            className="h-2.5 rounded-full bg-surface-2 border border-app-border overflow-hidden mt-3"
            role="progressbar"
            aria-label="Budget used this month"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(plan.pct))}
          >
            <div className={`h-full rounded-full ${over ? 'bg-danger' : plan.pct > 80 ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${Math.min(100, plan.pct)}%` }} />
          </div>
          <p className="text-sm text-app-text mt-3 tabular-nums">
            {over
              ? <><span className="font-semibold text-danger">{money(plan.over)} over budget</span><span className="text-app-muted"> · {plan.daysLeft} {plan.daysLeft === 1 ? 'day' : 'days'} left</span></>
              : <><span className="font-semibold">{money(plan.left)} left</span><span className="text-app-muted"> · {plan.daysLeft} {plan.daysLeft === 1 ? 'day' : 'days'} left · about </span><span className="font-semibold">{money(plan.perDay)}</span><span className="text-app-muted"> a day</span></>}
          </p>
          <p className="text-[11px] text-app-faint mt-1">Counts spending in categories that have a budget.</p>
        </>
      );
    }
    if (selectedRange === 'this_month') {
      return (
        <>
          <p className="text-sm font-semibold text-app-muted">Spent this month</p>
          <p className="font-display text-3xl md:text-4xl font-bold text-app-text mt-2 tabular-nums">{money(totals.spent)}</p>
          <p className="text-sm text-app-muted mt-2 tabular-nums">
            {totals.spentBefore > 0 ? <>By this day last month you'd spent <span className="font-semibold text-app-text">{money(totals.spentBefore)}</span>.</> : 'Nothing to compare with last month yet.'}
          </p>
          <Link to={PATHS.budgetsEdit} className={`${linkCls} inline-block mt-3`}>Set a budget to see what's left each month</Link>
        </>
      );
    }
    return (
      <>
        <p className="text-sm font-semibold text-app-muted">Spent {RANGE_WORDS[selectedRange]}</p>
        <p className="font-display text-3xl md:text-4xl font-bold text-app-text mt-2 tabular-nums">{money(totals.spent)}</p>
        {longRangeMonths > 1 && (
          <p className="text-sm text-app-muted mt-2 tabular-nums">About <span className="font-semibold text-app-text">{money(totals.spent / longRangeMonths)}</span> a month</p>
        )}
      </>
    );
  })();

  // Phones: a row each (label and change left, amount right), so long amounts
  // never get cut off; wider screens: tiles.
  const stat = (label: string, value: number, change: React.ReactNode, tone = 'text-app-text') => (
    <div className={`${card} !p-3 md:!p-4 flex flex-row sm:flex-col items-center sm:items-start justify-between gap-1 sm:gap-1.5`}>
      <div className="min-w-0 sm:contents">
        <p className="text-xs font-semibold text-app-muted">{label}</p>
        <div className="sm:order-last min-h-[16px]">{change}</div>
      </div>
      <p className={`font-display text-lg md:text-xl font-bold tabular-nums whitespace-nowrap ${tone}`}>{money(value)}</p>
    </div>
  );
  const top = categories[0];
  const largest = expenses.reduce<Expense | null>((m, e) => (!m || Number(e.amount) > Number(m.amount) ? e : m), null);
  const facts = !isEmpty && (
    <dl className="grid grid-cols-3 gap-3 pt-4 mt-auto border-t border-app-border text-sm">
      <div className="min-w-0"><dt className="text-[11px] text-app-muted">Top category</dt><dd className="font-semibold text-app-text truncate">{top ? top.name : '—'}</dd><dd className="text-[11px] text-app-muted tabular-nums">{top ? money(top.value) : ''}</dd></div>
      <div className="min-w-0"><dt className="text-[11px] text-app-muted">Largest expense</dt><dd className="font-semibold text-app-text truncate">{largest ? largest.title : '—'}</dd><dd className="text-[11px] text-app-muted tabular-nums">{largest ? money(largest.amount) : ''}</dd></div>
      <div className="min-w-0"><dt className="text-[11px] text-app-muted">Entries</dt><dd className="font-semibold text-app-text tabular-nums">{expenses.length + incomes.length}</dd><dd className="text-[11px] text-app-muted">{RANGE_WORDS[selectedRange]}</dd></div>
    </dl>
  );
  const netDelta = totals.net - totals.netBefore;

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-medium tracking-[0.18em] uppercase text-app-muted">{dateLabel}</span>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight tracking-tight mt-1">Overview</h2>
        </div>
        <div className="w-full lg:w-auto flex lg:justify-end overflow-x-auto no-scrollbar py-1">
          <DateRangeFilter selectedRange={selectedRange} onChange={onDateRangeChange} />
        </div>
      </div>

      {/* 1-2. The month, then income / spent / net */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <section aria-label="This month" className={`${card} lg:col-span-2 md:!p-6 flex flex-col`}>
          <div>{mainCard}</div>
          {facts && <div className="hidden sm:flex flex-col flex-1 mt-5">{facts}</div>}
        </section>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 sm:gap-3 md:gap-4">
          {stat('Income', totals.income, <Change value={totals.incomeChange} upIsGood />, 'text-ok')}
          {stat('Spent', totals.spent, <Change value={totals.spentChange} upIsGood={false} />)}
          {stat('Net', totals.net,
            totals.netBefore === 0 && totals.net === 0 ? null : (
              <span className={`text-[11px] tabular-nums ${netDelta >= 0 ? 'text-ok' : 'text-danger'}`}>
                {netDelta >= 0 ? '+' : '-'}{money(Math.abs(netDelta))} <span className="text-app-muted">vs before</span>
              </span>
            ),
            totals.net < 0 ? 'text-danger' : 'text-app-text')}
        </div>
      </div>

      {/* 3-5. Budgets at risk · Coming up · Recent */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        <section aria-labelledby="home-risk" className={card}>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 id="home-risk" className={cardTitle}>Budgets at risk</h3>
            <Link to={PATHS.budgets} className={linkCls}>All budgets</Link>
          </div>
          {budgets.length === 0 ? (
            <p className="text-sm text-app-muted">No budgets yet. <Link to={PATHS.budgetsEdit} className={linkCls}>Set budgets</Link></p>
          ) : risks.length === 0 ? (
            <p className="text-sm text-app-muted">Nothing spent against your budgets yet this month.</p>
          ) : (
            <ul className="space-y-3">
              {risks.map((r) => {
                const over = r.spent > r.budget;
                return (
                  <li key={r.category}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-app-text truncate">{budgetLabel(r.category, budgets.map((b) => b.category))}</span>
                      <span className={`tabular-nums font-semibold whitespace-nowrap ${over ? 'text-danger' : r.pct > 80 ? 'text-warn' : 'text-app-text'}`}>
                        {over ? `${money(r.spent - r.budget)} over` : `${money(r.budget - r.spent)} left`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1.5" aria-hidden="true">
                      <div className={`h-full rounded-full ${over ? 'bg-danger' : r.pct > 80 ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                    </div>
                    <p className="text-[11px] text-app-muted mt-1 tabular-nums">{money(r.spent)} of {money(r.budget)} · {r.pct.toFixed(0)}%</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="home-coming" className={card}>
          <h3 id="home-coming" className={`${cardTitle} mb-3`}>Coming up <span className="text-app-muted font-normal text-sm">· next 14 days</span></h3>
          <div className="space-y-2.5">
            {recurring.pending.length > 0 && <RecurringNotice recurring={recurring} inline />}
            {upcoming.length > 0 && (
              <ul className="divide-y divide-app-border">
                {upcoming.slice(0, 5).map((u) => (
                  <li key={`${u.title}-${u.date}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-app-text truncate">{u.title}</span>
                      <span className="block text-[11px] text-app-muted">{parseCalendarDate(u.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </span>
                    <span className="tabular-nums font-semibold text-app-text">{money(u.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {tuitionLeft && (
              <Link to={PATHS.tuition} className="flex items-center justify-between gap-3 rounded-xl border border-app-border bg-surface-2 px-3 py-2.5 text-sm hover:border-app-border-strong">
                <span className="text-app-text">Tuition: {tuitionLeft.count} {tuitionLeft.count === 1 ? 'installment' : 'installments'} unpaid</span>
                <span className="tabular-nums font-semibold text-app-text">{money(tuitionLeft.amount)}</span>
              </Link>
            )}
            {recurring.pending.length === 0 && upcoming.length === 0 && !tuitionLeft && (
              <p className="text-sm text-app-muted">Nothing due in the next 14 days.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="home-recent" className={`${card} md:col-span-2 xl:col-span-1`}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h3 id="home-recent" className={cardTitle}>Recent</h3>
            <Link to={PATHS.transactions} className={linkCls}>See all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-app-muted">No entries yet.</p>
          ) : (
            <ul className="divide-y divide-app-border">
              {recent.map((r) => (
                <li key={`${r.type}-${r.item.id}`}>
                  <button
                    type="button"
                    onClick={() => (r.type === 'expense' ? onEditExpense(r.item) : onEditIncome(r.item))}
                    className="w-full flex items-center justify-between gap-3 py-2 text-left rounded-lg hover:bg-surface-2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-app-text truncate">{r.item.title}</span>
                      <span className="block text-[11px] text-app-muted truncate">{r.item.category} · {parseCalendarDate(r.item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${r.type === 'income' ? 'text-ok' : 'text-app-text'}`}>
                      {r.type === 'income' ? '+' : ''}{money(r.item.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 6-7. Spending by category · daily spending */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-4">
        <section aria-labelledby="home-categories" className={card}>
          <h3 id="home-categories" className={`${cardTitle} mb-3`}>Spending by category</h3>
          {categories.length === 0 ? (
            <div className="h-40"><ChartEmpty message={`No spending ${RANGE_WORDS[selectedRange]}`} /></div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-28 h-28 flex-shrink-0" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Decorative: the list beside it carries the numbers, so no keyboard layer. */}
                  <PieChart accessibilityLayer={false}>
                    <Pie data={categories} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1} stroke="none" isAnimationActive={false} rootTabIndex={-1}>
                      {categories.map((c) => <Cell key={c.name} fill={c.fill} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 min-w-0 space-y-0.5">
                {categories.slice(0, 5).map((c) => (
                  <li key={c.name}>
                    <Link
                      to={`${PATHS.transactions}?category=${encodeURIComponent(c.name)}`}
                      className="flex items-center gap-2 py-1 px-1 -mx-1 rounded-lg text-sm hover:bg-surface-2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.fill }} aria-hidden="true" />
                      <span className="flex-1 min-w-0 truncate text-app-text">{c.name}</span>
                      <span className="tabular-nums font-semibold text-app-text">{money(c.value)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="home-daily" className={`${card} xl:col-span-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
            <h3 id="home-daily" className={cardTitle}>{isMonth ? `Daily spending, ${selectedRange === 'this_month' ? 'this month' : 'last month'}` : 'Monthly spending'}</h3>
            {selectedRange === 'this_month' && totalBudget > 0 && (
              <p className="text-[11px] text-app-muted tabular-nums">Dashed line: daily budget, {money(totalBudget / daysInMonth)}</p>
            )}
          </div>
          <div className="h-56 md:h-64">
            <SpendingBarChart data={barData} allowance={selectedRange === 'this_month' && totalBudget > 0 ? totalBudget / daysInMonth : undefined} />
          </div>
        </section>
      </div>

      {/* 8. Ask AI */}
      <section aria-labelledby="home-ask" className={card}>
        <div className="flex items-center gap-2 mb-3">
          <SparklesIcon className="h-5 w-5 text-primary" />
          <h3 id="home-ask" className={cardTitle}>Ask AI about your money</h3>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); ask(question); }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <label htmlFor="home-ask-input" className="sr-only">Your question</label>
          <input
            id="home-ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="For example: where did most of my money go this month?"
            className="flex-1 min-w-0 bg-surface-2 border border-app-border rounded-xl px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button type="submit" disabled={!question.trim()}>Ask</Button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {AI_PROMPTS.slice(0, 3).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => ask(p)}
              className="text-xs font-medium text-app-text rounded-full border border-app-border bg-surface px-3 py-1.5 hover:border-app-border-strong hover:bg-surface-2 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomeOverview;
