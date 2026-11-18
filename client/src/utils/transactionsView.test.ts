import { describe, expect, it } from 'vitest';
import type { Expense, Income } from '../types';
import { filterEntries, groupByDay, readListParams, sortEntries, toEntries } from './transactionsView';

const e = (over: Partial<Expense>): Expense => ({ id: Math.random().toString(36), title: 'x', amount: 10, category: 'Groceries', date: '2026-11-10', tags: [], ...over } as Expense);
const i = (over: Partial<Income>): Income => ({ id: Math.random().toString(36), title: 'Pay', amount: 100, category: 'Salary', date: '2026-11-10', tags: [], ...over } as Income);
const subToMain = { Groceries: 'Food', Rent: 'Housing' };

describe('the Transactions list', () => {
  const expenses = [e({ title: 'Milk', amount: 4, date: '2026-11-09', account: 'Discover', paymentMethod: 'Credit Card', tags: ['home'] }), e({ title: 'Rent', category: 'Rent', amount: 900, date: '2026-11-01' })];
  const incomes = [i({ date: '2026-11-09' })];

  it('shows all, expenses or income', () => {
    expect(toEntries(expenses, incomes, 'all')).toHaveLength(3);
    expect(toEntries(expenses, incomes, 'expenses').every((x) => x.kind === 'expense')).toBe(true);
    expect(toEntries(expenses, incomes, 'income').map((x) => x.kind)).toEqual(['income']);
  });

  it('filters by main category (its subcategories too), account, method, tag and amount', () => {
    const all = toEntries(expenses, incomes, 'all');
    expect(filterEntries(all, { category: 'Food' }, subToMain).map((x) => x.item.title)).toEqual(['Milk']);
    expect(filterEntries(all, { account: 'Discover' }, subToMain)).toHaveLength(1);
    expect(filterEntries(all, { method: 'Credit Card' }, subToMain).map((x) => x.kind)).toEqual(['expense']);
    expect(filterEntries(all, { tag: 'home' }, subToMain)).toHaveLength(1);
    expect(filterEntries(all, { min: 50, max: 500 }, subToMain).map((x) => x.item.title)).toEqual(['Pay']);
  });

  it('sorts newest, oldest or largest, and groups consecutive days with their totals', () => {
    const all = toEntries(expenses, incomes, 'all');
    expect(sortEntries(all, 'largest').map((x) => x.item.amount)).toEqual([900, 100, 4]);
    expect(sortEntries(all, 'oldest')[0].item.date).toBe('2026-11-01');
    const groups = groupByDay(sortEntries(all, 'newest'));
    expect(groups.map((g) => g.date)).toEqual(['2026-11-09', '2026-11-01']);
    expect(groups[0]).toMatchObject({ spent: 4, earned: 100 });
  });

  it('reads filters and sort from the address, ignoring nonsense', () => {
    const { filters, sort } = readListParams(new URLSearchParams('category=Food&min=5&max=abc&sort=largest'));
    expect(filters).toMatchObject({ category: 'Food', min: 5 });
    expect(filters.max).toBeUndefined();
    expect(sort).toBe('largest');
    expect(readListParams(new URLSearchParams('sort=sideways')).sort).toBe('newest');
  });
});
