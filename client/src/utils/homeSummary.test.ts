import { describe, expect, it } from 'vitest';
import type { Expense, Income } from '../types';
import { budgetsAtRisk, monthPlan, percentChange, recentTransactions, upcomingRecurring } from './homeSummary';

const exp = (over: Partial<Expense>): Expense => ({ id: Math.random().toString(36), title: 'x', amount: 10, category: 'Food', date: '2026-11-01', tags: [], ...over } as Expense);

describe('monthPlan', () => {
  it('spreads what is left over the days left, today included', () => {
    const p = monthPlan(3000, 1200, '2026-11-18'); // 30 days in November: 13 left
    expect(p.daysLeft).toBe(13);
    expect(p.left).toBe(1800);
    expect(p.perDay).toBeCloseTo(1800 / 13);
    expect(p.over).toBe(0);
    expect(p.pct).toBe(40);
  });
  it('reports the overspend and nothing left to spend', () => {
    const p = monthPlan(500, 650, '2026-11-30');
    expect(p).toMatchObject({ left: 0, over: 150, daysLeft: 1, perDay: 0 });
  });
});

describe('budgetsAtRisk', () => {
  it('lists the most-used budgets first and leaves out unused ones', () => {
    const budgets = [{ category: 'Food', amount: 100 }, { category: 'Housing', amount: 1000 }, { category: 'Travel', amount: 200 }, { category: 'Personal', amount: 50 }];
    const month = [exp({ category: 'Food', amount: 150 }), exp({ category: 'Housing', amount: 900 }), exp({ category: 'Travel', amount: 20 })];
    expect(budgetsAtRisk(budgets, month).map((r) => r.category)).toEqual(['Food', 'Housing', 'Travel']);
    expect(budgetsAtRisk(budgets, month, 2)).toHaveLength(2);
  });
});

describe('upcomingRecurring', () => {
  const netflix = exp({ title: 'Netflix', category: 'Subscriptions', amount: 15.49, date: '2026-10-22', isRecurring: true });
  it('finds the next charge inside the window, after today', () => {
    expect(upcomingRecurring([netflix], '2026-11-18')).toEqual([{ title: 'Netflix', category: 'Subscriptions', amount: 15.49, date: '2026-11-22' }]);
    expect(upcomingRecurring([netflix], '2026-11-01', 14)).toEqual([]); // the 22nd is 21 days away
  });
  it('leaves charges already due to the review, and paused ones out', () => {
    expect(upcomingRecurring([netflix], '2026-11-25')).toEqual([]); // due on the 22nd: the review offers it
    expect(upcomingRecurring([netflix], '2026-11-18', 14, { 'Netflix|Subscriptions|15.49': true })).toEqual([]);
  });
});

describe('recentTransactions and percentChange', () => {
  it('mixes expenses and income, newest first', () => {
    const inc = { id: 'i', title: 'Pay', amount: 100, category: 'Salary', date: '2026-11-15', tags: [] } as Income;
    const r = recentTransactions([exp({ date: '2026-11-10' }), exp({ date: '2026-11-17' })], [inc], 2);
    expect(r.map((x) => x.item.date)).toEqual(['2026-11-17', '2026-11-15']);
    expect(r[1].type).toBe('income');
  });
  it('compares only when there is something to compare', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(10, 0)).toBe(Infinity);
    expect(percentChange(0, 0)).toBeUndefined();
  });
});
