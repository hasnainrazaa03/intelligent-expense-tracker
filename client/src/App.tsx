import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Expense, Budget, Semester, Income } from './types';
import Header from './components/Header';
import Dashboard, { DateRange } from './components/Dashboard';
import ExpenseList from './components/ExpenseList';
import IncomeList from './components/IncomeList';
import ExpenseModal from './components/ExpenseModal';
import IncomeModal from './components/IncomeModal';
import BudgetManagerModal from './components/BudgetManagerModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import DataModal from './components/ExportModal';
import AiAnalyst from './components/AiAnalyst';
import Auth from './components/Auth';
import VerifyOTP from './components/VerifyOTP';
import { PlusCircleIcon, ClipboardDocumentListIcon, TableCellsIcon, AcademicCapIcon, ChartPieIcon, BanknotesIcon } from './components/Icons';
import { useTheme } from './hooks/useTheme';
import { USC_SEMESTERS } from './constants';
import USCPaymentTracker from './components/USCPaymentTracker';
import PivotAnalysis from './components/PivotAnalysis';
import Reports from './components/Reports';
import { fuzzyMatch } from './utils/fuzzySearch';
import { getAllData } from './services/api';
import { createExpense, updateExpense, deleteExpense, createIncome, updateIncome, deleteIncome, saveBudgets, saveSemesters, createBulkExpenses, restoreAllData } from './services/api';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

type ActiveView = 'expenses' | 'income' | 'pivot' | 'usc' | 'reports';

const VerticalTab = ({ icon, label, isActive, onClick, colorClass }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, colorClass: string }) => {
    return (
        <button
            onClick={onClick}
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
  const { theme, toggleTheme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [activeView, setActiveView] = useState<ActiveView>('expenses');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'INR'>('USD');
  const [usdToInrRate, setUsdToInrRate] = useState<number | null>(null);
  
  // --- MODIFIED ---
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('authToken') != null;
  });
  // We add a loading state
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSemestersDirty, setIsSemestersDirty] = useState(false);
  const [pendingRecurring, setPendingRecurring] = useState<Omit<Expense, 'id'>[]>([]);

  useEffect(() => {
    // Check if we've been redirected from the Google login
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const hashParams = new URLSearchParams(hash);
    const token = hashParams.get('token') ?? params.get('token');

    if (token) {
      // 1. Save the token
      localStorage.setItem('authToken', token);
      
      // 2. Update our auth state
      setIsAuthenticated(true);
      
      // 3. Clean the URL (remove token from query/hash)
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch conversion rate (P1: cached with 1hr TTL)
  useEffect(() => {
    const fetchRate = async () => {
      try {
        // P1: Check localStorage cache first
        const cached = localStorage.getItem('usdToInrRate');
        if (cached) {
          const { rate, timestamp } = JSON.parse(cached);
          const ONE_HOUR = 60 * 60 * 1000;
          if (Date.now() - timestamp < ONE_HOUR) {
            setUsdToInrRate(rate);
            return;
          }
        }

        const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
        if (!response.ok) throw new Error('Failed to fetch rate');
        const data = await response.json();
        const rate = data.rates.INR;
        setUsdToInrRate(rate);
        
        // P1: Cache the rate
        localStorage.setItem('usdToInrRate', JSON.stringify({ rate, timestamp: Date.now() }));
      } catch (error) {
        console.error("Could not fetch conversion rate:", error);
        // Fallback: try to use cached rate even if expired
        const cached = localStorage.getItem('usdToInrRate');
        if (cached) {
          const { rate } = JSON.parse(cached);
          setUsdToInrRate(rate);
        }
      }
    };
    fetchRate();
  }, []);

  // --- MODIFIED: Load data from API ---
  useEffect(() => {
    if (isAuthenticated) {
      // Set default currency preference
      const storedCurrency = localStorage.getItem('displayCurrency');
      if (storedCurrency === 'USD' || storedCurrency === 'INR') {
          setDisplayCurrency(storedCurrency);
      } else {
          const isIndia = new Date().getTimezoneOffset() === -330;
          setDisplayCurrency(isIndia ? 'INR' : 'USD');
      }
      
      // Fetch all data from our server
      setIsLoadingData(true);
      getAllData()
        .then(data => {
          const loadedExpenses = data.expenses as Expense[];
          setExpenses(loadedExpenses);
          setIncomes(data.incomes as Income[]);
          setBudgets(data.budgets as Budget[]);

          // Set initial semesters if user has none
          if (data.semesters.length > 0) {
            setSemesters(data.semesters as Semester[]);
          } else {
            const initialSemesters: Semester[] = USC_SEMESTERS.map(s => ({
                ...s,
                totalTuition: 0,
                installments: Array.from({ length: 4 }, (_, i) => ({
                    id: i + 1,
                    amount: 0,
                    status: 'unpaid',
                })),
            }));
            setSemesters(initialSemesters);
          }

          // F3: Check for recurring expenses from last month not yet created this month
          const now = new Date();
          const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

          const lastMonthRecurring = loadedExpenses.filter(
            e => e.isRecurring && e.date.startsWith(lastMonth)
          );
          const thisMonthEntries = new Set(
            loadedExpenses
              .filter(e => e.date.startsWith(thisMonth))
              .map(e => `${e.title.toLowerCase()}|${e.category.toLowerCase()}|${e.amount}`)
          );
          const missing = lastMonthRecurring.filter(
            e => !thisMonthEntries.has(`${e.title.toLowerCase()}|${e.category.toLowerCase()}|${e.amount}`)
          );

          if (missing.length > 0) {
            const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const newEntries: Omit<Expense, 'id'>[] = missing.map(e => ({
              // Clamp day so 31st from prior month doesn't generate invalid dates like YYYY-MM-31 in shorter months
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
        })
        .catch(err => {
          console.error("Failed to fetch data:", err);
          // If token is invalid, log out
          if (err.message === 'Invalid token' || err.message === 'No token provided' || err.message === 'Token expired') {
            handleLogout();
          }
        })
        .finally(() => {
          setIsLoadingData(false);
        });

    } else {
      // If not authenticated, clear data and set loading to false
      setExpenses([]);
      setIncomes([]);
      setBudgets([]);
      setSemesters([]);
      setIsLoadingData(false);
    }
  }, [isAuthenticated]);

  // --- MODIFIED: Remove all localStorage.setItem for data ---
  // We only save the displayCurrency preference
  useEffect(() => { 
    if (isAuthenticated) { 
      localStorage.setItem('displayCurrency', displayCurrency); 
    } 
  }, [displayCurrency, isAuthenticated]);

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
  
  // --- MODIFIED ---
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
    setExpenses([]);
    setIncomes([]);
    setBudgets([]);
    setSemesters([]);
  };

  // Budget alert: check if a category is near or over its monthly budget
  const checkBudgetAlert = useCallback((category: string, allExpenses: Expense[]) => {
    const budget = budgets.find(b => b.category === category);
    if (!budget || budget.amount <= 0) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const monthlySpent = allExpenses
      .filter(e => e.category === category && e.date >= monthStart && e.date <= monthEnd)
      .reduce((sum, e) => sum + e.amount, 0);

    const pct = (monthlySpent / budget.amount) * 100;
    if (pct >= 100) {
      toast.error(`🚨 Budget EXCEEDED for ${category}! $${monthlySpent.toFixed(0)} / $${budget.amount.toFixed(0)} (${pct.toFixed(0)}%)`, { duration: 5000 });
    } else if (pct >= 80) {
      toast(`⚠️ Budget warning for ${category}: $${monthlySpent.toFixed(0)} / $${budget.amount.toFixed(0)} (${pct.toFixed(0)}%)`, { duration: 4000 });
    }
  }, [budgets]);

  // F3: Accept pending recurring expenses
  const handleAcceptRecurring = async () => {
    if (pendingRecurring.length === 0) return;
    try {
      const addedCount = pendingRecurring.length;
      await createBulkExpenses(pendingRecurring);
      const refreshed = await getAllData();
      setExpenses(refreshed.expenses as Expense[]);
      setPendingRecurring([]);
      toast.success(`${addedCount} recurring expense(s) added for this month!`);
    } catch (error) {
      console.error("Failed to create recurring expenses:", error);
      toast.error("Could not create recurring expenses.");
    }
  };

  const handleDismissRecurring = () => {
    setPendingRecurring([]);
  };

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
    toast.error("Could not add expense.");
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
    setSemesters(prev => prev.map(sem => ({
      ...sem,
      installments: sem.installments.map(inst => 
        inst.expenseId === returnedExpense.id 
          ? { ...inst, paidDate: returnedExpense.date, amount: returnedExpense.amount } 
          : inst
      )
    })));
    setIsSemestersDirty(true);
    setEditingExpense(null);
    setIsExpenseModalOpen(false);
  } catch (error) {
    console.error("Failed to update expense:", error);
    toast.error("Could not update expense.");
  }
};

const handleDeleteExpense = async (id: string) => {
  try {
    // 1. EXECUTE API DELETE FIRST (before mutating state)
    await deleteExpense(id);

    // 2. SCAN AND RESET BURSAR STATE
    let wasTuitionPayment = false;

    setSemesters(prevSemesters => {
      return prevSemesters.map(semester => {
        let semesterModified = false;
        
        const updatedInstallments = semester.installments.map(inst => {
          if (inst.expenseId === id) {
            wasTuitionPayment = true;
            semesterModified = true;
            return { 
              ...inst, 
              status: 'unpaid' as const, 
              expenseId: undefined, 
              paidDate: undefined 
            };
          }
          return inst;
        });

        if (semesterModified) return { ...semester, installments: updatedInstallments };
        return semester;
      });
    });

    // 3. MARK BURSAR AS DIRTY
    if (wasTuitionPayment) {
      setIsSemestersDirty(true);
    }

    // 4. UPDATE LOCAL EXPENSE LIST
    setExpenses(prevExpenses => prevExpenses.filter(exp => exp.id !== id));

  } catch (error) {
    console.error("CRITICAL_SYNC_ERROR: Failed to delete expense:", error);
    toast.error("Could not delete expense. Please try again.");
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
    toast.error("Could not add income.");
  }
};

const handleUpdateIncome = async (updatedIncome: Income) => {
  try {
    const returnedIncome = await updateIncome(updatedIncome);
    setIncomes(prev => prev.map(inc => inc.id === returnedIncome.id ? returnedIncome : inc));
    setEditingIncome(null);
  } catch (error) {
    console.error("Failed to update income:", error);
    toast.error("Could not update income.");
  }
};

const handleDeleteIncome = async (id: string) => {
  try {
    await deleteIncome(id);
    setIncomes(prev => prev.filter(inc => inc.id !== id));
  } catch (error) {
    console.error("Failed to delete income:", error);
    toast.error("Could not delete income.");
  }
};
  const handleEditIncomeClick = (income: Income) => { setEditingIncome(income); setIsIncomeModalOpen(true); };

  const handleOpenModal = () => {
    if (activeView === 'income') {
        setEditingIncome(null);
        setIsIncomeModalOpen(true);
    } else {
        setEditingExpense(null);
        setIsExpenseModalOpen(true);
    }
  };

  const handleSaveBudgets = async (updatedBudgets: Budget[]) => {
  try {
    const savedBudgets = await saveBudgets(updatedBudgets);
    setBudgets(savedBudgets);
    setIsBudgetModalOpen(false);
  } catch (error) {
    console.error("Failed to save budgets:", error);
    toast.error("Could not save budgets.");
  }
};
  const handleImportExpenses = async (importedExpenses: Omit<Expense, 'id'>[]) => {
    try {
      // 1. Send the batch to the server
      await createBulkExpenses(importedExpenses);
      
      // 2. The import was successful, show an alert
      toast.success(`${importedExpenses.length} expenses successfully imported!`);

      // 3. Easiest way to get all the new IDs is to just re-fetch all data
      // This ensures our local state is in sync with the database.
      setIsLoadingData(true);
      getAllData()
        .then(data => {
          setExpenses(data.expenses as Expense[]);
          setIncomes(data.incomes as Income[]);
          setBudgets(data.budgets as Budget[]);
          if (data.semesters?.length > 0) {
            setSemesters(data.semesters as Semester[]);
          }
        })
        .catch(err => console.error("Failed to refetch data:", err))
        .finally(() => setIsLoadingData(false));
      
    } catch (error) {
      console.error("Failed to import expenses:", error);
      toast.error("Could not import expenses.");
    }
  };

  const handleRestoreBackup = async (payload: {
    expenses: Omit<Expense, 'id'>[];
    incomes: Omit<Income, 'id'>[];
    budgets: Budget[];
    semesters: Semester[];
  }) => {
    try {
      setIsLoadingData(true);
      const restored = await restoreAllData(payload);
      setExpenses(restored.expenses as Expense[]);
      setIncomes(restored.incomes as Income[]);
      setBudgets(restored.budgets as Budget[]);
      setSemesters(restored.semesters as Semester[]);
      setPendingRecurring([]);
      toast.success('Backup restored successfully.');
    } catch (error) {
      console.error('Failed to restore backup:', error);
      toast.error('Could not restore backup. Please verify the file format.');
      throw error;
    } finally {
      setIsLoadingData(false);
    }
  };
  const handleUpdateSemesterTuition = (semesterId: string, totalTuition: number) => {
    setSemesters(prevSemesters =>
      prevSemesters.map(semester => {
        if (semester.id === semesterId) {
          const installmentAmount = totalTuition > 0 && semester.installments.length > 0 ? totalTuition / semester.installments.length : 0;
          return { ...semester, totalTuition, installments: semester.installments.map(inst => ({ ...inst, amount: installmentAmount })) };
        }
        return semester;
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
      toast.error("Could not create the tuition expense.");
    }
  };
  const handleUpdateInstallmentDate = async (semesterId: string, installmentId: number, newDate: string) => {
      let expenseToUpdateId: string | undefined;
      setSemesters(prevSemesters => prevSemesters.map(s => {
              if (s.id === semesterId) { return { ...s, installments: s.installments.map(i => { if (i.id === installmentId) { expenseToUpdateId = i.expenseId; return { ...i, paidDate: newDate }; } return i; }) }; }
              return s;
          })
      );
      setIsSemestersDirty(true);
      if (expenseToUpdateId) {
        const expenseId = expenseToUpdateId;
        // Use functional update to get latest expenses (avoids stale closure)
        let expenseSnapshot: Expense | undefined;
        setExpenses(prevExpenses => {
          expenseSnapshot = prevExpenses.find(exp => exp.id === expenseId);
          return prevExpenses.map(exp => exp.id === expenseId ? { ...exp, date: newDate } : exp);
        });
        // Persist the date change to the API
        try {
          if (expenseSnapshot) {
            await updateExpense({ ...expenseSnapshot, date: newDate });
          }
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

        // 4. Calculate the new per-installment amount for the remaining slots
        const newSplitAmount = unpaidSlotsNeeded > 0 
          ? Math.round(((remainingToPay / unpaidSlotsNeeded) + Number.EPSILON) * 100) / 100
          : 0;

        // 5. Build the new dynamic array
        const newInstallments = Array.from({ length: count }, (_, i) => {
          const existing = semester.installments[i];
          
          // LOCK: If this slot was already paid, keep it EXACTLY as is (amount, ID, date)
          if (existing && existing.status === 'paid') {
            return existing;
          }

          // REDISTRIBUTE: Otherwise, assign the new split amount to the unpaid slot
          return {
            id: i + 1,
            amount: newSplitAmount,
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
  const { filteredExpenses, filteredIncomes, previousPeriodExpenses } = useMemo(() => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const getUTCDate = (dateString: string) => new Date(dateString);

    let start, end, prevStart, prevEnd;

    switch (dateRange) {
        case 'this_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            end = today;
            prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            prevEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            break;
        case 'last_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
            prevEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 0));
            break;
        case 'last_90_days':
            start = new Date(today);
            start.setUTCDate(today.getUTCDate() - 90);
            end = today;
            prevStart = new Date(start);
            prevStart.setUTCDate(start.getUTCDate() - 90);
            prevEnd = new Date(start);
            prevEnd.setUTCDate(start.getUTCDate() - 1);
            break;
        case 'all_time':
        default:
            return { filteredExpenses: expenses, filteredIncomes: incomes, previousPeriodExpenses: [] };
    }
    const currentExpenses = expenses.filter(exp => { const d = getUTCDate(exp.date); return d >= start && d <= end; });
    const currentIncomes = incomes.filter(inc => { const d = getUTCDate(inc.date); return d >= start && d <= end; });
    const previousExpenses = expenses.filter(exp => { const d = getUTCDate(exp.date); return d >= prevStart && d <= prevEnd; });
    
    return { filteredExpenses: currentExpenses, filteredIncomes: currentIncomes, previousPeriodExpenses: previousExpenses };
  }, [expenses, incomes, dateRange]);

  const searchedAndSortedItems = useMemo(() => {
    const itemsToFilter = activeView === 'income' ? [...filteredIncomes] : [...filteredExpenses];

    const results = searchQuery
      ? itemsToFilter.filter(item => {
          const query = searchQuery;
          const threshold = query.length > 5 ? 2 : 1;
          const titleMatch = fuzzyMatch(query, item.title, threshold);
          const categoryMatch = fuzzyMatch(query, item.category, threshold);
          const notesMatch = item.notes ? fuzzyMatch(query, item.notes, threshold) : false;
          return titleMatch || categoryMatch || notesMatch;
        })
      : itemsToFilter;

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredExpenses, filteredIncomes, searchQuery, activeView]);

  // --- NEW: Loading Spinner ---
  const LoadingSpinner = (
    <div className="min-h-screen bg-bone flex flex-col items-center justify-center p-8 graph-grid overflow-hidden">
      <div className="relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.05]">
          <h1 className="font-loud text-[20vw] leading-none text-ink select-none">LOADING</h1>
        </div>
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-24 h-24 border-8 border-ink border-t-usc-gold animate-spin mb-8 shadow-neo" />
          <div className="bg-ink text-bone px-8 py-3 border-4 border-ink shadow-neo">
            <span className="font-loud text-2xl tracking-[0.2em] animate-pulse">BOOTING_CORE_SYSTEM...</span>
          </div>
          <p className="font-mono text-[10px] mt-6 text-ink/40 uppercase tracking-[0.4em] font-bold">
            Establishing_Secure_Link // USC_FIN_v4.0
          </p>
        </div>
      </div>
    </div>
  );

  // ... (renderActiveView function remains the same) ...
  const renderActiveView = () => {
    const commonProps = { displayCurrency, conversionRate: usdToInrRate };
    switch (activeView) {
        case 'expenses':
            return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <ExpenseList 
                        expenses={searchedAndSortedItems as Expense[]} 
                        onEdit={handleEditExpenseClick}
                        onDelete={handleDeleteExpense}
                        {...commonProps}
                        />
                    </div>
                    <div className="lg:col-span-1">
                        <AiAnalyst expenses={expenses} incomes={incomes} />
                    </div>
                </div>
            );
        case 'income':
            return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <IncomeList 
                          incomes={searchedAndSortedItems as Income[]} 
                          onEdit={handleEditIncomeClick}
                          onDelete={handleDeleteIncome}
                           {...commonProps}
                        />
                    </div>
                    <div className="lg:col-span-1">
                        <AiAnalyst expenses={expenses} incomes={incomes} />
                    </div>
                </div>
            );
        case 'pivot':
            return <PivotAnalysis expenses={expenses} {...commonProps} />;
        case 'usc':
            return <USCPaymentTracker semesters={semesters} onUpdateTuition={handleUpdateSemesterTuition} onUpdateInstallmentCount={handleUpdateInstallmentCount} onMarkAsPaid={handleMarkInstallmentAsPaid} onUpdateDate={handleUpdateInstallmentDate} {...commonProps} />;
        case 'reports':
            return <Reports allExpenses={expenses} budgets={budgets} {...commonProps} />;
        default: return null;
    }
  };
        const DashboardLayout = (
          <div className="h-screen bg-bone flex flex-col overflow-hidden text-ink font-mono">
            <div className="noise-overlay" />
            
            {/* 1. HEADER (Fixed at top) */}
            <Header 
              onLogout={handleLogout} 
              onManageBudgets={() => setIsBudgetModalOpen(true)}
              onManageCategories={() => setIsCategoryModalOpen(true)}
              onDataAction={() => setIsDataModalOpen(true)}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              activeView={activeView}
              displayCurrency={displayCurrency}
              onCurrencyChange={setDisplayCurrency}
            />

            {/* 2. BODY WRAPPER */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* SIDE NAVIGATION (Vertical Sticker Tabs) */}
              <nav className="w-16 md:w-20 flex flex-col border-r-4 border-ink bg-bone z-30 flex-shrink-0 overflow-hidden no-scrollbar h-full">
                <VerticalTab icon={<ClipboardDocumentListIcon className="h-5 w-5" />} label="TXNS" colorClass="bg-usc-cardinal" isActive={activeView === 'expenses'} onClick={() => setActiveView('expenses')} />
                <VerticalTab icon={<BanknotesIcon className="h-5 w-5" />} label="REVENUE" colorClass="bg-green-600" isActive={activeView === 'income'} onClick={() => setActiveView('income')} />
                <VerticalTab icon={<TableCellsIcon className="h-5 w-5" />} label="MATRIX" colorClass="bg-ink" isActive={activeView === 'pivot'} onClick={() => setActiveView('pivot')} />
                <VerticalTab icon={<ChartPieIcon className="h-5 w-5" />} label="AUDIT" colorClass="bg-ink" isActive={activeView === 'reports'} onClick={() => setActiveView('reports')} />
                <VerticalTab icon={<AcademicCapIcon className="h-5 w-5" />} label="BURSAR" colorClass="bg-usc-gold text-ink" isActive={activeView === 'usc'} onClick={() => setActiveView('usc')} />
              </nav>

              {/* 3. MAIN SCROLLABLE VIEWPORT */}
              <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 md:p-12 custom-scrollbar relative bg-bone">
                <div className="w-full max-w-full overflow-hidden space-y-6 md:space-y-12 pb-40">
                  
                  {/* F3: Recurring expense prompt */}
                  {pendingRecurring.length > 0 && (
                    <div className="bg-usc-gold/20 border-4 border-ink p-4 shadow-neo">
                      <p className="font-loud text-sm uppercase mb-2">
                        🔁 {pendingRecurring.length} recurring expense{pendingRecurring.length > 1 ? 's' : ''} from last month
                      </p>
                      <p className="font-mono text-[10px] text-ink/70 mb-3">
                        {pendingRecurring.map(e => `${e.title} ($${e.amount})`).join(', ')}
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
                      </div>
                    </div>
                  )}

                  {(activeView === 'expenses' || activeView === 'income') && (
                    <Dashboard 
                      expenses={filteredExpenses} 
                      incomes={filteredIncomes}
                      allExpenses={expenses}
                      previousPeriodExpenses={previousPeriodExpenses}
                      selectedRange={dateRange}
                      onDateRangeChange={setDateRange}
                      budgets={budgets}
                      displayCurrency={displayCurrency}
                      conversionRate={usdToInrRate}
                    />
                  )}

                  <div className="border-t-8 border-ink pt-8 md:pt-12">
                    {renderActiveView()}
                  </div>
                </div>

              {/* 4. FLOATING ACTION BUTTON */}
              <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 flex flex-col items-center z-50 group">
                  <button
                    onClick={handleOpenModal}
                    className="bg-usc-gold text-ink border-4 border-ink p-3 md:p-4 shadow-neo hover:bg-white hover:text-usc-cardinal hover:shadow-neo-hover transition-all flex flex-col items-center active:scale-95"
                  >
                    <PlusCircleIcon className="h-8 w-8 md:h-10 md:w-10" />
                    <span className="font-loud text-[8px] md:text-[10px] mt-1 md:mt-2 leading-none uppercase tracking-tighter">
                      ADD_{activeView === 'income' ? 'INFLOW' : 'OUTFLOW'}
                    </span>
                  </button>
              </div>
            </main>
          </div>

            {/* 5. MODALS */}
            {isExpenseModalOpen && (
              <ExpenseModal 
                isOpen={isExpenseModalOpen} 
                onClose={() => setIsExpenseModalOpen(false)} 
                onSave={editingExpense ? handleUpdateExpense : handleAddExpense} 
                expense={editingExpense} 
                displayCurrency={displayCurrency}
                parentConversionRate={usdToInrRate}
              />
            )}
            {isIncomeModalOpen && (
              <IncomeModal 
                isOpen={isIncomeModalOpen} 
                onClose={() => setIsIncomeModalOpen(false)} 
                onSave={editingIncome ? handleUpdateIncome : handleAddIncome} 
                income={editingIncome} 
                displayCurrency={displayCurrency}
                parentConversionRate={usdToInrRate}
              />
            )}
            {isBudgetModalOpen && (
              <BudgetManagerModal 
                isOpen={isBudgetModalOpen} 
                onClose={() => setIsBudgetModalOpen(false)} 
                onSave={handleSaveBudgets} 
                currentBudgets={budgets} 
                displayCurrency={displayCurrency} 
                conversionRate={usdToInrRate} 
              />
            )}
            {isDataModalOpen && (
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
            )}
            {isCategoryModalOpen && (
              <CategoryManagerModal 
                isOpen={isCategoryModalOpen} 
                onClose={() => setIsCategoryModalOpen(false)} 
              />
            )}
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
                element={!isAuthenticated ? <Auth onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/" />} 
              />
              
              {/* 2. Verification Page */}
              <Route path="/verify" element={<VerifyOTP />} />

              {/* 3. The Main App (Protected) */}
              <Route 
                path="/" 
                element={isAuthenticated ? (isLoadingData ? LoadingSpinner : DashboardLayout) : <Navigate to="/login" />}
              />

              {/* Catch-all: Redirect unknown paths to home */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Router>
  );
};

export default App;