import { describe, expect, it } from 'vitest';
import { formatCurrency } from './currencyUtils';

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
});
