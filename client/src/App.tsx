import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Expense, Budget, Semester, Income } from './types';
import Header from './components/Header';
import type { DateRange } from './components/Dashboard';
import { PlusCircleIcon, ClipboardDocumentListIcon, TableCellsIcon, AcademicCapIcon, ChartPieIcon, BanknotesIcon, ChatBubbleBottomCenterTextIcon } from './components/Icons';
import { USC_SEMESTERS } from './constants';
import { fuzzyMatch } from './utils/fuzzySearch';
import { distributeAmount } from './utils/currencyUtils';
import { startOfMonth, endOfMonth, isWithinRange } from './utils/dateUtils';
import { expenseMatchesBudget } from './utils/budgetUtils';
import { getAllData, isAuthError } from './services/api';
import { useAuth } from './contexts/AuthContext';
import { createExpense, updateExpense, deleteExpense, createIncome, updateIncome, deleteIncome, saveBudgets, saveSemesters, createBulkExpenses, restoreAllData } from './services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './lib/queryClient';
import type { AllDataResponse } from './types/api';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import useDateRangeFilter from './hooks/useDateRangeFilter';
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

const VerticalTab = ({ icon, label, isActive, onClick, colorClass }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, colorClass: string }) => {
    return (
        <button
            onClick={onClick}
      role="tab"
      aria-selected={isActive}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
            // Changed w-20 to w-16 on mobile, w-20 on md+
            className={`flex-1 flex flex-col items-center justify-center w-16 md:w-20 border-b-4 border-r-4 border-ink transition-all relative overflow-hidden flex-shrink-0
                ${isActive 
                    ? `${colorClass} text-bone shadow-[inset_4px_0px_0px_0px_#111111]` 
                    : 'bg-white text-ink/40 hover:text-ink hover:bg-bone'
                }`}
        >
            {/* Desktop: Rotated Sticker | Mobile: Simple Stack */}
            <div className="flex flex-col items-center gap-1 md:gap-4 md:transform md:-rotate-90 whitespace-nowrap">
                <span className="font-loud text-[8px] md:text-[9px] tracking-[0.1em]">{label}</span>
                <div className="md:rotate-90 scale-90 md:scale-100">{icon}</div>
            </div>
            
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 md:w-2 bg-ink" />}
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
  // The raw search input lives in Header (debounced there); App only stores the
  // already-debounced term, so typing no longer re-renders the whole app on every
  // keystroke — only when the debounced value actually changes (APP-H5).
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Currency state/logic lives in CurrencyProvider now.

  const [isSemestersDirty, setIsSemestersDirty] = useState(false);
  const [pendingRecurring, setPendingRecurring] = useState<Omit<Expense, 'id'>[]>([]);
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

    // F3: recurring detection
    const loadedExpenses = data.expenses;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const lastMonthRecurring = loadedExpenses.filter(e => e.isRecurring && e.date.startsWith(lastMonth));
    const thisMonthEntries = new Set(
      loadedExpenses
        .filter(e => e.date.startsWith(thisMonth))
        .map(e => `${e.title.toLowerCase()}|${e.category.toLowerCase()}|${e.amount}`)
    );
    const missing = lastMonthRecurring.filter(
      e => !thisMonthEntries.has(`${e.title.toLowerCase()}|${e.category.toLowerCase()}|${e.amount}`)
    );

    if (missing.length > 0) {
      const snoozeUntil = Number(localStorage.getItem(RECURRING_SNOOZE_KEY) || '0');
      if (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil) {
        setPendingRecurring([]);
        return;
      }
      const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const newEntries: Omit<Expense, 'id'>[] = missing.map(e => ({
        date: (() => {
          const parsedDay = Number.parseInt(e.date.slice(8, 10), 10);
          const safeDay = Number.isFinite(parsedDay) && parsedDay > 0 ? Math.min(parsedDay, daysInThisMonth) : 1;
          return `${thisMonth}-${String(safeDay).padStart(2, '0')}`;
        })(),
        title: e.title,
        amount: e.amount,
        category: e.category,
        paymentMethod: e.paymentMethod,
        notes: e.notes,
        originalAmount: e.originalAmount,
        originalCurrency: e.originalCurrency,
        isRecurring: true,
      }));
      setPendingRecurring(newEntries);
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

  // F3: Accept pending recurring expenses
  const handleAcceptRecurring = async () => {
    if (pendingRecurring.length === 0) return;
    try {
      const addedCount = pendingRecurring.length;
      await createBulkExpenses(pendingRecurring);
      // Refetch the authoritative dataset (the bulk insert created server ids).
      await queryClient.invalidateQueries({ queryKey: queryKeys.allData });
      setPendingRecurring([]);
      localStorage.removeItem(RECURRING_SNOOZE_KEY);
      notify.success(`${addedCount} recurring expense(s) added for this month.`);
    } catch (error) {
      console.error("Failed to create recurring expenses:", error);
      notify.error('Could not create recurring expenses.');
    }
  };

  const handleDismissRecurring = () => {
    setPendingRecurring([]);
  };

  const handleSnoozeRecurring = () => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(RECURRING_SNOOZE_KEY, String(until));
    setPendingRecurring([]);
    notify.info('Recurring reminder snoozed for 24 hours.');
  };

  const showOnboarding = isAuthenticated && !isLoadingData && !onboardingDismissed && expenses.length === 0 && incomes.length === 0;

  const handleAddExpense = async (expense: Omit<Expense, 'id'>) => {
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

  const recurringSummary = useMemo(
    () => pendingRecurring.map(e => `${e.title} ($${e.amount})`).join(', '),
    [pendingRecurring]
  );

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
             
              />
                </div>
            );
        case 'income':
            return (
            <div>
              <IncomeList 
                incomes={searchedAndSortedItems as Income[]} 
                onEdit={handleEditIncomeClick}
                onQuickSave={handleQuickSaveIncome}
                onDelete={handleDeleteIncome}
                onCreate={handleOpenModal}
                isLoading={isLoadingData}
                
              />
                </div>
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
          <div className="h-screen bg-transparent flex flex-col overflow-hidden text-app-text font-sans">
            <div className="starfield" />
            <p className="sr-only" aria-live="polite" aria-atomic="true">{liveRegionMessage}</p>
            
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
            />

            {/* 2. BODY WRAPPER */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* SIDE NAVIGATION (Vertical Sticker Tabs) */}
              <nav
                ref={navRef}
                role="tablist"
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
                className="hidden md:flex w-16 md:w-20 flex-col border-r-4 border-ink bg-bone z-30 flex-shrink-0 overflow-hidden no-scrollbar h-full"
              >
                <VerticalTab icon={<ClipboardDocumentListIcon className="h-5 w-5" />} label="TXNS" colorClass="bg-usc-cardinal" isActive={activeView === 'expenses'} onClick={() => setActiveView('expenses')} />
                <VerticalTab icon={<BanknotesIcon className="h-5 w-5" />} label="REVENUE" colorClass="bg-green-600" isActive={activeView === 'income'} onClick={() => setActiveView('income')} />
                <VerticalTab icon={<ChatBubbleBottomCenterTextIcon className="h-5 w-5" />} label="AI" colorClass="bg-usc-gold text-ink" isActive={activeView === 'ai'} onClick={() => setActiveView('ai')} />
                <VerticalTab icon={<TableCellsIcon className="h-5 w-5" />} label="MATRIX" colorClass="bg-ink" isActive={activeView === 'pivot'} onClick={() => setActiveView('pivot')} />
                <VerticalTab icon={<ChartPieIcon className="h-5 w-5" />} label="AUDIT" colorClass="bg-ink" isActive={activeView === 'reports'} onClick={() => setActiveView('reports')} />
                <VerticalTab icon={<AcademicCapIcon className="h-5 w-5" />} label="BURSAR" colorClass="bg-usc-gold text-ink" isActive={activeView === 'usc'} onClick={() => setActiveView('usc')} />
              </nav>

              {/* 3. MAIN SCROLLABLE VIEWPORT */}
              <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 md:p-12 custom-scrollbar relative bg-transparent">
                <div className="w-full max-w-full overflow-hidden space-y-6 md:space-y-12 pb-56 md:pb-40">

                  {showOnboarding && (
                    <section className="bg-white border-4 border-ink p-4 md:p-6 shadow-neo">
                      <h3 className="font-loud text-lg md:text-2xl uppercase mb-2">WELCOME_ONBOARDING</h3>
                      <p className="font-mono text-[11px] text-ink/70 uppercase mb-4">
                        Start by adding one expense, one income, then set a budget for your top category.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={handleOpenExpenseModal}
                          className="bg-usc-gold text-ink font-loud text-xs py-2 px-4 border-4 border-ink shadow-neo uppercase"
                        >
                          ADD_FIRST_EXPENSE
                        </button>
                        <button
                          onClick={handleOpenIncomeModal}
                          className="bg-bone text-ink font-loud text-xs py-2 px-4 border-4 border-ink shadow-neo uppercase"
                        >
                          ADD_FIRST_INCOME
                        </button>
                        <button
                          onClick={() => {
                            localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
                            setOnboardingDismissed(true);
                          }}
                          className="bg-ink text-bone font-loud text-xs py-2 px-4 border-4 border-ink shadow-neo uppercase"
                        >
                          DISMISS
                        </button>
                      </div>
                    </section>
                  )}
                  
                  {/* F3: Recurring expense prompt */}
                  {pendingRecurring.length > 0 && (
                    <div className="bg-usc-gold/20 border-4 border-ink p-4 shadow-neo">
                      <p className="font-loud text-sm uppercase mb-2">
                        🔁 {pendingRecurring.length} recurring expense{pendingRecurring.length > 1 ? 's' : ''} from last month
                      </p>
                      <p className="font-mono text-[10px] text-ink/70 mb-3">
                        {recurringSummary}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleAcceptRecurring}
                          className="bg-usc-gold text-ink font-loud text-xs py-2 px-4 border-4 border-ink shadow-neo active:translate-y-1 transition-all uppercase"
                        >
                          ADD_ALL
                        </button>
                        <button
                          onClick={handleDismissRecurring}
                          className="bg-bone text-ink font-loud text-xs py-2 px-4 border-4 border-ink shadow-neo active:translate-y-1 transition-all uppercase"
                        >
                          DISMISS
                        </button>
                        <button
                          onClick={handleSnoozeRecurring}
                          className="bg-ink text-bone font-loud text-xs py-2 px-4 border-4 border-ink shadow-neo active:translate-y-1 transition-all uppercase"
                        >
                          SNOOZE_24H
                        </button>
                      </div>
                    </div>
                  )}

                  {(activeView === 'expenses' || activeView === 'income') && (
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

                  <div className="border-t-8 border-ink pt-8 md:pt-12">
                    <Suspense fallback={<SectionSkeleton title="Loading section" rows={4} />}>
                      {renderActiveView()}
                    </Suspense>
                  </div>
                </div>

              {/* 4. FLOATING ACTION BUTTON */}
              <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 flex flex-col items-center z-50 group">
                  {isQuickActionsOpen && (
                    <div className="mb-3 w-44 bg-bone border-4 border-ink shadow-neo p-2 space-y-2">
                      <button
                        onClick={handleOpenExpenseModal}
                        className="w-full text-left bg-white border-2 border-ink px-3 py-2 font-loud text-[10px] uppercase hover:bg-usc-gold"
                      >
                        + ADD_EXPENSE
                      </button>
                      <button
                        onClick={handleOpenIncomeModal}
                        className="w-full text-left bg-white border-2 border-ink px-3 py-2 font-loud text-[10px] uppercase hover:bg-usc-gold"
                      >
                        + ADD_INCOME
                      </button>
                      <button
                        onClick={handleOpenBudgetModal}
                        className="w-full text-left bg-white border-2 border-ink px-3 py-2 font-loud text-[10px] uppercase hover:bg-usc-gold"
                      >
                        + MANAGE_BUDGETS
                      </button>
                      <button
                        onClick={handleOpenDataModal}
                        className="w-full text-left bg-white border-2 border-ink px-3 py-2 font-loud text-[10px] uppercase hover:bg-usc-gold"
                      >
                        + DATA_HUB
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setIsQuickActionsOpen((prev) => !prev)}
                    aria-label="Open quick actions"
                    className="bg-usc-gold text-ink border-4 border-ink p-3 md:p-4 shadow-neo hover:bg-white hover:text-usc-cardinal hover:shadow-neo-hover transition-all flex flex-col items-center active:scale-95"
                  >
                    <PlusCircleIcon className="h-8 w-8 md:h-10 md:w-10" />
                    <span className="font-loud text-[8px] md:text-[10px] mt-1 md:mt-2 leading-none uppercase tracking-tighter">
                      QUICK_ACTIONS
                    </span>
                  </button>
              </div>

              <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t-4 border-ink bg-bone grid grid-cols-6">
                <button
                  onClick={() => setActiveView('expenses')}
                  className={`py-2 border-r-2 border-ink font-loud text-[9px] ${activeView === 'expenses' ? 'bg-usc-cardinal text-bone' : 'bg-white text-ink'}`}
                >
                  TXNS
                </button>
                <button
                  onClick={() => setActiveView('income')}
                  className={`py-2 border-r-2 border-ink font-loud text-[9px] ${activeView === 'income' ? 'bg-green-600 text-bone' : 'bg-white text-ink'}`}
                >
                  INCOME
                </button>
                <button
                  onClick={() => setActiveView('pivot')}
                  className={`py-2 border-r-2 border-ink font-loud text-[9px] ${activeView === 'pivot' ? 'bg-ink text-bone' : 'bg-white text-ink'}`}
                >
                  MATRIX
                </button>
                <button
                  onClick={() => setActiveView('ai')}
                  className={`py-2 border-r-2 border-ink font-loud text-[9px] ${activeView === 'ai' ? 'bg-usc-gold text-ink' : 'bg-white text-ink'}`}
                >
                  AI
                </button>
                <button
                  onClick={() => setActiveView('reports')}
                  className={`py-2 border-r-2 border-ink font-loud text-[9px] ${activeView === 'reports' ? 'bg-ink text-bone' : 'bg-white text-ink'}`}
                >
                  AUDIT
                </button>
                <button
                  onClick={() => setActiveView('usc')}
                  className={`py-2 font-loud text-[9px] ${activeView === 'usc' ? 'bg-usc-gold text-ink' : 'bg-white text-ink'}`}
                >
                  BURSAR
                </button>
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