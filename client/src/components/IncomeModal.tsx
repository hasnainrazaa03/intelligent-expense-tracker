import React, { useState, useEffect, useMemo } from 'react';
import { Income } from '../types';
import { INCOME_CATEGORIES } from '../constants';
import { todayCalendar } from '../utils/dateUtils';
import useForeignToUsd from '../hooks/useForeignToUsd';
import useDropdownKeyboard from '../hooks/useDropdownKeyboard';
import { useCurrency } from '../contexts/CurrencyContext';
import { Modal, Button, Input, Textarea, Label, DatePicker } from './ui';
import toast from 'react-hot-toast';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves `false` when the save failed, so the form stays open. */
  onSave: (income: any) => Promise<boolean | void> | boolean | void;
  income: Income | null;
  /** Opens the bank-statement importer (bulk add many at once). */
  onImportStatement?: () => void;
  /** Accounts already in use, offered as suggestions (mirrors ExpenseModal). */
  knownAccounts?: string[];
}

const IncomeModal: React.FC<IncomeModalProps> = ({ isOpen, onClose, onSave, income, onImportStatement, knownAccounts = [] }) => {
  const { displayCurrency, rateForEntry, availableCurrencies } = useCurrency();
  // The form starts from the income being edited (or blank). The dialog is
  // mounted for each opening, so these initial values are all it needs; an
  // effect used to refill the form, and reset it if the display currency changed.
  const storedForeign = Boolean(income?.originalCurrency && income.originalCurrency !== 'USD' && income.originalAmount);
  const [title, setTitle] = useState(income?.title ?? '');
  const [amount, setAmount] = useState(income ? income.amount.toString() : '');
  const [category, setCategory] = useState<string>(income?.category ?? INCOME_CATEGORIES[0]);
  const [date, setDate] = useState(() => income?.date ?? todayCalendar());
  const [notes, setNotes] = useState(income?.notes ?? '');
  const [account, setAccount] = useState(income?.account ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [tagsInput, setTagsInput] = useState((income?.tags ?? []).join(', '));
  const [metadataInput, setMetadataInput] = useState(() =>
    income?.metadata ? Object.entries(income.metadata).map(([k, v]) => `${k}: ${v}`).join('\n') : '');

  const [enterInForeign, setEnterInForeign] = useState(storedForeign);
  const [foreignCurrency, setForeignCurrency] = useState<string>(() =>
    storedForeign ? income!.originalCurrency! : displayCurrency !== 'USD' ? displayCurrency : 'INR');
  const [originalAmount, setOriginalAmount] = useState(storedForeign ? String(income!.originalAmount) : '');
  // See ExpenseModal: don't re-convert a stored foreign record's USD at today's
  // rate unless the user actually edits the foreign amount (H1).
  const [originalAmountDirty, setOriginalAmountDirty] = useState(false);

  // Fresh real rate only — see ExpenseModal.
  const parentRateForForeign = foreignCurrency === displayCurrency ? rateForEntry : null;
  const {
    convertedAmount,
    loading: conversionLoading,
    error: conversionError,
  } = useForeignToUsd(enterInForeign ? foreignCurrency : 'USD', originalAmount, parentRateForForeign);

  const isAmountUSDReadOnly = enterInForeign;

  // In foreign mode the USD amount is the conversion ('' when cleared or failed,
  // CMP-H5), but only once the foreign amount is edited (H1). Derived, not
  // copied into state by an effect.
  const usdAmount = enterInForeign && originalAmountDirty ? convertedAmount : amount;
  // Back to USD: keep the converted amount as the starting point.
  const switchToUsd = () => {
    setAmount(usdAmount);
    setEnterInForeign(false);
  };

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const categoryDropdownRef = React.useRef<HTMLDivElement>(null);
  useDropdownKeyboard(isCategoryDropdownOpen, () => setIsCategoryDropdownOpen(false), categoryDropdownRef, 'income-category-toggle');


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
    setIsCategoryDropdownOpen(false);
    setCategorySearchTerm('');
  };

  // See ExpenseModal: until the debounced conversion lands, `usdAmount` holds the
  // previous conversion, so saving would store a mismatched USD value.
  const isConversionPending = enterInForeign && originalAmountDirty && conversionLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (isConversionPending) {
      toast.error('Still converting the amount — try again in a moment.');
      return;
    }
    const primaryAmount = enterInForeign ? originalAmount : usdAmount;
    if (!title.trim()) {
      toast.error('Add a source for this income.');
      return;
    }
    if (!primaryAmount || parseFloat(primaryAmount) <= 0 || (isAmountUSDReadOnly && !usdAmount)) {
      toast.error(enterInForeign && conversionError
        ? 'Could not convert this amount to USD. Enter it in USD instead.'
        : 'Enter an amount greater than zero.');
      return;
    }

    const incomeData = {
      tags: tagsInput.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      metadata: (() => {
        const entries = metadataInput
          .split('\n')
          .map((line) => line.split(':'))
          .filter((parts) => parts.length >= 2)
          .map(([k, ...rest]) => [k.trim(), rest.join(':').trim()] as const)
          .filter(([k, v]) => Boolean(k) && Boolean(v))
          .slice(0, 20);
        return entries.length > 0 ? Object.fromEntries(entries) : undefined;
      })(),
      title: title.trim(),
      amount: parseFloat(usdAmount),
      category,
      date,
      notes: notes.trim() || undefined,
      // Always sent: the server's PUT treats a missing account as "clear it",
      // which used to erase the account of every income edited here.
      account: account.trim() || undefined,
      originalAmount: enterInForeign && originalAmount ? parseFloat(originalAmount) : undefined,
      originalCurrency: enterInForeign ? foreignCurrency : 'USD',
    };

    // Wait for the save; on failure keep the form open so nothing is lost.
    setIsSaving(true);
    try {
      const ok = await onSave(income ? { ...incomeData, id: income.id } : incomeData);
      if (ok !== false) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const inputBase = "w-full bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-app-faint appearance-none";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={income ? 'Edit income' : 'New income'}
      subtitle={income ? 'Update this income entry.' : 'Log an inflow.'}
      size="lg"
      labelledById="income-modal-title"
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
          <Button type="submit" form="income-form" fullWidth disabled={isSaving || isConversionPending}>
            {isSaving ? 'Saving…' : income ? 'Save changes' : 'Add income'}
          </Button>
        </>
      }
    >
      <form id="income-form" onSubmit={handleSubmit}>
          <div className="flex flex-col space-y-5">

            {/* Bulk import shortcut — only when adding (not editing). */}
            {!income && onImportStatement && (
              <button
                type="button"
                onClick={onImportStatement}
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-dashed border-app-border bg-surface-2 px-4 py-2.5 text-xs font-semibold text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
              >
                📄 Import many from a bank statement (CSV / PDF)
              </button>
            )}

            <div>
              <Label htmlFor="income-title">Source</Label>
              <Input id="income-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Stipend, freelance" required />
            </div>

            <div>
                <Label id="income-currency-label">Entry currency</Label>
                <div role="group" aria-labelledby="income-currency-label" className="grid grid-cols-2 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                    <button type="button" onClick={switchToUsd} className={`py-2 rounded-lg text-sm font-semibold transition-all ${!enterInForeign ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>USD ($)</button>
                    <button type="button" onClick={() => setEnterInForeign(true)} className={`py-2 rounded-lg text-sm font-semibold transition-all ${enterInForeign ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>Other currency</button>
                </div>
            </div>

            {/* Foreign-currency entry */}
            {enterInForeign && (
                <div className="rounded-xl border border-app-border bg-surface-2 p-4 space-y-3">
                    <div>
                        <Label htmlFor="income-foreign-cur">Currency</Label>
                        <select
                          id="income-foreign-cur"
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
                        <Label htmlFor="income-foreign-amount">Amount in {foreignCurrency}</Label>
                        <input
                          id="income-foreign-amount"
                          type="number"
                          value={originalAmount}
                          onChange={e => { setOriginalAmount(e.target.value); setOriginalAmountDirty(true); }}
                          placeholder="0.00"
                          className="w-full bg-surface border border-app-border rounded-lg px-3 py-2.5 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                          required step="0.01"
                        />
                    </div>
                    <p className="text-[11px] text-app-muted">USD equivalent is auto-calculated via the Frankfurter API.</p>
                </div>
            )}

            <div>
              <Label htmlFor="income-amount-usd">Amount (USD)</Label>
              <div className="relative">
                  <Input
                    id="income-amount-usd"
                    type="number" value={usdAmount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={isAmountUSDReadOnly ? 'opacity-70' : ''}
                    required readOnly={isAmountUSDReadOnly} step="0.01"
                  />
                  {conversionLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />}
              </div>
              {conversionError && <p role="alert" aria-live="assertive" className="text-xs text-danger font-medium mt-1.5">{conversionError}</p>}
            </div>

            <div>
              <Label htmlFor="income-date">Date</Label>
              <DatePicker id="income-date" value={date} onChange={setDate} required aria-label="Date" />
            </div>

            <div className="relative" ref={categoryDropdownRef}>
          <Label htmlFor="income-category-toggle">Category</Label>
          <button
            id="income-category-toggle"
            type="button"
            onClick={() => { setIsCategoryDropdownOpen(!isCategoryDropdownOpen); setCategorySearchTerm(''); }}
            className={`${inputBase} flex justify-between items-center text-left`}
          >
            <span className="truncate">{category}</span>
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-app-faint"></div>
          </button>

          {isCategoryDropdownOpen && (
            <div className="absolute z-50 mt-2 w-full modal-surface rounded-xl overflow-hidden flex flex-col max-h-64">
              <div className="p-2.5 border-b border-app-border sticky top-0 z-10" style={{ background: 'var(--modal-surface)' }}>
                <input
                  aria-label="Search categories"
                  type="text" placeholder="Search categories…" value={categorySearchTerm}
                  onChange={(e) => setCategorySearchTerm(e.target.value)}
                  className="w-full bg-surface-2 border border-app-border rounded-lg px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto">
                {filteredCategories.map(cat => (
                  <button
                    type="button"
                    key={cat} onClick={() => handleCategorySelect(cat)}
                    className="w-full text-left px-4 py-2.5 text-sm text-app-text hover:bg-surface-2 focus:bg-surface-2 focus:outline-none cursor-pointer transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

            <div>
              <Label htmlFor="income-account">Account (optional)</Label>
              <Input
                id="income-account"
                value={account}
                onChange={e => setAccount(e.target.value)}
                list="income-account-suggestions"
                placeholder="e.g. USCCU Checking"
              />
              <datalist id="income-account-suggestions">
                {knownAccounts.map(a => <option key={a} value={a} />)}
              </datalist>
              <p className="mt-1.5 text-[11px] text-app-muted">Which account this landed in.</p>
            </div>

            <div>
              <Label htmlFor="income-notes">Notes</Label>
              <Textarea id="income-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Source details…" className="h-24 resize-none" />
            </div>

            <div>
              <Label htmlFor="income-tags">Tags (comma separated)</Label>
              <Input
                id="income-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="stipend, freelance, passive"
              />
            </div>

            <div>
              <Label htmlFor="income-metadata">Metadata (one key: value per line)</Label>
              <Textarea
                id="income-metadata"
                value={metadataInput}
                onChange={(e) => setMetadataInput(e.target.value)}
                className="h-24 resize-none"
                placeholder={'client: Acme\ninvoice: INV-204'}
              />
            </div>
          </div>
      </form>
    </Modal>
  );
};

export default IncomeModal;