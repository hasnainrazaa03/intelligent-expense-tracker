import React from 'react';
import { WalletIcon, ArrowRightStartOnRectangleIcon, Cog6ToothIcon, MagnifyingGlassIcon, XMarkIcon, ArrowDownTrayIcon } from './Icons';
import ThemeToggle from './ThemeToggle';
import CurrencyToggle from './CurrencyToggle';

interface HeaderProps {
    onLogout: () => void;
    onManageBudgets: () => void;
    onDataAction: () => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    activeView: string;
    displayCurrency: 'USD' | 'INR';
    onCurrencyChange: (currency: 'USD' | 'INR') => void;
}

const Header: React.FC<HeaderProps> = ({ onLogout, onManageBudgets, onDataAction, searchQuery, setSearchQuery, activeView, displayCurrency, onCurrencyChange }) => {
  return (
    <header className="bg-base-100 dark:bg-dark-200 shadow-md">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center">
            <WalletIcon className="h-8 w-8 text-brand-primary" />
            <h1 className="ml-3 text-xl sm:text-2xl font-bold text-base-content dark:text-base-100 tracking-tight">
                <span className="hidden sm:inline">Intelligent </span>
                Expense Tracker
            </h1>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4">
            {(activeView === 'expenses' || activeView === 'income') && (
              <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <MagnifyingGlassIcon className="h-5 w-5 text-base-content-secondary dark:text-base-300" />
                  </span>
                  <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-28 sm:w-48 lg:w-64 bg-base-200 dark:bg-dark-300 border-transparent focus:border-brand-primary focus:ring-brand-primary rounded-md shadow-sm text-sm text-base-content dark:text-base-200 pl-10 pr-8 py-2 transition-all duration-300 focus:w-40 sm:focus:w-56 lg:focus:w-72"
                  />
                  {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-3 group">
                          <XMarkIcon className="h-5 w-5 text-base-content-secondary dark:text-base-300 group-hover:text-base-content dark:group-hover:text-base-100" />
                      </button>
                  )}
              </div>
            )}
            <CurrencyToggle currency={displayCurrency} onCurrencyChange={onCurrencyChange} />
            <ThemeToggle />
             <button
              onClick={onManageBudgets}
              className="hidden sm:flex items-center space-x-2 px-3 py-2 text-sm text-base-content-secondary dark:text-base-300 hover:bg-base-200 dark:hover:bg-dark-300 rounded-md transition-colors"
              aria-label="Manage Budgets"
            >
              <Cog6ToothIcon className="h-5 w-5" />
              <span className="hidden md:inline">Manage Budgets</span>
            </button>
            <button
              onClick={onDataAction}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-base-content-secondary dark:text-base-300 hover:bg-base-200 dark:hover:bg-dark-300 rounded-md transition-colors"
              aria-label="Export or Import Data"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span className="hidden md:inline">Export / Import</span>
            </button>
            <button
            onClick={onLogout}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-base-content-secondary dark:text-base-300 hover:bg-base-200 dark:hover:bg-dark-300 rounded-md transition-colors"
            aria-label="Logout"
            >
            <span className="hidden md:inline">Logout</span>
            <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
            </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
