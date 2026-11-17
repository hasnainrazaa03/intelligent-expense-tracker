import { useCallback, useMemo } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';

/** The currency a money INPUT accepts, and how to store what's typed.
 *
 *  Amounts are stored in USD and shown in the display currency. An input used
 *  to take whatever was typed as USD while everything around it showed, say,
 *  INR — so a ₹1,00,000 savings goal was saved as $100,000 (shown as ₹87,50,000).
 *  Inputs now take the display currency and convert, but only with a fresh real
 *  rate (`rateForEntry`); without one they fall back to USD and say so. */
export default function useEntryCurrency() {
  const { displayCurrency, rateForEntry } = useCurrency();
  const currency = rateForEntry ? displayCurrency : 'USD';
  const rate = rateForEntry ?? 1;

  const symbol = useMemo(() => {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
    } catch {
      return currency;
    }
  }, [currency]);

  /** Typed amount (in `currency`) → stored USD, rounded to cents. */
  const toUsd = useCallback((typed: number) => Math.round((typed / rate + Number.EPSILON) * 100) / 100, [rate]);
  /** Stored USD → amount in `currency`, for pre-filling an input. */
  const fromUsd = useCallback((usd: number) => Math.round((usd * rate + Number.EPSILON) * 100) / 100, [rate]);

  return { currency, symbol, toUsd, fromUsd, isDisplayCurrency: currency === displayCurrency };
}
