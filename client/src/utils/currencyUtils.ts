export const formatCurrency = (
  amountInUSD: number,
  displayCurrency: 'USD' | 'INR',
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

  if (displayCurrency === 'INR') {
    if (conversionRate === null) return '...';
    // Convert USD to INR only for display purposes
    const amountInINR = cleanUSD * conversionRate;
    return new Intl.NumberFormat('en-IN', options).format(amountInINR);
  }

  // 2. PURE PASSTHROUGH: No math is performed for USD to avoid conversion leaks
  return new Intl.NumberFormat('en-US', options).format(cleanUSD);
};
