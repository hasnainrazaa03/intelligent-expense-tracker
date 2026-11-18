import type { DateRange } from '../components/DateRangeFilter';
import { addDays, addMonths, formatCalendarDate } from './dateUtils';

export interface ReportPeriod {
  /** "This month", "Last 90 days", … */
  label: string;
  /** The dates it covers: "November 2026", "Aug 19 – Nov 17, 2026", "2025–2026". */
  span: string;
  /** How many months it covers, for comparing with (monthly) budgets. At least 1. */
  months: number;
}

const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayName = (d: Date, withYear: boolean) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

/** Describe a report period. `dates` (YYYY-MM-DD) give "all time" its extent. */
export const describePeriod = (range: DateRange, dates: string[], now = new Date()): ReportPeriod => {
  switch (range) {
    case 'this_month':
      return { label: 'This month', span: monthName(now), months: 1 };
    case 'last_month':
      return { label: 'Last month', span: monthName(addMonths(now, -1)), months: 1 };
    case 'last_90_days': {
      const start = addDays(now, -90);
      return { label: 'Last 90 days', span: `${dayName(start, start.getFullYear() !== now.getFullYear())} – ${dayName(now, true)}`, months: 3 };
    }
    case 'all_time':
    default: {
      if (dates.length === 0) return { label: 'All time', span: 'No data yet', months: 1 };
      const first = dates.reduce((a, b) => (a < b ? a : b));
      const [fy, fm] = first.split('-').map(Number);
      // Calendar months from the first expense's month to this one, inclusive.
      const months = Math.max(1, (now.getFullYear() - fy) * 12 + (now.getMonth() + 1 - fm) + 1);
      const lastYear = Number(formatCalendarDate(now).slice(0, 4));
      return { label: 'All time', span: fy === lastYear ? String(fy) : `${fy}–${lastYear}`, months };
    }
  }
};
