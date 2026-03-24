import React, { useMemo, useState } from 'react';
import { Expense, Income, InvestmentAccount } from '../types';
import { formatCurrency } from '../utils/currencyUtils';

const GOAL_KEY = 'monthlySavingsGoal';
const PAUSED_RECURRING_KEY = 'pausedRecurringTemplates';
const INVESTMENT_ACCOUNTS_KEY = 'investmentAccounts';
const FAMILY_MEMBERS_KEY = 'familyBudgetMembers';

interface FinancialPlanningPanelProps {
  expenses: Expense[];
  incomes: Income[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const templateKey = (e: Expense): string => `${e.title}|${e.category}|${e.amount}`;

const FinancialPlanningPanel: React.FC<FinancialPlanningPanelProps> = ({ expenses, incomes, displayCurrency, conversionRate }) => {
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

  return (
    <section className="bg-white border-4 border-ink p-4 md:p-6 shadow-neo space-y-6">
      <h3 className="font-loud text-lg md:text-2xl uppercase">FINANCIAL_PLANNING_CENTER</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">SAVINGS_GOAL_TRACKER</p>
          <div className="flex gap-2">
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="flex-1 border-2 border-ink p-2 font-mono text-sm"
              placeholder="Set monthly goal"
            />
            <button
              onClick={() => localStorage.setItem(GOAL_KEY, goalInput)}
              className="px-3 border-2 border-ink bg-usc-gold font-loud text-[10px]"
            >
              SAVE
            </button>
          </div>
          <p className="font-mono text-[11px] mt-2">Monthly net: {formatCurrency(monthlyNet, displayCurrency, conversionRate)}</p>
          <div className="mt-2 h-3 border-2 border-ink bg-white">
            <div className="h-full bg-usc-cardinal" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">CASH_FLOW_FORECAST_30D</p>
          <p className="font-loud text-xl">{formatCurrency(forecast30d, displayCurrency, conversionRate)}</p>
          <p className="font-mono text-[11px] mt-2 uppercase text-ink/70">Projected net based on last 30-day trend.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">CALENDAR_EXPENSE_VIEW</p>
          <div className="grid grid-cols-7 gap-1 text-[10px] font-mono">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
              <div key={d} className="text-center font-bold">{d}</div>
            ))}
            {calendarCells.map((cell, idx) => (
              <div key={`${cell.day ?? 'x'}-${idx}`} className="border border-ink min-h-10.5 p-1 bg-white">
                <div className="font-bold">{cell.day ?? ''}</div>
                {cell.total > 0 && <div className="text-[9px]">{formatCurrency(cell.total, displayCurrency, conversionRate, true)}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">RECURRING_MANAGEMENT_CENTER</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {recurringTemplates.slice(0, 8).map((e) => {
              const paused = !!pausedRecurring[templateKey(e)];
              return (
                <div key={templateKey(e)} className="flex items-center justify-between border border-ink p-2 bg-white">
                  <div>
                    <p className="font-loud text-[10px] uppercase">{e.title}</p>
                    <p className="font-mono text-[10px]">{formatCurrency(e.amount, displayCurrency, conversionRate)}</p>
                  </div>
                  <button
                    onClick={() => togglePauseRecurring(e)}
                    className={`px-2 py-1 border border-ink font-loud text-[9px] ${paused ? 'bg-usc-cardinal text-bone' : 'bg-usc-gold text-ink'}`}
                  >
                    {paused ? 'RESUME' : 'PAUSE'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">INVESTMENT_AND_NET_WORTH_TRACKING</p>
          <p className="font-mono text-[11px] mb-1">Portfolio value: {formatCurrency(totalInvestments, displayCurrency, conversionRate)}</p>
          <p className="font-loud text-lg">Net worth snapshot: {formatCurrency(netWorth, displayCurrency, conversionRate)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="border-2 border-ink p-2 text-xs" placeholder="Account" />
            <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value as InvestmentAccount['type'])} className="border-2 border-ink p-2 text-xs bg-white">
              <option value="cash">CASH</option>
              <option value="brokerage">BROKERAGE</option>
              <option value="crypto">CRYPTO</option>
              <option value="retirement">RETIREMENT</option>
              <option value="loan">LOAN</option>
              <option value="other">OTHER</option>
            </select>
            <input type="number" value={newAccountValue} onChange={(e) => setNewAccountValue(e.target.value)} className="border-2 border-ink p-2 text-xs" placeholder="Value" />
          </div>
          <button onClick={addInvestmentAccount} className="mt-2 px-3 py-1 border-2 border-ink bg-usc-gold font-loud text-[10px]">ADD_ACCOUNT</button>
          <div className="mt-3 space-y-1 max-h-28 overflow-y-auto">
            {investmentAccounts.slice(-6).map((account) => (
              <div key={account.id} className="text-[10px] font-mono border border-ink p-1 bg-white flex justify-between">
                <span>{account.name} ({account.type})</span>
                <span>{formatCurrency(account.value, displayCurrency, conversionRate)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">COLLABORATIVE_FAMILY_BUDGETING</p>
          <p className="font-mono text-[11px]">Shared contributions: {formatCurrency(familyContributionTotal, displayCurrency, conversionRate)}</p>
          <p className="font-mono text-[11px]">Shared expense load: {formatCurrency(monthlyExpense - familyContributionTotal, displayCurrency, conversionRate)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <input value={memberName} onChange={(e) => setMemberName(e.target.value)} className="border-2 border-ink p-2 text-xs" placeholder="Member name" />
            <input type="number" value={memberContribution} onChange={(e) => setMemberContribution(e.target.value)} className="border-2 border-ink p-2 text-xs" placeholder="Contribution" />
          </div>
          <button onClick={addFamilyMember} className="mt-2 px-3 py-1 border-2 border-ink bg-usc-gold font-loud text-[10px]">ADD_MEMBER</button>
          <div className="mt-3 space-y-1 max-h-28 overflow-y-auto">
            {familyMembers.slice(-6).map((member) => (
              <div key={member.id} className="text-[10px] font-mono border border-ink p-1 bg-white flex justify-between">
                <span>{member.name}</span>
                <span>{formatCurrency(member.contribution, displayCurrency, conversionRate)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">BILLS_AND_SUBSCRIPTIONS_TRACKER</p>
          {upcomingBills.length === 0 ? (
            <p className="font-mono text-[11px]">No recurring bills due in next 10 days.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingBills.map((bill) => (
                <li key={`${templateKey(bill)}-${bill.dueDate.toISOString()}`} className="border border-ink p-2 bg-white flex justify-between">
                  <span className="font-loud text-[10px] uppercase">{bill.title}</span>
                  <span className="font-mono text-[10px]">{bill.dueDate.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-2 border-ink p-4 bg-bone">
          <p className="font-loud text-xs uppercase mb-2">PROACTIVE_INSIGHTS</p>
          <ul className="space-y-2">
            {proactiveInsights.map((insight, idx) => (
              <li key={idx} className="border border-ink p-2 bg-white font-mono text-[11px]">{insight}</li>
            ))}
            {proactiveInsights.length === 0 && <li className="font-mono text-[11px]">No insights yet. Add more transactions.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default FinancialPlanningPanel;
