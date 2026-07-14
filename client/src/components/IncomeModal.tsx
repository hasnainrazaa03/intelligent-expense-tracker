import React, { useState, useEffect, useMemo } from 'react';
import { Income } from '../types';
import { INCOME_CATEGORIES } from '../constants';
import { todayCalendar } from '../utils/dateUtils';
import useInrToUsd from '../hooks/useInrToUsd';
import { useCurrency } from '../contexts/CurrencyContext';
import { Modal, Button, Input, Textarea, Label } from './ui';

interface IncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (income: any) => void;
  income: Income | null;
}

const IncomeModal: React.FC<IncomeModalProps> = ({ isOpen, onClose, onSave, income }) => {
  const { displayCurrency, conversionRate: parentConversionRate } = useCurrency();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [date, setDate] = useState(todayCalendar());
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [metadataInput, setMetadataInput] = useState('');

  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'INR'>('USD');
  const [originalAmount, setOriginalAmount] = useState('');

  const {
    convertedAmount,
    rate: conversionRate,
    loading: conversionLoading,
    error: conversionError,
  } = useInrToUsd(selectedCurrency, originalAmount, parentConversionRate ?? null);

  const isAmountUSDReadOnly = selectedCurrency === 'INR';

  // Mirror the derived USD amount in INR mode ('' when cleared/failed — CMP-H5).
  useEffect(() => {
    if (selectedCurrency === 'INR') {
      setAmount(convertedAmount);
    }
  }, [convertedAmount, selectedCurrency]);

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
      setTagsInput((income.tags || []).join(', '));
      setMetadataInput(
        income.metadata
          ? Object.entries(income.metadata)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
          : ''
      );
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
      setDate(todayCalendar());
      setNotes(''); 
      setTagsInput('');
      setMetadataInput('');
      setSelectedCurrency(displayCurrency); 
      setOriginalAmount('');
    }
  }, [income, isOpen, displayCurrency]);

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
          <Button type="submit" form="income-form" fullWidth>{income ? 'Save changes' : 'Add income'}</Button>
        </>
      }
    >
      <form id="income-form" onSubmit={handleSubmit}>
          <div className="flex flex-col space-y-5">

            <div>
              <Label htmlFor="income-title">Source</Label>
              <Input id="income-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Stipend, freelance" required />
            </div>

            <div>
                <Label id="income-currency-label">Currency</Label>
                <div role="group" aria-labelledby="income-currency-label" className="grid grid-cols-2 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                    <button type="button" onClick={() => setSelectedCurrency('USD')} className={`py-2 rounded-lg text-sm font-semibold transition-all ${selectedCurrency === 'USD' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>USD ($)</button>
                    <button type="button" onClick={() => setSelectedCurrency('INR')} className={`py-2 rounded-lg text-sm font-semibold transition-all ${selectedCurrency === 'INR' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>INR (₹)</button>
                </div>
            </div>

            {/* INR entry */}
            {selectedCurrency === 'INR' && (
                <div className="rounded-xl border border-app-border bg-surface-2 p-4">
                    <Label htmlFor="income-inr-amount">Amount in INR</Label>
                    <div className="flex items-center gap-2">
                        <span className="font-display text-xl text-app-muted">₹</span>
                        <input
                          id="income-inr-amount"
                          type="number"
                          value={originalAmount}
                          onChange={e => setOriginalAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-surface border border-app-border rounded-lg px-3 py-2.5 text-base text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                          required step="0.01"
                        />
                    </div>
                    <p className="mt-2 text-[11px] text-app-muted">USD equivalent is auto-calculated via the Frankfurter API.</p>
                </div>
            )}

            <div>
              <Label htmlFor="income-amount-usd">Amount (USD)</Label>
              <div className="relative">
                  <Input
                    id="income-amount-usd"
                    type="number" value={amount} onChange={e => setAmount(e.target.value)}
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
              <Input id="income-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
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