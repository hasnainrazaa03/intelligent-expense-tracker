import { describe, it, expect } from 'vitest';
import { parseCsvRows, autoDetectColumns, normalizeBankDate, parseBankTransactions } from './bankImport';

describe('parseCsvRows', () => {
  it('parses quoted fields with commas', () => {
    const rows = parseCsvRows('Date,Description,Amount\n2026-07-01,"Coffee, large",-4.50');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['2026-07-01', 'Coffee, large', '-4.50']);
  });
});

describe('autoDetectColumns', () => {
  it('detects date/description/amount from common headers', () => {
    const m = autoDetectColumns(['Posted Date', 'Payee', 'Amount', 'Category']);
    expect(m).toEqual({ date: 0, description: 1, amount: 2, category: 3 });
  });
});

describe('normalizeBankDate', () => {
  it('passes through ISO', () => {
    expect(normalizeBankDate('2026-07-01', 'auto')).toBe('2026-07-01');
  });
  it('parses US mdy by default', () => {
    expect(normalizeBankDate('07/15/2026', 'mdy')).toBe('2026-07-15');
  });
  it('parses dmy when specified', () => {
    expect(normalizeBankDate('15/07/2026', 'dmy')).toBe('2026-07-15');
  });
  it('expands 2-digit years', () => {
    expect(normalizeBankDate('07/15/26', 'mdy')).toBe('2026-07-15');
  });
  it('rejects nonsense', () => {
    expect(normalizeBankDate('not a date', 'auto')).toBeNull();
  });
});

describe('parseBankTransactions', () => {
  const mapping = { date: 0, description: 1, amount: 2 };

  it('imports debits as expenses and skips credits when negativeIsExpense', () => {
    const rows = [
      ['2026-07-01', 'Coffee', '-4.50'],
      ['2026-07-02', 'Paycheck', '2000.00'], // credit -> skipped
      ['2026-07-03', 'Groceries', '-60.00'],
    ];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', negativeIsExpense: true });
    expect(res.imported).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.expenses[0]).toMatchObject({ title: 'Coffee', amount: 4.5, date: '2026-07-01', category: 'Other' });
  });

  it('imports all rows as magnitude when negativeIsExpense is off', () => {
    const rows = [['2026-07-01', 'A', '-4.50'], ['2026-07-02', 'B', '60']];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', negativeIsExpense: false });
    expect(res.imported).toBe(2);
    expect(res.expenses[1].amount).toBe(60);
  });

  it('skips rows with a bad date or zero amount', () => {
    const rows = [['bad', 'X', '-1'], ['2026-07-01', 'Y', '0'], ['2026-07-01', '', '-5']];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', negativeIsExpense: true });
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(3);
  });

  it('uses a mapped category column when present', () => {
    const rows = [['2026-07-01', 'Gym', '-30', 'Fitness']];
    const res = parseBankTransactions(rows, { ...mapping, category: 3 }, { dateFormat: 'auto', negativeIsExpense: true });
    expect(res.expenses[0].category).toBe('Fitness');
  });
});
