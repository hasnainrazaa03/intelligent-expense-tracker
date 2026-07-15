import React, { createContext, useContext, useEffect, useState } from 'react';

interface CurrencyContextValue {
  /** The currency amounts are displayed in. Stored values are always USD. */
  displayCurrency: 'USD' | 'INR';
  setDisplayCurrency: (currency: 'USD' | 'INR') => void;
  /** USD→INR rate, or null while loading / unavailable. */
  conversionRate: number | null;
  /** True when the rate is the hardcoded last-resort fallback (no live or cached
   *  rate was obtained) — INR figures are approximate, so the UI can flag them. */
  isRateFallback: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const RATE_CACHE_KEY = 'usdToInrRate';
const ONE_HOUR_MS = 60 * 60 * 1000;
// Last-resort USD→INR rate so INR display never falls back to "..." when the
// live FX API is unreachable (blocked network / CORS / offline). Overwritten by
// the live rate as soon as the fetch succeeds; a cached rate always wins over it.
const FALLBACK_USD_INR = 87.5;

const readRateCache = (): { rate: number; timestamp: number } | null => {
  try {
    const raw = localStorage.getItem(RATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.rate === 'number' && Number.isFinite(parsed.rate)) {
      return { rate: parsed.rate, timestamp: Number(parsed.timestamp) || 0 };
    }
  } catch {
    // Corrupt cache — ignore and refetch.
  }
  return null;
};

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayCurrency, setDisplayCurrencyState] = useState<'USD' | 'INR'>(() => {
    const stored = localStorage.getItem('displayCurrency');
    if (stored === 'USD' || stored === 'INR') return stored;
    // Default INR for India-timezone users (UTC+5:30), else USD.
    return new Date().getTimezoneOffset() === -330 ? 'INR' : 'USD';
  });
  // Seed from cache (or the fallback) so INR renders immediately and never as
  // "..." — the live fetch below refines it.
  const [conversionRate, setConversionRate] = useState<number | null>(
    () => readRateCache()?.rate ?? FALLBACK_USD_INR
  );
  // Fallback is only in effect when there was no cached rate to seed from. A
  // cached (even stale) rate is a real market rate, not the hardcoded guess.
  const [isRateFallback, setIsRateFallback] = useState<boolean>(() => readRateCache() === null);

  const setDisplayCurrency = (currency: 'USD' | 'INR') => {
    setDisplayCurrencyState(currency);
    localStorage.setItem('displayCurrency', currency);
  };

  // Fetch the USD→INR rate (1h cache). Guards every parse and validates the rate
  // so INR amounts can never render as ₹NaN.
  useEffect(() => {
    const fetchRate = async () => {
      const cached = readRateCache();
      if (cached && Date.now() - cached.timestamp < ONE_HOUR_MS) {
        setConversionRate(cached.rate);
        setIsRateFallback(false);
        return;
      }
      try {
        const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
        if (!response.ok) throw new Error('Failed to fetch rate');
        const data = await response.json();
        const rate = data?.rates?.INR;
        if (typeof rate !== 'number' || !Number.isFinite(rate)) {
          throw new Error('Unexpected rate response shape');
        }
        setConversionRate(rate);
        setIsRateFallback(false);
        localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ rate, timestamp: Date.now() }));
      } catch (error) {
        console.error('Could not fetch conversion rate:', error);
        // Keep the cached rate if we have one (a real, if stale, rate); otherwise
        // the state already holds the hardcoded fallback so INR stays usable.
        if (cached) {
          setConversionRate(cached.rate);
          setIsRateFallback(false);
        }
      }
    };
    fetchRate();
  }, []);

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, conversionRate, isRateFallback }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextValue => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
};
