import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expense, Category } from '../types';
import { suggestCategory, recordCategorySelection } from '../services/categorySuggestionService';
import { PAYMENT_METHODS } from '../constants';
import { getEffectiveCategories } from '../utils/categories';
import { ChevronUpDownIcon, MagnifyingGlassIcon } from './Icons';
import { getCategoryColor } from '../utils/colorUtils';
import { todayCalendar } from '../utils/dateUtils';
import { distributeAmount } from '../utils/currencyUtils';
import { RECURRENCE_META_KEY, RECURRENCE_OPTIONS, getRecurrenceFrequency, type RecurrenceFrequency } from '../utils/recurrence';
import { listHouseholds, getReceipt, uploadReceipt, deleteReceipt, parseReceipt, type Household, type ParsedReceipt } from '../services/api';
import { downscaleImage } from '../utils/image';
import toast from 'react-hot-toast';
import useForeignToUsd from '../hooks/useForeignToUsd';
import { useCurrency } from '../contexts/CurrencyContext';
import { Modal, Button, Input, Textarea, Label, Select, DatePicker } from './ui';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: any) => void;
  expense: Expense | null;
  /** Opens the bank-statement importer (bulk add many at once). */
  onImportStatement?: () => void;
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave, expense, onImportStatement }) => {
  const { displayCurrency, conversionRate: parentConversionRate, availableCurrencies } = useCurrency();
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
  
  // Entry currency: amounts are stored in USD, but the user can enter in a foreign
  // currency which is converted. `foreignCurrency` is any supported ISO code.
  const [enterInForeign, setEnterInForeign] = useState(false);
  const [foreignCurrency, setForeignCurrency] = useState<string>('INR');
  const [originalAmount, setOriginalAmount] = useState('');
  // Tracks whether the user actually edited the foreign field this session.
  // Editing an existing foreign record must NOT silently re-convert its stored
  // USD at today's rate (H1) — recompute only once the foreign amount changes.
  const [originalAmountDirty, setOriginalAmountDirty] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [tagsInput, setTagsInput] = useState('');
  const [metadataInput, setMetadataInput] = useState('');
  const [taxCategory, setTaxCategory] = useState('');
  const [isTaxDeductible, setIsTaxDeductible] = useState(false);
  const [splitParticipantsInput, setSplitParticipantsInput] = useState('');
  const [receiptText, setReceiptText] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [householdId, setHouseholdId] = useState('');
  const [households, setHouseholds] = useState<Household[]>([]);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);

  // Reuse the cached display rate only when the entry currency matches it;
  // otherwise the hook fetches the correct foreign→USD rate itself.
  const parentRateForForeign = foreignCurrency === displayCurrency ? (parentConversionRate ?? null) : null;
  const {
    convertedAmount,
    rate: conversionRate,
    loading: conversionLoading,
    error: conversionError,
  } = useForeignToUsd(enterInForeign ? foreignCurrency : 'USD', originalAmount, parentRateForForeign);

  const isAmountUSDReadOnly = enterInForeign;

  // In foreign mode the USD amount is derived (read-only); mirror the hook's value
  // (which is '' when the field is cleared or a conversion fails — CMP-H5), but
  // only after the user edits the foreign amount, so opening an existing foreign
  // record to edit an unrelated field keeps its original stored USD (H1).
  useEffect(() => {
    if (enterInForeign && originalAmountDirty) {
      setAmount(convertedAmount);
    }
  }, [convertedAmount, enterInForeign, originalAmountDirty]);

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
      setFrequency(getRecurrenceFrequency(expense));
      setTagsInput((expense.tags || []).join(', '));
      setMetadataInput(
        expense.metadata
          ? Object.entries(expense.metadata)
              // Hide the reserved recurrence key — it's edited via the Frequency
              // control, not the raw metadata textarea.
              .filter(([k]) => k !== RECURRENCE_META_KEY)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
          : ''
      );
      setTaxCategory(expense.taxCategory || '');
      setIsTaxDeductible(Boolean(expense.isTaxDeductible));
      setSplitParticipantsInput((expense.splitParticipants || []).join(', '));
      setReceiptText(expense.receiptText || '');
      setReceiptFileName(expense.receiptFileName || '');
      setHouseholdId(expense.householdId || '');

      setOriginalAmountDirty(false);
      if (expense.originalCurrency && expense.originalCurrency !== 'USD' && expense.originalAmount) {
        setEnterInForeign(true);
        setForeignCurrency(expense.originalCurrency);
        setOriginalAmount(expense.originalAmount.toString());
      } else {
        setEnterInForeign(false);
        setForeignCurrency(displayCurrency !== 'USD' ? displayCurrency : 'INR');
        setOriginalAmount('');
      }
    } else {
      setTitle(''); setAmount(''); setCategory('Other');
      setDate(todayCalendar());
      setPaymentMethod(''); setNotes('');
      setHasManuallySelectedCategory(false);
      setEnterInForeign(false);
      setForeignCurrency(displayCurrency !== 'USD' ? displayCurrency : 'INR');
      setOriginalAmount(''); setOriginalAmountDirty(false); setIsRecurring(false); setFrequency('monthly');
      setTagsInput('');
      setMetadataInput('');
      setTaxCategory('');
      setIsTaxDeductible(false);
      setSplitParticipantsInput('');
      setReceiptText('');
      setReceiptFileName('');
      setHouseholdId('');
    }
  }, [expense, isOpen, displayCurrency]);

  // Load the user's households when the modal opens so an expense can be tagged
  // to one (shared/pooled). Silent on failure — the picker just stays hidden.
  useEffect(() => {
    if (!isOpen) return;
    listHouseholds().then((r) => setHouseholds(r.households)).catch(() => setHouseholds([]));
  }, [isOpen]);

  // Load any stored receipt image for an existing expense (kept out of /all).
  // Guard against a race when the modal switches expenses mid-fetch (e.g. via the
  // header search) so a slow response can't paint onto the wrong expense.
  useEffect(() => {
    if (!isOpen || !expense) { setReceiptImage(''); return; }
    let ignore = false;
    setReceiptImage('');
    getReceipt(expense.id)
      .then((r) => { if (!ignore) setReceiptImage(r.image); })
      .catch(() => { if (!ignore) setReceiptImage(''); });
    return () => { ignore = true; };
  }, [isOpen, expense]);

  useEffect(() => {
    // Switching back to USD entry clears the foreign amount to avoid confusion.
    if (!enterInForeign) {
      setOriginalAmount('');
      setOriginalAmountDirty(false);
    }
  }, [enterInForeign]);

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
    const metadataObj: Record<string, string> = Object.fromEntries(metadataEntries);
    // Persist the recurrence frequency alongside user metadata (reserved key) so
    // materialization knows the cadence — no schema change needed.
    if (isRecurring) metadataObj[RECURRENCE_META_KEY] = frequency;
    const metadata = Object.keys(metadataObj).length > 0 ? metadataObj : undefined;

    const splitParticipants = splitParticipantsInput
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 20);
    // Cent-accurate split so the shares sum back to the exact total (no penny
    // leak: $100 / 3 => [33.34, 33.33, 33.33], not 3×33.33 = 99.99).
    const splitShares = splitParticipants.length > 0
      ? distributeAmount(finalAmount, splitParticipants.length)
      : [];

    const expenseData = {
      title: title.trim(),
      amount: finalAmount,
      category,
      date,
      paymentMethod: paymentMethod.trim() || 'CASH', // Default to cash if empty
      notes: notes.trim() || undefined,
      originalAmount: enterInForeign ? parseFloat(originalAmount) : undefined,
      originalCurrency: enterInForeign ? foreignCurrency : 'USD',
      isRecurring,
      tags,
      metadata,
      taxCategory: taxCategory.trim() || undefined,
      isTaxDeductible,
      splitParticipants,
      splitShares,
      receiptText: receiptText.trim() || undefined,
      receiptFileName: receiptFileName || undefined,
      householdId: householdId || null,
    };

    onSave(expense ? { ...expenseData, id: expense.id } : expenseData);
    onClose();
  };

  // Effective categories (defaults + the user's custom ones). Re-read when the
  // modal opens so categories added in the manager show up here (CMP-M24).
  const effectiveCategories = useMemo(() => getEffectiveCategories(), [isOpen]);

  const filteredCategories = useMemo<Record<string, string[]>>(() => {
    const categoriesObj = effectiveCategories;
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
  }, [categorySearchTerm, effectiveCategories]);

  // Drop Gemini's structured receipt read into the form, only filling fields the
  // user hasn't already set. Returns true if it set an amount, so the OCR pass
  // below can skip its cruder regex guess.
  const applyParsedReceipt = (r: ParsedReceipt): boolean => {
    if (r.title && !title.trim()) setTitle(r.title.slice(0, 60));
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) setDate(r.date);
    if (r.category && !hasManuallySelectedCategory) {
      setCategory(r.category as Category);
      setHasManuallySelectedCategory(true);
    }
    if (r.paymentMethod && !paymentMethod.trim()) setPaymentMethod(r.paymentMethod);
    if (r.notes && !notes.trim()) setNotes(r.notes);

    let setAmt = false;
    if (r.amount > 0) {
      const cur = (r.currency || 'USD').toUpperCase();
      if (cur !== 'USD' && availableCurrencies.some((c) => c.code === cur)) {
        // Receipt is in a supported foreign currency — switch to foreign entry so
        // the existing FX pipeline converts it to the stored USD amount.
        setEnterInForeign(true);
        setForeignCurrency(cur);
        setOriginalAmount(String(r.amount));
        setOriginalAmountDirty(true);
        setAmt = true;
      } else if (!amount) {
        setAmount(r.amount.toFixed(2));
        setAmt = true;
      }
    }
    return setAmt;
  };

  const handleReceiptUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);

    // 1) Store a downscaled image first (fast). For an existing expense we persist
    // it right away; for a brand-new one it's a preview kept until saved.
    let thumb = '';
    try {
      thumb = await downscaleImage(file);
      setReceiptImage(thumb);
      if (expense) {
        setReceiptBusy(true);
        await uploadReceipt(expense.id, thumb);
        toast.success('Receipt image attached.');
      }
    } catch {
      toast.error('Could not attach the receipt image.');
    } finally {
      setReceiptBusy(false);
    }

    // 2) Smart fill via Gemini vision — title / amount / date / category / payment.
    let aiFilledAmount = false;
    if (thumb) {
      setIsAiParsing(true);
      try {
        const { receipt } = await parseReceipt(thumb);
        aiFilledAmount = applyParsedReceipt(receipt);
        if (receipt.title || receipt.amount > 0) {
          toast.success('Filled from receipt — review before saving.');
        }
      } catch {
        // AI unavailable (no key / rate-limited) — the OCR pass below still does a
        // best-effort amount guess, so this is a soft failure.
      } finally {
        setIsAiParsing(false);
      }
    }

    // 3) OCR the raw text (slower) — always stored as receiptText; only used to
    // guess the amount when the AI parse didn't already find one.
    setIsOcrProcessing(true);
    try {
      const tesseract = await import('tesseract.js');
      const result = await tesseract.recognize(file, 'eng');
      const extracted = result.data.text?.trim() || '';
      setReceiptText(extracted);

      if (!aiFilledAmount && !amount) {
        const amountMatch = extracted.match(/(?:total|amount|sum)\s*[:$]?\s*(\d+[\d,.]*\.?\d*)/i);
        if (amountMatch) {
          const parsed = Number.parseFloat(amountMatch[1].replace(/,/g, ''));
          if (Number.isFinite(parsed) && parsed > 0) {
            setAmount(parsed.toFixed(2));
          }
        }
      }
    } catch {
      setReceiptText('OCR failed. You can still keep this receipt as attached metadata and type notes manually.');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleRemoveReceiptImage = async () => {
    setReceiptImage('');
    if (!expense) return;
    setReceiptBusy(true);
    try {
      await deleteReceipt(expense.id);
      toast.success('Receipt image removed.');
    } catch {
      /* already gone / non-fatal */
    } finally {
      setReceiptBusy(false);
    }
  };

  // --- STYLING CONSTANTS ---
  const inputBase = "w-full bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-app-faint appearance-none";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'New expense'}
      subtitle={expense ? 'Update this transaction.' : 'Log a new transaction.'}
      size="lg"
      labelledById="expense-modal-title"
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button type="submit" form="expense-form" fullWidth>{expense ? 'Save changes' : 'Add expense'}</Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit}>
          <div className="flex flex-col space-y-5">

            {/* Bulk import shortcut — only when adding (not editing). */}
            {!expense && onImportStatement && (
              <button
                type="button"
                onClick={onImportStatement}
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-dashed border-app-border bg-surface-2 px-4 py-2.5 text-xs font-semibold text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
              >
                📄 Import many from a bank statement (CSV / PDF)
              </button>
            )}

            {/* Title */}
            <div>
              <Label htmlFor="exp-title">Title</Label>
              <Input
                id="exp-title"
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Groceries"
                required
              />
            </div>

            {/* Entry currency: USD or a foreign currency (converted to USD) */}
            <div>
              <Label id="exp-currency-label">Entry currency</Label>
              <div role="group" aria-labelledby="exp-currency-label" className="grid grid-cols-2 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                  <button type="button" onClick={() => setEnterInForeign(false)} className={`py-2 rounded-lg text-sm font-semibold transition-all ${!enterInForeign ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>USD ($)</button>
                  <button type="button" onClick={() => setEnterInForeign(true)} className={`py-2 rounded-lg text-sm font-semibold transition-all ${enterInForeign ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>Other currency</button>
              </div>
          </div>

            {/* Conditional foreign-currency input */}
            {enterInForeign && (
              <div className="rounded-xl border border-app-border bg-surface-2 p-4 space-y-3">
                <div>
                  <Label htmlFor="exp-foreign-cur">Currency</Label>
                  <select
                    id="exp-foreign-cur"
                    value={foreignCurrency}
                    onChange={e => { setForeignCurrency(e.target.value); setOriginalAmountDirty(true); }}
                    className="w-full bg-surface border border-app-border rounded-lg px-3 py-2.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {availableCurrencies.filter(c => c.code !== 'USD').map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="exp-foreign-amount">Amount in {foreignCurrency}</Label>
                  <input
                    id="exp-foreign-amount"
                    type="number"
                    value={originalAmount}
                    onChange={e => { setOriginalAmount(e.target.value); setOriginalAmountDirty(true); }}
                    placeholder="0.00"
                    className="w-full bg-surface border border-app-border rounded-lg px-3 py-2.5 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required min="0.01" step="0.01"
                  />
                </div>
                <p className="text-[11px] text-app-muted">USD equivalent is auto-calculated via the Frankfurter API.</p>
              </div>
            )}

            {/* USD Amount */}
            <div>
              <Label htmlFor="exp-amount">Amount (USD)</Label>
              <div className="relative">
                  <Input
                    id="exp-amount"
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={isAmountUSDReadOnly ? 'opacity-70' : ''}
                    required readOnly={isAmountUSDReadOnly} min="0.01" step="0.01"
                  />
                  {conversionLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />}
              </div>
                {conversionError && <p role="alert" aria-live="assertive" className="text-xs text-danger font-medium mt-1.5">{conversionError}</p>}
              {conversionRate && enterInForeign && (
                  <p aria-live="polite" className="text-[11px] text-app-muted mt-1.5 tabular-nums">FX: 1 {foreignCurrency} = {conversionRate.toFixed(4)} USD</p>
              )}
            </div>

            {/* Date */}
            <div>
              <Label htmlFor="exp-date">Date</Label>
              <DatePicker id="exp-date" value={date} onChange={setDate} required aria-label="Date" />
            </div>

            {/* Category Dropdown */}
            <div>
              <Label htmlFor="exp-category">Category</Label>
              <div className="relative" ref={categoryDropdownRef}>
                <button
                    id="exp-category"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isCategoryDropdownOpen}
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
                  <div className="absolute z-50 mt-2 w-full modal-surface rounded-xl overflow-hidden flex flex-col max-h-64">
                      <div className="p-2.5 border-b border-app-border sticky top-0 z-10" style={{ background: 'var(--modal-surface)' }}>
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
                                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-faint bg-surface-2">{main}</div>
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

            {/* Recurring toggle + frequency */}
            <div className="rounded-xl border border-app-border bg-surface-2 px-4 py-3">
                <div className="flex items-center justify-between">
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
                {isRecurring && (
                    <div className="mt-3">
                        <Label htmlFor="exp-frequency">Frequency</Label>
                        <select
                            id="exp-frequency"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                            className="w-full bg-surface border border-app-border rounded-lg px-3 py-2.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                            {RECURRENCE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <p className="mt-1.5 text-[11px] text-app-muted">You'll be prompted to add the next one when it's due.</p>
                    </div>
                )}
            </div>

            <div>
                <Label htmlFor="exp-payment">Payment method</Label>
                <Select
                    id="exp-payment"
                    value={PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : ''}
                    onChange={e => setPaymentMethod(e.target.value)}
                >
                    <option value="">Select method…</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
            </div>

            {/* Household (optional) — only shown when the user has households */}
            {households.length > 0 && (
              <div>
                <Label htmlFor="exp-household">Household (optional)</Label>
                <select
                  id="exp-household"
                  value={householdId}
                  onChange={(e) => setHouseholdId(e.target.value)}
                  className="w-full bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Personal (not shared)</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-app-muted">Tagging to a household pools this expense in its shared view + settle-up.</p>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="exp-notes">Notes</Label>
              <Textarea
                id="exp-notes"
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Any additional details…" className="h-24 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="exp-tax">Tax category</Label>
              <Input
                id="exp-tax"
                type="text"
                value={taxCategory}
                onChange={(e) => setTaxCategory(e.target.value)}
                placeholder="e.g. Education, Charity"
              />
              <label className="mt-2.5 inline-flex items-center gap-2 text-sm text-app-muted cursor-pointer">
                <input type="checkbox" checked={isTaxDeductible} onChange={(e) => setIsTaxDeductible(e.target.checked)} className="accent-[color:var(--primary)]" />
                Mark as tax deductible
              </label>
            </div>

            <div>
              <Label htmlFor="exp-tags">Tags (comma separated)</Label>
              <Input
                id="exp-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="groceries, urgent, reimbursement"
              />
            </div>

            <div>
              <Label htmlFor="exp-split">Split participants (comma separated)</Label>
              <Input
                id="exp-split"
                type="text"
                value={splitParticipantsInput}
                onChange={(e) => setSplitParticipantsInput(e.target.value)}
                placeholder="Alex, Sam, You"
              />
            </div>

            <div>
              <Label htmlFor="exp-metadata">Metadata (one key: value per line)</Label>
              <Textarea
                id="exp-metadata"
                value={metadataInput}
                onChange={(e) => setMetadataInput(e.target.value)}
                className="h-24 resize-none"
                placeholder={'merchant: Trader Joes\ntrip: Seattle'}
              />
            </div>

            <div className="rounded-xl border border-app-border bg-surface-2 p-4">
              <Label htmlFor="exp-receipt">Receipt upload · AI auto-fill</Label>
              <p className="text-[11px] text-app-muted -mt-1 mb-2">Upload a receipt and we'll read the total, date, merchant and category for you to review.</p>
              <input id="exp-receipt" type="file" accept="image/*" onChange={handleReceiptUpload} className="w-full text-xs text-app-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-on-primary file:text-xs file:font-semibold" />
              {isAiParsing && (
                <p className="text-[11px] text-primary mt-2 flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Reading receipt with AI…
                </p>
              )}
              {isOcrProcessing && !isAiParsing && <p className="text-[11px] text-app-muted mt-2">Scanning receipt text…</p>}
              {receiptFileName && <p className="text-[11px] text-app-muted mt-2">Attached: {receiptFileName}</p>}
              {receiptImage && (
                <div className="mt-3">
                  <img src={receiptImage} alt="Receipt" className="max-h-40 rounded-lg border border-app-border" />
                  <button
                    type="button"
                    onClick={handleRemoveReceiptImage}
                    disabled={receiptBusy}
                    className="mt-1.5 text-[11px] font-semibold text-app-faint hover:text-danger disabled:opacity-50"
                  >
                    Remove image
                  </button>
                </div>
              )}
              {!expense && receiptImage && (
                <p className="mt-1.5 text-[11px] text-app-muted">Save this expense, then reopen it to keep the receipt image.</p>
              )}
              <textarea
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                className="mt-2 w-full bg-surface border border-app-border rounded-lg p-2.5 h-24 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="OCR text appears here"
              />
            </div>
          </div>
      </form>
    </Modal>
  );
};

export default ExpenseModal;