export const formatCurrency = (
  amountInUSD: number,
  displayCurrency: 'USD' | 'INR',
  conversionRate: number | null,
  isCompact: boolean = false
): string => {
  const optionsUSD: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  const optionsINR: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  if (isCompact) {
    optionsUSD.notation = 'compact';
    optionsINR.notation = 'compact';
    optionsUSD.minimumFractionDigits = 0;
    optionsINR.minimumFractionDigits = 0;
    optionsUSD.maximumFractionDigits = 1;
    optionsINR.maximumFractionDigits = 1;
  }

  if (displayCurrency === 'INR') {
    if (conversionRate === null) return '...'; // Loading or error state
    const amountInINR = amountInUSD * conversionRate;
    return new Intl.NumberFormat('en-IN', optionsINR).format(amountInINR);
  }

  // Default to USD
  return new Intl.NumberFormat('en-US', optionsUSD).format(amountInUSD);
};
