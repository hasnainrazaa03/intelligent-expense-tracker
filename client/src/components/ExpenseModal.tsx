import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expense, Category } from '../types';
import { suggestCategory, recordCategorySelection } from '../services/categorySuggestionService';
import { CATEGORIES, PAYMENT_METHODS } from '../constants';
import { XMarkIcon, ChevronUpDownIcon, MagnifyingGlassIcon } from './Icons';
import { getCategoryColor } from '../utils/colorUtils';
import { todayCalendar } from '../utils/dateUtils';
import useModalFocusTrap from '../hooks/useModalFocusTrap';
import useInrToUsd from '../hooks/useInrToUsd';
import { useCurrency } from '../contexts/CurrencyContext';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: any) => void;
  expense: Expense | null;
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave, expense }) => {
  const { displayCurrency, conversionRate: parentConversionRate } = useCurrency();
  const modalRef = useModalFocusTrap<HTMLDivElement>(isOpen, onClose);
  // --- CORE STATE (PRESERVED) ---
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(''); 
  const [category, setCategory] = useState<Category>(expense?.category || 'Miscellaneous');
  const [date, setDate] = useState(todayCalendar());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [hasManuallySelectedCategory, setHasManuallySelectedCategory] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [originalAmount, setOriginalAmount] = useState(''); 
  const [isRecurring, setIsRecurring] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [metadataInput, setMetadataInput] = useState('');
  const [taxCategory, setTaxCategory] = useState('');
  const [isTaxDeductible, setIsTaxDeductible] = useState(false);
  const [splitParticipantsInput, setSplitParticipantsInput] = useState('');
  const [receiptText, setReceiptText] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  const {
    convertedAmount,
    rate: conversionRate,
    loading: conversionLoading,
    error: conversionError,
  } = useInrToUsd(selectedCurrency, originalAmount, parentConversionRate ?? null);

  const isAmountUSDReadOnly = selectedCurrency === 'INR';

  // In INR mode the USD amount is derived (read-only); mirror the hook's value
  // (which is '' when the INR field is cleared or a conversion fails — CMP-H5).
  useEffect(() => {
    if (selectedCurrency === 'INR') {
      setAmount(convertedAmount);
    }
  }, [convertedAmount, selectedCurrency]);

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
      setTagsInput((expense.tags || []).join(', '));
      setMetadataInput(
        expense.metadata
          ? Object.entries(expense.metadata)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
          : ''
      );
      setTaxCategory(expense.taxCategory || '');
      setIsTaxDeductible(Boolean(expense.isTaxDeductible));
      setSplitParticipantsInput((expense.splitParticipants || []).join(', '));
      setReceiptText(expense.receiptText || '');
      setReceiptFileName(expense.receiptFileName || '');

      if (expense.originalCurrency === 'INR' && expense.originalAmount) {
        setSelectedCurrency('INR');
        setOriginalAmount(expense.originalAmount.toString());
      } else {
        setSelectedCurrency('USD');
        setOriginalAmount('');
      }
    } else {
      setTitle(''); setAmount(''); setCategory('Other');
      setDate(todayCalendar());
      setPaymentMethod(''); setNotes('');
      setHasManuallySelectedCategory(false);
      setSelectedCurrency(displayCurrency);
      setOriginalAmount(''); setIsRecurring(false);
      setTagsInput('');
      setMetadataInput('');
      setTaxCategory('');
      setIsTaxDeductible(false);
      setSplitParticipantsInput('');
      setReceiptText('');
      setReceiptFileName('');
    }
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

  // --- HANDLERS ---
  const handleCategorySelect = (selectedCategory: Category) => {
    setCategory(selectedCategory);
    setHasManuallySelectedCategory(true);
    if (title.trim()) {
      recordCategorySelection(title, selectedCategory);
    }
    setIsCategoryDropdownOpen(false);
    setCategorySearchTerm('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Ensure we have the necessary numeric data
    const finalAmount = parseFloat(amount);
    if (!title || isNaN(finalAmount) || finalAmount <= 0) return;

    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
    const metadataEntries = metadataInput
      .split('\n')
      .map((line) => line.split(':'))
      .filter((parts) => parts.length >= 2)
      .map(([k, ...rest]) => [k.trim(), rest.join(':').trim()] as const)
      .filter(([k, v]) => Boolean(k) && Boolean(v))
      .slice(0, 20);
    const metadata = metadataEntries.length > 0 ? Object.fromEntries(metadataEntries) : undefined;

    const splitParticipants = splitParticipantsInput
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 20);
    const splitShares = splitParticipants.length > 0
      ? splitParticipants.map(() => Number((finalAmount / splitParticipants.length).toFixed(2)))
      : [];

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
      tags,
      metadata,
      taxCategory: taxCategory.trim() || undefined,
      isTaxDeductible,
      splitParticipants,
      splitShares,
      receiptText: receiptText.trim() || undefined,
      receiptFileName: receiptFileName || undefined,
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

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);
    setIsOcrProcessing(true);
    try {
      const tesseract = await import('tesseract.js');
      const result = await tesseract.recognize(file, 'eng');
      const extracted = result.data.text?.trim() || '';
      setReceiptText(extracted);

      const amountMatch = extracted.match(/(?:total|amount|sum)\s*[:$]?\s*(\d+[\d,.]*\.?\d*)/i);
      if (amountMatch && !amount) {
        const parsed = Number.parseFloat(amountMatch[1].replace(/,/g, ''));
        if (Number.isFinite(parsed) && parsed > 0) {
          setAmount(parsed.toFixed(2));
        }
      }
    } catch {
      setReceiptText('OCR failed. You can still keep this receipt as attached metadata and type notes manually.');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // --- STYLING CONSTANTS ---
  const inputBase = "w-full bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-app-faint appearance-none";
  const labelBase = "text-[11px] font-medium tracking-[0.12em] text-app-muted mb-2 block uppercase";

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
      tabIndex={-1}
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex justify-center items-center p-4"
    >
      <div className="glass glass-blur rounded-2xl w-full max-w-xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">

        {/* HEADER */}
        <div className="p-5 sm:p-6 border-b border-app-border flex justify-between items-center flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="expense-modal-title" className="font-display text-xl sm:text-2xl font-bold text-app-text leading-tight truncate">
                {expense ? 'Edit expense' : 'New expense'}
            </h2>
            <p className="text-xs text-app-muted mt-1">{expense ? 'Update this transaction.' : 'Log a new transaction.'}</p>
          </div>
          <button onClick={onClose} aria-label="Close expense modal" className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors flex-shrink-0">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto p-5 sm:p-6">
          <div className="flex flex-col space-y-5">

            {/* Title */}
            <div>
              <label className={labelBase}>Title</label>
              <input
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Groceries"
                className={inputBase} required
              />
            </div>

            {/* Currency Segmented Control */}
            <div>
              <label className={labelBase}>Currency</label>
              <div className="grid grid-cols-2 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                  <button type="button" onClick={() => setSelectedCurrency('USD')} className={`py-2 rounded-lg text-sm font-semibold transition-all ${selectedCurrency === 'USD' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>USD ($)</button>
                  <button type="button" onClick={() => setSelectedCurrency('INR')} className={`py-2 rounded-lg text-sm font-semibold transition-all ${selectedCurrency === 'INR' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>INR (₹)</button>
              </div>
          </div>

            {/* Conditional INR Input */}
            {selectedCurrency === 'INR' && (
              <div className="rounded-xl border border-app-border bg-surface-2 p-4">
                <label className={labelBase}>Amount in INR</label>
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl text-app-muted">₹</span>
                  <input
                    type="number"
                    value={originalAmount}
                    onChange={e => setOriginalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface border border-app-border rounded-lg px-3 py-2.5 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required min="0.01" step="0.01"
                  />
                </div>
                <p className="mt-2 text-[11px] text-app-muted">USD equivalent is auto-calculated via the Frankfurter API.</p>
              </div>
            )}

            {/* USD Amount */}
            <div>
              <label className={labelBase}>Amount (USD)</label>
              <div className="relative">
                  <input
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputBase} ${isAmountUSDReadOnly ? 'opacity-70' : ''}`}
                    required readOnly={isAmountUSDReadOnly} min="0.01" step="0.01"
                  />
                  {conversionLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />}
              </div>
                {conversionError && <p role="alert" aria-live="assertive" className="text-xs text-danger font-medium mt-1.5">{conversionError}</p>}
              {conversionRate && selectedCurrency === 'INR' && (
                  <p aria-live="polite" className="text-[11px] text-app-muted mt-1.5 tabular-nums">FX: 1 INR = {conversionRate.toFixed(4)} USD</p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className={labelBase}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inputBase} [color-scheme:dark]`} required />
            </div>

            {/* Category Dropdown */}
            <div>
              <label className={labelBase}>Category</label>
              <div className="relative" ref={categoryDropdownRef}>
                <button
                    type="button"
                    onClick={() => { setIsCategoryDropdownOpen(!isCategoryDropdownOpen); setCategorySearchTerm(''); }}
                    className={`${inputBase} flex justify-between items-center text-left`}
                >
                    <div className="flex items-center overflow-hidden">
                        <div className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0" style={{ backgroundColor: getCategoryColor(category) }}></div>
                        <span className="truncate">{category}</span>
                    </div>
                    <ChevronUpDownIcon className="h-5 w-5 text-app-faint" />
                </button>

                {isCategoryDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full glass glass-blur rounded-xl overflow-hidden flex flex-col max-h-64">
                      <div className="p-2.5 border-b border-app-border sticky top-0">
                          <input
                              type="text" placeholder="Search categories…" value={categorySearchTerm}
                              onChange={(e) => setCategorySearchTerm(e.target.value)}
                              className="w-full bg-surface-2 border border-app-border rounded-lg px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                              autoFocus
                          />
                      </div>
                      <div className="overflow-y-auto">
                          {(Object.entries(filteredCategories) as [string, string[]][]).map(([main, subs]) => (
                              <div key={main}>
                                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-faint bg-surface-2/60">{main}</div>
                                  {subs.map(sub => (
                                      <button
                                          type="button"
                                          key={sub} onClick={() => handleCategorySelect(sub)}
                                          className="w-full text-left px-4 py-2.5 text-sm text-app-text hover:bg-surface-2 focus:bg-surface-2 focus:outline-none cursor-pointer flex items-center transition-colors"
                                      >
                                          <div className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: getCategoryColor(sub) }}></div>
                                          {sub}
                                      </button>
                                  ))}
                              </div>
                          ))}
                      </div>
                  </div>
              )}
              </div>
            </div>

            {/* Recurring toggle */}
            <div className="flex items-center justify-between rounded-xl border border-app-border bg-surface-2 px-4 py-3">
                <span className="text-sm font-medium text-app-text">Recurring transaction</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={isRecurring}
                    onClick={() => setIsRecurring(!isRecurring)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${isRecurring ? 'bg-primary' : 'bg-surface border border-app-border'}`}
                >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>

            <div>
                <label className={labelBase}>Payment method</label>
                <input
                    list="methods" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                    placeholder="Card, cash, transfer…" className={inputBase}
                />
                <datalist id="methods">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m} />)}
                </datalist>
            </div>

            {/* Notes */}
            <div>
              <label className={labelBase}>Notes</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Any additional details…" className={`${inputBase} h-24 resize-none`}
              />
            </div>

            <div>
              <label className={labelBase}>Tax category</label>
              <input
                type="text"
                value={taxCategory}
                onChange={(e) => setTaxCategory(e.target.value)}
                placeholder="e.g. Education, Charity"
                className={inputBase}
              />
              <label className="mt-2.5 inline-flex items-center gap-2 text-sm text-app-muted cursor-pointer">
                <input type="checkbox" checked={isTaxDeductible} onChange={(e) => setIsTaxDeductible(e.target.checked)} className="accent-[color:var(--primary)]" />
                Mark as tax deductible
              </label>
            </div>

            <div>
              <label className={labelBase}>Tags (comma separated)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="groceries, urgent, reimbursement"
                className={inputBase}
              />
            </div>

            <div>
              <label className={labelBase}>Split participants (comma separated)</label>
              <input
                type="text"
                value={splitParticipantsInput}
                onChange={(e) => setSplitParticipantsInput(e.target.value)}
                placeholder="Alex, Sam, You"
                className={inputBase}
              />
            </div>

            <div>
              <label className={labelBase}>Metadata (one key: value per line)</label>
              <textarea
                value={metadataInput}
                onChange={(e) => setMetadataInput(e.target.value)}
                className={`${inputBase} h-24 resize-none`}
                placeholder={'merchant: Trader Joes\ntrip: Seattle'}
              />
            </div>

            <div className="rounded-xl border border-app-border bg-surface-2 p-4">
              <label className={labelBase}>Receipt upload (OCR)</label>
              <input type="file" accept="image/*" onChange={handleReceiptUpload} className="w-full text-xs text-app-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-on-primary file:text-xs file:font-semibold" />
              {isOcrProcessing && <p className="text-[11px] text-app-muted mt-2">Scanning receipt text…</p>}
              {receiptFileName && <p className="text-[11px] text-app-muted mt-2">Attached: {receiptFileName}</p>}
              <textarea
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                className="mt-2 w-full bg-surface border border-app-border rounded-lg p-2.5 h-24 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="OCR text appears here"
              />
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-7 pt-6 border-t border-app-border flex flex-col sm:flex-row gap-3">
            <button
              type="button" onClick={onClose}
              className="w-full sm:flex-1 py-3 rounded-xl text-sm font-semibold bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99] transition-all order-1 sm:order-2"
            >
              {expense ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;