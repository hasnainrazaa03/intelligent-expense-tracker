import React, { useState, useEffect } from 'react';
import { useCurrency } from '../contexts/CurrencyContext';
import { ExpenseTrackerLogo } from './Branding';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { useTheme } from '../hooks/useTheme';
import { APP_CONFIG } from '../config';
import {
  MagnifyingGlassIcon,
  ArrowRightStartOnRectangleIcon, 
  PencilIcon,
  TableCellsIcon,
  TagIcon,
  Cog6ToothIcon
} from './Icons';

interface HeaderProps {
  onLogout: () => void;
  onManageBudgets: () => void;
  onManageCategories: () => void;
  onDataAction: () => void;
  onToggleTwoFactor: () => void;
  twoFactorEnabled: boolean;
  onSearch: (query: string) => void;
  activeView: string;
}

const Header: React.FC<HeaderProps> = ({
  onLogout, onManageBudgets, onManageCategories, onDataAction, onToggleTwoFactor, twoFactorEnabled, onSearch
}) => {
  const { displayCurrency, setDisplayCurrency } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Raw search input is owned here and debounced locally, so keystrokes re-render
  // only the Header — not the whole app (APP-H5).
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, APP_CONFIG.searchDebounceMs);
  useEffect(() => {
    onSearch(debouncedSearch);
  }, [debouncedSearch, onSearch]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="glass glass-blur rounded-2xl sticky top-2 md:top-3 z-40 overflow-hidden mb-4 md:mb-6">
      {/* 1. STATUS BAR (subtle) */}
      <div className="hidden sm:flex text-app-faint py-1.5 px-5 justify-between items-center border-b border-app-border">
        <div className="flex gap-4 font-mono text-[9px] tracking-[0.25em] uppercase">
          <span>Orbit</span>
          <span className="hidden md:inline text-app-faint/70">Encrypted · Bank-level security</span>
        </div>
        <div className="font-mono text-[9px] tracking-[0.25em] text-primary">{currentTime}</div>
      </div>

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
          <div className="relative w-full lg:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-4 w-4 md:h-5 md:w-5 text-app-faint" />
            </div>
            <input
              type="text"
              placeholder="Search transactions…"
              aria-label="Search transactions"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-surface-2 border border-app-border rounded-xl py-2.5 md:py-3 pl-10 md:pl-11 pr-4 font-sans text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>

          {/* 4. UTILITY CONTROLS (Row 3 on Mobile) */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-3">
              {/* Theme toggle (light / cosmic dark) */}
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-full bg-surface-2 border border-app-border text-app-muted hover:text-app-text transition-colors"
              >
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
                )}
              </button>
              {/* Currency Switcher */}
              <div className="flex bg-surface-2 border border-app-border rounded-xl p-1">
                <button
                  onClick={() => setDisplayCurrency('USD')}
                  aria-label="Display currency USD"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${displayCurrency === 'USD' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
                >
                  USD
                </button>
                <button
                  onClick={() => setDisplayCurrency('INR')}
                  aria-label="Display currency INR"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${displayCurrency === 'INR' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
                >
                  INR
                </button>
              </div>

              {/* Action Buttons Group */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onManageBudgets}
                  aria-label="Manage budgets"
                  className="grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
                  title="Manage budgets"
                >
                  <PencilIcon className="h-4 w-4 md:h-5 md:w-5" />
                </button>
                <button
                  onClick={onManageCategories}
                  aria-label="Manage categories"
                  className="grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
                  title="Manage categories"
                >
                  <TagIcon className="h-4 w-4 md:h-5 md:w-5" />
                </button>
                <button
                  onClick={onDataAction}
                  aria-label="Open data import and export"
                  className="grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
                  title="Import / export"
                >
                  <TableCellsIcon className="h-4 w-4 md:h-5 md:w-5" />
                </button>
                <button
                  onClick={onToggleTwoFactor}
                  aria-label="Toggle optional two factor authentication"
                  className={`grid place-items-center w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-colors ${twoFactorEnabled ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}
                  title={twoFactorEnabled ? 'Two-factor: on' : 'Two-factor: off'}
                >
                  <Cog6ToothIcon className="h-4 w-4 md:h-5 md:w-5" />
                </button>

                {/* Desktop-Only Logout */}
                <button
                  onClick={onLogout}
                  aria-label="Logout"
                  className="hidden lg:grid place-items-center w-10 h-10 rounded-xl bg-surface-2 border border-app-border text-danger hover:bg-danger/10 transition-colors"
                  title="Log out"
                >
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};

export default Header;