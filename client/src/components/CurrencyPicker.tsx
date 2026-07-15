import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ChevronUpDownIcon } from './Icons';

/** Searchable display-currency picker (replaces the old USD/INR toggle). */
const CurrencyPicker: React.FC = () => {
  const { displayCurrency, setDisplayCurrency, availableCurrencies, isRateFallback } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableCurrencies;
    return availableCurrencies.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query, availableCurrencies]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  const choose = (code: string) => {
    setDisplayCurrency(code);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Display currency: ${displayCurrency}. Change`}
        className="flex items-center gap-1.5 bg-surface-2 border border-app-border rounded-xl px-3 py-1.5 text-xs font-semibold text-app-text hover:border-app-border-strong transition-colors"
      >
        <span className="tabular-nums">{displayCurrency}</span>
        {isRateFallback && (
          <ExclamationTriangleIcon className="h-3 w-3 text-warn" aria-label="Approximate FX rate" />
        )}
        <ChevronUpDownIcon className="h-3.5 w-3.5 text-app-faint" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-2 z-50 w-60 modal-surface rounded-2xl shadow-soft border border-app-border overflow-hidden"
        >
          <div className="p-2 border-b border-app-border">
            <div className="relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-app-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search currency…"
                aria-label="Search currency"
                className="w-full bg-surface-2 border border-app-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1 custom-scrollbar">
            {filtered.length === 0 && <li className="px-3 py-3 text-xs text-app-muted text-center">No match.</li>}
            {filtered.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === displayCurrency}>
                <button
                  type="button"
                  onClick={() => choose(c.code)}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors ${c.code === displayCurrency ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2 text-app-text'}`}
                >
                  <span className="text-sm truncate">{c.name}</span>
                  <span className="text-xs font-semibold tabular-nums flex-shrink-0 text-app-muted">{c.code}</span>
                </button>
              </li>
            ))}
          </ul>
          {isRateFallback && (
            <p className="px-3 py-2 text-[10px] text-warn border-t border-app-border flex items-center gap-1.5">
              <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" /> Live rate unavailable — amounts are approximate.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CurrencyPicker;
