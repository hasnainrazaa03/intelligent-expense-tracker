import React, { useState, useEffect, useMemo } from 'react';
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

  const [hasManuallySelectedCategory, setHasManuallySelectedCategory] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const categoryDropdownRef = React.useRef<HTMLDivElement>(null);

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
    setConversionError(null);
  }, [income, isOpen, displayCurrency]);

  useEffect(() => {
    const convert = async () => {
        if (selectedCurrency === 'INR' && originalAmount && parseFloat(originalAmount) > 0) {
            setConversionLoading(true);
            setConversionError(null);
            try {
                const response = await fetch(`https://api.frankfurter.app/latest?from=INR&to=USD`);
                if (!response.ok) throw new Error('SYNC_ERROR');
                const data = await response.json();
                if (data.rates && data.rates.USD) {
                    const rate = data.rates.USD;
                    setConversionRate(rate);
                    setAmount((parseFloat(originalAmount) * rate).toFixed(2));
                }
            } catch (err: any) {
                setConversionError("CONVERSION_FAILED");
            } finally {
                setConversionLoading(false);
            }
        }
    };
    const debounce = setTimeout(convert, 500);
    return () => clearTimeout(debounce);
  }, [selectedCurrency, originalAmount]);

  // Filter logic for the advanced dropdown
  const filteredCategories = useMemo(() => {
    if (!categorySearchTerm.trim()) return INCOME_CATEGORIES;
    return INCOME_CATEGORIES.filter(cat => 
      cat.toLowerCase().includes(categorySearchTerm.toLowerCase())
    );
  }, [categorySearchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCategorySelect = (selectedCategory: string) => {
    setCategory(selectedCategory);
    setHasManuallySelectedCategory(true);
    setIsCategoryDropdownOpen(false);
    setCategorySearchTerm('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const primaryAmount = selectedCurrency === 'INR' ? originalAmount : amount;
    if (!title || !primaryAmount || parseFloat(primaryAmount) <= 0 || (isAmountUSDReadOnly && !amount)) return;

    const incomeData = {
      title: title.trim(),
      amount: parseFloat(amount),
      category,
      date,
      notes: notes.trim() || undefined,
      originalAmount: selectedCurrency === 'INR' && originalAmount ? parseFloat(originalAmount) : undefined,
      originalCurrency: selectedCurrency === 'INR' ? 'INR' : 'USD',
    };
    
    onSave(income ? { ...incomeData, id: income.id } : incomeData);
    onClose();
  };

  if (!isOpen) return null;

  const inputBase = "w-full bg-white border-4 border-ink p-4 font-loud text-base text-ink focus:outline-none focus:ring-4 focus:ring-usc-gold transition-all placeholder:text-ink/10 min-h-[56px]";
  const labelBase = "font-loud text-[10px] tracking-widest text-ink/40 mb-2 block uppercase leading-none antialiased";

  return (
    <div className="fixed inset-0 bg-ink/90 backdrop-blur-md z-[100] flex justify-center items-center p-4">
      <div className="bg-bone border-4 border-ink shadow-neo-gold w-full max-w-xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* HEADER STAMP: REVENUE CONTROL */}
        <div className="bg-usc-gold p-6 border-b-4 border-ink flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="font-loud text-3xl text-ink leading-none uppercase">
                {income ? 'ADJUST_REVENUE' : 'LOG_INFLOW'}
            </h2>
            <div className="flex items-center mt-2">
                <span className="bg-ink text-usc-gold px-2 py-0.5 text-[8px] font-bold border border-ink uppercase tracking-widest">Revenue_Control_v4.0</span>
                <span className="ml-2 text-[8px] font-mono text-ink/40 uppercase tracking-widest leading-none">Status: Connected</span>
            </div>
          </div>
          <button onClick={onClose} className="bg-ink text-bone p-1 border-2 border-bone hover:bg-bone hover:text-ink transition-colors">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto p-4 sm:p-8">
          <div className="flex flex-col space-y-8">
            
            <div>
              <label className={labelBase}>REVENUE_SOURCE</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="E.G. USC_TA_STIPEND" className={inputBase} required />
            </div>

            <div>
                <label className={labelBase}>CURRENCY_SELECT</label>
                <div className="grid grid-cols-2 bg-ink border-4 border-ink p-1">
                    <button type="button" onClick={() => setSelectedCurrency('USD')} className={`py-3 font-loud text-[10px] sm:text-xs transition-all ${selectedCurrency === 'USD' ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}>USD_($)</button>
                    <button type="button" onClick={() => setSelectedCurrency('INR')} className={`py-3 font-loud text-[10px] sm:text-xs transition-all ${selectedCurrency === 'INR' ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}>INR_(₹)</button>
                </div>
            </div>

            {/* CURRENCY VOUCHER FOR INR */}
            {selectedCurrency === 'INR' && (
                <div className="bg-usc-gold border-4 border-ink p-4 relative overflow-hidden">
                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-bone border-r-4 border-ink rounded-full" />
                    <label className={`${labelBase} text-ink`}>FOREIGN_INFLOW_VALUE (INR)</label>
                    <div className="flex items-center gap-4">
                        <span className="font-loud text-3xl text-ink">₹</span>
                        <input 
                          type="number" 
                          value={originalAmount} 
                          onChange={e => setOriginalAmount(e.target.value)} 
                          placeholder="0.00" 
                          className={`${inputBase} w-full bg-bone border-4 border-ink p-3 font-loud text-lg focus:outline-none`} 
                          required step="0.01" 
                        />
                    </div>
                </div>
            )}

            <div>
              <label className={labelBase}>VALUATION_USD</label>
              <div className="relative">
                  <input 
                    type="number" value={amount} onChange={e => setAmount(e.target.value)} 
                    placeholder="$ 0.00" 
                    className={`${inputBase} ${isAmountUSDReadOnly ? 'bg-ink/5' : ''}`} 
                    required readOnly={isAmountUSDReadOnly} step="0.01" 
                  />
                  {conversionLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-usc-gold border-t-transparent rounded-full" />}
              </div>
              {conversionError && <p className="text-[10px] text-usc-cardinal font-bold mt-1 uppercase italic">{conversionError}</p>}
            </div>

            <div>
              <label className={labelBase}>DATE_STAMP</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputBase} required />
            </div>

            <div className="relative" ref={categoryDropdownRef}>
          <label className={labelBase}>ASSET_CLASS</label>
          <button
            type="button"
            onClick={() => { setIsCategoryDropdownOpen(!isCategoryDropdownOpen); setCategorySearchTerm(''); }}
            className={`${inputBase} flex justify-between items-center text-left`}
          >
            <span className="truncate">{category.toUpperCase()}</span>
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-ink opacity-30"></div>
          </button>
          
          {isCategoryDropdownOpen && (
            <div className="absolute z-50 mt-2 w-full bg-white border-4 border-ink shadow-neo overflow-hidden flex flex-col max-h-64">
              <div className="p-3 border-b-4 border-ink bg-bone sticky top-0">
                <input
                  type="text" placeholder="SEARCH_ASSETS..." value={categorySearchTerm}
                  onChange={(e) => setCategorySearchTerm(e.target.value)}
                  className="w-full bg-white border-2 border-ink p-2 text-xs font-loud focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto">
                {filteredCategories.map(cat => (
                  <div
                    key={cat} onClick={() => handleCategorySelect(cat)}
                    className="px-4 py-3 text-xs font-bold text-ink hover:bg-usc-gold cursor-pointer transition-colors border-b border-ink/5 uppercase"
                  >
                    {cat}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

            <div className="col-span-2">
              <label className={labelBase}>ADDITIONAL_METADATA</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="SOURCE_DETAILS..." className={`${inputBase} h-24 resize-none`} />
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="mt-10 pt-8 border-t-4 border-dashed border-ink/10 flex flex-col sm:flex-row gap-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="w-full sm:flex-1 py-4 font-loud text-sm border-4 border-ink bg-white text-ink shadow-neo active:translate-y-1 transition-all order-2 sm:order-1"
            >
              TERMINATE
            </button>
            <button 
              type="submit" 
              className="w-full sm:flex-1 py-4 font-loud text-sm border-4 border-ink bg-usc-gold text-ink shadow-neo active:translate-y-1 transition-all order-1 sm:order-2"
            >
              COMMIT_ASSET
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncomeModal;