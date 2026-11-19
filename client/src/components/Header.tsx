import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { ExpenseTrackerLogo } from './Branding';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { APP_CONFIG } from '../config';
import { Expense, Income } from '../types';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { formatCurrency } from '../utils/currencyUtils';
import { MagnifyingGlassIcon, TagIcon, BanknotesIcon, CalendarDaysIcon } from './Icons';
import AddMenu from './shell/AddMenu';
import ProfileMenu from './shell/ProfileMenu';
import { PATHS } from '../app/routes';

export type SearchHit =
  | { type: 'expense'; item: Expense }
  | { type: 'income'; item: Income };

interface HeaderProps {
  userEmail: string | null;
  onLogout: () => void;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onScanStatement: () => void;
  /** Hide tuition + tuition-loan from the overviews and reports. */
  hideTuition: boolean;
  onToggleHideTuition: () => void;
  onSearch: (query: string) => void;
  offlineStatus?: { isOnline: boolean; pendingCount: number; syncing: boolean };
  /** All transactions, searched globally by the header dropdown. */
  expenses: Expense[];
  incomes: Income[];
  /** Open a transaction's detail (edit) modal when picked from the dropdown. */
  onSelectTransaction: (hit: SearchHit) => void;
  /** Bump to clear the search box (e.g. "Clear search" on an empty result). */
  clearSearchSignal?: number;
}

const MAX_SEARCH_RESULTS = 8;

/**
 * The header (U2a): logo and sync status, search, Add, and the profile menu.
 * It replaces a row of eight icon buttons; what they did now lives in the
 * profile menu and the sidebar. On a phone it's one row, and search opens
 * from an icon.
 */
const Header: React.FC<HeaderProps> = ({
  userEmail, onLogout, onAddExpense, onAddIncome, onScanStatement, onSearch,
  hideTuition, onToggleHideTuition, offlineStatus, expenses, incomes, onSelectTransaction, clearSearchSignal = 0
}) => {
  const { displayCurrency, conversionRate } = useCurrency();

  // Raw search input is owned here and debounced locally, so keystrokes re-render
  // only the Header — not the whole app (APP-H5).
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, APP_CONFIG.searchDebounceMs);
  useEffect(() => {
    onSearch(debouncedSearch);
  }, [debouncedSearch, onSearch]);

  // --- Global search dropdown ---------------------------------------------
  // Match the live input (not the debounced value) so the dropdown feels
  // instant, across BOTH expenses and income and regardless of the active
  // tab or date range — the point is to find any transaction and jump to it.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Phones: search opens from an icon on a row of its own.
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
  useEffect(() => {
    if (phoneSearchOpen) searchInputRef.current?.focus();
  }, [phoneSearchOpen]);

  // The search text; any change also resets the keyboard highlight.
  const updateSearch = (value: string) => {
    setSearchInput(value);
    setActiveIndex(-1);
  };
  // A parent asks to clear the search ("Clear search" in an empty list). State
  // follows the signal during render, React's pattern for adjusting state to a
  // prop, instead of an effect that rendered twice.
  const [seenClearSignal, setSeenClearSignal] = useState(clearSearchSignal);
  if (clearSearchSignal !== seenClearSignal) {
    setSeenClearSignal(clearSearchSignal);
    updateSearch('');
  }
  useEffect(() => {
    if (clearSearchSignal !== 0) onSearch(''); // now, not after the debounce
  }, [clearSearchSignal, onSearch]);

  const matches = useMemo<SearchHit[]>(() => {
    const q = searchInput.trim();
    if (!q) return [];
    const threshold = q.length > 5 ? 2 : 1;
    const hit = (t: Expense | Income) =>
      fuzzyMatch(q, t.title, threshold) ||
      fuzzyMatch(q, t.category, threshold) ||
      (t.notes ? fuzzyMatch(q, t.notes, threshold) : false);
    const results: SearchHit[] = [
      ...expenses.filter(hit).map((item) => ({ type: 'expense' as const, item })),
      ...incomes.filter(hit).map((item) => ({ type: 'income' as const, item })),
    ];
    results.sort((a, b) => new Date(b.item.date).getTime() - new Date(a.item.date).getTime());
    return results.slice(0, MAX_SEARCH_RESULTS);
  }, [searchInput, expenses, incomes]);

  const showDropdown = isSearchOpen && searchInput.trim().length > 0;


  // Close the dropdown on any click outside the search cluster.
  useEffect(() => {
    if (!showDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showDropdown]);

  const selectHit = (hit: SearchHit) => {
    onSelectTransaction(hit);
    setIsSearchOpen(false);
    setActiveIndex(-1);
  };

  // Keep the keyboard-highlighted result in view while arrowing through a long list.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setIsSearchOpen(false); return; }
    if (!showDropdown || matches.length === 0) {
      if (e.key === 'ArrowDown' && searchInput.trim()) setIsSearchOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < matches.length) {
        e.preventDefault();
        selectHit(matches[activeIndex]);
      }
    }
  };

  const pending = offlineStatus?.pendingCount ?? 0;
  const synced = !offlineStatus || (offlineStatus.isOnline && pending === 0);
  const syncLabel = synced
    ? 'All changes saved'
    : offlineStatus!.isOnline ? `Syncing${pending ? ` ${pending}` : ''}…` : `Offline${pending ? ` · ${pending} queued` : ''}`;

  return (
    <header className="glass glass-blur rounded-2xl sticky top-2 md:top-3 z-40 overflow-visible mb-3 md:mb-5">
      <div className="px-3 py-2.5 md:px-5 md:py-3">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2.5 md:gap-5">
          <Link to={PATHS.home} aria-label="Orbit, home" className="flex-shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <ExpenseTrackerLogo className="h-7 md:h-8 w-auto text-app-text" />
          </Link>

          {/* Sync status: a dot when everything is saved, words when it isn't. */}
          <span
            role="status"
            aria-live="polite"
            title={synced ? 'Everything is saved to your account.' : offlineStatus!.isOnline ? 'Changes are syncing to the server.' : 'You are offline — new expenses are saved locally and will sync when you reconnect.'}
            className={`inline-flex items-center gap-1.5 flex-shrink-0 ${synced ? '' : `rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap ${offlineStatus!.isOnline ? 'bg-primary-soft text-primary' : 'bg-warn/15 text-warn'}`}`}
          >
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${synced ? 'bg-ok' : offlineStatus!.isOnline ? 'bg-primary animate-pulse' : 'bg-warn'}`} />
            <span className={synced ? 'sr-only' : ''}>{syncLabel}</span>
          </span>

          {/* 3. SEARCH */}
          <div ref={searchRef} className={`${phoneSearchOpen ? 'block' : 'hidden'} md:block relative order-last basis-full md:order-none md:basis-auto md:flex-1 md:max-w-xl`}>
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-4 w-4 md:h-5 md:w-5 text-app-faint" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search transactions…"
              aria-label="Search transactions"
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="search-results"
              aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
              autoComplete="off"
              value={searchInput}
              onChange={(e) => { updateSearch(e.target.value); setIsSearchOpen(true); }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-surface-2 border border-app-border rounded-xl py-2.5 pl-10 md:pl-11 pr-9 font-sans text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { updateSearch(''); setIsSearchOpen(false); }}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-app-faint hover:text-app-text transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )}

            {showDropdown && (
              <div
                className="absolute left-0 right-0 top-full mt-2 z-50 modal-surface rounded-2xl shadow-soft border border-app-border overflow-hidden"
              >
                {matches.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-app-muted text-center" role="status">
                    No transactions match “{searchInput.trim()}”.
                  </p>
                ) : (
                  // The list itself is the listbox and each row is an option
                  // (no nested buttons): the search box points at the active
                  // row via aria-activedescendant (4b).
                  <ul id="search-results" role="listbox" aria-label="Matching transactions" className="py-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {matches.map((hit, index) => {
                      const isExpense = hit.type === 'expense';
                      const active = index === activeIndex;
                      return (
                        <li
                          key={`${hit.type}-${hit.item.id}`}
                          role="option"
                          id={`search-result-${index}`}
                          aria-selected={active}
                          // onMouseDown (not onClick) so the selection fires before
                          // the input's blur/outside-click can close the dropdown.
                          onMouseDown={(e) => { e.preventDefault(); selectHit(hit); }}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
                        >
                            <span className={`grid place-items-center w-9 h-9 rounded-xl flex-shrink-0 ${isExpense ? 'bg-primary-soft text-primary' : 'bg-ok/15 text-ok'}`}>
                              {isExpense ? <TagIcon className="h-4 w-4" /> : <BanknotesIcon className="h-4 w-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-sm text-app-text truncate">{hit.item.title}</span>
                              <span className="flex items-center gap-2 mt-0.5 text-[11px] text-app-muted">
                                <span className="truncate">{hit.item.category}</span>
                                <span className="inline-flex items-center gap-1 flex-shrink-0">
                                  <CalendarDaysIcon className="h-3 w-3" /> {hit.item.date}
                                </span>
                              </span>
                            </span>
                            <span className={`font-display text-sm font-bold tabular-nums flex-shrink-0 ${isExpense ? 'text-app-text' : 'text-ok'}`}>
                              {isExpense ? '' : '+'}{formatCurrency(hit.item.amount, displayCurrency, conversionRate)}
                            </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 md:hidden" />
          <button
            type="button"
            onClick={() => setPhoneSearchOpen((o) => !o)}
            aria-label={phoneSearchOpen ? 'Close search' : 'Open search'}
            aria-expanded={phoneSearchOpen}
            className="md:hidden grid place-items-center w-10 h-10 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text transition-colors"
          >
            <MagnifyingGlassIcon className="h-5 w-5" />
          </button>
          <div className="hidden md:block flex-shrink-0 md:ml-auto">
            <AddMenu placement="header" onAddExpense={onAddExpense} onAddIncome={onAddIncome} onScanStatement={onScanStatement} />
          </div>
          <ProfileMenu
            email={userEmail}
            hideTuition={hideTuition}
            onToggleHideTuition={onToggleHideTuition}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
