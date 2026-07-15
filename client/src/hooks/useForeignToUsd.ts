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
  const [convertedAmount, setConvertedAmount] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = parseFloat(foreignAmount);

    if (foreignCurrency === 'USD' || !foreignAmount || !(value > 0)) {
      setConvertedAmount('');
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const convert = async () => {
      setLoading(true);
      setError(null);
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
        if (cancelled) return;
        setRate(r);
        setConvertedAmount((value * r).toFixed(2));
      } catch {
        if (cancelled) return;
        setError('CONVERSION_FAILED');
        setConvertedAmount(''); // never leave a stale USD value on failure
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const debounce = setTimeout(convert, 500);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [foreignCurrency, foreignAmount, parentUsdToForeignRate]);

  return { convertedAmount, rate, loading, error };
}
