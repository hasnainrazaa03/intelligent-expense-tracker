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

// --- WHIMSICAL COMPONENT: THE TRACKING EYES ---
const TrojanEyes = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 12;
      const y = (e.clientY / window.innerHeight - 0.5) * 12;
      setMousePos({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="flex space-x-2 bg-ink p-2 border-2 border-usc-gold shadow-[4px_4px_0px_0px_#990000]">
      {[1, 2].map((i) => (
        <div key={i} className="w-6 h-6 bg-bone rounded-full relative overflow-hidden border-2 border-ink">
          <div 
            className="w-3 h-3 bg-ink rounded-full absolute transition-transform duration-75 ease-out"
            style={{ 
              top: '50%', left: '50%',
              transform: `translate(calc(-50% + ${mousePos.x}px), calc(-50% + ${mousePos.y}px))` 
            }}
          />
        </div>
      ))}
    </div>
  );
};

const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave, expense, displayCurrency }) => {
  // --- CORE STATE (PRESERVED) ---
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(''); 
  const [category, setCategory] = useState<Category>(expense?.category || 'Miscellaneous');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [hasManuallySelectedCategory, setHasManuallySelectedCategory] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [originalAmount, setOriginalAmount] = useState(''); 
  const [isRecurring, setIsRecurring] = useState(false);

  const [conversionRate, setConversionRate] = useState<number|null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string|null>(null);
  
  const isAmountUSDReadOnly = selectedCurrency === 'INR';

  // --- LOGIC: INITIALIZATION ---
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
    } else {
      setTitle(''); setAmount(''); setCategory('Other');
      setDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod(''); setNotes('');
      setHasManuallySelectedCategory(false);
      setSelectedCurrency(displayCurrency);
      setOriginalAmount(''); setIsRecurring(false);
    }
    setConversionRate(null); setConversionLoading(false); setConversionError(null);
  }, [expense, isOpen, displayCurrency]);

  useEffect(() => {
    // Reset the other amount field when switching to avoid confusion
    if (selectedCurrency === 'USD') {
      setOriginalAmount('');
    } else {
      // If we have an amount but no originalAmount when switching to INR
      if (amount && !originalAmount) {
        // Logic to reverse convert could go here, but usually, 
        // users prefer starting fresh for a foreign currency entry.
      }
    }
  }, [selectedCurrency]);

  // --- LOGIC: AUTO-CATEGORY SUGGESTION ---
  useEffect(() => {
  // If the user hasn't touched the category yet and there's a title...
  if (!hasManuallySelectedCategory && title.trim()) {
    const suggested = suggestCategory(title);
    if (suggested) {
      setCategory(suggested);
    }
  }
}, [title, hasManuallySelectedCategory]);

  useEffect(() => {
    if (!expense && !title.trim()) {
      setCategory('Other');
      setHasManuallySelectedCategory(false); 
    }
  }, [title, expense]);

  // --- LOGIC: CLICK OUTSIDE ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- LOGIC: CURRENCY CONVERSION ---
  useEffect(() => {
    const convert = async () => {
        if (selectedCurrency === 'INR' && originalAmount && parseFloat(originalAmount) > 0) {
            setConversionLoading(true);
            setConversionError(null);
            try {
                const response = await fetch(`https://api.frankfurter.app/latest?from=INR&to=USD`);
                if (!response.ok) throw new Error('FETCH_ERROR');
                const data = await response.json();
                if (data.rates && data.rates.USD) {
                    const rate = data.rates.USD;
                    setConversionRate(rate);
                    setAmount((parseFloat(originalAmount) * rate).toFixed(2));
                }
            } catch (err: any) {
                setConversionError("SYNC_FAILED");
                setAmount('');
            } finally {
                setConversionLoading(false);
            }
        }
    };
    const debounce = setTimeout(convert, 500);
    return () => clearTimeout(debounce);
  }, [selectedCurrency, originalAmount]);

  // --- HANDLERS ---
  const handleCategorySelect = (selectedCategory: Category) => {
    setCategory(selectedCategory);
    setHasManuallySelectedCategory(true);
    setIsCategoryDropdownOpen(false);
    setCategorySearchTerm('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Ensure we have the necessary numeric data
    const finalAmount = parseFloat(amount);
    if (!title || isNaN(finalAmount) || finalAmount <= 0) return;

    const expenseData = {
      title: title.trim(),
      amount: finalAmount,
      category,
      date,
      paymentMethod: paymentMethod.trim() || 'CASH', // Default to cash if empty
      notes: notes.trim() || undefined,
      originalAmount: selectedCurrency === 'INR' ? parseFloat(originalAmount) : undefined,
      originalCurrency: selectedCurrency === 'INR' ? 'INR' : 'USD',
      isRecurring,
    };
    
    onSave(expense ? { ...expenseData, id: expense.id } : expenseData);
    onClose();
  };

  const filteredCategories = useMemo<Record<string, string[]>>(() => {
    const categoriesObj = CATEGORIES as Record<string, string[]>;
    if (!categorySearchTerm.trim()) return categoriesObj;

    const filtered: Record<string, string[]> = {};
    const lowerCaseSearch = categorySearchTerm.toLowerCase();

    for (const mainCategory in categoriesObj) {
      const subcategories = categoriesObj[mainCategory];
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

  // --- STYLING CONSTANTS ---
  const inputBase = "w-full bg-white border-4 border-ink p-4 font-loud text-base text-ink focus:outline-none focus:ring-4 focus:ring-usc-gold transition-all placeholder:text-ink/10 min-h-[56px] appearance-none";
  const labelBase = "font-loud text-[10px] tracking-widest text-ink/40 mb-2 block uppercase leading-none antialiased";
  
  return (
    <div className="fixed inset-0 bg-ink/90 backdrop-blur-md z-[100] flex justify-center items-center p-4">
      <div className="bg-bone border-4 border-ink shadow-neo-gold w-full max-w-xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* HEADER STAMP */}
        <div className="bg-usc-cardinal p-4 sm:p-6 border-b-4 border-ink flex justify-between items-center flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="font-loud text-xl sm:text-3xl text-bone leading-none uppercase truncate">
                {expense ? 'UPDATE_MANIFEST' : 'INITIALIZE_ENTRY'}
            </h2>
            <div className="flex items-center mt-1 sm:mt-2">
              <span className="bg-ink text-usc-gold px-1.5 py-0.5 text-[7px] sm:text-[8px] font-bold border border-ink">v4.0_SECURE</span>
              <span className="ml-2 text-[7px] sm:text-[8px] font-mono text-bone/40 uppercase tracking-widest leading-none hidden xs:inline">AUTO_SYNC: ON</span>
          </div>
        </div>
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            <div className="scale-75 sm:scale-100 origin-right">
              <TrojanEyes />
            </div>
            <button onClick={onClose} className="bg-ink text-bone p-1 border-2 border-bone hover:bg-bone hover:text-ink transition-colors">
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto p-4 sm:p-8">
          <div className="flex flex-col space-y-8">
            
            {/* Title */}
            <div>
              <label className={labelBase}>TRANSACTION_TITLE</label>
              <input 
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Eg. USC_VILLAGE" 
                className={inputBase} required 
              />
            </div>

            {/* Currency Segmented Control */}
            <div>
              <label className={labelBase}>CURRENCY_FILTER</label>
              <div className="grid grid-cols-2 bg-ink border-4 border-ink p-1">
                  <button type="button" onClick={() => setSelectedCurrency('USD')} className={`py-3 font-loud text-[10px] sm:text-xs transition-all ${selectedCurrency === 'USD' ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}>USD_($)</button>
                  <button type="button" onClick={() => setSelectedCurrency('INR')} className={`py-3 font-loud text-[10px] sm:text-xs transition-all ${selectedCurrency === 'INR' ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}>INR_(₹)</button>
              </div>
          </div>

            {/* Conditional INR Input */}
            {selectedCurrency === 'INR' && (
              <div className="bg-usc-gold border-4 border-ink p-4 relative overflow-hidden">
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-bone border-r-4 border-ink rounded-full" />
                
                <label className={`${labelBase} text-ink/60`}>FOREIGN_EXCHANGE_ENTRY (INR)</label>
                <div className="flex items-center gap-3">
                  <span className="font-loud text-2xl">₹</span>
                  <input 
                    type="number" 
                    value={originalAmount} 
                    onChange={e => setOriginalAmount(e.target.value)}
                    placeholder="0.00" 
                    className="w-full bg-bone border-4 border-ink p-3 font-loud text-lg focus:outline-none" 
                    required min="0.01" step="0.01"
                  />
                </div>
                <p className="mt-2 font-mono text-[9px] text-ink/60 uppercase">System will auto-calculate USD equivalent via Frankfurter_API</p>
              </div>
            )}

            {/* USD Amount */}
            <div>
              <label className={labelBase}>TOTAL_USD_VALUE</label>
              <div className="relative">
                  <input 
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00" 
                    className={`${inputBase} ${isAmountUSDReadOnly ? 'bg-ink/5' : ''}`} 
                    required readOnly={isAmountUSDReadOnly} min="0.01" step="0.01"
                  />
                  {conversionLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-usc-gold border-t-transparent rounded-full" />}
              </div>
              {conversionError && <p className="text-[10px] text-usc-cardinal font-bold mt-1 uppercase italic">{conversionError}</p>}
              {conversionRate && selectedCurrency === 'INR' && (
                  <p className="text-[9px] font-mono mt-1 opacity-50">FX: 1 INR = {conversionRate.toFixed(4)} USD</p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className={labelBase}>TIMESTAMP_ENTRY</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputBase} required />
            </div>

            {/* Category Dropdown (Neo-Brutalist Rebuild) */}
            <div className="col-span-2">
              <label className={labelBase}>CLASSIFICATION</label>
              <div className="relative" ref={categoryDropdownRef}>
                <button
                    type="button"
                    onClick={() => { setIsCategoryDropdownOpen(!isCategoryDropdownOpen); setCategorySearchTerm(''); }}
                    className={`${inputBase} flex justify-between items-center text-left`}
                >
                    <div className="flex items-center uppercase overflow-hidden">
                        <div className="w-3 h-3 border-2 border-ink mr-3 flex-shrink-0" style={{ backgroundColor: getCategoryColor(category) }}></div>
                        <span className="truncate">{category}</span>
                    </div>
                    <ChevronUpDownIcon className="h-5 w-5 text-ink/30" />
                </button>
                
                {isCategoryDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full bg-bone border-4 border-ink shadow-neo overflow-hidden flex flex-col max-h-64">
                      <div className="p-3 border-b-4 border-ink bg-white sticky top-0">
                          <input
                              type="text" placeholder="SEARCH_CATEGORIES..." value={categorySearchTerm}
                              onChange={(e) => setCategorySearchTerm(e.target.value)}
                              className="w-full bg-bone border-2 border-ink p-2 text-xs font-loud focus:outline-none"
                              autoFocus
                          />
                      </div>
                      <div className="overflow-y-auto bg-white">
                          {(Object.entries(filteredCategories) as [string, string[]][]).map(([main, subs]) => (
                              <div key={main}>
                                  <div className="px-3 py-1 text-[9px] font-loud bg-ink text-bone uppercase">{main}</div>
                                  {subs.map(sub => (
                                      <div
                                          key={sub} onClick={() => handleCategorySelect(sub)}
                                          className="px-4 py-2 text-xs font-bold text-ink hover:bg-usc-gold cursor-pointer flex items-center transition-colors border-b border-ink/5"
                                      >
                                          <div className="w-2 h-2 border border-ink mr-3" style={{ backgroundColor: getCategoryColor(sub) }}></div>
                                          {sub.toUpperCase()}
                                      </div>
                                  ))}
                              </div>
                          ))}
                      </div>
                  </div>
              )}
              </div>
            </div>

            {/* Recurring & Payment */}
            <div className="col-span-1 flex items-center">
                <label className="flex items-center cursor-pointer group">
                    <div className="relative">
                        <input 
                            type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)}
                            className="sr-only" 
                        />
                        <div className={`w-10 h-6 border-4 border-ink transition-colors ${isRecurring ? 'bg-usc-gold' : 'bg-bone'}`}></div>
                        <div className={`absolute top-1 left-1 w-2 h-2 bg-ink transition-transform ${isRecurring ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                    <span className="ml-3 font-loud text-[10px] uppercase">RECURRING_TX</span>
                </label>
            </div>

            <div className="col-span-1">
                <label className={labelBase}>PAYMENT_METHOD</label>
                <input 
                    list="methods" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                    placeholder="TYPE..." className={inputBase}
                />
                <datalist id="methods">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m} />)}
                </datalist>
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className={labelBase}>TECHNICAL_NOTES</label>
              <textarea 
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="INPUT_ADDITIONAL_METADATA..." className={`${inputBase} h-24 resize-none`}
              />
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t-4 border-dashed border-ink/10 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:col-span-2">
            <button 
              type="button" onClick={onClose}
              className="w-full sm:flex-1 py-3 sm:py-4 font-loud text-xs sm:text-sm border-4 border-ink bg-white text-ink shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all order-2 sm:order-1"
            >
              ABORT_MANIFEST
            </button>
            <button 
              type="submit"
              className="w-full sm:flex-1 py-3 sm:py-4 font-loud text-xs sm:text-sm border-4 border-ink bg-usc-gold text-ink shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all order-1 sm:order-2"
            >
              COMMIT_RECORD
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;