import { describe, it, expect } from 'vitest';
import {
  parseCsvRows,
  autoDetectColumns,
  normalizeBankDate,
  parseBankTransactions,
  parseAmountCell,
  isMappingReady,
} from './bankImport';

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

  it('detects split debit/credit columns instead of a single amount', () => {
    const m = autoDetectColumns(['Date', 'Description', 'Debit', 'Credit']);
    expect(m).toEqual({ date: 0, description: 1, debit: 2, credit: 3 });
    expect(m.amount).toBeUndefined();
  });

  it('detects UK-style money in/out headers', () => {
    const m = autoDetectColumns(['Date', 'Narration', 'Paid Out', 'Paid In']);
    expect(m).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
  });
});

describe('parseAmountCell', () => {
  it('reads plain and comma-grouped numbers', () => {
    expect(parseAmountCell('-12.50')).toBe(-12.5);
    expect(parseAmountCell('$1,234.56')).toBe(1234.56);
  });
  it('reads accounting parentheses as negative', () => {
    expect(parseAmountCell('(45.00)')).toBe(-45);
    expect(parseAmountCell('$(45.00)')).toBe(-45);
  });
  it('reads a trailing minus as negative', () => {
    expect(parseAmountCell('45.00-')).toBe(-45);
  });
  it('reads DR/CR suffixes', () => {
    expect(parseAmountCell('45.00 DR')).toBe(-45);
    expect(parseAmountCell('45.00 CR')).toBe(45);
  });
  it('returns null for empty or non-numeric cells', () => {
    expect(parseAmountCell('')).toBeNull();
    expect(parseAmountCell('   ')).toBeNull();
    expect(parseAmountCell('-')).toBeNull();
    expect(parseAmountCell(undefined)).toBeNull();
  });
});

describe('isMappingReady', () => {
  it('accepts either a single amount column or a debit/credit column', () => {
    expect(isMappingReady({ date: 0, description: 1, amount: 2 })).toBe(true);
    expect(isMappingReady({ date: 0, description: 1, debit: 2 })).toBe(true);
    expect(isMappingReady({ date: 0, description: 1 })).toBe(false);
  });
});

describe('parseBankTransactions', () => {
  const mapping = { date: 0, description: 1, amount: 2 };

  it('imports debits as expenses and credits as income', () => {
    const rows = [
      ['2026-07-01', 'Coffee', '-4.50'],
      ['2026-07-02', 'Paycheck', '2000.00'],
      ['2026-07-03', 'Groceries', '-60.00'],
    ];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', signMode: 'auto' });
    expect(res.imported).toBe(3);
    expect(res.skipped).toBe(0);
    expect(res.expenses).toHaveLength(2);
    expect(res.transactions[1]).toMatchObject({ type: 'income', amount: 2000, description: 'Paycheck' });
    expect(res.expenses[0]).toMatchObject({ title: 'Coffee', amount: 4.5, date: '2026-07-01', category: 'Other' });
  });

  it('imports every row as an expense at absolute value in "expenses" mode', () => {
    const rows = [['2026-07-01', 'A', '-4.50'], ['2026-07-02', 'B', '60']];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', signMode: 'expenses' });
    expect(res.imported).toBe(2);
    expect(res.expenses).toHaveLength(2);
    expect(res.expenses[1].amount).toBe(60);
  });

  // B1: split debit/credit statements print unsigned values. Reading the debit
  // column as a signed amount used to skip every single row.
  it('imports unsigned split debit/credit columns correctly', () => {
    const rows = [
      ['08/01/2026', 'TRADER JOES', '45.00', ''],
      ['08/05/2026', 'PAYROLL', '', '2000.00'],
    ];
    const res = parseBankTransactions(
      rows,
      { date: 0, description: 1, debit: 2, credit: 3 },
      { dateFormat: 'auto', signMode: 'auto' }
    );
    expect(res.imported).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.transactions[0]).toMatchObject({ type: 'expense', amount: 45, date: '2026-08-01' });
    expect(res.transactions[1]).toMatchObject({ type: 'income', amount: 2000, date: '2026-08-05' });
  });

  // B3: parenthesised / trailing-minus amounts used to be dropped silently.
  it('imports parenthesised and trailing-minus amounts as expenses', () => {
    const rows = [
      ['08/01/2026', 'TRADER JOES', '(45.00)'],
      ['08/02/2026', 'LYFT', '45.00-'],
      ['08/03/2026', 'CVS', '-12.50'],
    ];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', signMode: 'auto' });
    expect(res.imported).toBe(3);
    expect(res.skipped).toBe(0);
    expect(res.expenses.map((e) => e.amount)).toEqual([45, 45, 12.5]);
  });

  it('skips rows with a bad date or zero amount and reports why', () => {
    const rows = [['bad', 'X', '-1'], ['2026-07-01', 'Y', '0'], ['2026-07-01', '', '-5']];
    const res = parseBankTransactions(rows, mapping, { dateFormat: 'auto', signMode: 'auto' });
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(3);
    expect(res.skipReasons).toEqual({ noDescription: 1, badDate: 1, badAmount: 1 });
  });

  it('uses a mapped category column when present', () => {
    const rows = [['2026-07-01', 'Gym', '-30', 'Fitness']];
    const res = parseBankTransactions(rows, { ...mapping, category: 3 }, { dateFormat: 'auto', signMode: 'auto' });
    expect(res.expenses[0].category).toBe('Fitness');
  });
});
