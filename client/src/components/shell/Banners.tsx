import React, { useState } from 'react';
import type { Expense } from '../../types';
import { getRecurrenceFrequency } from '../../utils/recurrence';
import type { RecurringSuggestions } from '../../hooks/useRecurringSuggestions';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { CalendarDaysIcon } from '../Icons';
import { Button, Modal } from '../ui';

/** C2: a failed load says so, with Retry, instead of looking like an empty account. */
export const DataLoadBanner: React.FC<{ hasPartialData: boolean; retrying: boolean; onRetry: () => void }> = ({ hasPartialData, retrying, onRetry }) => (
  <section role="alert" className="glass rounded-2xl p-5 md:p-6 border border-danger/40">
    <h3 className="font-display text-lg font-bold text-app-text mb-1.5">Couldn't load your data</h3>
    <p className="text-sm text-app-muted mb-4">
      {typeof navigator !== 'undefined' && !navigator.onLine ? "You're offline. " : "The server didn't respond. "}
      Budgets, tuition and imports are paused until it loads, so nothing gets overwritten.
      {hasPartialData ? ' Anything you add now is kept and shown here.' : ''}
    </p>
    <button type="button" onClick={onRetry} disabled={retrying} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-60">
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  </section>
);

export const OnboardingCard: React.FC<{ onAddExpense: () => void; onAddIncome: () => void; onDismiss: () => void }> = ({ onAddExpense, onAddIncome, onDismiss }) => (
  <section className="glass rounded-2xl p-5 md:p-6">
    <h3 className="font-display text-lg md:text-xl font-bold text-app-text mb-1.5">Welcome to Orbit</h3>
    <p className="text-sm text-app-muted mb-4">Start by adding one expense, one income, then set a budget for your top category.</p>
    <div className="flex flex-wrap gap-2.5">
      <button onClick={onAddExpense} className="bg-primary text-on-primary shadow-glow font-semibold text-sm py-2 px-4 rounded-xl hover:brightness-110 transition-all">
        Add first expense
      </button>
      <button onClick={onAddIncome} className="bg-surface-2 border border-app-border text-app-text font-semibold text-sm py-2 px-4 rounded-xl hover:border-app-border-strong transition-all">
        Add first income
      </button>
      <button onClick={onDismiss} className="text-app-muted hover:text-app-text font-semibold text-sm py-2 px-4 rounded-xl transition-all">
        Dismiss
      </button>
    </div>
  </section>
);

/**
 * F3: the recurring charges that are due. One line on the Expenses home
 * ("4 recurring charges due · $1,550.24 · Review") instead of a box on every
 * screen; Review opens the list, with nothing ticked, to pick what to add.
 */
export const RecurringNotice: React.FC<{ recurring: RecurringSuggestions }> = ({ recurring }) => {
  const [open, setOpen] = useState(false);
  const { displayCurrency, conversionRate } = useCurrency();
  const { pending } = recurring;
  const total = pending.reduce((sum, e) => sum + e.amount, 0);
  const money = (n: number) => formatCurrency(n, displayCurrency, conversionRate);
  return (
    <>
      <section
        aria-label="Recurring charges due"
        className="glass rounded-2xl px-4 py-3 border border-warn/30 flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <CalendarDaysIcon className="h-5 w-5 text-warn flex-shrink-0" aria-hidden="true" />
        <p className="text-sm text-app-text min-w-0 flex-1">
          <span className="font-semibold">
            {pending.length} recurring charge{pending.length === 1 ? '' : 's'} due
          </span>
          <span className="text-app-muted tabular-nums"> · {money(total)}</span>
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>Review</Button>
      </section>
      <RecurringReviewDialog recurring={recurring} isOpen={open} onClose={() => setOpen(false)} money={money} />
    </>
  );
};

const RecurringReviewDialog: React.FC<{
  recurring: RecurringSuggestions;
  isOpen: boolean;
  onClose: () => void;
  money: (n: number) => string;
}> = ({ recurring, isOpen, onClose, money }) => {
  const { pending, selected, toggle, selectAll, selectNone, accept, dismiss, snooze } = recurring;
  const allTicked = pending.length > 0 && selected.size === pending.length;
  const close = (action?: () => unknown) => () => { onClose(); action?.(); };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Recurring charges due"
      subtitle="Tick the ones to add. Each is dated at its next due date."
      footer={
        <div className="flex flex-wrap gap-2.5 w-full">
          <Button onClick={close(accept)} disabled={selected.size === 0}>
            Add selected ({selected.size})
          </Button>
          <Button variant="secondary" onClick={close(dismiss)}>Dismiss</Button>
          <Button variant="ghost" onClick={close(snooze)}>Snooze 24h</Button>
        </div>
      }
    >
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={allTicked ? selectNone : selectAll}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {allTicked ? 'Select none' : 'Select all'}
        </button>
      </div>
      <ul className="space-y-2">
        {pending.map((e: Omit<Expense, 'id'>, i) => (
          <li key={`${e.title}-${e.date}-${i}`}>
            <label className="flex items-center gap-3 rounded-xl border border-app-border bg-surface-2 px-3 py-2.5 cursor-pointer hover:border-app-border-strong transition-colors">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="accent-[color:var(--primary)] w-4 h-4 flex-shrink-0"
                aria-label={`Add recurring ${e.title}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-app-text truncate">{e.title}</span>
                <span className="block text-[11px] text-app-muted">{e.category} · {e.date} · {getRecurrenceFrequency(e)}</span>
              </span>
              <span className="text-sm font-semibold text-app-text tabular-nums flex-shrink-0">{money(e.amount)}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
