import { describe, expect, it } from 'vitest';
import { formatCurrency, distributeAmount } from './currencyUtils';

describe('formatCurrency', () => {
  it('formats USD in standard mode', () => {
    expect(formatCurrency(1234.56, 'USD', null)).toContain('$1,234.56');
  });

  it('returns placeholder when INR conversion rate is unavailable', () => {
    expect(formatCurrency(10, 'INR', null)).toBe('...');
  });

  it('formats INR with conversion when rate is provided', () => {
    const formatted = formatCurrency(10, 'INR', 80);
    expect(formatted).toContain('800');
  });

  it('converts an arbitrary currency by its USD rate', () => {
    // 100 USD * 0.92 = 92 EUR
    const formatted = formatCurrency(100, 'EUR', 0.92);
    expect(formatted).toContain('92');
    expect(formatted).toMatch(/€|EUR/);
  });

  it('returns placeholder for any non-USD currency without a rate', () => {
    expect(formatCurrency(10, 'EUR', null)).toBe('...');
  });

  it('always shows cents in the full form', () => {
    expect(formatCurrency(478.5, 'USD', null)).toBe('$478.50');
    expect(formatCurrency(1401.34, 'USD', null)).toBe('$1,401.34');
    expect(formatCurrency(0, 'USD', null)).toBe('$0.00');
  });

  it('keeps the short form whole under 1,000 and one decimal above', () => {
    expect(formatCurrency(478.5, 'USD', null, true)).toBe('$479');
    expect(formatCurrency(0, 'USD', null, true)).toBe('$0');
    expect(formatCurrency(1500, 'USD', null, true)).toBe('$1.5K');
    expect(formatCurrency(12000, 'USD', null, true)).toBe('$12K');
    expect(formatCurrency(-2500, 'USD', null, true)).toBe('-$2.5K');
  });

  it('decides the short form on the converted amount', () => {
    // 20 USD at 83 INR/USD = 1,660 INR, so it is past 1,000 and compact.
    expect(formatCurrency(20, 'INR', 83, true)).toMatch(/1\.7K/);
  });
});

describe('distributeAmount', () => {
  const sum = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) * 100) / 100;

  it('splits evenly divisible totals', () => {
    expect(distributeAmount(90, 3)).toEqual([30, 30, 30]);
  });

  it('reconciles remainder cents so the parts sum exactly to the total', () => {
    const parts = distributeAmount(100, 3);
    expect(sum(parts)).toBe(100);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
  });

  it('handles awkward totals without penny leak', () => {
    expect(sum(distributeAmount(10.1, 3))).toBe(10.1);
    expect(sum(distributeAmount(9999.99, 7))).toBe(9999.99);
  });

  it('returns zero-filled slots for non-positive totals', () => {
    expect(distributeAmount(0, 4)).toEqual([0, 0, 0, 0]);
    expect(distributeAmount(-50, 2)).toEqual([0, 0]);
  });

  it('returns an empty array for non-positive counts', () => {
    expect(distributeAmount(100, 0)).toEqual([]);
  });
});
