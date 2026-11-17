import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Expense, Budget, Semester, Income } from './types';
import Header from './components/Header';
import { DateRangeFilter, type DateRange } from './components/DateRangeFilter';
import IncomeSummary from './components/IncomeSummary';
import { PlusCircleIcon, ClipboardDocumentListIcon, TableCellsIcon, AcademicCapIcon, ChartPieIcon, BanknotesIcon, ChatBubbleBottomCenterTextIcon } from './components/Icons';
import { USC_SEMESTERS } from './constants';
import { fuzzyMatch } from './utils/fuzzySearch';
import { distributeAmount } from './utils/currencyUtils';
import { startOfMonth, endOfMonth, isWithinRange, todayCalendar } from './utils/dateUtils';
import { computeDueRecurring, getRecurrenceFrequency } from './utils/recurrence';
import { budgetForExpense, computeBudgetSpend, budgetLabel } from './utils/budgetUtils';
import { stripTuition } from './utils/tuition';
import { getAllData, isAuthError } from './services/api';
import { useAuth } from './contexts/AuthContext';
import { createExpense, updateExpense, deleteExpense, createIncome, updateIncome, deleteIncome, saveBudgets, saveSemesters, createBulkExpenses, createBulkIncomes, restoreAllData, wipeAllData } from './services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './lib/queryClient';
import type { AllDataResponse } from './types/api';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import useDateRangeFilter from './hooks/useDateRangeFilter';
import useOfflineQueue from './hooks/useOfflineQueue';
import { enqueueExpense, type PendingExpense } from './utils/offlineQueue';
import { notify } from './utils/notifications';
import { userStorage } from './utils/userStorage';
import SectionSkeleton from './components/SectionSkeleton';
import { APP_CONFIG } from './config';

// A dynamic-import ("chunk load") failure almost always means this browser is
// holding a stale index.html from before a new deploy — it points at hashed
// chunk filenames the server no longer serves, so the request falls back to
// index.html (text/html) and the module fails its MIME check. Force ONE reload
// to pick up the fresh index + chunks; a sessionStorage guard prevents an
// infinite reload loop if the failure is something else. On success we clear the
// guard so a future deploy can reload again.
const lazyWithReload = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    const RELOAD_KEY = 'orbit:chunk-reloaded';
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        return await new Promise<{ default: T }>(() => {}); // hold until reload
      }
      throw err;
    }
  });

const Dashboard = lazyWithReload(() => import('./components/Dashboard'));
const ExpenseList = lazyWithReload(() => import('./components/ExpenseList'));
const IncomeList = lazyWithReload(() => import('./components/IncomeList'));
const ExpenseModal = lazyWithReload(() => import('./components/ExpenseModal'));
const IncomeModal = lazyWithReload(() => import('./components/IncomeModal'));
const BudgetManagerModal = lazyWithReload(() => import('./components/BudgetManagerModal'));
const CategoryManagerModal = lazyWithReload(() => import('./components/CategoryManagerModal'));
const DataModal = lazyWithReload(() => import('./components/ExportModal'));
const StatementImportModal = lazyWithReload(() => import('./components/StatementImportModal'));
const AiAnalyst = lazyWithReload(() => import('./components/AiAnalyst'));
const Auth = lazyWithReload(() => import('./components/Auth'));
const VerifyOTP = lazyWithReload(() => import('./components/VerifyOTP'));
const LandingPage = lazyWithReload(() => import('./components/LandingPage'));
const KnowledgeBase = lazyWithReload(() => import('./components/KnowledgeBase'));
const MobileInstallPrompt = lazyWithReload(() => import('./components/MobileInstallPrompt'));
const USCPaymentTracker = lazyWithReload(() => import('./components/USCPaymentTracker'));
const PivotAnalysis = lazyWithReload(() => import('./components/PivotAnalysis'));
const Reports = lazyWithReload(() => import('./components/Reports'));

type ActiveView = 'expenses' | 'income' | 'ai' | 'pivot' | 'usc' | 'reports';

/** Idempotency key for one bulk-import batch, so a retry can be recognised and
 *  rejected server-side instead of duplicating the whole import. */
const newBatchId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// Default (empty) tuition plan used when the server has no semesters yet.
const buildDefaultSemesters = (): Semester[] =>
  USC_SEMESTERS.map((s) => ({
    ...s,
    totalTuition: 0,
    installments: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, amount: 0, status: 'unpaid' })),
  }));

const EMPTY_ALL_DATA: AllDataResponse = { expenses: [], incomes: [], budgets: [], semesters: [] };

const RECURRING_SNOOZE_KEY = 'recurringReminderSnoozeUntil';
const ONBOARDING_DISMISSED_KEY = 'onboardingDismissed';

const VerticalTab = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, colorClass?: string }) => {
    return (
        <button
            onClick={onClick}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            title={label}
            className={`group relative flex items-center gap-3 w-full pl-[10px] pr-2 py-2.5 rounded-xl transition-colors flex-shrink-0 text-left
                ${isActive
                    ? 'bg-primary text-on-primary shadow-glow'
                    : 'text-app-muted hover:text-app-text hover:bg-surface-2'
                }`}
        >
            <span className={`flex-shrink-0 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`}>{icon}</span>
            <span className="text-sm font-semibold tracking-tight whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150">{label}</span>
        </button>
    );
}

const App: React.FC = () => {
  const navRef = useRef<HTMLElement | null>(null);
  // --- Data store: React Query owns the four collections (replaces useState +
  // the hand-rolled getAllData/cache). Setter wrappers keep the useState-style
  // API so every existing handler works unchanged; they patch the ['allData']
  // cache entry, which is keyed per-query by React Query (fixes the cross-user
  // cache bug where a stale entry could survive a failed logout — APP-M6). ---
  const queryClient = useQueryClient();
  const { isAuthenticated, userEmail, twoFactorEnabled, loginSuccess, logout, toggleTwoFactor } = useAuth();

  // True once /data/all has actually loaded this session. Until then the cache
  // can hold only optimistic patches on an empty base (an offline add after a
  // failed load), and anything that saves a FULL list back to the server —
  // budgets, semesters — would overwrite the user's real data with it.
  const [hasServerSnapshot, setHasServerSnapshot] = useState(false);
  const allDataQuery = useQuery({
    queryKey: queryKeys.allData,
    queryFn: async () => {
      const data = await getAllData();
      setHasServerSnapshot(true);
      // A refetch (after an import, a sync, …) while tuition edits are unsaved
      // would replace them with the server copy; keep the local ones — the
      // autosave is about to write them.
      if (isSemestersDirtyRef.current) {
        const local = queryClient.getQueryData<AllDataResponse>(queryKeys.allData)?.semesters;
        if (local) return { ...data, semesters: local };
      }
      return data;
    },
    enabled: isAuthenticated,
  });
  useEffect(() => { if (!isAuthenticated) setHasServerSnapshot(false); }, [isAuthenticated]);
  // Load failed (or never landed) → banner with Retry instead of an empty
  // account that looks real.
  const dataLoadFailed = isAuthenticated && !hasServerSnapshot && (allDataQuery.isError || allDataQuery.isSuccess);
  // With nothing loaded at all, show skeletons rather than $0 totals.
  const isLoadingData = isAuthenticated && (allDataQuery.isPending || (!hasServerSnapshot && !allDataQuery.data));
  // Retry as soon as the connection comes back.
  useEffect(() => {
    if (!isAuthenticated || hasServerSnapshot) return;
    const retry = () => { void allDataQuery.refetch(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, hasServerSnapshot]);
  const refuseUntilLoaded = (what: string): boolean => {
    if (hasServerSnapshot) return false;
    notify.error(`Your data hasn't loaded yet, so ${what} wasn't saved (it would overwrite what's on the server). Retry loading first.`);
    return true;
  };

  const expenses = allDataQuery.data?.expenses ?? EMPTY_ALL_DATA.expenses;
  const incomes = allDataQuery.data?.incomes ?? EMPTY_ALL_DATA.incomes;
  const budgets = allDataQuery.data?.budgets ?? EMPTY_ALL_DATA.budgets;
  const semesters = allDataQuery.data?.semesters ?? EMPTY_ALL_DATA.semesters;

  const patchAllData = useCallback(
    <K extends keyof AllDataResponse>(key: K, updater: React.SetStateAction<AllDataResponse[K]>) => {
      queryClient.setQueryData<AllDataResponse>(queryKeys.allData, (old) => {
        const base = old ?? EMPTY_ALL_DATA;
        const next =
          typeof updater === 'function'
            ? (updater as (p: AllDataResponse[K]) => AllDataResponse[K])(base[key])
            : updater;
        return { ...base, [key]: next };
      });
    },
    [queryClient]
  );

  const setExpenses = useCallback((u: React.SetStateAction<Expense[]>) => patchAllData('expenses', u), [patchAllData]);
  const setIncomes = useCallback((u: React.SetStateAction<Income[]>) => patchAllData('incomes', u), [patchAllData]);
  const setBudgets = useCallback((u: React.SetStateAction<Budget[]>) => patchAllData('budgets', u), [patchAllData]);
  const setSemesters = useCallback((u: React.SetStateAction<Semester[]>) => patchAllData('semesters', u), [patchAllData]);
  
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isStatementImportOpen, setIsStatementImportOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  // The Income hub keeps its own date range, independent of the expense-centric
  // Financial hub, so filtering one never moves the other.
  const [incomeDateRange, setIncomeDateRange] = useState<DateRange>('this_month');
  const [activeView, setActiveView] = useState<ActiveView>('expenses');
  // Sub-tab within the Expenses / Income hubs: the overview (dashboard/summary)
  // vs the transactions list. Reset to overview whenever the top-level view changes.
  const [hubTab, setHubTab] = useState<'overview' | 'list'>('overview');
  useEffect(() => { setHubTab('overview'); }, [activeView]);
  // The raw search input lives in Header (debounced there); App only stores the
  // already-debounced term, so typing no longer re-renders the whole app on every
  // keystroke — only when the debounced value actually changes (APP-H5).
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Currency state/logic lives in CurrencyProvider now.

  const [isSemestersDirty, setIsSemestersDirty] = useState(false);
  // Bumped on every local semester edit. An autosave clears the dirty flag only
  // if no edit happened while it was in flight; clearing it unconditionally
  // cancelled the timer queued for the newer edit, so that edit was never saved.
  const semestersEditVersion = useRef(0);
  const isSemestersDirtyRef = useRef(false);
  const markSemestersDirty = useCallback(() => {
    semestersEditVersion.current += 1;
    isSemestersDirtyRef.current = true;
    setIsSemestersDirty(true);
  }, []);
  // Latest semesters for the autosave, which may run after waiting for an earlier save.
  const semestersRef = useRef<Semester[]>([]);
  semestersRef.current = semesters;
  const semesterSaveInFlight = useRef<Promise<unknown> | null>(null);
  const semesterSaveFailures = useRef(0);
  const [semesterRetryTick, setSemesterRetryTick] = useState(0);

  // Hide tuition + tuition-loan from the analytical overviews (Financial hub &
  // Income summary) so day-to-day cash flow isn't dwarfed by one-off tuition.
  // Persisted so the choice survives reloads. The tuition ledger is unaffected.
  const [hideTuition, setHideTuition] = useState<boolean>(() => {
    try { return localStorage.getItem('hideTuition') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('hideTuition', hideTuition ? '1' : '0'); } catch { /* ignore */ }
  }, [hideTuition]);
  const [pendingRecurring, setPendingRecurring] = useState<Omit<Expense, 'id'>[]>([]);
  const [selectedRecurring, setSelectedRecurring] = useState<Set<number>>(new Set());
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
    return userStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
  });
  // Per-account flag: re-read when the signed-in account changes.
  useEffect(() => {
    setOnboardingDismissed(userStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true');
  }, [userEmail]);

  // Log out on a data-load auth failure (401/403) — keyed off HTTP status, not
  // brittle message matching (APP-H2).
  useEffect(() => {
    if (allDataQuery.error && isAuthError(allDataQuery.error)) {
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDataQuery.error]);

  // Once per fresh load: substitute default semesters when the user has none,
  // and detect recurring expenses from last month not yet created this month.
  const didProcessLoadRef = useRef(false);
  useEffect(() => {
    const data = allDataQuery.data;
    // Only real server data: on a failed load `data` can be a patch on an empty
    // base, and substituting default semesters there would later be autosaved
    // over the user's real ones.
    if (!data || !hasServerSnapshot) {
      didProcessLoadRef.current = false;
      return;
    }
    if (didProcessLoadRef.current) return;
    didProcessLoadRef.current = true;

    if (data.semesters.length === 0) {
      setSemesters(buildDefaultSemesters());
    }

    // F3: frequency-aware recurring detection — suggest each recurring charge's
    // next due instance (weekly / monthly / yearly) for per-item review.
    const due = computeDueRecurring(data.expenses, todayCalendar());
    if (due.length > 0) {
      const snoozeUntil = Number(userStorage.getItem(RECURRING_SNOOZE_KEY) || '0');
      if (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil) {
        setPendingRecurring([]);
        return;
      }
      setPendingRecurring(due);
      setSelectedRecurring(new Set(due.map((_, i) => i)));
    } else {
      setPendingRecurring([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDataQuery.data, hasServerSnapshot]);

  // U6: Keyboard shortcuts
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N or Cmd+N: New expense/income
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleOpenModal();
      }
      // Escape: Close any open modal
      if (e.key === 'Escape') {
        if (isExpenseModalOpen) setIsExpenseModalOpen(false);
        if (isIncomeModalOpen) setIsIncomeModalOpen(false);
        if (isBudgetModalOpen) setIsBudgetModalOpen(false);
        if (isDataModalOpen) setIsDataModalOpen(false);
        if (isCategoryModalOpen) setIsCategoryModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, isExpenseModalOpen, isIncomeModalOpen, isBudgetModalOpen, isDataModalOpen, isCategoryModalOpen, activeView]);

  // Auto-save semesters (a full-state replace) 800ms after the last change.
  useEffect(() => {
    // Semesters save as a full replace, so never before the real list loaded.
    if (!isAuthenticated || !isSemestersDirty || !hasServerSnapshot) {
      return;
    }

    let cancelled = false;
    const saveTimer = setTimeout(async () => {
      // One save at a time: overlapping full-state saves interleave on the server.
      while (semesterSaveInFlight.current) {
        await semesterSaveInFlight.current.catch(() => undefined);
      }
      if (cancelled) return; // a newer edit re-ran this effect; its timer saves
      const version = semestersEditVersion.current;
      const request = saveSemesters(semestersRef.current);
      semesterSaveInFlight.current = request;
      try {
        const saved = await request;
        if (semesterSaveFailures.current > 0) notify.success('Tuition changes saved.');
        semesterSaveFailures.current = 0;
        if (semestersEditVersion.current === version) {
          // Nothing changed while saving: adopt the server's copy so new
          // installments carry their real ids. Kept on temporary numeric ids,
          // every later save deleted and re-created them.
          isSemestersDirtyRef.current = false;
          setSemesters(saved);
          setIsSemestersDirty(false);
        }
        // Otherwise a newer edit is pending; its own timer saves it.
      } catch (err) {
        console.error('Failed to auto-save semesters:', err);
        semesterSaveFailures.current += 1;
        if (semesterSaveFailures.current === 1) {
          notify.error("Couldn't save your tuition changes. Retrying…");
        }
        const backoffMs = Math.min(30_000, 2_000 * 2 ** (semesterSaveFailures.current - 1));
        setTimeout(() => setSemesterRetryTick((t) => t + 1), backoffMs);
      } finally {
        semesterSaveInFlight.current = null;
      }
    }, 800);

    // A change within 800ms supersedes this save.
    return () => { cancelled = true; clearTimeout(saveTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesters, isAuthenticated, isSemestersDirty, hasServerSnapshot, semesterRetryTick]);
  
  // Budget alert: check if a category is near or over its monthly budget
  const checkBudgetAlert = useCallback((category: string, allExpenses: Expense[]) => {
    // The budget this expense counts toward: its own subcategory budget, else
    // its main category's. It used to look only for an exact match, so a "Food"
    // budget never warned when a "Groceries" expense pushed it over (C8).
    const budgetCategories = budgets.map(b => b.category);
    const target = budgetForExpense(category, budgetCategories);
    const budget = budgets.find(b => b.category === target);
    if (!budget || budget.amount <= 0) return;

    // Local calendar month window (no toISOString UTC shift).
    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();
    const monthExpenses = allExpenses.filter(e => isWithinRange(e.date, monthStart, monthEnd));
    const monthlySpent = computeBudgetSpend(budget.category, monthExpenses, budgetCategories);

    const pct = (monthlySpent / budget.amount) * 100;
    const name = budgetLabel(budget.category, budgetCategories);
    const amounts = `$${monthlySpent.toFixed(0)} of $${budget.amount.toFixed(0)} (${pct.toFixed(0)}%)`;
    if (pct >= 100) {
      notify.error(`Budget exceeded: ${name} ${amounts}`);
    } else if (pct >= 80) {
      notify.warning(`Budget warning: ${name} ${amounts}`);
    }
  }, [budgets]);

  const toggleRecurringSelection = (index: number) => {
    setSelectedRecurring((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  // F3: Add only the recurring instances the user ticked in the review list.
  const handleAcceptRecurring = async () => {
    const toAdd = pendingRecurring.filter((_, i) => selectedRecurring.has(i));
    if (toAdd.length === 0) return;
    try {
      await createBulkExpenses(toAdd);
      // Refetch the authoritative dataset (the bulk insert created server ids).
      await queryClient.invalidateQueries({ queryKey: queryKeys.allData });
      setPendingRecurring([]);
      setSelectedRecurring(new Set());
      userStorage.removeItem(RECURRING_SNOOZE_KEY);
      notify.success(`${toAdd.length} recurring expense(s) added.`);
    } catch (error) {
      console.error("Failed to create recurring expenses:", error);
      notify.error('Could not create recurring expenses.');
    }
  };

  const handleDismissRecurring = () => {
    setPendingRecurring([]);
    setSelectedRecurring(new Set());
  };

  const handleSnoozeRecurring = () => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    userStorage.setItem(RECURRING_SNOOZE_KEY, String(until));
    setPendingRecurring([]);
    setSelectedRecurring(new Set());
    notify.info('Recurring reminder snoozed for 24 hours.');
  };

  const showOnboarding = isAuthenticated && hasServerSnapshot && !isLoadingData && !onboardingDismissed && expenses.length === 0 && incomes.length === 0;

  // Offline queue: replay each queued create, then refetch so temp local rows
  // are replaced by the authoritative server data.
  const offline = useOfflineQueue({
    // Only the signed-in user's own queued items replay, and only while signed in.
    ownerId: isAuthenticated ? userEmail : null,
    // Send the queue's clientId as an idempotency key so a replayed create
    // (e.g. after a crash between POST and dequeue) returns the existing row
    // instead of duplicating it.
    process: useCallback(async (item: PendingExpense) => { await createExpense({ ...item.payload, clientRequestId: item.clientId }); }, []),
    onSynced: useCallback(() => { void queryClient.invalidateQueries({ queryKey: queryKeys.allData }); }, [queryClient]),
    onDropped: useCallback((item: PendingExpense, message: string) => {
      notify.error(`Couldn't sync "${item.payload.title}" (${message}). Please add it again.`);
    }, []),
  });

  // Save handlers resolve true/false so the entry modals close only on success
  // and keep the user's input on failure.
  const handleAddExpense = async (expense: Omit<Expense, 'id'>): Promise<boolean> => {
    // Offline: queue it in IndexedDB and optimistically show it (temp id) so no
    // data is lost; it replays automatically on reconnect.
    if (!navigator.onLine) {
      try {
        const item = await enqueueExpense(expense, userEmail);
        setExpenses(prev => {
          const updated = [...prev, { ...expense, id: item.clientId } as Expense];
          checkBudgetAlert(expense.category, updated);
          return updated;
        });
        await offline.refreshCount();
        notify.info('Saved offline — will sync when you reconnect.');
        return true;
      } catch (error) {
        console.error('Failed to queue expense offline:', error);
        notify.error('Could not save offline. Your entry is still in the form.');
        return false;
      }
    }
    try {
      const newExpense = await createExpense(expense);
      setExpenses(prev => {
        const updated = [...prev, newExpense];
        checkBudgetAlert(newExpense.category, updated);
        return updated;
      });
      return true;
    } catch (error) {
      console.error("Failed to add expense:", error);
      notify.error('Could not add expense. Your entry is still in the form.');
      return false;
    }
  };

const handleUpdateExpense = async (updatedExpense: Expense): Promise<boolean> => {
  try {
    const returnedExpense = await updateExpense(updatedExpense);
    setExpenses(prev => {
      const updated = prev.map(exp => exp.id === returnedExpense.id ? returnedExpense : exp);
      checkBudgetAlert(returnedExpense.category, updated);
      return updated;
    });
    // Only touch semesters (and trigger their autosave) when this expense is
    // actually a linked tuition installment — editing a normal expense no longer
    // POSTs the entire semesters array (APP-M1).
    const isLinkedTuition = semesters.some(sem => sem.installments.some(i => i.expenseId === returnedExpense.id));
    if (isLinkedTuition) {
      setSemesters(prev => prev.map(sem => ({
        ...sem,
        installments: sem.installments.map(inst =>
          inst.expenseId === returnedExpense.id
            ? { ...inst, paidDate: returnedExpense.date, amount: returnedExpense.amount }
            : inst
        )
      })));
      markSemestersDirty();
    }
    setEditingExpense(null);
    setIsExpenseModalOpen(false);
    return true;
  } catch (error) {
    console.error("Failed to update expense:", error);
    notify.error('Could not update expense. Your changes are still in the form.');
    return false;
  }
};

const handleQuickSaveExpense = async (updatedExpense: Expense) => {
  try {
    const returnedExpense = await updateExpense(updatedExpense);
    setExpenses(prev => {
      const updated = prev.map(exp => exp.id === returnedExpense.id ? returnedExpense : exp);
      checkBudgetAlert(returnedExpense.category, updated);
      return updated;
    });
    // See APP-M1 note in handleUpdateExpense.
    const isLinkedTuition = semesters.some(sem => sem.installments.some(i => i.expenseId === returnedExpense.id));
    if (isLinkedTuition) {
      setSemesters(prev => prev.map(sem => ({
        ...sem,
        installments: sem.installments.map(inst =>
          inst.expenseId === returnedExpense.id
            ? { ...inst, paidDate: returnedExpense.date, amount: returnedExpense.amount }
            : inst
        )
      })));
      markSemestersDirty();
    }
  } catch (error) {
    console.error('Failed to quick update expense:', error);
    notify.error('Could not quick update expense.');
  }
};

const handleDeleteExpense = async (id: string) => {
  try {
    // 1. EXECUTE API DELETE FIRST (before mutating state)
    await deleteExpense(id);

    // 2. Determine whether this expense was a tuition payment BEFORE mutating
    // state — reading a flag set inside a state updater is unreliable (updaters
    // are not guaranteed to run synchronously and run twice under StrictMode),
    // which previously caused the installment reset to never be persisted.
    const wasTuitionPayment = semesters.some(semester =>
      semester.installments.some(inst => inst.expenseId === id)
    );

    // 3. RESET BURSAR STATE (unlink the installment tied to this expense)
    if (wasTuitionPayment) {
      setSemesters(prevSemesters =>
        prevSemesters.map(semester => {
          if (!semester.installments.some(inst => inst.expenseId === id)) return semester;
          return {
            ...semester,
            installments: semester.installments.map(inst =>
              inst.expenseId === id
                ? { ...inst, status: 'unpaid' as const, expenseId: undefined, paidDate: undefined }
                : inst
            ),
          };
        })
      );
      markSemestersDirty();
    }

    // 4. UPDATE LOCAL EXPENSE LIST
    setExpenses(prevExpenses => prevExpenses.filter(exp => exp.id !== id));

  } catch (error) {
    console.error("CRITICAL_SYNC_ERROR: Failed to delete expense:", error);
    notify.error('Could not delete expense. Please try again.');
  }
};
  const handleEditExpenseClick = (expense: Expense) => { setEditingExpense(expense); setIsExpenseModalOpen(true); };

  // Income Handlers
const handleAddIncome = async (income: Omit<Income, 'id'>): Promise<boolean> => {
  try {
    const newIncome = await createIncome(income);
    setIncomes(prev => [...prev, newIncome]);
    return true;
  } catch (error) {
    console.error("Failed to add income:", error);
    notify.error('Could not add income. Your entry is still in the form.');
    return false;
  }
};

const handleUpdateIncome = async (updatedIncome: Income): Promise<boolean> => {
  try {
    const returnedIncome = await updateIncome(updatedIncome);
    setIncomes(prev => prev.map(inc => inc.id === returnedIncome.id ? returnedIncome : inc));
    setEditingIncome(null);
    return true;
  } catch (error) {
    console.error("Failed to update income:", error);
    notify.error('Could not update income. Your changes are still in the form.');
    return false;
  }
};

const handleQuickSaveIncome = async (updatedIncome: Income) => {
  try {
    const returnedIncome = await updateIncome(updatedIncome);
    setIncomes(prev => prev.map(inc => inc.id === returnedIncome.id ? returnedIncome : inc));
  } catch (error) {
    console.error('Failed to quick update income:', error);
    notify.error('Could not quick update income.');
  }
};

const handleDeleteIncome = async (id: string) => {
  try {
    await deleteIncome(id);
    setIncomes(prev => prev.filter(inc => inc.id !== id));
  } catch (error) {
    console.error("Failed to delete income:", error);
    notify.error('Could not delete income.');
  }
};
  const handleEditIncomeClick = (income: Income) => { setEditingIncome(income); setIsIncomeModalOpen(true); };

  const handleOpenModal = () => {
    setIsQuickActionsOpen(false);
    if (activeView === 'income') {
        setEditingIncome(null);
        setIsIncomeModalOpen(true);
    } else {
        setEditingExpense(null);
        setIsExpenseModalOpen(true);
    }
  };

  const handleOpenExpenseModal = () => {
    setEditingExpense(null);
    setIsExpenseModalOpen(true);
    setIsQuickActionsOpen(false);
  };

  const handleOpenIncomeModal = () => {
    setEditingIncome(null);
    setIsIncomeModalOpen(true);
    setIsQuickActionsOpen(false);
  };

  const handleOpenBudgetModal = () => {
    setIsBudgetModalOpen(true);
    setIsQuickActionsOpen(false);
  };

  const handleOpenDataModal = () => {
    setIsDataModalOpen(true);
    setIsQuickActionsOpen(false);
  };

  const handleSaveBudgets = async (updatedBudgets: Budget[]) => {
  // Budgets save as a full replace (the server deletes any not in the list).
  if (refuseUntilLoaded('your budgets')) return;
  try {
    const savedBudgets = await saveBudgets(updatedBudgets);
    setBudgets(savedBudgets);
    setIsBudgetModalOpen(false);
  } catch (error) {
    console.error("Failed to save budgets:", error);
    notify.error('Could not save budgets.');
  }
};
  const handleImportExpenses = async (importedExpenses: Omit<Expense, 'id'>[]) => {
    // Duplicate detection compares against the loaded data; without it a
    // re-import would insert rows that already exist.
    if (refuseUntilLoaded('the import')) return;
    try {
      // 1. Send the batch to the server (keyed, so a retry can't duplicate it).
      await createBulkExpenses(importedExpenses, newBatchId());

      // 2. The import was successful, show an alert
      notify.success(`${importedExpenses.length} expenses successfully imported.`);

      // 3. Refetch the authoritative dataset so local state has the new ids.
      await queryClient.invalidateQueries({ queryKey: queryKeys.allData });

    } catch (error) {
      console.error("Failed to import expenses:", error);
      notify.error('Could not import expenses.');
    }
  };

  // Danger zone: permanently wipe all of the user's data (confirmed by typing
  // "DELETE" in the modal).
  const handleWipeAll = async () => {
    try {
      const { deleted } = await wipeAllData('DELETE');
      const total = Object.values(deleted).reduce((s, n) => s + n, 0);
      notify.success(`Deleted ${total} record${total === 1 ? '' : 's'}. Your data is now empty.`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.allData });
      setIsDataModalOpen(false);
    } catch (error) {
      console.error('Failed to wipe data:', error);
      notify.error('Could not delete your data.');
    }
  };

  // Bank-statement import: a statement can contain both debits and credits, so it
  // creates expenses AND incomes in one pass, then refetches once.
  // Resolves true only when everything landed; the importer stays open otherwise
  // so the user can press Import again (same batch key → no duplicates).
  const handleImportStatement = async (payload: { expenses: Omit<Expense, 'id'>[]; incomes: Omit<Income, 'id'>[]; batchId?: string }): Promise<boolean> => {
    const { expenses, incomes } = payload;
    if (expenses.length === 0 && incomes.length === 0) return false;
    if (refuseUntilLoaded('the import')) return false;

    // The two batches are separate requests, so the second can fail after the
    // first has already been written. Track what actually landed and ALWAYS
    // refetch — otherwise the inserted rows stay invisible and re-importing
    // silently duplicates them (B4).
    let expensesSaved = 0;
    let incomesSaved = 0;
    let failure: unknown = null;

    // One key per import session (from the importer), so a retry after a
    // failure or a lost response skips whatever already landed instead of
    // inserting it again (B5). It used to be regenerated on every attempt.
    const batchId = payload.batchId || newBatchId();

    try {
      if (expenses.length > 0) { await createBulkExpenses(expenses, `${batchId}-exp`); expensesSaved = expenses.length; }
      if (incomes.length > 0) { await createBulkIncomes(incomes, `${batchId}-inc`); incomesSaved = incomes.length; }
    } catch (error) {
      failure = error;
      console.error('Failed to import statement:', error);
    }

    if (expensesSaved > 0 || incomesSaved > 0) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.allData });
    }

    const parts: string[] = [];
    if (expensesSaved > 0) parts.push(`${expensesSaved} expense${expensesSaved === 1 ? '' : 's'}`);
    if (incomesSaved > 0) parts.push(`${incomesSaved} income`);

    if (!failure) {
      notify.success(`Imported ${parts.join(' and ')}.`);
      return true;
    }
    if (parts.length > 0) {
      // Partial write. Pressing Import again is safe: the saved batch is skipped.
      notify.error(`Imported ${parts.join(' and ')}, but the rest failed. Press Import again to finish — nothing will be duplicated.`);
    } else {
      notify.error('Could not import the statement. Nothing was saved — your review is still here, try Import again.');
    }
    return false;
  };

  const handleRestoreBackup = async (payload: {
    expenses: Omit<Expense, 'id'>[];
    incomes: Omit<Income, 'id'>[];
    budgets: Budget[];
    semesters: Semester[];
  }) => {
    try {
      const restored = await restoreAllData(payload);
      // Replace the whole cached dataset in one write.
      queryClient.setQueryData<AllDataResponse>(queryKeys.allData, {
        expenses: restored.expenses,
        incomes: restored.incomes,
        budgets: restored.budgets,
        semesters: restored.semesters,
      });
      setPendingRecurring([]);
      notify.success('Backup restored successfully.');
    } catch (error) {
      console.error('Failed to restore backup:', error);
      notify.error('Could not restore backup. Please verify the file format.');
      throw error;
    }
  };
  const handleUpdateSemesterTuition = (semesterId: string, totalTuition: number) => {
    // Guard against invalid input (empty field, NaN, negative) so a stray blur
    // can never wipe the tuition total or zero out the payment schedule.
    if (!Number.isFinite(totalTuition) || totalTuition < 0) return;

    setSemesters(prevSemesters =>
      prevSemesters.map(semester => {
        if (semester.id !== semesterId) return semester;

        // Paid installments are locked: preserve their amounts and only
        // redistribute the remaining balance across the unpaid slots
        // (cent-accurate, no penny leak).
        const paidSum = semester.installments.reduce(
          (sum, inst) => (inst.status === 'paid' ? sum + inst.amount : sum),
          0
        );
        const unpaidSlots = semester.installments.filter(i => i.status !== 'paid').length;
        const splits = distributeAmount(Math.max(0, totalTuition - paidSum), unpaidSlots);

        let unpaidIdx = 0;
        const installments = semester.installments.map(inst =>
          inst.status === 'paid' ? inst : { ...inst, amount: splits[unpaidIdx++] ?? 0 }
        );

        return { ...semester, totalTuition, installments };
      })
    );
    markSemestersDirty();
  };
  // Installments with a "mark paid" request in flight. A double-click used to
  // run this twice: both calls saw the installment unpaid and created two
  // tuition expenses, double-counting tuition.
  const markPaidInFlight = useRef(new Set<string>());
  const handleMarkInstallmentAsPaid = async (semesterId: string, installmentId: number, paymentDate: string) => {
    const flightKey = `${semesterId}:${installmentId}`;
    if (markPaidInFlight.current.has(flightKey)) return;
    markPaidInFlight.current.add(flightKey);
    try {
      await markInstallmentAsPaid(semesterId, installmentId, paymentDate);
    } finally {
      markPaidInFlight.current.delete(flightKey);
    }
  };
  const markInstallmentAsPaid = async (semesterId: string, installmentId: number, paymentDate: string) => {
    const semester = semesters.find(s => s.id === semesterId);
    const installment = semester?.installments.find(i => i.id === installmentId);
    
    if (!semester || !installment || installment.status === 'paid' || installment.amount <= 0) return;

    const baseSemesterName = semester.name.split('USC TUITION')[0].trim();
    const cleanTitle = `USC Tuition - ${baseSemesterName} (Inst #${installment.id})`;

    // Self-heal / anti-duplicate: if a tuition expense for THIS exact installment
    // already exists (e.g. it was created on a previous "mark paid" but the
    // semester link was lost — as happened when the semesters save was failing),
    // re-link to that existing expense instead of creating a second one.
    const existingExpense = expenses.find(
      (e) => e.category === 'Tuition' && e.title === cleanTitle
    );
    if (existingExpense) {
      setSemesters(prevSemesters =>
        prevSemesters.map(s =>
          s.id === semesterId
            ? { ...s, installments: s.installments.map(i =>
                i.id === installmentId
                  ? { ...i, status: 'paid', expenseId: existingExpense.id, paidDate: existingExpense.date }
                  : i
              )}
            : s
        )
      );
      markSemestersDirty();
      notify.success('Linked to your existing tuition payment (no duplicate created).');
      return;
    }

    // 1. Define the new expense data
    const newExpenseData: Omit<Expense, 'id'> = {
      title: cleanTitle,
      amount: installment.amount,
      category: 'Tuition',
      date: paymentDate,
      paymentMethod: 'Bank Transfer',
      isRecurring: false // Tuition is not a monthly recurring expense
    };

    try {
      // 2. Save the new expense. The key makes a repeat (another tab, a retry)
      // return the same expense instead of creating a second one.
      const savedExpense = await createExpense({ ...newExpenseData, clientRequestId: `tuition-${semesterId}-${installmentId}` });
      
      // 3. Add the *saved* expense to the local state
      setExpenses(prevExpenses => [...prevExpenses, savedExpense]);

      // 4. Update the semester state to link the new expense
      setSemesters(prevSemesters => 
        prevSemesters.map(s => 
          s.id === semesterId
            ? { ...s, installments: s.installments.map(i => 
                i.id === installmentId
                  ? { ...i, status: 'paid', expenseId: savedExpense.id, paidDate: savedExpense.date }
                  : i
              )}
            : s
        )
      );
      // This change to 'semesters' will trigger our useEffect to auto-save to the DB
      markSemestersDirty();
    } catch (error) {
      console.error("Failed to mark installment as paid:", error);
      notify.error('Could not create the tuition expense.');
    }
  };
  const handleUpdateInstallmentDate = async (semesterId: string, installmentId: number, newDate: string) => {
      // Resolve the linked expense from current state BEFORE mutating — reading a
      // value assigned inside a state updater is unreliable (see handleDeleteExpense),
      // which previously caused the date change to be persisted only sometimes.
      const targetInstallment = semesters
        .find(s => s.id === semesterId)
        ?.installments.find(i => i.id === installmentId);
      const expenseSnapshot = targetInstallment?.expenseId
        ? expenses.find(exp => exp.id === targetInstallment.expenseId)
        : undefined;

      setSemesters(prevSemesters => prevSemesters.map(s =>
        s.id === semesterId
          ? { ...s, installments: s.installments.map(i => i.id === installmentId ? { ...i, paidDate: newDate } : i) }
          : s
      ));
      markSemestersDirty();

      if (expenseSnapshot) {
        setExpenses(prevExpenses => prevExpenses.map(exp =>
          exp.id === expenseSnapshot.id ? { ...exp, date: newDate } : exp
        ));
        // Persist the date change to the API
        try {
          await updateExpense({ ...expenseSnapshot, date: newDate });
        } catch (error) {
          console.error('Failed to persist installment date change:', error);
        }
      }
  };

  const handleUpdateInstallmentCount = (semesterId: string, count: number) => {
  setSemesters(prevSemesters =>
    prevSemesters.map(semester => {
      if (semester.id === semesterId) {
        // 1. Identify what has already been settled
        const paidInstallments = semester.installments.filter(i => i.status === 'paid');
        const paidSum = paidInstallments.reduce((sum, i) => sum + i.amount, 0);
        
        // 2. Calculate the remaining balance to be distributed
        const remainingToPay = semester.totalTuition - paidSum;
        const unpaidSlotsNeeded = count - paidInstallments.length;

        // 3. Prevent logic errors if count is reduced below paid installments
        if (unpaidSlotsNeeded < 0) return semester;

        // 4. Split the remaining balance cent-accurately across the unpaid slots
        // so paid + unpaid sums back to totalTuition (no phantom balance).
        const splits = distributeAmount(remainingToPay, unpaidSlotsNeeded);

        // 5. Build the new dynamic array
        let unpaidIdx = 0;
        const newInstallments = Array.from({ length: count }, (_, i) => {
          const existing = semester.installments[i];

          // LOCK: If this slot was already paid, keep it EXACTLY as is (amount, ID, date)
          if (existing && existing.status === 'paid') {
            return existing;
          }

          // REDISTRIBUTE: Otherwise, assign the next split amount to the unpaid slot
          return {
            id: i + 1,
            amount: splits[unpaidIdx++] ?? 0,
            status: 'unpaid' as const,
            expenseId: undefined,
            paidDate: undefined,
          };
        });

        return { ...semester, installments: newInstallments };
      }
      return semester;
    })
  );
  
  markSemestersDirty();
};

  // Financial hub uses `dateRange`; the Income hub uses its own `incomeDateRange`.
  const { filteredExpenses, filteredIncomes: dashboardIncomes, previousPeriodExpenses } = useDateRangeFilter(expenses, incomes, dateRange);
  const { filteredIncomes: incomeHubIncomes, previousPeriodIncomes: incomeHubPrevIncomes } = useDateRangeFilter(expenses, incomes, incomeDateRange);

  // Tuition-aware inputs for the analytical overviews only. When `hideTuition` is
  // on, tuition + tuition-loan are stripped from the Financial hub and Income
  // summary (their totals, charts, top-category, net flow). The raw `expenses` /
  // `incomes` and the tuition ledger are untouched.
  const hubExpenses = useMemo(() => stripTuition(filteredExpenses, hideTuition), [filteredExpenses, hideTuition]);
  const hubIncomes = useMemo(() => stripTuition(dashboardIncomes, hideTuition), [dashboardIncomes, hideTuition]);
  const hubPrevExpenses = useMemo(() => stripTuition(previousPeriodExpenses, hideTuition), [previousPeriodExpenses, hideTuition]);
  const hubAllExpenses = useMemo(() => stripTuition(expenses, hideTuition), [expenses, hideTuition]);
  const hubAllIncomes = useMemo(() => stripTuition(incomes, hideTuition), [incomes, hideTuition]);
  const incomeHubIncomesView = useMemo(() => stripTuition(incomeHubIncomes, hideTuition), [incomeHubIncomes, hideTuition]);
  const incomeHubPrevView = useMemo(() => stripTuition(incomeHubPrevIncomes, hideTuition), [incomeHubPrevIncomes, hideTuition]);

  // Accounts already in use across expenses and incomes — offered as suggestions
  // wherever an account can be typed, so one card can't end up under two labels.
  const knownAccounts = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) if (e.account) set.add(e.account);
    for (const i of incomes) if (i.account) set.add(i.account);
    return [...set].sort();
  }, [expenses, incomes]);

  const searchedAndSortedItems = useMemo(() => {
    const itemsToFilter = activeView === 'income' ? [...incomeHubIncomes] : [...filteredExpenses];

    const results = debouncedSearchQuery
      ? itemsToFilter.filter(item => {
          const query = debouncedSearchQuery;
          const threshold = query.length > 5 ? 2 : 1;
          const titleMatch = fuzzyMatch(query, item.title, threshold);
          const categoryMatch = fuzzyMatch(query, item.category, threshold);
          const notesMatch = item.notes ? fuzzyMatch(query, item.notes, threshold) : false;
          // Tags are set by the importer and the AI enricher, so they need to be
          // searchable too — otherwise they're write-only metadata (B6).
          const tagMatch = item.tags?.some((tag) => fuzzyMatch(query, tag, threshold)) ?? false;
          // Payment method makes "credit card" / "discover" style filtering work
          // on expenses without a dedicated account field. (Incomes have none.)
          const method = (item as Partial<Expense>).paymentMethod;
          const methodMatch = method ? fuzzyMatch(query, method, threshold) : false;
          // Account makes "discover" / "usccu" isolate one card's transactions.
          const accountMatch = item.account ? fuzzyMatch(query, item.account, threshold) : false;
          return titleMatch || categoryMatch || notesMatch || tagMatch || methodMatch || accountMatch;
        })
      : itemsToFilter;

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredExpenses, incomeHubIncomes, debouncedSearchQuery, activeView]);


  const liveRegionMessage = useMemo(() => {
    if (isLoadingData) {
      return 'Loading your financial data.';
    }
    if (pendingRecurring.length > 0) {
      return `${pendingRecurring.length} recurring expense suggestion${pendingRecurring.length > 1 ? 's are' : ' is'} ready to review.`;
    }
    return `Viewing ${activeView}.`;
  }, [isLoadingData, pendingRecurring.length, activeView]);

  // ... (renderActiveView function remains the same) ...
  const renderActiveView = () => {
    switch (activeView) {
        case 'expenses':
            return (
            <div>
              <ExpenseList
              expenses={searchedAndSortedItems as Expense[]}
              onEdit={handleEditExpenseClick}
              onQuickSave={handleQuickSaveExpense}
              onDelete={handleDeleteExpense}
              onCreate={handleOpenModal}
              isLoading={isLoadingData}
              dateFilter={<DateRangeFilter selectedRange={dateRange} onChange={setDateRange} />}
              />
                </div>
            );
        case 'income':
            return (
              <IncomeList
                incomes={searchedAndSortedItems as Income[]}
                onEdit={handleEditIncomeClick}
                onQuickSave={handleQuickSaveIncome}
                onDelete={handleDeleteIncome}
                onCreate={handleOpenModal}
                isLoading={isLoadingData}
                dateFilter={<DateRangeFilter selectedRange={incomeDateRange} onChange={setIncomeDateRange} />}
              />
            );
        case 'ai':
          return <AiAnalyst expenses={expenses} incomes={incomes} />;
        case 'pivot':
            return <PivotAnalysis expenses={hubAllExpenses} />;
        case 'usc':
            return <USCPaymentTracker semesters={semesters} onUpdateTuition={handleUpdateSemesterTuition} onUpdateInstallmentCount={handleUpdateInstallmentCount} onMarkAsPaid={handleMarkInstallmentAsPaid} onUpdateDate={handleUpdateInstallmentDate} />;
        case 'reports':
          return <Reports allExpenses={hubAllExpenses} budgets={budgets} isLoading={isLoadingData} />;
        default: return null;
    }
  };
        const DashboardLayout = (
          <div className="h-screen bg-transparent flex flex-col overflow-hidden text-app-text font-sans px-3 md:px-6 py-3 md:py-4">
            <div className="starfield" />
            <p className="sr-only" aria-live="polite" aria-atomic="true">{liveRegionMessage}</p>

            {/* Skip link — visible only when focused, jumps keyboard users past the chrome */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:z-[200] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-primary focus:text-on-primary focus:shadow-glow focus:font-semibold focus:outline-none focus:ring-2 focus:ring-primary/60"
            >
              Skip to main content
            </a>

            {/* 1. HEADER (Fixed at top) */}
            <Header 
              onLogout={logout} 
              onManageBudgets={() => setIsBudgetModalOpen(true)}
              onManageCategories={() => setIsCategoryModalOpen(true)}
              onDataAction={() => setIsDataModalOpen(true)}
              onToggleTwoFactor={toggleTwoFactor}
              twoFactorEnabled={twoFactorEnabled}
              hideTuition={hideTuition}
              onToggleHideTuition={() => setHideTuition((v) => !v)}
              onSearch={setDebouncedSearchQuery}
              activeView={activeView}
              offlineStatus={{ isOnline: offline.isOnline, pendingCount: offline.pendingCount, syncing: offline.syncing }}
              expenses={expenses}
              incomes={incomes}
              onSelectTransaction={(hit) => {
                if (hit.type === 'expense') {
                  setActiveView('expenses');
                  handleEditExpenseClick(hit.item);
                } else {
                  setActiveView('income');
                  handleEditIncomeClick(hit.item);
                }
              }}
            />

            {/* 2. BODY WRAPPER */}
            <div className="flex flex-1 overflow-hidden gap-4 md:gap-6">
              
              {/* SIDE NAVIGATION — slim icon rail that expands to reveal labels on hover */}
              <div className="hidden md:block relative w-[64px] flex-shrink-0 h-full z-30">
              <nav
                ref={navRef}
                role="tablist"
                aria-label="Primary navigation"
                aria-orientation="vertical"
                onKeyDown={(e) => {
                  const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
                  if (!keys.includes(e.key) || !navRef.current) return;
                  const tabs = Array.from(navRef.current.querySelectorAll('button')) as HTMLButtonElement[];
                  const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
                  if (tabs.length === 0 || currentIndex === -1) return;

                  e.preventDefault();
                  if (e.key === 'Home') {
                    tabs[0].focus();
                    return;
                  }
                  if (e.key === 'End') {
                    tabs[tabs.length - 1].focus();
                    return;
                  }

                  const delta = e.key === 'ArrowDown' ? 1 : -1;
                  const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
                  tabs[nextIndex].focus();
                }}
                className="group/nav absolute left-0 top-0 h-full w-[64px] hover:w-52 hover:shadow-soft transition-[width] duration-200 ease-out flex flex-col gap-1 modal-surface rounded-2xl p-2 overflow-hidden"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-faint px-3 h-4 pt-1 mb-1 whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150">Menu</p>
                <VerticalTab icon={<ClipboardDocumentListIcon className="h-5 w-5" />} label="Expenses" isActive={activeView === 'expenses'} onClick={() => setActiveView('expenses')} />
                <VerticalTab icon={<BanknotesIcon className="h-5 w-5" />} label="Income" isActive={activeView === 'income'} onClick={() => setActiveView('income')} />
                <VerticalTab icon={<ChatBubbleBottomCenterTextIcon className="h-5 w-5" />} label="AI Analyst" isActive={activeView === 'ai'} onClick={() => setActiveView('ai')} />
                <VerticalTab icon={<TableCellsIcon className="h-5 w-5" />} label="Pivot" isActive={activeView === 'pivot'} onClick={() => setActiveView('pivot')} />
                <VerticalTab icon={<ChartPieIcon className="h-5 w-5" />} label="Reports" isActive={activeView === 'reports'} onClick={() => setActiveView('reports')} />
                <VerticalTab icon={<AcademicCapIcon className="h-5 w-5" />} label="Tuition" isActive={activeView === 'usc'} onClick={() => setActiveView('usc')} />
              </nav>
              </div>

              {/* 3. MAIN SCROLLABLE VIEWPORT */}
              <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pr-1 md:pr-2 custom-scrollbar relative bg-transparent focus:outline-none">
                <div className={`w-full max-w-full overflow-hidden space-y-5 md:space-y-7 ${activeView === 'ai' ? 'pb-28 md:pb-4' : 'pb-56 md:pb-40'}`}>

                  {dataLoadFailed && (
                    <section role="alert" className="glass rounded-2xl p-5 md:p-6 border border-danger/40">
                      <h3 className="font-display text-lg font-bold text-app-text mb-1.5">Couldn't load your data</h3>
                      <p className="text-sm text-app-muted mb-4">
                        {typeof navigator !== 'undefined' && !navigator.onLine
                          ? "You're offline. "
                          : "The server didn't respond. "}
                        Budgets, tuition and imports are paused until it loads, so nothing gets overwritten.
                        {allDataQuery.data ? ' Anything you add now is kept and shown here.' : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => { void allDataQuery.refetch(); }}
                        disabled={allDataQuery.isFetching}
                        className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
                      >
                        {allDataQuery.isFetching ? 'Retrying…' : 'Retry'}
                      </button>
                    </section>
                  )}

                  {showOnboarding && (
                    <section className="glass rounded-2xl p-5 md:p-6">
                      <h3 className="font-display text-lg md:text-xl font-bold text-app-text mb-1.5">Welcome to Orbit</h3>
                      <p className="text-sm text-app-muted mb-4">
                        Start by adding one expense, one income, then set a budget for your top category.
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          onClick={handleOpenExpenseModal}
                          className="bg-primary text-on-primary shadow-glow font-semibold text-sm py-2 px-4 rounded-xl hover:brightness-110 transition-all"
                        >
                          Add first expense
                        </button>
                        <button
                          onClick={handleOpenIncomeModal}
                          className="bg-surface-2 border border-app-border text-app-text font-semibold text-sm py-2 px-4 rounded-xl hover:border-app-border-strong transition-all"
                        >
                          Add first income
                        </button>
                        <button
                          onClick={() => {
                            userStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
                            setOnboardingDismissed(true);
                          }}
                          className="text-app-muted hover:text-app-text font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                        >
                          Dismiss
                        </button>
                      </div>
                    </section>
                  )}

                  {/* F3: Recurring expense review list */}
                  {pendingRecurring.length > 0 && (
                    <div className="glass rounded-2xl p-5 border border-warn/30">
                      <p className="font-display text-sm md:text-base font-semibold text-app-text mb-1">
                        🔁 {pendingRecurring.length} recurring charge{pendingRecurring.length > 1 ? 's are' : ' is'} due
                      </p>
                      <p className="text-xs text-app-muted mb-3">
                        Tick the ones to add this cycle. Each is dated at its next due date.
                      </p>
                      <ul className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                        {pendingRecurring.map((e, i) => (
                          <li key={`${e.title}-${e.date}-${i}`}>
                            <label className="flex items-center gap-3 rounded-xl border border-app-border bg-surface-2 px-3 py-2.5 cursor-pointer hover:border-app-border-strong transition-colors">
                              <input
                                type="checkbox"
                                checked={selectedRecurring.has(i)}
                                onChange={() => toggleRecurringSelection(i)}
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
                          onClick={handleAcceptRecurring}
                          disabled={selectedRecurring.size === 0}
                          className="bg-primary text-on-primary shadow-glow font-semibold text-sm py-2 px-4 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add selected ({selectedRecurring.size})
                        </button>
                        <button
                          onClick={handleDismissRecurring}
                          className="bg-surface-2 border border-app-border text-app-text font-semibold text-sm py-2 px-4 rounded-xl hover:border-app-border-strong transition-all"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={handleSnoozeRecurring}
                          className="text-app-muted hover:text-app-text font-semibold text-sm py-2 px-4 rounded-xl transition-all"
                        >
                          Snooze 24h
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sub-tabs for the Expenses / Income hubs: Overview (dashboard /
                      summary) vs the transactions list — keeps each hub uncluttered. */}
                  {(activeView === 'expenses' || activeView === 'income') && (
                    <div role="tablist" aria-label="Hub section" className="flex items-center gap-1 bg-surface-2 border border-app-border rounded-xl p-1 w-fit">
                      {([
                        { id: 'overview' as const, label: 'Overview' },
                        { id: 'list' as const, label: activeView === 'expenses' ? 'Transactions' : 'Income stream' },
                      ]).map(t => (
                        <button
                          key={t.id}
                          role="tab"
                          aria-selected={hubTab === t.id}
                          onClick={() => setHubTab(t.id)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${hubTab === t.id ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Overview tab */}
                  {activeView === 'expenses' && hubTab === 'overview' && (
                    <Suspense fallback={<SectionSkeleton title="Loading dashboard" rows={4} />}>
                      <Dashboard
                        expenses={hubExpenses}
                        incomes={hubIncomes}
                        allIncomes={hubAllIncomes}
                        allExpenses={hubAllExpenses}
                        previousPeriodExpenses={hubPrevExpenses}
                        selectedRange={dateRange}
                        onDateRangeChange={setDateRange}
                        budgets={budgets}
                        isLoading={isLoadingData}
                      />
                    </Suspense>
                  )}
                  {activeView === 'income' && hubTab === 'overview' && (
                    isLoadingData
                      ? <SectionSkeleton title="Loading income" rows={4} />
                      : <IncomeSummary
                          incomes={incomeHubIncomesView}
                          previousPeriodIncomes={incomeHubPrevView}
                          allIncomes={hubAllIncomes}
                          allExpenses={hubAllExpenses}
                          selectedRange={incomeDateRange}
                          onDateRangeChange={setIncomeDateRange}
                        />
                  )}

                  {/* List tab (and every non-hub view) */}
                  {(!(activeView === 'expenses' || activeView === 'income') || hubTab === 'list') && (
                    <div>
                      <Suspense fallback={<SectionSkeleton title="Loading section" rows={4} />}>
                        {renderActiveView()}
                      </Suspense>
                    </div>
                  )}
                </div>

              {/* 4. FLOATING ACTION BUTTON */}
              <div className="fixed bottom-24 right-5 md:bottom-8 md:right-8 z-50">
                  {/* Click-away backdrop */}
                  {isQuickActionsOpen && (
                    <button
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => setIsQuickActionsOpen(false)}
                      className="fixed inset-0 -z-10 cursor-default"
                    />
                  )}
                  {isQuickActionsOpen && (
                    <div
                      role="menu"
                      className="absolute bottom-16 right-0 w-56 modal-surface rounded-2xl p-2 space-y-0.5 origin-bottom-right animate-[fabpop_120ms_ease-out]"
                    >
                      <button
                        role="menuitem"
                        onClick={handleOpenExpenseModal}
                        className="w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-medium text-app-text hover:bg-surface-2 transition-colors"
                      >
                        + Add expense
                      </button>
                      <button
                        role="menuitem"
                        onClick={handleOpenIncomeModal}
                        className="w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-medium text-app-text hover:bg-surface-2 transition-colors"
                      >
                        + Add income
                      </button>
                      <div className="my-1 border-t border-app-border" />
                      <button
                        role="menuitem"
                        onClick={() => { setIsQuickActionsOpen(false); setIsStatementImportOpen(true); }}
                        className="w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-medium text-app-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                      >
                        <span aria-hidden="true">📄</span> Scan a statement (CSV / PDF)
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setIsQuickActionsOpen((prev) => !prev)}
                    aria-label="Quick actions"
                    aria-expanded={isQuickActionsOpen}
                    className="grid place-items-center w-14 h-14 rounded-full bg-primary text-on-primary shadow-glow hover:brightness-110 transition-all active:scale-95"
                  >
                    <PlusCircleIcon className={`h-7 w-7 transition-transform duration-200 ${isQuickActionsOpen ? 'rotate-45' : ''}`} />
                  </button>
              </div>

              <nav aria-label="Primary" className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass glass-blur border-t border-app-border grid grid-cols-6 px-1 pt-1.5 pb-2">
                {[
                  { view: 'expenses' as const, label: 'Spend' },
                  { view: 'income' as const, label: 'Income' },
                  { view: 'pivot' as const, label: 'Pivot' },
                  { view: 'ai' as const, label: 'AI' },
                  { view: 'reports' as const, label: 'Reports' },
                  { view: 'usc' as const, label: 'Tuition' },
                ].map(({ view, label }) => (
                  <button
                    key={view}
                    onClick={() => setActiveView(view)}
                    aria-current={activeView === view ? 'page' : undefined}
                    className={`py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${activeView === view ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </main>
          </div>

            {/* 5. MODALS */}
            {isExpenseModalOpen && (
              <Suspense fallback={null}>
                <ExpenseModal
                  isOpen={isExpenseModalOpen}
                  onClose={() => setIsExpenseModalOpen(false)}
                  onSave={editingExpense ? handleUpdateExpense : handleAddExpense}
                  expense={editingExpense}
                  onImportStatement={() => { setIsExpenseModalOpen(false); setIsStatementImportOpen(true); }}
                  knownAccounts={knownAccounts}
                />
              </Suspense>
            )}
            {isIncomeModalOpen && (
              <Suspense fallback={null}>
                <IncomeModal
                  isOpen={isIncomeModalOpen}
                  onClose={() => setIsIncomeModalOpen(false)}
                  onSave={editingIncome ? handleUpdateIncome : handleAddIncome}
                  income={editingIncome}
                  onImportStatement={() => { setIsIncomeModalOpen(false); setIsStatementImportOpen(true); }}
                  knownAccounts={knownAccounts}
                />
              </Suspense>
            )}
            {isBudgetModalOpen && (
              <Suspense fallback={null}>
                <BudgetManagerModal
                  isOpen={isBudgetModalOpen}
                  onClose={() => setIsBudgetModalOpen(false)}
                  onSave={handleSaveBudgets}
                  currentBudgets={budgets}
                />
              </Suspense>
            )}
            {isStatementImportOpen && (
              <Suspense fallback={null}>
                <StatementImportModal
                  isOpen={isStatementImportOpen}
                  onClose={() => setIsStatementImportOpen(false)}
                  existingExpenses={expenses}
                  existingIncomes={incomes}
                  onImport={handleImportStatement}
                />
              </Suspense>
            )}
            {isDataModalOpen && (
              <Suspense fallback={null}>
                <DataModal 
                  isOpen={isDataModalOpen} 
                  onClose={() => setIsDataModalOpen(false)} 
                  allExpenses={expenses} 
                  allIncomes={incomes}
                  budgets={budgets} 
                  semesters={semesters}
                  onImport={handleImportExpenses}
                  onOpenStatementImport={() => { setIsDataModalOpen(false); setIsStatementImportOpen(true); }}
                  onRestoreBackup={handleRestoreBackup}
                  onWipeAll={handleWipeAll}
                />
              </Suspense>
            )}
            {isCategoryModalOpen && (
              <Suspense fallback={null}>
                <CategoryManagerModal 
                  isOpen={isCategoryModalOpen} 
                  onClose={() => setIsCategoryModalOpen(false)} 
                />
              </Suspense>
            )}
            <Suspense fallback={null}>
              <MobileInstallPrompt />
            </Suspense>
          </div>
        );

        // --- THE NEW MAIN ROUTER RETURN ---
        return (
          <Router>
            {/* Top-center, not top-right: the right corner holds primary actions
                (the importer's Import button, the header's icon buttons), and a
                toast there covered them — hovering it even paused its dismissal. */}
            <Toaster 
              position="top-center"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#111111',
                  color: '#FAF9F6',
                  border: '3px solid #111111',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  textTransform: 'uppercase',
                },
                success: { style: { background: '#166534', border: '3px solid #111111' } },
                error: { style: { background: '#990000', border: '3px solid #111111' } },
              }}
            />
            <Routes>
              {/* 1. Auth Page */}
              <Route 
                path="/login" 
                element={!isAuthenticated ? (
                  <Suspense fallback={<SectionSkeleton title="Loading login" rows={2} />}>
                    <Auth onLoginSuccess={loginSuccess} />
                  </Suspense>
                ) : <Navigate to="/app" />} 
              />

              <Route
                path="/"
                element={!isAuthenticated ? (
                  <Suspense fallback={<SectionSkeleton title="Loading landing" rows={2} />}>
                    <LandingPage />
                  </Suspense>
                ) : <Navigate to="/app" />}
              />

              <Route
                path="/knowledge"
                element={
                  <Suspense fallback={<SectionSkeleton title="Loading knowledge base" rows={2} />}>
                    <KnowledgeBase />
                  </Suspense>
                }
              />
              
              {/* 2. Verification Page */}
              <Route path="/verify" element={<Suspense fallback={<SectionSkeleton title="Loading verification" rows={2} />}><VerifyOTP /></Suspense>} />

              {/* 3. The Main App (Protected) */}
              <Route 
                path="/app" 
                element={isAuthenticated
                  // Per-account storage (goals, categories, …) is keyed by the
                  // signed-in email, so wait for it; rendering earlier would read
                  // an empty store and a first save could overwrite real data.
                  ? (userEmail ? DashboardLayout : <SectionSkeleton title="Loading your account" rows={3} />)
                  : <Navigate to="/login" />}
              />

              {/* Catch-all: Redirect unknown paths to home */}
              <Route path="*" element={<Navigate to={isAuthenticated ? '/app' : '/'} />} />
            </Routes>
          </Router>
  );
};

export default App;