import { describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  toCalendarDate,
  parseCalendarDate,
  startOfMonth,
  endOfMonth,
  addMonths,
  addDays,
  isWithinRange,
  monthKey,
} from './dateUtils';

describe('dateUtils', () => {
  it('formats a Date as its local calendar day (no UTC shift)', () => {
    // Local midnight of a specific day formats to that same day.
    const d = new Date(2026, 6, 1, 0, 0, 0); // Jul 1 2026 local
    expect(formatCalendarDate(d)).toBe('2026-07-01');
  });

  it('formats late-evening local times to the same local day', () => {
    // 11pm local on Jul 4 must stay Jul 4 even where UTC has rolled to Jul 5.
    const d = new Date(2026, 6, 4, 23, 0, 0);
    expect(formatCalendarDate(d)).toBe('2026-07-04');
  });

  it('parses YYYY-MM-DD to local midnight of the picked day', () => {
    const d = parseCalendarDate('2026-07-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(1);
  });

  it('normalizes longer ISO strings to the calendar portion', () => {
    expect(toCalendarDate('2026-07-01T22:00:00-08:00')).toBe('2026-07-01');
  });

  it('computes month boundaries', () => {
    const ref = new Date(2026, 1, 15); // Feb 2026
    expect(startOfMonth(ref)).toBe('2026-02-01');
    expect(endOfMonth(ref)).toBe('2026-02-28');
  });

  it('addMonths is overflow-safe at month-end', () => {
    const jan31 = new Date(2026, 0, 31);
    // Naive setMonth(-1) would wrap through a nonexistent day; addMonths lands on the 1st.
    expect(formatCalendarDate(addMonths(jan31, -1))).toBe('2025-12-01');
    expect(formatCalendarDate(addMonths(jan31, 1))).toBe('2026-02-01');
  });

  it('addDays crosses month boundaries', () => {
    expect(formatCalendarDate(addDays(new Date(2026, 6, 31), 1))).toBe('2026-08-01');
  });

  it('isWithinRange is inclusive on calendar strings', () => {
    expect(isWithinRange('2026-07-01', '2026-07-01', '2026-07-31')).toBe(true);
    expect(isWithinRange('2026-07-31', '2026-07-01', '2026-07-31')).toBe(true);
    expect(isWithinRange('2026-08-01', '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('monthKey groups by year-month', () => {
    expect(monthKey('2026-07-15')).toBe('2026-07');
  });
});
