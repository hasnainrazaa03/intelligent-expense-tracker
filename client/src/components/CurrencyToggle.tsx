import React from 'react';

interface CurrencyToggleProps {
  currency: 'USD' | 'INR';
  onCurrencyChange: (currency: 'USD' | 'INR') => void;
}

const CurrencyToggle: React.FC<CurrencyToggleProps> = ({ currency, onCurrencyChange }) => {
  return (
    <div className="flex bg-surface-2 border border-app-border rounded-xl p-1 flex-shrink-0">
      {/* USD Button */}
      <button
        onClick={() => onCurrencyChange('USD')}
        className={`px-3 md:px-4 py-1.5 md:py-1 font-semibold text-[10px] md:text-xs rounded-lg transition-all duration-200 ${
          currency === 'USD'
            ? 'bg-primary text-on-primary shadow-glow'
            : 'text-app-muted hover:text-app-text'
        }`}
      >
        <span className="md:hidden">USD</span>
        <span className="hidden md:inline">USD$</span>
      </button>

      {/* INR Button */}
      <button
        onClick={() => onCurrencyChange('INR')}
        className={`px-3 md:px-4 py-1.5 md:py-1 font-semibold text-[10px] md:text-xs rounded-lg transition-all duration-200 ${
          currency === 'INR'
            ? 'bg-primary text-on-primary shadow-glow'
            : 'text-app-muted hover:text-app-text'
        }`}
      >
        <span className="md:hidden">INR</span>
        <span className="hidden md:inline">INR₹</span>
      </button>
    </div>
  );
};

export default CurrencyToggle;