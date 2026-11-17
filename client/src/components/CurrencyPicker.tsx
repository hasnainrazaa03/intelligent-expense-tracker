import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ChevronUpDownIcon, CheckIcon } from './Icons';

/**
 * Searchable display-currency picker (replaces the old USD/INR toggle).
 *
 * Accessible combobox (4b): the search box drives the list with
 * aria-activedescendant; ArrowUp/Down, Home/End and Enter pick a currency;
 * Escape closes and returns focus to the button. Options used to be buttons
 * nested inside role="option" items (invalid, and announced twice), and Escape
 * didn't close the list.
 */
const CurrencyPicker: React.FC = () => {
  const { displayCurrency, setDisplayCurrency, availableCurrencies, isRateFallback } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const optionId = (code: string) => `${listId}-${code}`;

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

  // Keep the highlighted option in view while arrowing through the list.
  useEffect(() => {
    if (!isOpen) return;
    const code = filtered[active]?.code;
    if (code) document.getElementById(optionId(code))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isOpen, filtered]);

  const open = () => {
    setQuery('');
    setActive(Math.max(0, availableCurrencies.findIndex((c) => c.code === displayCurrency)));
    setIsOpen(true);
  };
  const close = () => {
    setIsOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };
  const choose = (code: string) => {
    setDisplayCurrency(code);
    close();
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = filtered.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active].code); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') setIsOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
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
        <div className="absolute right-0 top-full mt-2 z-50 w-60 modal-surface rounded-2xl shadow-soft border border-app-border overflow-hidden">
          <div className="p-2 border-b border-app-border">
            <div className="relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-app-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={filtered[active] ? optionId(filtered[active].code) : undefined}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKey}
                placeholder="Search currency…"
                aria-label="Search currency"
                className="w-full bg-surface-2 border border-app-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
          <ul id={listId} role="listbox" aria-label="Currencies" className="max-h-72 overflow-y-auto py-1 custom-scrollbar">
            {filtered.map((c, i) => {
              const selected = c.code === displayCurrency;
              return (
                <li
                  key={c.code}
                  id={optionId(c.code)}
                  role="option"
                  aria-selected={selected}
                  // mousedown keeps focus in the search box; click picks.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(c.code)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2 cursor-pointer transition-colors text-app-text ${i === active ? 'bg-surface-2' : ''} ${selected ? 'font-semibold' : ''}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <CheckIcon className={`h-3.5 w-3.5 flex-shrink-0 text-primary ${selected ? '' : 'invisible'}`} aria-hidden="true" />
                    <span className="text-sm truncate">{c.name}</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums flex-shrink-0 text-app-muted">{c.code}</span>
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && <p className="px-3 py-3 text-xs text-app-muted text-center" role="status">No match.</p>}
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
