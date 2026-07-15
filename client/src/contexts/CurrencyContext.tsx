import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SUPPORTED_CURRENCIES, CurrencyMeta, isSupportedCurrency } from '../utils/currencies';

interface CurrencyContextValue {
  /** The currency amounts are displayed in (ISO code). Stored values are always USD. */
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => void;
  /** USD→displayCurrency rate (1 for USD), or null while loading / unavailable. */
  conversionRate: number | null;
  /** True when INR is falling back to the hardcoded rate, or a non-USD currency
   *  has no rate yet — figures are approximate/unavailable, so the UI can flag it. */
  isRateFallback: boolean;
  /** Currencies offered in the picker. */
  availableCurrencies: CurrencyMeta[];
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const RATE_TABLE_KEY = 'usdRateTableV2';
const DISPLAY_CURRENCY_KEY = 'displayCurrency';
const ONE_HOUR_MS = 60 * 60 * 1000;
// Last-resort USD→INR rate so the historically INR-default users never see "..."
// when the live FX API is unreachable. Only applies to INR.
const FALLBACK_USD_INR = 87.5;

type RateTable = Record<string, number>;

const readRateTable = (): { rates: RateTable; timestamp: number } | null => {
  try {
    const raw = localStorage.getItem(RATE_TABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.rates === 'object' && parsed.rates) {
      return { rates: parsed.rates as RateTable, timestamp: Number(parsed.timestamp) || 0 };
    }
  } catch {
    // Corrupt cache — ignore and refetch.
  }
  return null;
};

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayCurrency, setDisplayCurrencyState] = useState<string>(() => {
    const stored = localStorage.getItem(DISPLAY_CURRENCY_KEY);
    if (stored && isSupportedCurrency(stored)) return stored;
    // Default INR for India-timezone users (UTC+5:30), else USD.
    return new Date().getTimezoneOffset() === -330 ? 'INR' : 'USD';
  });
  const [rates, setRates] = useState<RateTable | null>(() => readRateTable()?.rates ?? null);

  const setDisplayCurrency = (currency: string) => {
    setDisplayCurrencyState(currency);
    localStorage.setItem(DISPLAY_CURRENCY_KEY, currency);
  };

  // Fetch the whole USD→* table in one request (1h cache). One fetch covers every
  // currency, so switching the display currency is instant and offline-tolerant.
  useEffect(() => {
    const fetchRates = async () => {
      const cached = readRateTable();
      if (cached && Date.now() - cached.timestamp < ONE_HOUR_MS) {
        setRates(cached.rates);
        return;
      }
      try {
        const response = await fetch('https://api.frankfurter.app/latest?from=USD');
        if (!response.ok) throw new Error('Failed to fetch rates');
        const data = await response.json();
        if (!data?.rates || typeof data.rates !== 'object') throw new Error('Unexpected rate response shape');
        setRates(data.rates);
        localStorage.setItem(RATE_TABLE_KEY, JSON.stringify({ rates: data.rates, timestamp: Date.now() }));
      } catch (error) {
        console.error('Could not fetch conversion rates:', error);
        if (cached) setRates(cached.rates); // keep the stale-but-real table
      }
    };
    fetchRates();
  }, []);

  const conversionRate = useMemo<number | null>(() => {
    if (displayCurrency === 'USD') return 1;
    const live = rates?.[displayCurrency];
    if (typeof live === 'number' && Number.isFinite(live)) return live;
    if (displayCurrency === 'INR') return FALLBACK_USD_INR;
    return null;
  }, [rates, displayCurrency]);

  const isRateFallback = useMemo<boolean>(() => {
    if (displayCurrency === 'USD') return false;
    const live = rates?.[displayCurrency];
    return !(typeof live === 'number' && Number.isFinite(live));
  }, [rates, displayCurrency]);

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, conversionRate, isRateFallback, availableCurrencies: SUPPORTED_CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextValue => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
};
