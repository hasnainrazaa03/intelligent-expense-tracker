import { describe, it, expect } from 'vitest';
import { seriesValue } from './chartPayload';

describe('seriesValue', () => {
  // recharts orders payload by declaration order. BudgetPerformanceChart draws
  // the budget Line before the spent Area, so budgeted lands at index 0 — the
  // positional read used to label it "Spent".
  const payload = [
    { dataKey: 'budgeted', value: 1700 },
    { dataKey: 'spent', value: 2034.21 },
  ];

  it('reads each series by dataKey regardless of position', () => {
    expect(seriesValue(payload, 'spent')).toBe(2034.21);
    expect(seriesValue(payload, 'budgeted')).toBe(1700);
  });

  it('is unaffected when the declaration order flips', () => {
    const flipped = [...payload].reverse();
    expect(seriesValue(flipped, 'spent')).toBe(2034.21);
    expect(seriesValue(flipped, 'budgeted')).toBe(1700);
  });

  it('falls back to 0 for a missing or malformed payload', () => {
    expect(seriesValue(payload, 'nope')).toBe(0);
    expect(seriesValue(undefined, 'spent')).toBe(0);
    expect(seriesValue([{ dataKey: 'spent', value: 'abc' }], 'spent')).toBe(0);
  });
});
