/**
 * Ensures financial precision by rounding to 2 decimal places.
 * Uses Number.EPSILON to handle floating point inaccuracies like 1.005 rounding incorrectly.
 */
export const toFinPrecision = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};