import React, { useMemo, useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Expense, Income, InvestmentAccount } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { todayCalendar } from '../utils/dateUtils';

const GOAL_KEY = 'monthlySavingsGoal';
const PAUSED_RECURRING_KEY = 'pausedRecurringTemplates';
const INVESTMENT_ACCOUNTS_KEY = 'investmentAccounts';
const FAMILY_MEMBERS_KEY = 'familyBudgetMembers';

interface FinancialPlanningPanelProps {
  expenses: Expense[];
  incomes: Income[];
}

const todayIso = () => todayCalendar();

const templateKey = (e: Expense): string => `${e.title}|${e.category}|${e.amount}`;

const FinancialPlanningPanel: React.FC<FinancialPlanningPanelProps> = ({ expenses, incomes }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [goalInput, setGoalInput] = useState<string>(() => localStorage.getItem(GOAL_KEY) || '');
  const [pausedRecurring, setPausedRecurring] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(PAUSED_RECURRING_KEY) || '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(INVESTMENT_ACCOUNTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<InvestmentAccount['type']>('brokerage');
  const [newAccountValue, setNewAccountValue] = useState('');

  const [familyMembers, setFamilyMembers] = useState<Array<{ id: string; name: string; contribution: number }>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAMILY_MEMBERS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [memberName, setMemberName] = useState('');
  const [memberContribution, setMemberContribution] = useState('');

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthlyExpense = useMemo(
    () => expenses.filter((e) => e.date.startsWith(currentMonthPrefix)).reduce((s, e) => s + e.amount, 0),
    [expenses, currentMonthPrefix]
  );
  const monthlyIncome = useMemo(
    () => incomes.filter((i) => i.date.startsWith(currentMonthPrefix)).reduce((s, i) => s + i.amount, 0),
    [incomes, currentMonthPrefix]
  );
  const monthlyNet = monthlyIncome - monthlyExpense;
    const totalInvestments = useMemo(
      () => investmentAccounts.reduce((sum, account) => sum + account.value, 0),
      [investmentAccounts]
    );

    const netWorth = useMemo(() => {
      const cashPosition = monthlyIncome - monthlyExpense;
      return cashPosition + totalInvestments;
    }, [monthlyIncome, monthlyExpense, totalInvestments]);

    const familyContributionTotal = useMemo(
      () => familyMembers.reduce((sum, member) => sum + member.contribution, 0),
      [familyMembers]
    );

    const addInvestmentAccount = () => {
      const parsed = Number.parseFloat(newAccountValue);
      if (!newAccountName.trim() || !Number.isFinite(parsed)) return;
      const next: InvestmentAccount[] = [
        ...investmentAccounts,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: newAccountName.trim(),
          type: newAccountType,
          value: parsed,
          asOf: todayIso(),
        },
      ];
      setInvestmentAccounts(next);
      localStorage.setItem(INVESTMENT_ACCOUNTS_KEY, JSON.stringify(next));
      setNewAccountName('');
      setNewAccountValue('');
    };

    const addFamilyMember = () => {
      const parsed = Number.parseFloat(memberContribution);
      if (!memberName.trim() || !Number.isFinite(parsed)) return;
      const next = [
        ...familyMembers,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: memberName.trim(),
          contribution: parsed,
        },
      ];
      setFamilyMembers(next);
      localStorage.setItem(FAMILY_MEMBERS_KEY, JSON.stringify(next));
      setMemberName('');
      setMemberContribution('');
    };

  const savingsGoal = Number.parseFloat(goalInput) || 0;
  const progressPct = savingsGoal > 0 ? Math.max(0, Math.min(100, (monthlyNet / savingsGoal) * 100)) : 0;

  const recurringTemplates = useMemo(() => {
    const map = new Map<string, Expense>();
    expenses
      .filter((e) => e.isRecurring)
      .forEach((e) => {
        const key = templateKey(e);
        const existing = map.get(key);
        if (!existing || existing.date < e.date) {
          map.set(key, e);
        }
      });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [expenses]);

  const togglePauseRecurring = (expense: Expense) => {
    const key = templateKey(expense);
    const next = { ...pausedRecurring, [key]: !pausedRecurring[key] };
    setPausedRecurring(next);
    localStorage.setItem(PAUSED_RECURRING_KEY, JSON.stringify(next));
  };

  const upcomingBills = useMemo(() => {
    const today = new Date(todayIso());
    const horizon = new Date(today);
    horizon.setDate(today.getDate() + 10);

    return recurringTemplates
      .filter((e) => !pausedRecurring[templateKey(e)])
      .map((e) => {
        const day = Number.parseInt(e.date.slice(8, 10), 10) || 1;
        const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(day, 28));
        if (dueDate < today) dueDate.setMonth(dueDate.getMonth() + 1);
        return { ...e, dueDate };
      })
      .filter((e) => e.dueDate <= horizon)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [recurringTemplates, pausedRecurring, now]);

  const proactiveInsights = useMemo(() => {
    const insights: string[] = [];
    if (monthlyNet < 0) {
      insights.push('Monthly net is negative. Consider reducing Dining Out or Subscriptions this week.');
    }

    const categoryTotals = expenses
      .filter((e) => e.date.startsWith(currentMonthPrefix))
      .reduce((acc: Record<string, number>, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {});

    const top = (Object.entries(categoryTotals) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      insights.push(`Top spend category this month is ${top[0]} at ${formatCurrency(top[1], displayCurrency, conversionRate)}.`);
    }

    const pausedCount = Object.values(pausedRecurring).filter(Boolean).length;
    if (pausedCount > 0) {
      insights.push(`${pausedCount} recurring template(s) are paused. Review if this is still intentional.`);
    }

    return insights.slice(0, 3);
  }, [expenses, currentMonthPrefix, monthlyNet, pausedRecurring, displayCurrency, conversionRate]);

  const forecast30d = useMemo(() => {
    const last30Start = new Date();
    last30Start.setDate(last30Start.getDate() - 30);
    const expense30 = expenses
      .filter((e) => new Date(e.date) >= last30Start)
      .reduce((s, e) => s + e.amount, 0);
    const income30 = incomes
      .filter((i) => new Date(i.date) >= last30Start)
      .reduce((s, i) => s + i.amount, 0);
    const dailyNet = (income30 - expense30) / 30;
    return dailyNet * 30;
  }, [expenses, incomes]);

  const calendarCells = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totals: Record<number, number> = {};

    expenses
      .filter((e) => e.date.startsWith(currentMonthPrefix))
      .forEach((e) => {
        const day = Number.parseInt(e.date.slice(8, 10), 10);
        totals[day] = (totals[day] || 0) + e.amount;
      });

    const cells: Array<{ day: number | null; total: number }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, total: 0 });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, total: totals[d] || 0 });
    return cells;
  }, [expenses, currentMonthPrefix, now]);

  const cardCls = "rounded-2xl border border-app-border bg-surface-2 p-4 md:p-5";
  const subLabelCls = "font-display text-sm font-semibold text-app-text mb-3";
  const fieldCls = "bg-surface border border-app-border rounded-lg px-3 py-2 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50";
  const addBtnCls = "mt-2.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary font-semibold text-xs shadow-glow hover:brightness-110 transition-all";
  const rowCls = "text-xs rounded-lg border border-app-border bg-surface px-2.5 py-2 flex justify-between items-center tabular-nums";

  return (
    <section className="glass rounded-2xl p-5 md:p-7 space-y-5">
      <h3 className="font-display text-xl md:text-2xl font-bold text-app-text">Financial planning</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <p className={subLabelCls}>Savings goal</p>
          <div className="flex gap-2">
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className={`flex-1 ${fieldCls}`}
              placeholder="Set monthly goal"
            />
            <button
              onClick={() => localStorage.setItem(GOAL_KEY, goalInput)}
              className="px-4 rounded-lg bg-primary text-on-primary font-semibold text-xs shadow-glow hover:brightness-110 transition-all"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-app-muted mt-2.5 tabular-nums">Monthly net: <span className="text-app-text font-medium">{formatCurrency(monthlyNet, displayCurrency, conversionRate)}</span></p>
          <div className="mt-2 h-2.5 rounded-full border border-app-border bg-surface overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className={cardCls}>
          <p className={subLabelCls}>Trailing 30-day net flow</p>
          <p className={`font-display text-2xl font-bold tabular-nums ${forecast30d < 0 ? 'text-danger' : 'text-ok'}`}>{formatCurrency(forecast30d, displayCurrency, conversionRate)}</p>
          <p className="text-xs text-app-muted mt-2">Net of the last 30 days (income minus expenses) — a simple forward proxy.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <p className={subLabelCls}>Calendar spending</p>
          <div className="grid grid-cols-7 gap-1 text-[10px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center font-semibold text-app-faint uppercase tracking-wide">{d}</div>
            ))}
            {calendarCells.map((cell, idx) => (
              <div key={`${cell.day ?? 'x'}-${idx}`} className="rounded-md border border-app-border min-h-[42px] p-1 bg-surface">
                <div className="font-semibold text-app-muted">{cell.day ?? ''}</div>
                {cell.total > 0 && <div className="text-[9px] text-danger tabular-nums">{formatCurrency(cell.total, displayCurrency, conversionRate, true)}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <p className={subLabelCls}>Recurring management</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recurringTemplates.slice(0, 8).map((e) => {
              const paused = !!pausedRecurring[templateKey(e)];
              return (
                <div key={templateKey(e)} className="flex items-center justify-between rounded-lg border border-app-border p-2.5 bg-surface">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-app-text truncate">{e.title}</p>
                    <p className="text-xs text-app-muted tabular-nums">{formatCurrency(e.amount, displayCurrency, conversionRate)}</p>
                  </div>
                  <button
                    onClick={() => togglePauseRecurring(e)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors flex-shrink-0 ${paused ? 'bg-warn/15 border-warn/30 text-warn' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}
                  >
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              );
            })}
            {recurringTemplates.length === 0 && <p className="text-xs text-app-muted">No recurring templates yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <p className={subLabelCls}>Investments & position</p>
          <p className="text-xs text-app-muted mb-1 tabular-nums">Portfolio value: <span className="text-app-text font-medium">{formatCurrency(totalInvestments, displayCurrency, conversionRate)}</span></p>
          <p className="font-display text-lg font-bold text-app-text tabular-nums">Est. position: {formatCurrency(netWorth, displayCurrency, conversionRate)}</p>
          <p className="text-[11px] text-app-muted mt-1">This month's net cash flow + portfolio value (not full net worth).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className={fieldCls} placeholder="Account" />
            <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value as InvestmentAccount['type'])} className={fieldCls}>
              <option value="cash">Cash</option>
              <option value="brokerage">Brokerage</option>
              <option value="crypto">Crypto</option>
              <option value="retirement">Retirement</option>
              <option value="loan">Loan</option>
              <option value="other">Other</option>
            </select>
            <input type="number" value={newAccountValue} onChange={(e) => setNewAccountValue(e.target.value)} className={fieldCls} placeholder="Value" />
          </div>
          <button onClick={addInvestmentAccount} className={addBtnCls}>Add account</button>
          <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">
            {investmentAccounts.slice(-6).map((account) => (
              <div key={account.id} className={rowCls}>
                <span className="text-app-muted truncate">{account.name} <span className="text-app-faint">({account.type})</span></span>
                <span className="text-app-text font-medium">{formatCurrency(account.value, displayCurrency, conversionRate)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <p className={subLabelCls}>Collaborative budgeting</p>
          <p className="text-xs text-app-muted tabular-nums">Shared contributions: <span className="text-app-text font-medium">{formatCurrency(familyContributionTotal, displayCurrency, conversionRate)}</span></p>
          <p className="text-xs text-app-muted tabular-nums">Shared expense load: <span className="text-app-text font-medium">{formatCurrency(monthlyExpense - familyContributionTotal, displayCurrency, conversionRate)}</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <input value={memberName} onChange={(e) => setMemberName(e.target.value)} className={fieldCls} placeholder="Member name" />
            <input type="number" value={memberContribution} onChange={(e) => setMemberContribution(e.target.value)} className={fieldCls} placeholder="Contribution" />
          </div>
          <button onClick={addFamilyMember} className={addBtnCls}>Add member</button>
          <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">
            {familyMembers.slice(-6).map((member) => (
              <div key={member.id} className={rowCls}>
                <span className="text-app-muted truncate">{member.name}</span>
                <span className="text-app-text font-medium">{formatCurrency(member.contribution, displayCurrency, conversionRate)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <p className={subLabelCls}>Bills & subscriptions</p>
          {upcomingBills.length === 0 ? (
            <p className="text-xs text-app-muted">No recurring bills due in the next 10 days.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingBills.map((bill) => (
                <li key={`${templateKey(bill)}-${bill.dueDate.toISOString()}`} className={rowCls}>
                  <span className="text-app-text font-medium truncate">{bill.title}</span>
                  <span className="text-app-muted">{bill.dueDate.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cardCls}>
          <p className={subLabelCls}>Insights</p>
          <ul className="space-y-2">
            {proactiveInsights.map((insight, idx) => (
              <li key={idx} className="rounded-lg border border-app-border bg-surface px-3 py-2.5 text-xs text-app-muted leading-relaxed">{insight}</li>
            ))}
            {proactiveInsights.length === 0 && <li className="text-xs text-app-muted">No insights yet. Add more transactions.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default FinancialPlanningPanel;
