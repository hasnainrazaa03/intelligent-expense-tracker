export const formatCurrency = (
  amountInUSD: number,
  displayCurrency: string,
  conversionRate: number | null,
  isCompact: boolean = false
): string => {
  // 1. CLEAN FLOAT ARTIFACTS: Rounds to 2 decimal places immediately
  // This prevents 10.099999999 from appearing as $10.09
  const cleanUSD = Math.round((amountInUSD + Number.EPSILON) * 100) / 100;

  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: displayCurrency,
    minimumFractionDigits: isCompact ? 0 : 2,
    maximumFractionDigits: isCompact ? 1 : 2,
    notation: isCompact ? 'compact' : 'standard',
  };

  // Amounts are stored in USD. USD is a pure passthrough (no conversion leak);
  // every other display currency multiplies by the USD→currency rate.
  if (displayCurrency === 'USD') {
    return new Intl.NumberFormat('en-US', options).format(cleanUSD);
  }

  if (conversionRate === null) return '...';
  const converted = cleanUSD * conversionRate;
  const locale = displayCurrency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, options).format(converted);
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
