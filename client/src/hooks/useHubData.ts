import { useMemo } from 'react';
import type { Expense, Income } from '../types';
import type { DateRange } from '../components/DateRangeFilter';
import useDateRangeFilter from './useDateRangeFilter';
import { stripTuition } from '../utils/tuition';
import { fuzzyMatch } from '../utils/fuzzySearch';

/**
 * What the overview screens and lists show, derived from the raw data: each
 * hub's date range, tuition hidden when the user asks (overviews only; the
 * tuition ledger and raw lists keep it), and the searched, sorted list.
 */
export const useHubData = ({
  expenses,
  incomes,
  dateRange,
  incomeDateRange,
  hideTuition,
  search,
}: {
  expenses: Expense[];
  incomes: Income[];
  /** The Financial hub's range. */
  dateRange: DateRange;
  /** The Income hub keeps its own range, so filtering one never moves the other. */
  incomeDateRange: DateRange;
  hideTuition: boolean;
  search: string;
}) => {
  const { filteredExpenses, filteredIncomes, previousPeriodExpenses, previousPeriodIncomes, comparisonCutoff } = useDateRangeFilter(expenses, incomes, dateRange);
  const { filteredIncomes: incomeHubIncomes, previousPeriodIncomes: incomeHubPrevIncomes, comparisonCutoff: incomeComparisonCutoff } =
    useDateRangeFilter(expenses, incomes, incomeDateRange);

  const hub = {
    expenses: useMemo(() => stripTuition(filteredExpenses, hideTuition), [filteredExpenses, hideTuition]),
    incomes: useMemo(() => stripTuition(filteredIncomes, hideTuition), [filteredIncomes, hideTuition]),
    previousExpenses: useMemo(() => stripTuition(previousPeriodExpenses, hideTuition), [previousPeriodExpenses, hideTuition]),
    previousIncomes: useMemo(() => stripTuition(previousPeriodIncomes, hideTuition), [previousPeriodIncomes, hideTuition]),
    allExpenses: useMemo(() => stripTuition(expenses, hideTuition), [expenses, hideTuition]),
    allIncomes: useMemo(() => stripTuition(incomes, hideTuition), [incomes, hideTuition]),
    comparisonCutoff,
  };
  const incomeHub = {
    incomes: useMemo(() => stripTuition(incomeHubIncomes, hideTuition), [incomeHubIncomes, hideTuition]),
    previousIncomes: useMemo(() => stripTuition(incomeHubPrevIncomes, hideTuition), [incomeHubPrevIncomes, hideTuition]),
    comparisonCutoff: incomeComparisonCutoff,
  };

  // Accounts already in use, offered wherever one can be typed, so one card
  // can't end up under two labels.
  const knownAccounts = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) if (e.account) set.add(e.account);
    for (const i of incomes) if (i.account) set.add(i.account);
    return [...set].sort();
  }, [expenses, incomes]);

  // The Transactions list (U4): both kinds in the Home period, matching the
  // header search. Tags (from the importer and AI), payment method and account
  // are searchable too, so "discover" or "credit card" isolate a card (B6).
  const matches = useMemo(() => {
    if (!search) return null;
    const threshold = search.length > 5 ? 2 : 1;
    const match = (text?: string) => (text ? fuzzyMatch(search, text, threshold) : false);
    return (item: Expense | Income) =>
      match(item.title) ||
      match(item.category) ||
      match(item.notes) ||
      (item.tags?.some((tag) => match(tag)) ?? false) ||
      match((item as Partial<Expense>).paymentMethod) ||
      match(item.account);
  }, [search]);
  const listExpenses = useMemo(() => (matches ? filteredExpenses.filter(matches) : filteredExpenses), [filteredExpenses, matches]);
  const listIncomes = useMemo(() => (matches ? filteredIncomes.filter(matches) : filteredIncomes), [filteredIncomes, matches]);

  return { hub, incomeHub, knownAccounts, listExpenses, listIncomes };
};
