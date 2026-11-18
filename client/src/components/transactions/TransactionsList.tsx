import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Expense, Income } from '../../types';
import { DateRangeFilter, type DateRange } from '../DateRangeFilter';
import SectionTabs from '../shell/SectionTabs';
import SectionSkeleton from '../SectionSkeleton';
import EmptyState from '../EmptyState';
import ConfirmationDialog from '../ConfirmationDialog';
import { Button } from '../ui';
import TransactionRow from './TransactionRow';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useCategories } from '../../hooks/useCategories';
import useUndoableDelete, { usePendingDeleteIds } from '../../hooks/useUndoableDelete';
import { formatCurrency } from '../../utils/currencyUtils';
import { parseCalendarDate } from '../../utils/dateUtils';
import { notify } from '../../utils/notifications';
import { INCOME_CATEGORIES } from '../../constants';
import * as api from '../../services/api';
import {
  filterEntries, groupByDay, hasFilters, readListParams, sortEntries, toEntries,
  type Entry, type EntryType,
} from '../../utils/transactionsView';
import { PATHS } from '../../app/routes';

const PAGE = 50;

interface TransactionsListProps {
  type: EntryType;
  /** In the period and matching the header search. */
  expenses: Expense[];
  incomes: Income[];
  /** The account has entries of each kind at all (an empty list then means "filtered out"). */
  hasAnyExpenses: boolean;
  hasAnyIncomes: boolean;
  isLoading: boolean;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  search: string;
  onClearSearch: () => void;
  onEditExpense: (e: Expense) => void;
  onEditIncome: (i: Income) => void;
  onQuickSaveExpense: (e: Expense) => Promise<void> | void;
  onQuickSaveIncome: (i: Income) => Promise<void> | void;
  onDeleteExpense: (id: string) => Promise<void> | void;
  onDeleteIncome: (id: string) => Promise<void> | void;
  /** After a bulk change: reload the data. */
  onBulkChanged: () => Promise<unknown> | void;
  /** Opens the bank-statement importer (it used to sit at the top of the add form). */
  onImportStatement: () => void;
  onCreate: () => void;
}

const key = (e: Entry) => `${e.kind}:${e.item.id}`;
const NOUN: Record<EntryType, string> = { all: 'entries', expenses: 'expenses', income: 'income entries' };
const PERIOD: Record<DateRange, string | null> = { this_month: 'this month', last_month: 'last month', last_90_days: 'the last 90 days', all_time: null };

/**
 * Transactions (U4): expenses and income in one compact list, grouped by day
 * with each day's totals. All / Expenses / Income, the period, sort and
 * filters (category, account or card, payment method, tag, amount) sit on top
 * and live in the address. "Select" ticks entries to recategorise or delete
 * together; a single delete has an Undo window instead of a dialog.
 */
const TransactionsList: React.FC<TransactionsListProps> = ({
  type, expenses, incomes, hasAnyExpenses, hasAnyIncomes, isLoading, dateRange, onDateRangeChange, search, onClearSearch,
  onEditExpense, onEditIncome, onQuickSaveExpense, onQuickSaveIncome, onDeleteExpense, onDeleteIncome, onBulkChanged, onImportStatement, onCreate,
}) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const money = (n: number) => formatCurrency(n, displayCurrency, conversionRate);
  const { subToMain, allSubcategories, categories: categoryMap } = useCategories();
  const [params, setParams] = useSearchParams();
  // Rebuilt only when the address changes, so the memos below stay put.
  const paramsKey = params.toString();
  const { filters, sort } = useMemo(() => readListParams(new URLSearchParams(paramsKey)), [paramsKey]);
  const [shown, setShown] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(() => hasFilters(filters));
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [busy, setBusy] = useState(false);

  const pendingIds = usePendingDeleteIds();
  const scheduleExpenseDelete = useUndoableDelete(onDeleteExpense);
  const scheduleIncomeDelete = useUndoableDelete(onDeleteIncome);

  const setParam = (name: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
    setShown(PAGE);
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const name of ['category', 'account', 'method', 'tag', 'min', 'max']) next.delete(name);
    setParams(next, { replace: true });
  };

  const entries = useMemo(
    () => sortEntries(filterEntries(toEntries(expenses, incomes, type), filters, subToMain).filter((e) => !pendingIds.has(e.item.id)), sort),
    [expenses, incomes, type, filters, subToMain, pendingIds, sort],
  );
  const totals = useMemo(() => entries.reduce(
    (t, e) => (e.kind === 'expense' ? { ...t, out: t.out + e.item.amount } : { ...t, in: t.in + e.item.amount }),
    { out: 0, in: 0 },
  ), [entries]);
  const visible = entries.slice(0, shown);
  const groups = sort === 'largest' ? [{ date: '', entries: visible, spent: 0, earned: 0 }] : groupByDay(visible);

  // Options for the filter menus, from what's in the period.
  const options = useMemo(() => {
    const accounts = new Set<string>(), methods = new Set<string>(), tags = new Set<string>(), cats = new Set<string>();
    for (const e of expenses) {
      if (e.account) accounts.add(e.account);
      if (e.paymentMethod) methods.add(e.paymentMethod);
      e.tags?.forEach((t) => tags.add(t));
    }
    for (const i of incomes) {
      if (i.account) accounts.add(i.account);
      i.tags?.forEach((t) => tags.add(t));
      cats.add(i.category);
    }
    return {
      categories: [...Object.keys(categoryMap), ...[...cats].filter((c) => !(c in categoryMap))],
      accounts: [...accounts].sort(), methods: [...methods].sort(), tags: [...tags].sort(),
    };
  }, [expenses, incomes, categoryMap]);

  // --- Selection and bulk actions ----------------------------------------------
  // Only ticked entries still in the list count: a search or filter that hides
  // some leaves them out of the count and of every bulk action.
  const selectedEntries = entries.filter((e) => selected.has(key(e)));
  const selectedCount = selectedEntries.length;
  const selectedKinds = new Set(selectedEntries.map((e) => e.kind));
  const allShownSelected = visible.length > 0 && visible.every((e) => selected.has(key(e)));
  const toggle = (e: Entry) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key(e))) next.delete(key(e)); else next.add(key(e));
    return next;
  });
  const endSelect = () => { setSelectMode(false); setSelected(new Set()); setBulkCategory(''); };
  const idsOf = (kind: Entry['kind']) => selectedEntries.filter((e) => e.kind === kind).map((e) => e.item.id);

  const runBulk = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      notify.success(await action());
      await onBulkChanged();
      endSelect();
    } catch (error) {
      notify.error(error instanceof Error && error.message ? error.message : "Couldn't change those entries. Nothing was lost; try again.");
    } finally {
      setBusy(false);
    }
  };
  const bulkDelete = () => runBulk(async () => {
    const [ex, inc] = await Promise.all([
      idsOf('expense').length ? api.bulkDelete('expenses', idsOf('expense')) : { deleted: 0 },
      idsOf('income').length ? api.bulkDelete('incomes', idsOf('income')) : { deleted: 0 },
    ]);
    const n = ex.deleted + inc.deleted;
    return `Deleted ${n} ${n === 1 ? 'entry' : 'entries'}.`;
  }).finally(() => setConfirmBulkDelete(false));
  const bulkRecategorise = () => runBulk(async () => {
    const kind = selectedKinds.has('income') ? 'incomes' : 'expenses';
    const ids = selectedEntries.map((e) => e.item.id);
    const { updated } = await api.bulkRecategorise(kind, ids, bulkCategory);
    return `Moved ${updated} ${updated === 1 ? 'entry' : 'entries'} to ${bulkCategory}.`;
  });
  const bulkCategoryOptions = selectedKinds.has('income') ? INCOME_CATEGORIES : allSubcategories;

  const remove = (e: Entry) => (e.kind === 'expense'
    ? scheduleExpenseDelete(e.item.id, `Deleted “${e.item.title}”.`)
    : scheduleIncomeDelete(e.item.id, `Deleted “${e.item.title}”.`));

  if (isLoading) return <SectionSkeleton title="Loading transactions" rows={6} />;

  const hasAny = type === 'income' ? hasAnyIncomes : type === 'expenses' ? hasAnyExpenses : hasAnyExpenses || hasAnyIncomes;
  const period = PERIOD[dateRange];
  const field = 'bg-surface-2 border border-app-border rounded-lg px-2.5 py-1.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50';
  const chip = (label: string, name: string) => (
    <button
      key={name}
      type="button"
      onClick={() => setParam(name, undefined)}
      aria-label={`Remove filter ${label}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft text-primary text-xs font-semibold px-3 py-1 hover:brightness-110"
    >
      {label} <span aria-hidden="true">×</span>
    </button>
  );
  const activeChips = [
    filters.category && chip(filters.category, 'category'),
    filters.account && chip(filters.account, 'account'),
    filters.method && chip(filters.method, 'method'),
    filters.tag && chip(`#${filters.tag}`, 'tag'),
    filters.min !== undefined && chip(`From ${money(filters.min)}`, 'min'),
    filters.max !== undefined && chip(`Up to ${money(filters.max)}`, 'max'),
  ].filter(Boolean);

  const typeLink = (t: EntryType) => {
    const base = t === 'all' ? PATHS.transactions : t === 'expenses' ? PATHS.transactionsExpenses : PATHS.transactionsIncome;
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight tracking-tight">Transactions</h2>
          <p className="text-sm text-app-muted mt-1 tabular-nums" role="status">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            {totals.out > 0 && <> · <span className="text-app-text font-medium">{money(totals.out)}</span> out</>}
            {totals.in > 0 && <> · <span className="text-ok font-medium">{money(totals.in)}</span> in</>}
          </p>
        </div>
        <div className="flex lg:justify-end overflow-x-auto no-scrollbar py-1">
          <DateRangeFilter selectedRange={dateRange} onChange={(r) => { onDateRangeChange(r); setShown(PAGE); }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionTabs
          label="Transaction type"
          tabs={[
            { label: 'All', to: typeLink('all'), active: type === 'all' },
            { label: 'Expenses', to: typeLink('expenses'), active: type === 'expenses' },
            { label: 'Income', to: typeLink('income'), active: type === 'income' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <label className="sr-only" htmlFor="tx-sort">Sort</label>
          <select id="tx-sort" value={sort} onChange={(e) => setParam('sort', e.target.value === 'newest' ? undefined : e.target.value)} className={field}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest amount</option>
          </select>
          <Button variant="secondary" size="sm" aria-expanded={showFilters} aria-controls="tx-filters" onClick={() => setShowFilters((s) => !s)}>
            Filters{activeChips.length ? ` (${activeChips.length})` : ''}
          </Button>
          <Button variant="secondary" size="sm" onClick={onImportStatement}>Import statement</Button>
          <Button variant={selectMode ? 'primary' : 'secondary'} size="sm" onClick={() => (selectMode ? endSelect() : setSelectMode(true))}>
            {selectMode ? 'Done' : 'Select'}
          </Button>
        </div>
      </div>

      {showFilters && (
        <div id="tx-filters" className="glass rounded-2xl p-3 md:p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <label className="text-xs text-app-muted flex flex-col gap-1">Category
            <select value={filters.category ?? ''} onChange={(e) => setParam('category', e.target.value || undefined)} className={field}>
              <option value="">Any</option>
              {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-app-muted flex flex-col gap-1">Account or card
            <select value={filters.account ?? ''} onChange={(e) => setParam('account', e.target.value || undefined)} className={field}>
              <option value="">Any</option>
              {options.accounts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-app-muted flex flex-col gap-1">Payment method
            <select value={filters.method ?? ''} onChange={(e) => setParam('method', e.target.value || undefined)} className={field}>
              <option value="">Any</option>
              {options.methods.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-app-muted flex flex-col gap-1">Tag
            <select value={filters.tag ?? ''} onChange={(e) => setParam('tag', e.target.value || undefined)} className={field}>
              <option value="">Any</option>
              {options.tags.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-app-muted flex flex-col gap-1">Amount from
            <input type="number" min={0} inputMode="decimal" value={filters.min ?? ''} onChange={(e) => setParam('min', e.target.value || undefined)} className={field} />
          </label>
          <label className="text-xs text-app-muted flex flex-col gap-1">Amount up to
            <input type="number" min={0} inputMode="decimal" value={filters.max ?? ''} onChange={(e) => setParam('max', e.target.value || undefined)} className={field} />
          </label>
        </div>
      )}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips}
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline underline-offset-2">Clear filters</button>
        </div>
      )}

      {selectMode && (
        <div className="glass rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-2.5 sticky top-0 z-10" role="region" aria-label="Selected entries">
          <label className="flex items-center gap-2 text-sm text-app-text">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={() => setSelected(allShownSelected ? new Set() : new Set(visible.map(key)))}
              className="accent-[color:var(--primary)] w-4 h-4"
            />
            Select all shown
          </label>
          <span className="text-sm text-app-muted tabular-nums">{selectedCount} selected</span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {selectedKinds.size > 1 ? (
              <span className="text-xs text-app-muted">Pick only expenses or only income to change their category.</span>
            ) : (
              <>
                <label className="sr-only" htmlFor="tx-bulk-category">New category</label>
                <select id="tx-bulk-category" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className={field} disabled={selectedCount === 0}>
                  <option value="">Move to category…</option>
                  {bulkCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <Button size="sm" variant="secondary" disabled={!bulkCategory || selectedCount === 0 || busy} onClick={() => { void bulkRecategorise(); }}>Move</Button>
              </>
            )}
            <Button size="sm" variant="danger" disabled={selectedCount === 0 || busy} onClick={() => setConfirmBulkDelete(true)}>Delete</Button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        hasAny ? (
          <EmptyState
            title="Nothing matches"
            subtitle={`No ${NOUN[type]}${search ? ` match “${search}”` : ''}${period ? ` in ${period}` : ''}.`}
            actions={[
              ...(search ? [{ label: 'Clear search', onClick: onClearSearch }] : []),
              ...(hasFilters(filters) ? [{ label: 'Clear filters', onClick: clearFilters }] : []),
              ...(period ? [{ label: 'Show all time', onClick: () => onDateRangeChange('all_time') }] : []),
            ]}
          />
        ) : (
          <EmptyState
            title={type === 'income' ? 'No income yet' : 'No transactions yet'}
            subtitle={type === 'income' ? 'Add income to see it here.' : 'Start by logging your first expense to see it here.'}
            ctaLabel={type === 'income' ? 'Add income' : 'Add first expense'}
            onCta={onCreate}
          />
        )
      ) : (
        <div className="glass rounded-2xl p-2 md:p-3">
          {groups.map((g) => (
            <section key={g.date || 'all'} aria-label={g.date ? parseCalendarDate(g.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Largest first'}>
              {g.date && (
                <div className="flex items-baseline justify-between gap-3 px-2.5 pt-3 pb-1 text-xs">
                  <span className="font-semibold text-app-muted">{parseCalendarDate(g.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="tabular-nums text-app-muted">
                    {g.spent > 0 && <>{money(g.spent)} out</>}
                    {g.spent > 0 && g.earned > 0 && ' · '}
                    {g.earned > 0 && <span className="text-ok">{money(g.earned)} in</span>}
                  </span>
                </div>
              )}
              <ul className="space-y-0.5">
                {g.entries.map((e) => (
                  <TransactionRow
                    key={key(e)}
                    entry={e}
                    selectMode={selectMode}
                    selected={selected.has(key(e))}
                    onToggle={() => toggle(e)}
                    onEdit={() => (e.kind === 'expense' ? onEditExpense(e.item) : onEditIncome(e.item))}
                    onDelete={() => remove(e)}
                    onQuickSave={(next) => (e.kind === 'expense' ? onQuickSaveExpense(next as Expense) : onQuickSaveIncome(next as Income))}
                  />
                ))}
              </ul>
            </section>
          ))}
          {entries.length > shown && (
            <div className="flex justify-center pt-3 pb-1">
              <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Load more ({Math.min(PAGE, entries.length - shown)} of {entries.length - shown} left)
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmationDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => { void bulkDelete(); }}
        title={`Delete ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'}?`}
        confirmLabel="Delete"
        loading={busy}
      >
        This can't be undone. Tuition payments among them re-open their installments.
      </ConfirmationDialog>
    </div>
  );
};

export default TransactionsList;
