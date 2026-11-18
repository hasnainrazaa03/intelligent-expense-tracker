/**
 * Money as people read it: full amounts with cents (`$478.50`, `$1,401.34`).
 * `isCompact` is the short form for chart axes and other chart-like labels
 * only (`$0`, `$480`, `$1.5K`, `$12K`): whole numbers under 1,000, one decimal
 * above. Everything a person reads as an amount uses the full form.
 */
export const formatCurrency = (
  amountInUSD: number,
  displayCurrency: string,
  conversionRate: number | null,
  isCompact: boolean = false
): string => {
  // 1. CLEAN FLOAT ARTIFACTS: Rounds to 2 decimal places immediately
  // This prevents 10.099999999 from appearing as $10.09
  const cleanUSD = Math.round((amountInUSD + Number.EPSILON) * 100) / 100;

  // Amounts are stored in USD. USD is a pure passthrough (no conversion leak);
  // every other display currency multiplies by the USD→currency rate.
  if (displayCurrency !== 'USD' && conversionRate === null) return '...';
  const value = displayCurrency === 'USD' ? cleanUSD : cleanUSD * (conversionRate as number);
  const locale = displayCurrency === 'INR' ? 'en-IN' : 'en-US';

  const options: Intl.NumberFormatOptions = isCompact
    ? {
        style: 'currency',
        currency: displayCurrency,
        notation: 'compact',
        minimumFractionDigits: 0,
        // "$478.5" reads like a typo; under 1,000 the short form is whole.
        maximumFractionDigits: Math.abs(value) < 1000 ? 0 : 1,
      }
    : { style: 'currency', currency: displayCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2 };

  return new Intl.NumberFormat(locale, options).format(value);
};

/**
 * Splits a total amount into `parts` cent-accurate pieces that sum back to the
 * exact total (no penny leak). Any leftover cents are distributed one-per-piece
 * to the earliest slots, so e.g. distributeAmount(100, 3) => [33.34, 33.33, 33.33].
 * Non-positive totals or counts yield zero-filled slots (safe for tuition math).
 */
export const distributeAmount = (totalUSD: number, parts: number): number[] => {
  if (!Number.isFinite(parts) || parts <= 0) return [];
  if (!Number.isFinite(totalUSD) || totalUSD <= 0) return Array.from({ length: parts }, () => 0);

  const totalCents = Math.round((totalUSD + Number.EPSILON) * 100);
  const base = Math.floor(totalCents / parts);
  let remainder = totalCents - base * parts; // 0 .. parts-1 extra cents

  return Array.from({ length: parts }, () => {
    const cents = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    return cents / 100;
  });
};
