/**
 * Ensures financial precision by rounding to 2 decimal places.
 * Uses toFixed(2) which handles banker's rounding edge cases better than
 * the Number.EPSILON trick (which fails for values like 1.255).
 * Guards against NaN and Infinity inputs.
 */
export const toFinPrecision = (num: number): number => {
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
};

/**
 * Validates that a value is a finite number.
 * Returns the parsed float if valid, or null if invalid.
 */
export const parseFiniteFloat = (value: any): number | null => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

/** Midnight UTC of a real calendar day, or null (no rolling 30 February into March). */
const utcDay = (year: number, month: number, day: number): Date | null => {
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
};

/**
 * A transaction date as a calendar day: midnight UTC of the day the client sent
 * (SRV-L5). Dates are calendar days end to end (the client reads back the first
 * ten characters), but this used to keep any time it was given, so
 * "2026-10-05T23:30:00-07:00" was stored as 6 October. Now the written day
 * wins. Impossible days ("2026-02-30", which JavaScript rolls into March) and
 * anything unparseable return null.
 */
export const parseValidDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : utcDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const ymd = YMD_PREFIX.exec(text);
  if (ymd) {
    // A time part must still be a real timestamp ("2026-10-05Tnonsense" isn't).
    if (ymd[4] && Number.isNaN(new Date(text).getTime())) return null;
    return utcDay(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }
  // Other spellings ("Oct 5, 2026"): the day as the parser reads it.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : utcDay(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
};
// Largest amount accepted anywhere: $10M. Money is stored as 32-bit integer cents
// (max 2,147,483,647 ≈ $21.4M), so larger values used to crash with a 500.
export const MAX_AMOUNT = 10_000_000;
// Foreign-currency originals (e.g. INR) run larger; still under the Int32 ceiling.
export const MAX_ORIGINAL_AMOUNT = 20_000_000;

/** A finite amount within ±max, or null (callers treat null as invalid). */
export const parseAmount = (value: any, max: number = MAX_AMOUNT): number | null => {
  const n = parseFiniteFloat(value);
  return n === null || Math.abs(n) > max ? null : n;
};
