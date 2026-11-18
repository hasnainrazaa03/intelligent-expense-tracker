import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Income } from '../types';
import { INCOME_CATEGORIES } from '../constants';
import { formatCalendarDate, parseCalendarDate, todayCalendar } from '../utils/dateUtils';
import useForeignToUsd from '../hooks/useForeignToUsd';
import useDropdownKeyboard from '../hooks/useDropdownKeyboard';
import { useCurrency } from '../contexts/CurrencyContext';
import { Modal, Button, Input, Textarea, Label, DatePicker } from './ui';
import toast from 'react-hot-toast';
import type { EntryDraft, SaveOptions } from './entryDraft';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves `false` when the save failed, so the form stays open. */
  onSave: (income: any, options?: SaveOptions) => Promise<boolean | void> | boolean | void;
  income: Income | null;
  /** Past income: sources are suggested, and picking one fills its category and account (U4). */
  pastIncomes?: Income[];
  /** New entries: switch to the expense form, carrying title, amount and date. */
  onSwitchKind?: (draft: EntryDraft) => void;
  /** Starting values when the form was switched from an expense. */
  draft?: EntryDraft;
  /** Accounts already in use, offered as suggestions (mirrors ExpenseModal). */
  knownAccounts?: string[];
}

const IncomeModal: React.FC<IncomeModalProps> = ({ isOpen, onClose, onSave, income, pastIncomes = [], onSwitchKind, draft, knownAccounts = [] }) => {
  const { displayCurrency, rateForEntry, availableCurrencies } = useCurrency();
  // The form starts from the income being edited (or blank). The dialog is
  // mounted for each opening, so these initial values are all it needs; an
  // effect used to refill the form, and reset it if the display currency changed.
  const storedForeign = Boolean(income?.originalCurrency && income.originalCurrency !== 'USD' && income.originalAmount);
  const [title, setTitle] = useState(income?.title ?? draft?.title ?? '');
  const [amount, setAmount] = useState(income ? income.amount.toString() : draft?.amount ?? '');
  const [category, setCategory] = useState<string>(income?.category ?? INCOME_CATEGORIES[0]);
  const [date, setDate] = useState(() => income?.date ?? draft?.date ?? todayCalendar());
  // Account, notes, tags and metadata sit under "More details" (U4).
  const [moreOpen, setMoreOpen] = useState(() => Boolean(income && (income.account || income.notes || income.tags?.length || Object.keys(income.metadata ?? {}).length)));
  const amountRef = useRef<HTMLInputElement>(null);
  const pastBySource = useMemo(() => {
    const map = new Map<string, Income>();
    for (const i of [...pastIncomes].sort((a, b) => b.date.localeCompare(a.date))) {
      const k = i.title.trim().toLowerCase();
      if (k && !map.has(k)) map.set(k, i);
    }
    return map;
  }, [pastIncomes]);
  const changeTitle = (value: string) => {
    setTitle(value);
    const past = income ? undefined : pastBySource.get(value.trim().toLowerCase());
    if (past) {
      setCategory(past.category);
      if (past.account) setAccount((a) => a || past.account!);
    }
  };
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  const save = async (keepOpen: boolean) => {
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
      const ok = await onSave(income ? { ...incomeData, id: income.id } : incomeData, { keepOpen });
      if (ok !== false) {
        if (keepOpen) {
          // The date and account stay for the next one.
          toast.success(`Added “${incomeData.title}”. Next one?`);
          setTitle(''); setAmount(''); setOriginalAmount(''); setOriginalAmountDirty(false);
          setNotes(''); setTagsInput(''); setMetadataInput('');
          amountRef.current?.focus();
        } else onClose();
      }
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
          {!income && (
            <Button variant="secondary" fullWidth disabled={isSaving || isConversionPending} onClick={() => { void save(true); }}>
              Save &amp; add another
            </Button>
          )}
          <Button type="submit" form="income-form" fullWidth disabled={isSaving || isConversionPending}>
            {isSaving ? 'Saving…' : income ? 'Save changes' : 'Add income'}
          </Button>
        </>
      }
    >
      <form id="income-form" onSubmit={handleSubmit}>
          <div className="flex flex-col space-y-5">

            {/* One form for both (U4): a new entry can switch to an expense. */}
            {!income && onSwitchKind && (
              <div role="group" aria-label="Kind of entry" className="grid grid-cols-2 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                <button type="button" aria-pressed="false" onClick={() => onSwitchKind({ title, amount: usdAmount, date })} className="py-2 rounded-lg text-sm font-semibold text-app-muted hover:text-app-text">Expense</button>
                <button type="button" aria-pressed="true" className="py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary shadow-glow">Income</button>
              </div>
            )}

            <div>
              <Label htmlFor="income-amount-usd">Amount (USD)</Label>
              <div className="relative">
                  <Input
                    ref={amountRef}
                    id="income-amount-usd"
                    type="number" inputMode="decimal" value={usdAmount} onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={`!text-2xl !font-display !font-bold !py-3.5 tabular-nums ${isAmountUSDReadOnly ? 'opacity-70' : ''}`}
                    required readOnly={isAmountUSDReadOnly} step="0.01"
                  />
                  {conversionLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />}
              </div>
              {conversionError && <p role="alert" aria-live="assertive" className="text-xs text-danger font-medium mt-1.5">{conversionError}</p>}
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
              <Label htmlFor="income-title">Source</Label>
              <Input id="income-title" type="text" value={title} onChange={e => changeTitle(e.target.value)} placeholder="e.g. Stipend, freelance" list={income ? undefined : 'income-title-suggestions'} autoComplete="off" required />
              {!income && (
                <datalist id="income-title-suggestions">
                  {[...pastBySource.values()].slice(0, 60).map((i) => <option key={i.title} value={i.title} />)}
                </datalist>
              )}
            </div>

            <div>
              <Label htmlFor="income-date">Date</Label>
              <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Quick dates">
                {[{ label: 'Today', value: todayCalendar() }, { label: 'Yesterday', value: (() => { const d = parseCalendarDate(todayCalendar()); d.setDate(d.getDate() - 1); return formatCalendarDate(d); })() }].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    aria-pressed={date === q.value}
                    onClick={() => setDate(q.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${date === q.value ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
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

            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="income-more"
              onClick={() => setMoreOpen((o) => !o)}
              className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-2"
            >
              <span aria-hidden="true" className={`inline-block transition-transform ${moreOpen ? 'rotate-90' : ''}`}>›</span>
              More details
            </button>
            <div id="income-more" hidden={!moreOpen} className="space-y-5">
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
          </div>
      </form>
    </Modal>
  );
};

export default IncomeModal;