import React, { useMemo, useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { Expense, Income, InvestmentAccount } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { todayCalendar } from '../utils/dateUtils';
import { Button, Card } from './ui';
import SpendingBarChart from './SpendingBarChart';
import HouseholdsManager from './HouseholdsManager';

const SAVINGS_GOALS_KEY = 'savingsGoalsV2';
const PAUSED_RECURRING_KEY = 'pausedRecurringTemplates';
const INVESTMENT_ACCOUNTS_KEY = 'investmentAccounts';

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  /** Optional target date (YYYY-MM-DD). */
  deadline?: string;
}

interface FinancialPlanningPanelProps {
  expenses: Expense[];
  incomes: Income[];
}

const todayIso = () => todayCalendar();

const templateKey = (e: Expense): string => `${e.title}|${e.category}|${e.amount}`;

const FinancialPlanningPanel: React.FC<FinancialPlanningPanelProps> = ({ expenses, incomes }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVINGS_GOALS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [fundInputs, setFundInputs] = useState<Record<string, string>>({});
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


  const persistSavingsGoals = (next: SavingsGoal[]) => {
    setSavingsGoals(next);
    localStorage.setItem(SAVINGS_GOALS_KEY, JSON.stringify(next));
  };
  const addSavingsGoal = () => {
    const target = Number.parseFloat(newGoalTarget);
    if (!newGoalName.trim() || !Number.isFinite(target) || target <= 0) return;
    persistSavingsGoals([
      ...savingsGoals,
      { id: `${Date.now()}-${savingsGoals.length}`, name: newGoalName.trim(), target, saved: 0, deadline: newGoalDeadline || undefined },
    ]);
    setNewGoalName('');
    setNewGoalTarget('');
    setNewGoalDeadline('');
  };
  const addFundsToGoal = (id: string) => {
    const amount = Number.parseFloat(fundInputs[id] || '');
    if (!Number.isFinite(amount) || amount === 0) return;
    persistSavingsGoals(savingsGoals.map((g) => (g.id === id ? { ...g, saved: Math.max(0, g.saved + amount) } : g)));
    setFundInputs((prev) => ({ ...prev, [id]: '' }));
  };
  const removeSavingsGoal = (id: string) => persistSavingsGoals(savingsGoals.filter((g) => g.id !== id));

  // Project a completion date for a goal from the current monthly net (a simple
  // "at this rate" forecast). Returns a label + whether it beats the deadline.
  const forecastGoal = (goal: SavingsGoal): { label: string; onTrack: boolean | null } => {
    const remaining = goal.target - goal.saved;
    if (remaining <= 0) return { label: 'Goal reached 🎉', onTrack: true };
    if (monthlyNet <= 0) return { label: 'Needs a positive monthly net to project', onTrack: null };
    const months = Math.ceil(remaining / monthlyNet);
    const done = new Date(now.getFullYear(), now.getMonth() + months, 1);
    const label = `~${done.toLocaleString('en-US', { month: 'short', year: 'numeric' })} at your current rate`;
    if (!goal.deadline) return { label, onTrack: null };
    const onTrack = done <= new Date(goal.deadline);
    return { label, onTrack };
  };

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
    // Local midnight today, to match `dueDate` (also built from local Y/M/D).
    // Using `new Date(todayIso())` parsed the day as UTC midnight, so for UTC+
    // users a bill due today read as already past and got bumped a month out.
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const horizon = new Date(today);
    horizon.setDate(today.getDate() + 10);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return recurringTemplates
      .filter((e) => !pausedRecurring[templateKey(e)])
      .map((e) => {
        const day = Number.parseInt(e.date.slice(8, 10), 10) || 1;
        // Clamp to this month's length (was a hard 28, which mis-dated bills on
        // the 29th–31st) rather than to an arbitrary cap.
        const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(day, daysInMonth));
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

    // Anomaly detection: flag categories where this month's spend already exceeds
    // 1.5× the average of the prior 3 months (a genuine spike even mid-month,
    // since the partial current month is compared against full prior months).
    const priorPrefixes = [1, 2, 3].map((k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const priorByCat: Record<string, number[]> = {};
    priorPrefixes.forEach((prefix) => {
      const monthCat: Record<string, number> = {};
      expenses.filter((e) => e.date.startsWith(prefix)).forEach((e) => {
        monthCat[e.category] = (monthCat[e.category] || 0) + e.amount;
      });
      Object.entries(monthCat).forEach(([cat, amt]) => {
        (priorByCat[cat] ??= []).push(amt);
      });
    });
    (Object.entries(categoryTotals) as Array<[string, number]>).forEach(([cat, current]) => {
      const priors = priorByCat[cat];
      if (!priors || priors.length === 0) return;
      const avg = priors.reduce((s, a) => s + a, 0) / priors.length;
      if (avg > 0 && current > avg * 1.5) {
        const pct = ((current - avg) / avg) * 100;
        insights.push(`${cat} is up ${pct.toFixed(0)}% vs your recent average (${formatCurrency(current, displayCurrency, conversionRate)} vs ~${formatCurrency(avg, displayCurrency, conversionRate)}).`);
      }
    });

    const top = (Object.entries(categoryTotals) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      insights.push(`Top spend category this month is ${top[0]} at ${formatCurrency(top[1], displayCurrency, conversionRate)}.`);
    }

    const pausedCount = Object.values(pausedRecurring).filter(Boolean).length;
    if (pausedCount > 0) {
      insights.push(`${pausedCount} recurring template(s) are paused. Review if this is still intentional.`);
    }

    return insights.slice(0, 4);
  }, [expenses, currentMonthPrefix, monthlyNet, pausedRecurring, displayCurrency, conversionRate, now]);

  // Subscription price-creep: among recurring-flagged charges, group by
  // title+category and flag any whose latest amount is higher than its earliest
  // occurrence — a silent price increase — with the cumulative amount paid.
  const subscriptionCreep = useMemo(() => {
    const groups = new Map<string, { title: string; category: string; occ: { date: string; amount: number }[] }>();
    expenses
      .filter((e) => e.isRecurring)
      .forEach((e) => {
        const key = `${e.title.trim().toLowerCase()}|${e.category}`;
        const g = groups.get(key) ?? { title: e.title, category: e.category, occ: [] };
        g.occ.push({ date: e.date, amount: Number(e.amount) });
        groups.set(key, g);
      });

    const rows: Array<{ title: string; category: string; from: number; to: number; pct: number; count: number; total: number }> = [];
    for (const g of groups.values()) {
      if (g.occ.length < 2) continue;
      const sorted = g.occ.sort((a, b) => a.date.localeCompare(b.date));
      const from = sorted[0].amount;
      const to = sorted[sorted.length - 1].amount;
      const total = sorted.reduce((s, o) => s + o.amount, 0);
      if (from > 0 && to > from * 1.01) {
        rows.push({ title: g.title, category: g.category, from, to, pct: ((to - from) / from) * 100, count: sorted.length, total });
      }
    }
    return rows.sort((a, b) => b.pct - a.pct).slice(0, 5);
  }, [expenses]);

  // Roommate settle-up: turn the per-expense split data (participants + cent-
  // accurate shares the modal already stores) into who-owes-you balances. "You"
  // / "Me" are treated as the payer and excluded.
  const settleUp = useMemo(() => {
    const owed: Record<string, number> = {};
    expenses.forEach((e) => {
      if (!e.splitParticipants?.length || !e.splitShares?.length) return;
      e.splitParticipants.forEach((name, i) => {
        const n = (name || '').trim();
        const lower = n.toLowerCase();
        if (!n || lower === 'you' || lower === 'me') return;
        owed[n] = (owed[n] || 0) + (Number(e.splitShares[i]) || 0);
      });
    });
    return Object.entries(owed)
      .map(([name, amount]) => ({ name, amount }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const settleUpTotal = useMemo(() => settleUp.reduce((s, r) => s + r.amount, 0), [settleUp]);

  // Historical net-worth estimate: cumulative (income − expense) up to each
  // month's end, plus the current portfolio value as a baseline. Gives an
  // immediate 6-month curve from real transaction history (no waiting for
  // month-over-month snapshots to accumulate).
  const netWorthTrend = useMemo(() => {
    const data: { label: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const cutoff = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
      const inc = incomes.filter((x) => x.date <= cutoff).reduce((s, x) => s + Number(x.amount), 0);
      const exp = expenses.filter((x) => x.date <= cutoff).reduce((s, x) => s + Number(x.amount), 0);
      data.push({ label: ref.toLocaleString('en-US', { month: 'short', year: '2-digit' }), amount: inc - exp + totalInvestments });
    }
    return data;
  }, [expenses, incomes, totalInvestments, now]);

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
  const rowCls = "text-xs rounded-lg border border-app-border bg-surface px-2.5 py-2 flex justify-between items-center tabular-nums";

  return (
    <Card className="space-y-4">
      <h3 className="font-display text-xl md:text-2xl font-bold text-app-text">Financial planning</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <p className={subLabelCls}>Savings goals</p>
          <p className="text-xs text-app-muted mb-3 tabular-nums">Monthly net: <span className="text-app-text font-medium">{formatCurrency(monthlyNet, displayCurrency, conversionRate)}</span> · projections use this rate</p>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-2">
            <input value={newGoalName} onChange={(e) => setNewGoalName(e.target.value)} className={fieldCls} placeholder="Goal name (e.g. Emergency fund)" />
            <input type="number" value={newGoalTarget} onChange={(e) => setNewGoalTarget(e.target.value)} className={`${fieldCls} sm:w-28`} placeholder="Target" aria-label="Goal target amount" />
          </div>
          <div className="flex gap-2 mb-3">
            <input type="date" value={newGoalDeadline} onChange={(e) => setNewGoalDeadline(e.target.value)} className={`flex-1 ${fieldCls}`} aria-label="Goal deadline (optional)" />
            <Button size="sm" onClick={addSavingsGoal} className="px-4">Add goal</Button>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {savingsGoals.length === 0 && <p className="text-xs text-app-muted">No goals yet. Add one above to track progress toward it.</p>}
            {savingsGoals.map((goal) => {
              const pct = goal.target > 0 ? Math.max(0, Math.min(100, (goal.saved / goal.target) * 100)) : 0;
              const fc = forecastGoal(goal);
              return (
                <div key={goal.id} className="rounded-lg border border-app-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-app-text truncate">{goal.name}</p>
                    <button onClick={() => removeSavingsGoal(goal.id)} aria-label={`Delete goal ${goal.name}`} className="text-app-faint hover:text-danger text-[11px] font-semibold flex-shrink-0">Remove</button>
                  </div>
                  <p className="text-[11px] text-app-muted mt-0.5 tabular-nums">
                    {formatCurrency(goal.saved, displayCurrency, conversionRate)} / {formatCurrency(goal.target, displayCurrency, conversionRate)} · {pct.toFixed(0)}%
                  </p>
                  <div className="mt-1.5 h-2 rounded-full border border-app-border bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`text-[11px] mt-1.5 ${fc.onTrack === false ? 'text-danger' : fc.onTrack ? 'text-ok' : 'text-app-muted'}`}>
                    {fc.label}{goal.deadline ? ` · due ${goal.deadline}${fc.onTrack === false ? ' (behind)' : fc.onTrack ? ' (on track)' : ''}` : ''}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <input type="number" value={fundInputs[goal.id] || ''} onChange={(e) => setFundInputs((prev) => ({ ...prev, [goal.id]: e.target.value }))} className={`flex-1 ${fieldCls}`} placeholder="Add funds" aria-label={`Add funds to ${goal.name}`} />
                    <Button size="sm" onClick={() => addFundsToGoal(goal.id)} className="px-3">+ Fund</Button>
                  </div>
                </div>
              );
            })}
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
      {subscriptionCreep.length > 0 && (
        <div className={cardCls}>
          <p className={subLabelCls}>Subscription watch · price increases</p>
          <div className="space-y-2">
            {subscriptionCreep.map((s) => (
              <div key={`${s.title}-${s.category}`} className="flex items-center justify-between rounded-lg border border-warn/30 bg-warn/10 p-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-app-text truncate">{s.title}</p>
                  <p className="text-[11px] text-app-muted tabular-nums">
                    {formatCurrency(s.from, displayCurrency, conversionRate)} → {formatCurrency(s.to, displayCurrency, conversionRate)} · {s.count} charges · {formatCurrency(s.total, displayCurrency, conversionRate)} total
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-lg bg-warn/20 text-warn px-2 py-1 text-[11px] font-bold tabular-nums">+{s.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-app-muted mt-2.5">Based on recurring-flagged charges whose amount rose over time.</p>
        </div>
      )}

      {settleUp.length > 0 && (
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <p className={`${subLabelCls} mb-0`}>Split &amp; settle-up</p>
            <span className="text-xs font-semibold text-ok tabular-nums">{formatCurrency(settleUpTotal, displayCurrency, conversionRate)} owed to you</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {settleUp.map((r) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg border border-app-border bg-surface px-3 py-2.5">
                <span className="text-sm font-medium text-app-text truncate">{r.name}</span>
                <span className="text-sm font-semibold text-ok tabular-nums flex-shrink-0">owes {formatCurrency(r.amount, displayCurrency, conversionRate)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-app-muted mt-2.5">Summed from each expense's split shares (participants other than you).</p>
        </div>
      )}

      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <p className={`${subLabelCls} mb-0`}>Net-worth trend · 6-month</p>
          <span className="text-xs font-semibold text-app-text tabular-nums">{formatCurrency(netWorth, displayCurrency, conversionRate)}</span>
        </div>
        <div className="h-32 md:h-36">
          <SpendingBarChart data={netWorthTrend} />
        </div>
        <p className="text-[11px] text-app-muted mt-2">Cumulative cash flow plus current portfolio value — an estimate, not audited net worth.</p>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <p className={subLabelCls}>Investments & position</p>
          <p className="text-xs text-app-muted mb-1 tabular-nums">Portfolio value: <span className="text-app-text font-medium">{formatCurrency(totalInvestments, displayCurrency, conversionRate)}</span></p>
          <p className="font-display text-lg font-bold text-app-text tabular-nums">Est. position: {formatCurrency(netWorth, displayCurrency, conversionRate)}</p>
          <p className="text-[11px] text-app-muted mt-1">This month's net cash flow + portfolio value (not full net worth).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className={fieldCls} placeholder="Account" aria-label="Account name" />
            <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value as InvestmentAccount['type'])} className={fieldCls} aria-label="Account type">
              <option value="cash">Cash</option>
              <option value="brokerage">Brokerage</option>
              <option value="crypto">Crypto</option>
              <option value="retirement">Retirement</option>
              <option value="loan">Loan</option>
              <option value="other">Other</option>
            </select>
            <input type="number" value={newAccountValue} onChange={(e) => setNewAccountValue(e.target.value)} className={fieldCls} placeholder="Value" />
          </div>
          <Button size="sm" onClick={addInvestmentAccount} className="mt-2.5">Add account</Button>
          <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">
            {investmentAccounts.slice(-6).map((account) => (
              <div key={account.id} className={rowCls}>
                <span className="text-app-muted truncate">{account.name} <span className="text-app-faint">({account.type})</span></span>
                <span className="text-app-text font-medium">{formatCurrency(account.value, displayCurrency, conversionRate)}</span>
              </div>
            ))}
          </div>
        </div>

        <HouseholdsManager />

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
    </Card>
  );
};

export default FinancialPlanningPanel;
