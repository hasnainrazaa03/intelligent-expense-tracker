import type { Expense, Income } from '../types';
import { getMainCategory } from './colorUtils';

/**
 * The Transactions list (U4): expenses and income together, filtered, sorted
 * and grouped by day. Pure, so the list component only renders.
 */
export type Entry = { kind: 'expense'; item: Expense } | { kind: 'income'; item: Income };
export type EntryType = 'all' | 'expenses' | 'income';
export type EntrySort = 'newest' | 'oldest' | 'largest';

export interface EntryFilters {
  /** A main category matches its subcategories too. */
  category?: string;
  account?: string;
  /** Payment method (expenses only). */
  method?: string;
  tag?: string;
  min?: number;
  max?: number;
}

export const toEntries = (expenses: Expense[], incomes: Income[], type: EntryType): Entry[] => [
  ...(type === 'income' ? [] : expenses.map((item) => ({ kind: 'expense' as const, item }))),
  ...(type === 'expenses' ? [] : incomes.map((item) => ({ kind: 'income' as const, item }))),
];

export const hasFilters = (f: EntryFilters): boolean =>
  Boolean(f.category || f.account || f.method || f.tag || f.min !== undefined || f.max !== undefined);

export const filterEntries = (entries: Entry[], f: EntryFilters, subToMain: Record<string, string>): Entry[] =>
  entries.filter(({ kind, item }) => {
    if (f.category && item.category !== f.category && !(kind === 'expense' && getMainCategory(item.category, subToMain) === f.category)) return false;
    if (f.account && item.account !== f.account) return false;
    if (f.method && (kind !== 'expense' || (item as Expense).paymentMethod !== f.method)) return false;
    if (f.tag && !(item.tags ?? []).includes(f.tag)) return false;
    if (f.min !== undefined && item.amount < f.min) return false;
    if (f.max !== undefined && item.amount > f.max) return false;
    return true;
  });

export const sortEntries = (entries: Entry[], sort: EntrySort): Entry[] =>
  [...entries].sort((a, b) => {
    if (sort === 'largest') return b.item.amount - a.item.amount || b.item.date.localeCompare(a.item.date);
    const byDate = a.item.date.localeCompare(b.item.date);
    return sort === 'oldest' ? byDate : -byDate;
  });

export interface DayGroup { date: string; entries: Entry[]; spent: number; earned: number }

/** Consecutive entries of the same day, in the order given, with the day's totals. */
export const groupByDay = (entries: Entry[]): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const date = entry.item.date.slice(0, 10);
    let group = groups[groups.length - 1];
    if (!group || group.date !== date) {
      group = { date, entries: [], spent: 0, earned: 0 };
      groups.push(group);
    }
    group.entries.push(entry);
    if (entry.kind === 'expense') group.spent += entry.item.amount;
    else group.earned += entry.item.amount;
  }
  return groups;
};

const num = (v: string | null): number | undefined => {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Filters and sort live in the address (?category=Food&sort=largest), so Back and bookmarks keep them. */
export const readListParams = (params: URLSearchParams): { filters: EntryFilters; sort: EntrySort } => {
  const sort = params.get('sort');
  return {
    filters: {
      category: params.get('category') || undefined,
      account: params.get('account') || undefined,
      method: params.get('method') || undefined,
      tag: params.get('tag') || undefined,
      min: num(params.get('min')),
      max: num(params.get('max')),
    },
    sort: sort === 'oldest' || sort === 'largest' ? sort : 'newest',
  };
};
