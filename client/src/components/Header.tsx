import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { ExpenseTrackerLogo } from './Branding';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { useTheme } from '../hooks/useTheme';
import { APP_CONFIG } from '../config';
import { Expense, Income } from '../types';
import { fuzzyMatch } from '../utils/fuzzySearch';
import { formatCurrency } from '../utils/currencyUtils';
import {
  MagnifyingGlassIcon,
  ArrowRightStartOnRectangleIcon,
  PencilIcon,
  TableCellsIcon,
  TagIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  ArrowDownTrayIcon,
  AcademicCapIcon
} from './Icons';
import { IconButton } from './ui';
import CurrencyPicker from './CurrencyPicker';
import { usePwaInstall } from '../hooks/usePwaInstall';

export type SearchHit =
  | { type: 'expense'; item: Expense }
  | { type: 'income'; item: Income };

interface HeaderProps {
  onLogout: () => void;
  onManageBudgets: () => void;
  onManageCategories: () => void;
  onDataAction: () => void;
  /** Opens the Settings page (currency, 2FA, sessions, data, account). */
  onOpenSettings: () => void;
  settingsActive: boolean;
  /** Hide tuition + tuition-loan from the Financial hub & Income summary. */
  hideTuition: boolean;
  onToggleHideTuition: () => void;
  onSearch: (query: string) => void;
  activeView: string;
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

// Wraps a header action so its purpose shows as a labelled tooltip on hover —
// the icon-only buttons were hard to identify at a glance.
/** The words for an icon button: on hover, and on keyboard focus so people who
 *  Tab through the header get them too. Hidden from screen readers, which read
 *  the button's own aria-label instead. */
const ActionTip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group/tip flex">
    {children}
    <span aria-hidden="true" className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg modal-surface px-2.5 py-1 text-[11px] font-medium text-app-text opacity-0 group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:opacity-100 transition-opacity duration-150 z-50 shadow-soft">
      {label}
    </span>
  </div>
);

const Header: React.FC<HeaderProps> = ({
  onLogout, onManageBudgets, onManageCategories, onDataAction, onOpenSettings, settingsActive, onSearch,
  hideTuition, onToggleHideTuition, offlineStatus, expenses, incomes, onSelectTransaction, clearSearchSignal = 0
}) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const { canInstall, promptInstall } = usePwaInstall();

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

  return (
    <header className="glass glass-blur rounded-2xl sticky top-2 md:top-3 z-40 overflow-visible mb-4 md:mb-6">
      <div className="p-3 md:p-5">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 md:gap-6">

          {/* 2. LOGO & MOBILE LOGOUT */}
          <div className="flex items-center justify-between w-full lg:w-auto">
            <div className="flex flex-col">
              <ExpenseTrackerLogo className="h-7 sm:h-8 md:h-9 w-auto text-app-text" />
              <p className="hidden md:block font-sans text-[11px] text-app-muted tracking-wide mt-0.5 ml-0.5">
                Expense Tracker
              </p>
            </div>

            {/* Mobile-Only Logout */}
            <button
              onClick={onLogout}
              aria-label="Logout"
              className="lg:hidden grid place-items-center w-10 h-10 rounded-xl bg-surface-2 border border-app-border text-danger hover:bg-danger/10 transition-colors"
              title="Log out"
            >
              <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>

          {/* 3. SEARCH */}
          <div ref={searchRef} className="relative w-full lg:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-4 w-4 md:h-5 md:w-5 text-app-faint" />
            </div>
            <input
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
              className="w-full bg-surface-2 border border-app-border rounded-xl py-2.5 md:py-3 pl-10 md:pl-11 pr-9 font-sans text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
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

          {/* 4. UTILITY CONTROLS (Row 3 on Mobile) */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-3">
              {/* Theme toggle (light / cosmic dark) */}
              <ActionTip label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-full bg-surface-2 border border-app-border text-app-muted hover:text-app-text transition-colors"
              >
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
                )}
              </button>
              </ActionTip>
              {/* Offline / pending-sync indicator */}
              {offlineStatus && (!offlineStatus.isOnline || offlineStatus.pendingCount > 0) && (
                <span
                  role="status"
                  aria-live="polite"
                  title={offlineStatus.isOnline ? 'Changes are syncing to the server.' : 'You are offline — new expenses are saved locally and will sync when you reconnect.'}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap ${offlineStatus.isOnline ? 'bg-primary-soft text-primary' : 'bg-warn/15 text-warn'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${offlineStatus.isOnline ? 'bg-primary animate-pulse' : 'bg-warn'}`} />
                  {offlineStatus.isOnline
                    ? `Syncing${offlineStatus.pendingCount ? ` ${offlineStatus.pendingCount}` : ''}…`
                    : `Offline${offlineStatus.pendingCount ? ` · ${offlineStatus.pendingCount} queued` : ''}`}
                </span>
              )}

              {/* Currency picker (searchable, any supported currency) */}
              <CurrencyPicker />

              {/* Action Buttons Group */}
              <div className="flex items-center gap-2">
                {canInstall && (
                  <ActionTip label="Install app">
                    <IconButton
                      onClick={() => { promptInstall(); }}
                      aria-label="Install Orbit app"
                      className="md:w-10 md:h-10 !bg-primary-soft !border-primary/40 !text-primary"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 md:h-5 md:w-5" />
                    </IconButton>
                  </ActionTip>
                )}
                <ActionTip label={hideTuition ? 'Tuition hidden everywhere — show' : 'Hide tuition (all charts & reports)'}>
                  <button
                    onClick={onToggleHideTuition}
                    aria-label={hideTuition ? 'Show tuition across summaries, charts and reports' : 'Hide tuition from summaries, charts and reports'}
                    aria-pressed={hideTuition}
                    className={`grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-colors ${hideTuition ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}
                  >
                    <AcademicCapIcon className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </ActionTip>
                <ActionTip label="Manage budgets">
                  <IconButton onClick={onManageBudgets} aria-label="Manage budgets" className="md:w-10 md:h-10">
                    <PencilIcon className="h-4 w-4 md:h-5 md:w-5" />
                  </IconButton>
                </ActionTip>
                <ActionTip label="Manage categories">
                  <IconButton onClick={onManageCategories} aria-label="Manage categories" className="md:w-10 md:h-10">
                    <TagIcon className="h-4 w-4 md:h-5 md:w-5" />
                  </IconButton>
                </ActionTip>
                <ActionTip label="Import / export">
                  <IconButton onClick={onDataAction} aria-label="Open data import and export" className="md:w-10 md:h-10">
                    <TableCellsIcon className="h-4 w-4 md:h-5 md:w-5" />
                  </IconButton>
                </ActionTip>
                {/* The gear used to switch two-factor sign-in on in one click; it
                    opens Settings now, where 2FA asks first. */}
                <ActionTip label="Settings">
                  <button
                    onClick={onOpenSettings}
                    aria-label="Settings"
                    aria-current={settingsActive ? 'page' : undefined}
                    className={`grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-colors ${settingsActive ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}
                  >
                    <Cog6ToothIcon className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </ActionTip>

                {/* Desktop-Only Logout */}
                <ActionTip label="Log out">
                  <button
                    onClick={onLogout}
                    aria-label="Logout"
                    className="hidden lg:grid place-items-center w-10 h-10 rounded-xl bg-surface-2 border border-app-border text-danger hover:bg-danger/10 transition-colors"
                  >
                    <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                  </button>
                </ActionTip>
              </div>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};

export default Header;