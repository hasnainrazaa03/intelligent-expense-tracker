import { describe, it, expect } from 'vitest';
import { describePeriod } from './reportPeriod';

const now = new Date(2026, 10, 17); // 17 Nov 2026, local

describe('describePeriod', () => {
  it('names the month for month periods', () => {
    expect(describePeriod('this_month', [], now)).toEqual({ label: 'This month', span: 'November 2026', months: 1 });
    expect(describePeriod('last_month', [], now)).toEqual({ label: 'Last month', span: 'October 2026', months: 1 });
  });

  it('gives 90 days as three months, with its dates', () => {
    expect(describePeriod('last_90_days', [], now)).toEqual({ label: 'Last 90 days', span: 'Aug 19 – Nov 17, 2026', months: 3 });
  });

  it('counts calendar months for all time, from the first expense to now', () => {
    expect(describePeriod('all_time', ['2026-03-30', '2025-12-01', '2026-11-02'], now)).toEqual({ label: 'All time', span: '2025–2026', months: 12 });
    expect(describePeriod('all_time', ['2026-11-01'], now).months).toBe(1);
    expect(describePeriod('all_time', [], now)).toEqual({ label: 'All time', span: 'No data yet', months: 1 });
  });
});
