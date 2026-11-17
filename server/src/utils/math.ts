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

/**
 * Validates a date string and returns a Date object, or null if invalid.
 */
export const parseValidDate = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
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
