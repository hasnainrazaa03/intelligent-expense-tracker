import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expense, Category } from '../types';
import { suggestCategory } from '../services/categorySuggestionService';
import { CATEGORIES, PAYMENT_METHODS } from '../constants';
import { XMarkIcon, ChevronUpDownIcon, MagnifyingGlassIcon } from './Icons';
import { getCategoryColor } from '../utils/colorUtils';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: any) => void;
  expense: Expense | null;
  displayCurrency: 'USD' | 'INR';
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave, expense, displayCurrency }) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(''); // Always holds the USD value
  const [category, setCategory] = useState<Category>('Other');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [hasManuallySelectedCategory, setHasManuallySelectedCategory] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [originalAmount, setOriginalAmount] = useState(''); // Holds the INR value if selected
  const [isRecurring, setIsRecurring] = useState(false);

  const [conversionRate, setConversionRate] = useState<number|null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string|null>(null);
  
  const isAmountUSDReadOnly = selectedCurrency === 'INR';

  useEffect(() => {
    if (expense) {
      setTitle(expense.title);
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setDate(expense.date);
      setPaymentMethod(expense.paymentMethod || '');
      setNotes(expense.notes || '');
      setHasManuallySelectedCategory(true);
      setIsRecurring(expense.isRecurring || false);

      if (expense.originalCurrency === 'INR' && expense.originalAmount) {
        setSelectedCurrency('INR');
        setOriginalAmount(expense.originalAmount.toString());
      } else {
        setSelectedCurrency('USD');
        setOriginalAmount('');
      }
    } else { // New expense
      setTitle('');
      setAmount('');
      setCategory('Other');
      setDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('');
      setNotes('');
      setHasManuallySelectedCategory(false);
      setSelectedCurrency(displayCurrency);
      setOriginalAmount('');
      setIsRecurring(false);
    }
    setConversionRate(null);
    setConversionLoading(false);
    setConversionError(null);
  }, [expense, isOpen, displayCurrency]);

  useEffect(() => {
    if (!title.trim() || hasManuallySelectedCategory) {
      return;
    }

    const handler = setTimeout(() => {
      const suggested = suggestCategory(title);
      if (suggested) {
        setCategory(suggested);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [title, hasManuallySelectedCategory]);

  useEffect(() => {
    if (!expense && !title.trim()) {
      setCategory('Other');
    }
  }, [title, expense]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
                setAmount(''); // Clear USD amount on error
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

  const handleCategorySelect = (selectedCategory: Category) => {
    setCategory(selectedCategory);
    setHasManuallySelectedCategory(true);
    setIsCategoryDropdownOpen(false);
    setCategorySearchTerm('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const primaryAmount = selectedCurrency === 'INR' ? originalAmount : amount;
    if (!title || !primaryAmount || parseFloat(primaryAmount) <= 0 || (isAmountUSDReadOnly && !amount)) {
        // also check if USD amount is not calculated yet for INR
        return;
    }

    const expenseData = {
      title,
      amount: parseFloat(amount), // Amount is always in USD
      category,
      date,
      paymentMethod: paymentMethod.trim() || undefined,
      notes: notes.trim() || undefined,
      originalAmount: selectedCurrency === 'INR' && originalAmount ? parseFloat(originalAmount) : undefined,
      originalCurrency: selectedCurrency === 'INR' ? 'INR' : undefined,
      isRecurring,
    };
    
    if (expense) {
        onSave({ ...expenseData, id: expense.id });
    } else {
        onSave(expenseData);
    }
    onClose();
  };

  const filteredCategories = useMemo(() => {
    if (!categorySearchTerm.trim()) {
        return CATEGORIES;
    }
    const filtered: { [key: string]: string[] } = {};
    const lowerCaseSearch = categorySearchTerm.toLowerCase();

    for (const mainCategory in CATEGORIES) {
        const subcategories = CATEGORIES[mainCategory as keyof typeof CATEGORIES];
        const matchingSubcategories = subcategories.filter(sub => 
            sub.toLowerCase().includes(lowerCaseSearch)
        );
        if (matchingSubcategories.length > 0) {
            filtered[mainCategory] = matchingSubcategories;
        }
    }
    return filtered;
  }, [categorySearchTerm]);

  if (!isOpen) return null;

  const inputClasses = "mt-1 block w-full bg-base-200 dark:bg-dark-300 border border-base-300 dark:border-dark-100 rounded-md shadow-sm focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-base-content dark:text-base-200 px-3 py-2.5";
  const selectedCategoryColor = getCategoryColor(category);
  
  const renderConversionStatus = () => {
    if (conversionLoading) {
      return <p className="text-xs text-blue-500 mt-1">Converting...</p>;
    }
    if (conversionError) {
      return <p className="text-xs text-red-500 mt-1">{conversionError}</p>;
    }
    if (conversionRate && selectedCurrency === 'INR') {
      return <p className="text-xs text-green-600 dark:text-green-400 mt-1">Rate: 1 INR = {conversionRate.toFixed(4)} USD</p>;
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-base-100 dark:bg-dark-200 rounded-lg shadow-xl w-full max-w-md m-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-base-200 dark:border-dark-300 flex-shrink-0">
            <h2 className="text-xl font-bold text-base-content dark:text-base-100">{expense ? 'Edit Expense' : 'Add Expense'}</h2>
            <button onClick={onClose} className="p-1 rounded-full text-base-content-secondary dark:text-base-300 hover:bg-base-200 dark:hover:bg-dark-300 transition-colors">
                <XMarkIcon className="h-6 w-6" />
            </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto">
          <div className="p-6 grid grid-cols-2 gap-x-4 gap-y-5">
              <div className="col-span-2">
                <label htmlFor="title" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Title</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className={inputClasses}
                  required
                />
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
                        <input
                            id="originalAmount"
                            type="number"
                            value={originalAmount}
                            onChange={e => setOriginalAmount(e.target.value)}
                            className={inputClasses}
                            required
                            min="0.01"
                            step="0.01"
                            placeholder='Amount in ₹'
                        />
                    </div>
                )}
              
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Amount (USD)</label>
                  <input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className={`${inputClasses} ${isAmountUSDReadOnly ? 'bg-base-300/50 dark:bg-dark-100/50 cursor-not-allowed' : ''}`}
                    required
                    readOnly={isAmountUSDReadOnly}
                    min="0.01"
                    step="0.01"
                    placeholder='Amount in $'
                  />
                </div>

                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Date</label>
                  <input
                    id="date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className={inputClasses}
                    required
                  />
                </div>

                <div className="col-span-2 -mt-3">
                    {renderConversionStatus()}
                </div>

              <div className="col-span-2">
                <label htmlFor="category" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Category</label>
                 <div className="relative" ref={categoryDropdownRef}>
                    <button
                        type="button"
                        onClick={() => {
                          setIsCategoryDropdownOpen(prev => !prev);
                          if(isCategoryDropdownOpen) setCategorySearchTerm('');
                        }}
                        className={`${inputClasses} flex justify-between items-center text-left w-full`}
                    >
                        <span className="flex items-center">
                            <span className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0" style={{ backgroundColor: selectedCategoryColor }}></span>
                            <span className="truncate">{category}</span>
                        </span>
                        <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                    </button>
                    {isCategoryDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full bg-base-100 dark:bg-dark-300 shadow-lg rounded-md border border-base-300 dark:border-dark-100 max-h-60 overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-base-200 dark:border-dark-200 relative">
                                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-4 transform -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search categories..."
                                    value={categorySearchTerm}
                                    onChange={(e) => setCategorySearchTerm(e.target.value)}
                                    className="w-full bg-base-200 dark:bg-dark-200 border-transparent focus:border-brand-primary focus:ring-brand-primary rounded-md shadow-sm sm:text-sm text-base-content dark:text-base-200 pl-9 pr-3 py-2"
                                    autoFocus
                                />
                            </div>
                            <ul className="overflow-y-auto flex-grow">
                                {Object.keys(filteredCategories).length > 0 ? (
                                    Object.entries(filteredCategories).map(([mainCategory, subcategories]) => (
                                        <li key={mainCategory}>
                                            <div className="px-3 py-1.5 text-xs font-bold text-base-content-secondary dark:text-base-300 uppercase tracking-wider bg-base-200/50 dark:bg-dark-200/50">{mainCategory}</div>
                                            <ul>
                                                {subcategories.map(sub => (
                                                    <li
                                                        key={sub}
                                                        onClick={() => handleCategorySelect(sub)}
                                                        className="px-3 py-2 text-sm text-base-content dark:text-base-200 cursor-pointer hover:bg-base-200 dark:hover:bg-dark-200 flex items-center"
                                                    >
                                                        <span className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0" style={{ backgroundColor: getCategoryColor(sub) }}></span>
                                                        <span className="truncate">{sub}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))
                                ) : (
                                    <li className="px-3 py-4 text-sm text-center text-base-content-secondary dark:text-base-300">No categories found.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
              </div>
               <div className="col-span-2">
                <div className="flex items-center">
                    <input
                        id="recurring-checkbox"
                        type="checkbox"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                    />
                    <label htmlFor="recurring-checkbox" className="ml-2 block text-sm text-base-content-secondary dark:text-base-300">
                        Recurring Expense
                    </label>
                </div>
              </div>

              <div className="col-span-2">
                <label htmlFor="paymentMethod" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Payment Method (Optional)</label>
                <input
                  id="paymentMethod"
                  type="text"
                  list="payment-methods"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className={inputClasses}
                />
                <datalist id="payment-methods">
                  {(PAYMENT_METHODS as string[]).map(method => <option key={method} value={method} />)}
                </datalist>
              </div>
              <div className="col-span-2">
                <label htmlFor="notes" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Notes (Optional)</label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className={`${inputClasses} min-h-[80px]`}
                  rows={3}
                />
              </div>
          </div>
          <div className="flex justify-end p-5 bg-base-200 dark:bg-dark-300 rounded-b-lg space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-base-100 dark:bg-dark-200 text-base-content dark:text-base-200 rounded-md hover:bg-base-300/70 dark:hover:bg-dark-100 border border-base-300 dark:border-dark-100 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-secondary transition-colors">{expense ? 'Save Changes' : 'Add Expense'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;
