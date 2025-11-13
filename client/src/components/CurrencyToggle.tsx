import React from 'react';

interface CurrencyToggleProps {
  currency: 'USD' | 'INR';
  onCurrencyChange: (currency: 'USD' | 'INR') => void;
}

const CurrencyToggle: React.FC<CurrencyToggleProps> = ({ currency, onCurrencyChange }) => {
  const handleToggle = () => {
    onCurrencyChange(currency === 'USD' ? 'INR' : 'USD');
  };

  return (
    <button
      onClick={handleToggle}
      className="flex items-center space-x-2 px-3 py-2 text-sm font-semibold text-brand-primary bg-brand-primary/10 dark:bg-brand-primary/20 rounded-md hover:bg-brand-primary/20 dark:hover:bg-brand-primary/30 transition-colors"
      aria-label="Toggle currency"
    >
      <span>{currency}</span>
      <span className="font-normal">{currency === 'USD' ? '$' : '₹'}</span>
    </button>
  );
};

export default CurrencyToggle;
