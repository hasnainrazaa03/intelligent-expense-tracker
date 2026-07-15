import { describe, expect, it } from 'vitest';
import { computeDueRecurring, getRecurrenceFrequency, nextOccurrence } from './recurrence';
import { Expense } from '../types';

const mk = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36).slice(2),
  title: 'Netflix',
  amount: 15,
  category: 'Subscriptions',
  date: '2026-06-15',
  isRecurring: true,
  ...over,
});

describe('getRecurrenceFrequency', () => {
  it('defaults legacy recurring items to monthly', () => {
    expect(getRecurrenceFrequency(mk({}))).toBe('monthly');
  });
  it('reads the reserved metadata key', () => {
    expect(getRecurrenceFrequency(mk({ metadata: { recurrence: 'weekly' } }))).toBe('weekly');
    expect(getRecurrenceFrequency(mk({ metadata: { recurrence: 'yearly' } }))).toBe('yearly');
  });
});

describe('nextOccurrence', () => {
  it('steps by the right period', () => {
    expect(nextOccurrence('2026-06-15', 'weekly')).toBe('2026-06-22');
    expect(nextOccurrence('2026-06-15', 'monthly')).toBe('2026-07-15');
    expect(nextOccurrence('2026-06-15', 'yearly')).toBe('2027-06-15');
  });
  it('clamps month-end overflow', () => {
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
});

describe('computeDueRecurring', () => {
  it('suggests a monthly charge once the next month has arrived', () => {
    const due = computeDueRecurring([mk({ date: '2026-06-15' })], '2026-07-20');
    expect(due).toHaveLength(1);
    expect(due[0].date).toBe('2026-07-15');
  });

  it('does not suggest before the next occurrence is due', () => {
    const due = computeDueRecurring([mk({ date: '2026-07-15' })], '2026-07-20');
    expect(due).toHaveLength(0);
  });

  it('skips an identity that was already materialized', () => {
    const due = computeDueRecurring(
      [mk({ id: 'a', date: '2026-06-15' }), mk({ id: 'b', date: '2026-07-15' })],
      '2026-07-20'
    );
    expect(due).toHaveLength(0);
  });

  it('handles weekly frequency', () => {
    const due = computeDueRecurring(
      [mk({ date: '2026-07-01', metadata: { recurrence: 'weekly' } })],
      '2026-07-20'
    );
    expect(due).toHaveLength(1);
    expect(due[0].date).toBe('2026-07-08');
    expect(due[0].metadata?.recurrence).toBe('weekly');
  });

  it('ignores non-recurring expenses', () => {
    expect(computeDueRecurring([mk({ isRecurring: false, date: '2026-01-01' })], '2026-07-20')).toHaveLength(0);
  });
});
