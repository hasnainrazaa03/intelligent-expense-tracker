import { describe, it, expect } from 'vitest';
import { parseExpenseCsv, ExpenseCsvError } from './expenseCsvImport';
import { parseCsvRows } from './bankImport';
import { escapeCsvCell } from './exportUtils';

const HEAD = 'title,amount,category,date,paymentMethod,notes,isRecurring,tags';

describe('parseCsvRows (multi-line and BOM)', () => {
  it('keeps a newline inside a quoted field in one row', () => {
    const rows = parseCsvRows('a,b\r\n1,"line one\nline two"\r\n2,x');
    expect(rows).toEqual([['a', 'b'], ['1', 'line one\nline two'], ['2', 'x']]);
  });
  it('strips a UTF-8 BOM and skips blank lines', () => {
    expect(parseCsvRows('﻿title,amount\n\n  \nCoffee,4\n')).toEqual([['title', 'amount'], ['Coffee', '4']]);
  });
});

describe('parseExpenseCsv', () => {
  it('reads thousands separators and currency symbols', () => {
    const { expenses } = parseExpenseCsv(`${HEAD}\nLaptop,"1,234.56",Electronics,2026-11-02,,,,\nLunch,$12.50,Dining Out,2026-11-03,,,,`, 100);
    expect(expenses.map((e) => e.amount)).toEqual([1234.56, 12.5]);
  });

  it('keeps a multi-line note in its row', () => {
    const { expenses, skipped } = parseExpenseCsv(`${HEAD}\nRent,1500,Rent,2026-11-01,Bank Transfer,"Split with\nroommates",true,home; fixed`, 100);
    expect(skipped).toBe(0);
    expect(expenses[0]).toMatchObject({ title: 'Rent', notes: 'Split with\nroommates', isRecurring: true, tags: ['home', 'fixed'] });
  });

  it('skips zero/negative amounts instead of failing the batch, and counts them', () => {
    const r = parseExpenseCsv(`${HEAD}\nRefund,-20,Shopping,2026-11-01,,,,\nFree,0,Other,2026-11-01,,,,\nCoffee,4.5,Dining Out,2026-11-01,,,,`, 100);
    expect(r.expenses.map((e) => e.title)).toEqual(['Coffee']);
    expect(r).toMatchObject({ skipped: 2, nonPositive: 2 });
  });

  it('skips rows the server would reject (over the max amount or over-long title)', () => {
    const r = parseExpenseCsv(`${HEAD}\nHuge,20000000,Other,2026-11-01,,,,\n${'x'.repeat(501)},5,Other,2026-11-01,,,,\nOk,5,Other,2026-11-01,,,,`, 100);
    expect(r.expenses.map((e) => e.title)).toEqual(['Ok']);
    expect(r.skipped).toBe(2);
  });

  it('accepts a header with an Excel BOM', () => {
    expect(parseExpenseCsv(`﻿${HEAD}\nCoffee,4,Dining Out,2026-11-01,,,,`, 100).expenses).toHaveLength(1);
  });

  it('round-trips the app\'s own export cells', () => {
    const row = ['Dinner, with "friends"', 1234.5, 'Dining Out', '2026-11-04', 'Credit Card', 'Paid for\nthree', false, ['social', 'food']];
    const csv = `${HEAD}\r\n${row.map(escapeCsvCell).join(',')}`;
    expect(parseExpenseCsv(csv, 100).expenses[0]).toMatchObject({
      title: 'Dinner, with "friends"', amount: 1234.5, notes: 'Paid for\nthree', tags: ['social', 'food'],
    });
  });

  it('throws on missing headers and on too many rows', () => {
    expect(() => parseExpenseCsv('name,amount\nx,1', 100)).toThrow(ExpenseCsvError);
    expect(() => parseExpenseCsv(`${HEAD}\na,1,c,2026-11-01\nb,1,c,2026-11-01`, 1)).toThrow(/ROW_LIMIT/);
  });
});
