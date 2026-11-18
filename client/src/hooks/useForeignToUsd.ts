import { useEffect, useState } from 'react';

export interface ForeignToUsdResult {
  /** Converted USD amount as a string, or '' when conversion doesn't apply. */
  convertedAmount: string;
  /** USD per 1 unit of the foreign currency. */
  rate: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Converts an amount entered in an arbitrary foreign currency to USD for the
 * expense/income modals. Returns '' whenever it doesn't apply (USD mode, empty /
 * non-positive input, or a failed conversion) so a stale value can never be
 * submitted (CMP-H5). Reuses the parent USD→foreign rate when the foreign
 * currency matches the display currency; otherwise fetches foreign→USD directly.
 * Debounced 500ms.
 */
export default function useForeignToUsd(
  foreignCurrency: string,
  foreignAmount: string,
  parentUsdToForeignRate: number | null
): ForeignToUsdResult {
  // The latest conversion, labelled with the input it was for. Whether one is
  // pending, or doesn't apply, is derived from the input during render; the
  // effect only sets state when the (debounced) conversion comes back.
  const [result, setResult] = useState<{ input: string; convertedAmount: string; rate: number | null; error: string | null }>(
    { input: '', convertedAmount: '', rate: null, error: null });

  const value = parseFloat(foreignAmount);
  const applies = foreignCurrency !== 'USD' && Boolean(foreignAmount) && value > 0;
  const input = `${foreignCurrency}|${foreignAmount}|${parentUsdToForeignRate ?? ''}`;

  useEffect(() => {
    if (!applies) return;
    let cancelled = false;
    const convert = async () => {
      try {
        let r: number;
        if (parentUsdToForeignRate && parentUsdToForeignRate > 0) {
          r = 1 / parentUsdToForeignRate;
        } else {
          const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(foreignCurrency)}&symbols=USD`);
          if (!response.ok) throw new Error('FETCH_ERROR');
          const data = await response.json();
          r = data?.rates?.USD;
          if (typeof r !== 'number' || !Number.isFinite(r)) throw new Error('BAD_RATE');
        }
        if (!cancelled) setResult({ input, convertedAmount: (value * r).toFixed(2), rate: r, error: null });
      } catch {
        // Never leave a stale USD value on failure.
        if (!cancelled) setResult({ input, convertedAmount: '', rate: null, error: 'CONVERSION_FAILED' });
      }
    };
    const debounce = setTimeout(convert, 500);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [applies, input, foreignCurrency, parentUsdToForeignRate, value]);

  if (!applies) return { convertedAmount: '', rate: result.rate, loading: false, error: null };
  const current = result.input === input;
  return {
    // The previous conversion stays visible while the next one is pending (the
    // forms refuse to save while `loading`), so the USD field doesn't blank out.
    convertedAmount: result.convertedAmount,
    rate: result.rate,
    // Pending from the first keystroke, not only once the debounced fetch
    // starts: a form submitted inside the 500 ms window must not save the
    // previous conversion.
    loading: !current,
    error: current ? result.error : null,
  };
}
