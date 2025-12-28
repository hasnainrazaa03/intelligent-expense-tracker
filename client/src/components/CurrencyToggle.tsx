import React from 'react';

interface CurrencyToggleProps {
  currency: 'USD' | 'INR';
  onCurrencyChange: (currency: 'USD' | 'INR') => void;
}

const CurrencyToggle: React.FC<CurrencyToggleProps> = ({ currency, onCurrencyChange }) => {
  return (
    <div className="flex bg-ink border-[3px] md:border-4 border-ink p-1 shadow-neo flex-shrink-0">
      {/* USD Button */}
      <button 
        onClick={() => onCurrencyChange('USD')}
        className={`px-3 md:px-4 py-1.5 md:py-1 font-loud text-[10px] md:text-xs transition-all duration-200 ${
          currency === 'USD' 
            ? 'bg-usc-gold text-ink' 
            : 'text-bone hover:bg-white/10'
        }`}
      >
        <span className="md:hidden">USD</span>
        <span className="hidden md:inline">USD$</span>
      </button>

      {/* INR Button */}
      <button 
        onClick={() => onCurrencyChange('INR')}
        className={`px-3 md:px-4 py-1.5 md:py-1 font-loud text-[10px] md:text-xs transition-all duration-200 ${
          currency === 'INR' 
            ? 'bg-usc-gold text-ink' 
            : 'text-bone hover:bg-white/10'
        }`}
      >
        <span className="md:hidden">INR</span>
        <span className="hidden md:inline">INR₹</span>
      </button>
    </div>
  );
};

export default CurrencyToggle;