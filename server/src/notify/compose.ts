// What to tell a user, as plain data: the hourly job (job.ts) loads their data,
// calls these, and sends whatever hasn't been sent yet (NotificationLog keys).
import { budgetForExpense } from '../utils/categories';
import { upcomingBills, type RecurringExpense } from './recurrence';
import { addDays, monthName, shortDay } from './calendar';

export interface Notice {
  /** Every key is logged when sent; a notice whose keys were all sent is skipped. */
  keys: string[];
  title: string;
  body: string;
  url: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag: string;
}

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

interface Budget { category: string; amount: number } // dollars
interface Spend { category: string; amount: number; date: string } // dollars

/**
 * Budgets at 80% or over this month: one notification listing them, sent once
 * per budget, month and level (80%, then again at 100%).
 */
export const budgetNotice = ({ budgets, expenses, month, subToMain, sent }: {
  budgets: Budget[];
  /** This month's expenses. */
  expenses: Spend[];
  month: string;
  subToMain: Record<string, string>;
  /** Keys already sent, to leave out budgets already reported at this level. */
  sent: Set<string>;
}): Notice | null => {
  const budgeted = new Set(budgets.map((b) => b.category));
  const spent = new Map<string, number>();
  for (const e of expenses) {
    const b = budgetForExpense(e.category, budgeted, subToMain);
    if (b) spent.set(b, (spent.get(b) ?? 0) + e.amount);
  }
  const hits = budgets
    .filter((b) => b.amount > 0)
    .map((b) => {
      const pct = ((spent.get(b.category) ?? 0) / b.amount) * 100;
      const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
      return { ...b, pct, level, key: `budget:${month}:${b.category}:${level}` };
    })
    .filter((b) => b.level > 0 && !sent.has(b.key))
    .sort((a, b) => b.pct - a.pct);
  if (hits.length === 0) return null;

  const over = hits.filter((h) => h.level === 100);
  const line = (h: (typeof hits)[number]) => `${h.category} ${Math.round(h.pct)}%`;
  return {
    keys: hits.map((h) => h.key),
    title: over.length ? `Over budget: ${over.map((h) => h.category).join(', ')}` : `Budget check: ${hits.map((h) => h.category).join(', ')}`,
    body: hits.length === 1
      ? `You've used ${Math.round(hits[0].pct)}% of your ${hits[0].category} budget (${money(hits[0].amount)}) this month.`
      : `This month so far: ${hits.map(line).join(' · ')}.`,
    url: '/app/budgets',
    tag: `budget-${month}`,
  };
};

/** Recurring charges due in the next two days that aren't entered yet: one notification. */
export const billNotice = ({ expenses, today, paused, sent = new Set() }: { expenses: RecurringExpense[]; today: string; paused?: Record<string, unknown>; sent?: Set<string> }): Notice | null => {
  const bills = upcomingBills(expenses, today, 2, paused).filter((b) => !sent.has(`bill:${b.identity}:${b.due}`));
  if (bills.length === 0) return null;
  const when = (due: string) => (due === today ? 'today' : due === addDays(today, 1) ? 'tomorrow' : `on ${shortDay(due)}`);
  return {
    keys: bills.map((b) => `bill:${b.identity}:${b.due}`),
    title: bills.length === 1 ? `${bills[0].title} is due ${when(bills[0].due)}` : `${bills.length} bills due soon`,
    body: bills.map((b) => `${b.title} ${money(b.amount)} ${when(b.due)}`).join(' · '),
    url: '/app',
    tag: `bills-${today}`,
  };
};

/** Last month in one line, early in the new month. */
export const summaryNotice = ({ lastMonth, expenses, budgets, subToMain }: {
  lastMonth: string;
  /** Last month's expenses. */
  expenses: Spend[];
  budgets: Budget[];
  subToMain: Record<string, string>;
}): Notice | null => {
  if (expenses.length === 0) return null;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byMain = new Map<string, number>();
  for (const e of expenses) {
    const main = subToMain[e.category] ?? e.category;
    byMain.set(main, (byMain.get(main) ?? 0) + e.amount);
  }
  const [topName, topAmount] = [...byMain.entries()].sort((a, b) => b[1] - a[1])[0];
  const budgeted = new Set(budgets.map((b) => b.category));
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const budgetedSpend = expenses.filter((e) => budgetForExpense(e.category, budgeted, subToMain)).reduce((s, e) => s + e.amount, 0);
  const budgetPart = totalBudget > 0 ? `, ${Math.round((budgetedSpend / totalBudget) * 100)}% of your budgets` : '';
  return {
    keys: [`summary:${lastMonth}`],
    title: `Your ${monthName(lastMonth)} summary`,
    body: `You spent ${money(total)}${budgetPart}. Top category: ${topName} (${money(topAmount)}).`,
    url: '/app/insights/reports',
    tag: `summary-${lastMonth}`,
  };
};
