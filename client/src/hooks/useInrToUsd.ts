import { useEffect, useState } from 'react';

export interface InrToUsdResult {
  /** Converted USD amount as a string, or '' when conversion doesn't apply. */
  convertedAmount: string;
  rate: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Converts an INR entry amount to USD for the expense/income modals (previously
 * duplicated verbatim in both). Returns '' whenever the mode isn't INR, the INR
 * input is empty/non-positive, or a conversion fails — which fixes CMP-H5, where
 * clearing or failing the INR field left the previous (stale) USD value in a
 * read-only field to be submitted. Uses the parent USD→INR rate when available,
 * otherwise fetches INR→USD, debounced by 500ms.
 */
export default function useInrToUsd(
  selectedCurrency: 'USD' | 'INR',
  originalAmount: string,
  parentUsdToInrRate: number | null
): InrToUsdResult {
  const [convertedAmount, setConvertedAmount] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inr = parseFloat(originalAmount);

    // Not applicable → clear any stale converted value so it can't be submitted.
    if (selectedCurrency !== 'INR' || !originalAmount || !(inr > 0)) {
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
        if (parentUsdToInrRate && parentUsdToInrRate > 0) {
          r = 1 / parentUsdToInrRate;
        } else {
          const response = await fetch('https://api.frankfurter.app/latest?from=INR&to=USD');
          if (!response.ok) throw new Error('FETCH_ERROR');
          const data = await response.json();
          r = data?.rates?.USD;
          if (typeof r !== 'number' || !Number.isFinite(r)) throw new Error('BAD_RATE');
        }
        if (cancelled) return;
        setRate(r);
        setConvertedAmount((inr * r).toFixed(2));
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
  }, [selectedCurrency, originalAmount, parentUsdToInrRate]);

  return { convertedAmount, rate, loading, error };
}
