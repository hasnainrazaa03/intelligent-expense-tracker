import React from 'react';
import type { Expense } from '../../types';
import { getRecurrenceFrequency } from '../../utils/recurrence';
import type { RecurringSuggestions } from '../../hooks/useRecurringSuggestions';

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

/** F3: the recurring charges that are due, to tick and add. */
export const RecurringReview: React.FC<{ recurring: RecurringSuggestions }> = ({ recurring }) => {
  const { pending, selected, toggle, accept, dismiss, snooze } = recurring;
  return (
    <div className="glass rounded-2xl p-5 border border-warn/30">
      <p className="font-display text-sm md:text-base font-semibold text-app-text mb-1">
        🔁 {pending.length} recurring charge{pending.length > 1 ? 's are' : ' is'} due
      </p>
      <p className="text-xs text-app-muted mb-3">Tick the ones to add this cycle. Each is dated at its next due date.</p>
      <ul className="space-y-2 mb-4 max-h-56 overflow-y-auto">
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
              <span className="text-sm font-semibold text-app-text tabular-nums flex-shrink-0">${e.amount.toFixed(2)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={accept}
          disabled={selected.size === 0}
          className="bg-primary text-on-primary shadow-glow font-semibold text-sm py-2 px-4 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add selected ({selected.size})
        </button>
        <button onClick={dismiss} className="bg-surface-2 border border-app-border text-app-text font-semibold text-sm py-2 px-4 rounded-xl hover:border-app-border-strong transition-all">
          Dismiss
        </button>
        <button onClick={snooze} className="text-app-muted hover:text-app-text font-semibold text-sm py-2 px-4 rounded-xl transition-all">
          Snooze 24h
        </button>
      </div>
    </div>
  );
};

/** Overview vs list, inside the Expenses and Income hubs. */
export const HubTabs: React.FC<{ value: 'overview' | 'list'; onChange: (tab: 'overview' | 'list') => void; listLabel: string }> = ({ value, onChange, listLabel }) => (
  <div role="tablist" aria-label="Hub section" className="flex items-center gap-1 bg-surface-2 border border-app-border rounded-xl p-1 w-fit">
    {([{ id: 'overview' as const, label: 'Overview' }, { id: 'list' as const, label: listLabel }]).map((t) => (
      <button
        key={t.id}
        role="tab"
        aria-selected={value === t.id}
        onClick={() => onChange(t.id)}
        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${value === t.id ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
      >
        {t.label}
      </button>
    ))}
  </div>
);
