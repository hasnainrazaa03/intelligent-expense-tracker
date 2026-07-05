/**
 * Shared date convention for the app.
 *
 * Expense/income dates are timezone-agnostic **calendar days** in `YYYY-MM-DD`
 * form (the day the user picked). All "today" / month-boundary math derives from
 * LOCAL time, and dates are NEVER round-tripped through `toISOString()` (which
 * shifts the day for non-UTC users — the source of the timezone bugs).
 *
 * Because `YYYY-MM-DD` sorts lexicographically, range checks compare strings
 * directly instead of constructing Date objects.
 */

/** Format a Date's LOCAL calendar day as `YYYY-MM-DD` (no UTC shift). */
export const formatCalendarDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Today's local calendar day as `YYYY-MM-DD`. */
export const todayCalendar = (): string => formatCalendarDate(new Date());

/** Normalize any date-ish string to its `YYYY-MM-DD` calendar portion. */
export const toCalendarDate = (value: string): string => (value || '').slice(0, 10);

/**
 * Parse a `YYYY-MM-DD` (or longer ISO) string to a Date at LOCAL midnight, so
 * calendar-day comparisons and `getMonth()`/`getDay()` reflect the picked day
 * rather than a UTC-shifted one.
 */
export const parseCalendarDate = (value: string): Date => {
  const [y, m, d] = toCalendarDate(value).split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};

/** First calendar day of the month containing `ref` (default: today). */
export const startOfMonth = (ref: Date = new Date()): string =>
  formatCalendarDate(new Date(ref.getFullYear(), ref.getMonth(), 1));

/** Last calendar day of the month containing `ref` (default: today). */
export const endOfMonth = (ref: Date = new Date()): string =>
  formatCalendarDate(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));

/** A new Date offset by whole months, overflow-safe (Jan 31 - 1mo -> Dec 31, no April-31 wrap). */
export const addMonths = (ref: Date, delta: number): Date =>
  new Date(ref.getFullYear(), ref.getMonth() + delta, 1);

/** A new Date offset by whole days. */
export const addDays = (ref: Date, delta: number): Date => {
  const next = new Date(ref);
  next.setDate(next.getDate() + delta);
  return next;
};

/** Inclusive calendar-day range test on `YYYY-MM-DD` strings. */
export const isWithinRange = (date: string, startInclusive: string, endInclusive: string): boolean => {
  const d = toCalendarDate(date);
  return d >= startInclusive && d <= endInclusive;
};

/** `YYYY-MM` month key for grouping. */
export const monthKey = (date: string): string => toCalendarDate(date).slice(0, 7);
