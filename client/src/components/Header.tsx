import React, { useState, useEffect } from 'react';
import trojanLogo from '../../public/trojan-logo.png';
import { ExpenseTrackerLogo } from './Branding';
import ThemeToggle from './ThemeToggle';
import { 
  WalletIcon, 
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
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeView: string;
  displayCurrency: 'USD' | 'INR';
  onCurrencyChange: (currency: 'USD' | 'INR') => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onLogout, onManageBudgets, onManageCategories, onDataAction, onToggleTwoFactor, twoFactorEnabled, searchQuery, 
  setSearchQuery, displayCurrency, onCurrencyChange
}) => {
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="border-b-4 md:border-b-8 border-ink bg-bone sticky top-0 z-40 overflow-hidden">
      {/* 1. STATUS BAR (Hidden on Mobile for vertical space) */}
      <div className="hidden sm:flex bg-ink text-bone py-1 px-4 justify-between items-center overflow-hidden">
        <div className="flex gap-4 font-mono text-[8px] tracking-[0.3em] uppercase opacity-70">
          <span>SYSTEM: USC_MAIN_CORE</span>
          <span className="hidden md:inline">ENCRYPTION: AES_256</span>
          <span className="hidden md:inline">STATUS: LOGGED_IN</span>
        </div>
        <div className="font-mono text-[8px] tracking-[0.3em] text-usc-gold">
          {currentTime}
        </div>
      </div>

      <div className="p-3 md:p-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 md:gap-6">
          
          {/* 2. LOGO & MOBILE LOGOUT (Row 1 on Mobile) */}
          <div className="flex items-center justify-between w-full lg:w-auto">
            <div className="flex items-center group">
              <div className="bg-usc-cardinal p-1.5 md:p-2 border-2 md:border-4 border-ink shadow-neo transition-transform group-hover:rotate-6">
                <img 
                  src={trojanLogo} 
                  alt="USC Trojan" 
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className="h-8 w-8 md:h-10 md:w-10 object-contain" 
                />
              </div>
              <div className="ml-2 md:ml-3 flex-shrink-0">
                {/*<h1 className="font-loud text-xl md:text-4xl text-ink leading-none tracking-tighter uppercase">
                  EXPENSE_TRACKER
                </h1>*/}
                <ExpenseTrackerLogo className="h-7 sm:h-10 md:h-14 w-auto" />
                <p className="hidden md:block font-loud text-[10px] text-usc-cardinal tracking-widest mt-1 uppercase">
                  USC_FINANCIAL_ARCHITECTURE
                </p>
              </div>
            </div>

            {/* Mobile-Only Logout Button to save space in the bottom row */}
            <button 
              onClick={onLogout}
              aria-label="Logout"
              className="lg:hidden bg-usc-cardinal border-2 border-ink p-2 shadow-neo text-bone active:translate-y-0.5 transition-all"
              title="LOGOUT"
            >
              <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>

          {/* 3. SEARCH BAR (Row 2 on Mobile - Full Width) */}
          <div className="relative w-full lg:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 md:pl-4 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-4 w-4 md:h-5 md:w-5 text-ink/30" />
            </div>
            <input
              type="text"
              placeholder="SEARCH_MANIFEST..."
              aria-label="Search transactions"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border-2 md:border-4 border-ink p-3 md:p-4 pl-10 md:pl-12 font-loud text-xs md:text-sm text-ink focus:outline-none focus:ring-4 focus:ring-usc-gold shadow-neo-gold placeholder:text-ink/40"
            />
          </div>

          {/* 4. UTILITY CONTROLS (Row 3 on Mobile) */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-3">
              {/* Currency Switcher */}
              <div className="flex bg-ink border-2 md:border-4 border-ink p-0.5 md:p-1 shadow-neo-gold">
                <button 
                  onClick={() => onCurrencyChange('USD')}
                  aria-label="Display currency USD"
                  className={`px-3 py-1 font-loud text-[10px] transition-all ${displayCurrency === 'USD' ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}
                >
                  USD$
                </button>
                <button 
                  onClick={() => onCurrencyChange('INR')}
                  aria-label="Display currency INR"
                  className={`px-3 py-1 font-loud text-[10px] transition-all ${displayCurrency === 'INR' ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}
                >
                  INR₹
                </button>
              </div>

              {/* Action Buttons Group */}
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button 
                  onClick={onManageBudgets}
                  aria-label="Manage budgets"
                  className="bg-bone border-2 md:border-4 border-ink p-2 shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                  title="MANAGE_BUDGETS"
                >
                  <PencilIcon className="h-4 w-4 md:h-6 md:w-6 text-ink" />
                </button>
                <button 
                  onClick={onManageCategories}
                  aria-label="Manage categories"
                  className="bg-bone border-2 md:border-4 border-ink p-2 shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                  title="MANAGE_CATEGORIES"
                >
                  <TagIcon className="h-4 w-4 md:h-6 md:w-6 text-ink" />
                </button>
                <button 
                  onClick={onDataAction}
                  aria-label="Open data import and export"
                  className="bg-bone border-2 md:border-4 border-ink p-2 shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                  title="DATA_TERMINAL"
                >
                  <TableCellsIcon className="h-4 w-4 md:h-6 md:w-6 text-ink" />
                </button>
                <button
                  onClick={onToggleTwoFactor}
                  aria-label="Toggle optional two factor authentication"
                  className={`border-2 md:border-4 border-ink p-2 shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all ${twoFactorEnabled ? 'bg-usc-cardinal text-bone' : 'bg-bone text-ink'}`}
                  title={twoFactorEnabled ? '2FA_ON' : '2FA_OFF'}
                >
                  <Cog6ToothIcon className="h-4 w-4 md:h-6 md:w-6" />
                </button>
                
                {/* Desktop-Only Logout Button */}
                <button 
                  onClick={onLogout}
                  aria-label="Logout"
                  className="hidden lg:block bg-usc-cardinal border-2 md:border-4 border-ink p-2 shadow-neo text-bone hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                  title="LOGOUT"
                >
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 md:h-6 md:w-6" />
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