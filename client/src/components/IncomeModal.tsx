import React, { useState, useEffect } from 'react';
import { Income } from '../types';
import { INCOME_CATEGORIES } from '../constants';
import { XMarkIcon } from './Icons';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (income: any) => void;
  income: Income | null;
  displayCurrency: 'USD' | 'INR';
}

const IncomeModal: React.FC<IncomeModalProps> = ({ isOpen, onClose, onSave, income, displayCurrency }) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [originalAmount, setOriginalAmount] = useState('');

  const [conversionRate, setConversionRate] = useState<number | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  
  const isAmountUSDReadOnly = selectedCurrency === 'INR';

  useEffect(() => {
    if (income) {
      setTitle(income.title);
      setAmount(income.amount.toString());
      setCategory(income.category);
      setDate(income.date);
      setNotes(income.notes || '');
      if (income.originalCurrency === 'INR' && income.originalAmount) {
        setSelectedCurrency('INR');
        setOriginalAmount(income.originalAmount.toString());
      } else {
        setSelectedCurrency('USD');
        setOriginalAmount('');
      }
    } else {
      setTitle('');
      setAmount('');
      setCategory(INCOME_CATEGORIES[0]);
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedCurrency(displayCurrency);
      setOriginalAmount('');
    }
     setConversionRate(null);
     setConversionLoading(false);
     setConversionError(null);
  }, [income, isOpen, displayCurrency]);

  useEffect(() => {
    const convert = async () => {
        if (selectedCurrency === 'INR' && originalAmount && parseFloat(originalAmount) > 0) {
            setConversionLoading(true);
            setConversionError(null);
            setConversionRate(null);
            try {
                const response = await fetch(`https://api.frankfurter.app/latest?from=INR&to=USD`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Could not fetch rate.');
                }
                const data = await response.json();
                if (data.rates && data.rates.USD) {
                    const rate = data.rates.USD;
                    setConversionRate(rate);
                    const usdAmount = parseFloat(originalAmount) * rate;
                    setAmount(usdAmount.toFixed(2));
                } else {
                    throw new Error(`Invalid currency code: INR`);
                }
            } catch (err: any) {
                setConversionError(err.message);
                setAmount('');
            } finally {
                setConversionLoading(false);
            }
        } else if (selectedCurrency === 'USD') {
            setConversionError(null);
            setConversionRate(null);
        }
    };
    
    const debounce = setTimeout(convert, 500);
    return () => clearTimeout(debounce);
  }, [selectedCurrency, originalAmount]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const primaryAmount = selectedCurrency === 'INR' ? originalAmount : amount;
    if (!title || !primaryAmount || parseFloat(primaryAmount) <= 0 || (isAmountUSDReadOnly && !amount)) {
      return;
    }

    const incomeData = {
      title,
      amount: parseFloat(amount),
      category,
      date,
      notes: notes.trim() || undefined,
      originalAmount: selectedCurrency === 'INR' && originalAmount ? parseFloat(originalAmount) : undefined,
      originalCurrency: selectedCurrency === 'INR' ? 'INR' : undefined,
    };
    
    if (income) {
      onSave({ ...incomeData, id: income.id });
    } else {
      onSave(incomeData);
    }
    onClose();
  };

  if (!isOpen) return null;

  const inputClasses = "mt-1 block w-full bg-base-200 dark:bg-dark-300 border border-base-300 dark:border-dark-100 rounded-md shadow-sm focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-base-content dark:text-base-200 px-3 py-2.5";
  
  const renderConversionStatus = () => {
    if (conversionLoading) return <p className="text-xs text-blue-500 mt-1">Converting...</p>;
    if (conversionError) return <p className="text-xs text-red-500 mt-1">{conversionError}</p>;
    if (conversionRate && selectedCurrency === 'INR') return <p className="text-xs text-green-600 dark:text-green-400 mt-1">Rate: 1 INR = {conversionRate.toFixed(4)} USD</p>;
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-base-100 dark:bg-dark-200 rounded-lg shadow-xl w-full max-w-md m-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-base-200 dark:border-dark-300 flex-shrink-0">
            <h2 className="text-xl font-bold text-base-content dark:text-base-100">{income ? 'Edit Income' : 'Add Income'}</h2>
            <button onClick={onClose} className="p-1 rounded-full text-base-content-secondary dark:text-base-300 hover:bg-base-200 dark:hover:bg-dark-300 transition-colors">
                <XMarkIcon className="h-6 w-6" />
            </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto">
          <div className="p-6 grid grid-cols-2 gap-x-4 gap-y-5">
              <div className="col-span-2">
                <label htmlFor="title" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Title</label>
                <input id="title" type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputClasses} required />
              </div>

              <div className="col-span-2">
                  <label className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Currency</label>
                  <div className="mt-1 grid grid-cols-2 gap-2 rounded-md bg-base-200 dark:bg-dark-300 p-1">
                      <button type="button" onClick={() => setSelectedCurrency('USD')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selectedCurrency === 'USD' ? 'bg-brand-primary text-white shadow' : 'text-base-content-secondary dark:text-base-300'}`}>USD</button>
                      <button type="button" onClick={() => setSelectedCurrency('INR')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selectedCurrency === 'INR' ? 'bg-brand-primary text-white shadow' : 'text-base-content-secondary dark:text-base-300'}`}>INR</button>
                  </div>
              </div>

              {selectedCurrency === 'INR' && (
                  <div className="col-span-2">
                      <label htmlFor="originalAmount" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Amount (INR)</label>
                      <input id="originalAmount" type="number" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} className={inputClasses} required min="0.01" step="0.01" placeholder='Amount in ₹' />
                  </div>
              )}
              
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Amount (USD)</label>
                <input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`${inputClasses} ${isAmountUSDReadOnly ? 'bg-base-300/50 dark:bg-dark-100/50 cursor-not-allowed' : ''}`} required readOnly={isAmountUSDReadOnly} min="0.01" step="0.01" placeholder='Amount in $' />
              </div>

              <div>
                <label htmlFor="date" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Date</label>
                <input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClasses} required />
              </div>
              
              <div className="col-span-2 -mt-3">{renderConversionStatus()}</div>

              <div className="col-span-2">
                <label htmlFor="category" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Category</label>
                <select id="category" value={category} onChange={e => setCategory(e.target.value)} className={inputClasses}>
                    {INCOME_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label htmlFor="notes" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Notes (Optional)</label>
                <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClasses} min-h-[80px]`} rows={3} />
              </div>
          </div>
          <div className="flex justify-end p-5 bg-base-200 dark:bg-dark-300 rounded-b-lg space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-base-100 dark:bg-dark-200 text-base-content dark:text-base-200 rounded-md hover:bg-base-300/70 dark:hover:bg-dark-100 border border-base-300 dark:border-dark-100 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-secondary transition-colors">{income ? 'Save Changes' : 'Add Income'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeModal;
