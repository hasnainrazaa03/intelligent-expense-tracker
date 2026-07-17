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
import { expenseMatchesBudget } from './utils/budgetUtils';
import { getAllData, isAuthError } from './services/api';
import { useAuth } from './contexts/AuthContext';
import { createExpense, updateExpense, deleteExpense, createIncome, updateIncome, deleteIncome, saveBudgets, saveSemesters, createBulkExpenses, restoreAllData } from './services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './lib/queryClient';
import type { AllDataResponse } from './types/api';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import useDateRangeFilter from './hooks/useDateRangeFilter';
import useOfflineQueue from './hooks/useOfflineQueue';
import { enqueueExpense, type PendingExpense } from './utils/offlineQueue';
import { notify } from './utils/notifications';
import SectionSkeleton from './components/SectionSkeleton';
import { APP_CONFIG } from './config';

const Dashboard = lazy(() => import('./components/Dashboard'));
const ExpenseList = lazy(() => import('./components/ExpenseList'));
const IncomeList = lazy(() => import('./components/IncomeList'));
const ExpenseModal = lazy(() => import('./components/ExpenseModal'));
const IncomeModal = lazy(() => import('./components/IncomeModal'));
const BudgetManagerModal = lazy(() => import('./components/BudgetManagerModal'));
const CategoryManagerModal = lazy(() => import('./components/CategoryManagerModal'));
const DataModal = lazy(() => import('./components/ExportModal'));
const AiAnalyst = lazy(() => import('./components/AiAnalyst'));
const Auth = lazy(() => import('./components/Auth'));
const VerifyOTP = lazy(() => import('./components/VerifyOTP'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const KnowledgeBase = lazy(() => import('./components/KnowledgeBase'));
const MobileInstallPrompt = lazy(() => import('./components/MobileInstallPrompt'));
const USCPaymentTracker = lazy(() => import('./components/USCPaymentTracker'));
const PivotAnalysis = lazy(() => import('./components/PivotAnalysis'));
const Reports = lazy(() => import('./components/Reports'));

type ActiveView = 'expenses' | 'income' | 'ai' | 'pivot' | 'usc' | 'reports';

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
  const { isAuthenticated, twoFactorEnabled, loginSuccess, logout, toggleTwoFactor } = useAuth();

  const allDataQuery = useQuery({
    queryKey: queryKeys.allData,
    queryFn: getAllData,
    enabled: isAuthenticated,
  });
  const isLoadingData = isAuthenticated && allDataQuery.isPending;

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
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>('this_month');
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
  const [pendingRecurring, setPendingRecurring] = useState<Omit<Expense, 'id'>[]>([]);
  const [selectedRecurring, setSelectedRecurring] = useState<Set<number>>(new Set());
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
  });

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
    if (!data) {
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
      const snoozeUntil = Number(localStorage.getItem(RECURRING_SNOOZE_KEY) || '0');
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
  }, [allDataQuery.data]);

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

  // Auto-save semesters to the database whenever they change
  useEffect(() => {
    // Only save if we're logged in AND the user has actually made a change
    if (!isAuthenticated || !isSemestersDirty) {
      return;
    }

    // Set a timer to wait 800ms after the last change before triggering the API
    const saveTimer = setTimeout(() => {
      saveSemesters(semesters)
        .then(() => {
          setIsSemestersDirty(false); // Reset the flag after a successful save
        })
        .catch(err => {
          console.error("Failed to auto-save semesters:", err);
          // We removed the alert here to prevent interrupting the user experience
        });
    }, 800);

    // CLEANUP: If the user makes another change within 800ms, this clears the previous timer
    return () => clearTimeout(saveTimer);

  }, [semesters, isAuthenticated, isSemestersDirty]);
  
  // Budget alert: check if a category is near or over its monthly budget
  const checkBudgetAlert = useCallback((category: string, allExpenses: Expense[]) => {
    const budget = budgets.find(b => b.category === category);
    if (!budget || budget.amount <= 0) return;

    // Local calendar month window (no toISOString UTC shift).
    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();

    const monthlySpent = allExpenses
      .filter(e => expenseMatchesBudget(e.category, category) && isWithinRange(e.date, monthStart, monthEnd))
      .reduce((sum, e) => sum + e.amount, 0);

    const pct = (monthlySpent / budget.amount) * 100;
    if (pct >= 100) {
      notify.error(`Budget exceeded: ${category} ${monthlySpent.toFixed(0)} / ${budget.amount.toFixed(0)} (${pct.toFixed(0)}%)`);
    } else if (pct >= 80) {
      notify.warning(`Budget warning: ${category} ${monthlySpent.toFixed(0)} / ${budget.amount.toFixed(0)} (${pct.toFixed(0)}%)`);
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
      localStorage.removeItem(RECURRING_SNOOZE_KEY);
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
    localStorage.setItem(RECURRING_SNOOZE_KEY, String(until));
    setPendingRecurring([]);
    setSelectedRecurring(new Set());
    notify.info('Recurring reminder snoozed for 24 hours.');
  };

  const showOnboarding = isAuthenticated && !isLoadingData && !onboardingDismissed && expenses.length === 0 && incomes.length === 0;

  // Offline queue: replay each queued create, then refetch so temp local rows
  // are replaced by the authoritative server data.
  const offline = useOfflineQueue({
    // Send the queue's clientId as an idempotency key so a replayed create
    // (e.g. after a crash between POST and dequeue) returns the existing row
    // instead of duplicating it.
    process: useCallback(async (item: PendingExpense) => { await createExpense({ ...item.payload, clientRequestId: item.clientId }); }, []),
    onSynced: useCallback(() => { void queryClient.invalidateQueries({ queryKey: queryKeys.allData }); }, [queryClient]),
  });

  const handleAddExpense = async (expense: Omit<Expense, 'id'>) => {
    // Offline: queue it in IndexedDB and optimistically show it (temp id) so no
    // data is lost; it replays automatically on reconnect.
    if (!navigator.onLine) {
      try {
        const item = await enqueueExpense(expense);
        setExpenses(prev => {
          const updated = [...prev, { ...expense, id: item.clientId } as Expense];
          checkBudgetAlert(expense.category, updated);
          return updated;
        });
        await offline.refreshCount();
        notify.info('Saved offline — will sync when you reconnect.');
      } catch (error) {
        console.error('Failed to queue expense offline:', error);
        notify.error('Could not save offline.');
      }
      return;
    }
    try {
      const newExpense = await createExpense(expense);
      setExpenses(prev => {
        const updated = [...prev, newExpense];
        checkBudgetAlert(newExpense.category, updated);
        return updated;
      });
    } catch (error) {
      console.error("Failed to add expense:", error);
      notify.error('Could not add expense.');
    }
  };

const handleUpdateExpense = async (updatedExpense: Expense) => {
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
      setIsSemestersDirty(true);
    }
    setEditingExpense(null);
    setIsExpenseModalOpen(false);
  } catch (error) {
    console.error("Failed to update expense:", error);
    notify.error('Could not update expense.');
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
      setIsSemestersDirty(true);
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
      setIsSemestersDirty(true);
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
const handleAddIncome = async (income: Omit<Income, 'id'>) => {
  try {
    const newIncome = await createIncome(income);
    setIncomes(prev => [...prev, newIncome]);
  } catch (error) {
    console.error("Failed to add income:", error);
    notify.error('Could not add income.');
  }
};

const handleUpdateIncome = async (updatedIncome: Income) => {
  try {
    const returnedIncome = await updateIncome(updatedIncome);
    setIncomes(prev => prev.map(inc => inc.id === returnedIncome.id ? returnedIncome : inc));
    setEditingIncome(null);
  } catch (error) {
    console.error("Failed to update income:", error);
    notify.error('Could not update income.');
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
    try {
      // 1. Send the batch to the server
      await createBulkExpenses(importedExpenses);
      
      // 2. The import was successful, show an alert
      notify.success(`${importedExpenses.length} expenses successfully imported.`);

      // 3. Refetch the authoritative dataset so local state has the new ids.
      await queryClient.invalidateQueries({ queryKey: queryKeys.allData });

    } catch (error) {
      console.error("Failed to import expenses:", error);
      notify.error('Could not import expenses.');
    }
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
    setIsSemestersDirty(true);
  };
  const handleMarkInstallmentAsPaid = async (semesterId: string, installmentId: number, paymentDate: string) => {
    const semester = semesters.find(s => s.id === semesterId);
    const installment = semester?.installments.find(i => i.id === installmentId);
    
    if (!semester || !installment || installment.status === 'paid' || installment.amount <= 0) return;

    const baseSemesterName = semester.name.split('USC TUITION')[0].trim();
    const cleanTitle = `USC Tuition - ${baseSemesterName} (Inst #${installment.id})`;

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
      // 2. Save the new expense to the database
      const savedExpense = await createExpense(newExpenseData);
      
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
      setIsSemestersDirty(true);
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
      setIsSemestersDirty(true);

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
            status: 'unpaid',
            expenseId: undefined,
            paidDate: undefined,
          };
        });

        return { ...semester, installments: newInstallments };
      }
      return semester;
    })
  );
  
  setIsSemestersDirty(true);
};

  // ... (useMemo for filteredExpenses, filteredIncomes, etc. remains the same) ...
    const { filteredExpenses, filteredIncomes, previousPeriodExpenses } = useDateRangeFilter(expenses, incomes, dateRange);

  const searchedAndSortedItems = useMemo(() => {
    const itemsToFilter = activeView === 'income' ? [...filteredIncomes] : [...filteredExpenses];

    const results = debouncedSearchQuery
      ? itemsToFilter.filter(item => {
          const query = debouncedSearchQuery;
          const threshold = query.length > 5 ? 2 : 1;
          const titleMatch = fuzzyMatch(query, item.title, threshold);
          const categoryMatch = fuzzyMatch(query, item.category, threshold);
          const notesMatch = item.notes ? fuzzyMatch(query, item.notes, threshold) : false;
          return titleMatch || categoryMatch || notesMatch;
        })
      : itemsToFilter;

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredExpenses, filteredIncomes, debouncedSearchQuery, activeView]);


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
                dateFilter={<DateRangeFilter selectedRange={dateRange} onChange={setDateRange} />}
              />
            );
        case 'ai':
          return <AiAnalyst expenses={expenses} incomes={incomes} />;
        case 'pivot':
            return <PivotAnalysis expenses={expenses} />;
        case 'usc':
            return <USCPaymentTracker semesters={semesters} onUpdateTuition={handleUpdateSemesterTuition} onUpdateInstallmentCount={handleUpdateInstallmentCount} onMarkAsPaid={handleMarkInstallmentAsPaid} onUpdateDate={handleUpdateInstallmentDate} />;
        case 'reports':
          return <Reports allExpenses={expenses} budgets={budgets} isLoading={isLoadingData} />;
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
                            localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
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
                        expenses={filteredExpenses}
                        incomes={filteredIncomes}
                        allIncomes={incomes}
                        allExpenses={expenses}
                        previousPeriodExpenses={previousPeriodExpenses}
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
                      : <IncomeSummary incomes={filteredIncomes} allIncomes={incomes} />
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
                  onRestoreBackup={handleRestoreBackup}
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
            <Toaster 
              position="top-right"
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
                element={isAuthenticated ? DashboardLayout : <Navigate to="/login" />}
              />

              {/* Catch-all: Redirect unknown paths to home */}
              <Route path="*" element={<Navigate to={isAuthenticated ? '/app' : '/'} />} />
            </Routes>
          </Router>
  );
};

export default App;