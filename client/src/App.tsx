import React, { useState, useEffect, useMemo } from 'react';
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
import { createExpense, updateExpense, deleteExpense, createIncome, updateIncome, deleteIncome, saveBudgets, saveSemesters, createBulkExpenses } from './services/api';
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

  useEffect(() => {
    // Check if we've been redirected from the Google login
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // 1. Save the token
      localStorage.setItem('authToken', token);
      
      // 2. Update our auth state
      setIsAuthenticated(true);
      
      // 3. Clean the URL (remove the token)
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch conversion rate
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
        if (!response.ok) throw new Error('Failed to fetch rate');
        const data = await response.json();
        setUsdToInrRate(data.rates.INR);
      } catch (error) {
        console.error("Could not fetch conversion rate:", error);
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
          setExpenses(data.expenses as Expense[]);
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
            // We'll save these initial semesters to the DB later
          }
        })
        .catch(err => {
          console.error("Failed to fetch data:", err);
          // If token is invalid, log out
          if (err.message === 'Invalid token' || err.message === 'No token provided') {
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

  // Auto-save semesters to the database whenever they change
  useEffect(() => {
    // --- THIS IS THE FIX ---
    // Only save if we're logged in AND the user has actually made a change
    if (!isAuthenticated || !isSemestersDirty) {
      return;
    }
    
    saveSemesters(semesters)
      .then(() => {
        setIsSemestersDirty(false); // Reset the flag after a successful save
      })
      .catch(err => {
        console.error("Failed to auto-save semesters:", err);
        alert("Error: Could not save semester changes to the database.");
      });
  
  }, [semesters, isAuthenticated, isSemestersDirty]);
  
  // --- MODIFIED ---
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken'); // Remove the new token
    setIsAuthenticated(false);
    setExpenses([]);
    setIncomes([]);
    setBudgets([]);
  };

  // --- NOTE: These functions are NOT YET connected to the API ---
  // They will only update the app's *local* state.
  // We will connect these one by one in the next step.
  const handleAddExpense = async (expense: Omit<Expense, 'id'>) => {
  try {
    const newExpense = await createExpense(expense);
    setExpenses([...expenses, newExpense]);
  } catch (error) {
    console.error("Failed to add expense:", error);
    alert("Error: Could not add expense.");
  }
};

const handleUpdateExpense = async (updatedExpense: Expense) => {
  try {
    const returnedExpense = await updateExpense(updatedExpense);
    setExpenses(expenses.map(exp => exp.id === returnedExpense.id ? returnedExpense : exp));
    setEditingExpense(null);
  } catch (error) {
    console.error("Failed to update expense:", error);
    alert("Error: Could not update expense.");
  }
};

const handleDeleteExpense = async (id: string) => {
  try {
    // 1. First, update the local semester state, which might rely on the expense
    setSemesters(prevSemesters =>
        prevSemesters.map(semester => ({ ...semester, installments: semester.installments.map(inst => inst.expenseId === id ? { ...inst, status: 'unpaid', expenseId: undefined, paidDate: undefined } : inst ) }))
    );
    
    // 2. Then, call the API
    await deleteExpense(id);
    
    // 3. Finally, remove the expense from the main local state
    setExpenses(expenses.filter(exp => exp.id !== id));

  } catch (error) {
    console.error("Failed to delete expense:", error);
    alert("Error: Could not delete expense.");
  }
};
  const handleEditExpenseClick = (expense: Expense) => { setEditingExpense(expense); setIsExpenseModalOpen(true); };

  // Income Handlers
const handleAddIncome = async (income: Omit<Income, 'id'>) => {
  try {
    const newIncome = await createIncome(income);
    setIncomes([...incomes, newIncome]);
  } catch (error) {
    console.error("Failed to add income:", error);
    alert("Error: Could not add income.");
  }
};

const handleUpdateIncome = async (updatedIncome: Income) => {
  try {
    const returnedIncome = await updateIncome(updatedIncome);
    setIncomes(incomes.map(inc => inc.id === returnedIncome.id ? returnedIncome : inc));
    setEditingIncome(null);
  } catch (error) {
    console.error("Failed to update income:", error);
    alert("Error: Could not update income.");
  }
};

const handleDeleteIncome = async (id: string) => {
  try {
    await deleteIncome(id);
    setIncomes(incomes.filter(inc => inc.id !== id));
  } catch (error) {
    console.error("Failed to delete income:", error);
    alert("Error: Could not delete income.");
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
    alert("Error: Could not save budgets.");
  }
};
  const handleImportExpenses = async (importedExpenses: Omit<Expense, 'id'>[]) => {
    try {
      // 1. Send the batch to the server
      await createBulkExpenses(importedExpenses);
      
      // 2. The import was successful, show an alert
      alert(`${importedExpenses.length} expenses successfully imported!`);

      // 3. Easiest way to get all the new IDs is to just re-fetch all data
      // This ensures our local state is in sync with the database.
      setIsLoadingData(true);
      getAllData()
        .then(data => {
          setExpenses(data.expenses as Expense[]);
          setIncomes(data.incomes as Income[]);
          setBudgets(data.budgets as Budget[]);
          // ... (rest of your getAllData logic)
        })
        .catch(err => console.error("Failed to refetch data:", err))
        .finally(() => setIsLoadingData(false));
      
    } catch (error) {
      console.error("Failed to import expenses:", error);
      alert("Error: Could not import expenses.");
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
  const handleMarkInstallmentAsPaid = async (semesterId: string, installmentId: number) => {
    const semester = semesters.find(s => s.id === semesterId);
    const installment = semester?.installments.find(i => i.id === installmentId);
    
    if (!semester || !installment || installment.status === 'paid' || installment.amount <= 0) return;

    // 1. Define the new expense data
    const newExpenseData: Omit<Expense, 'id'> = {
      title: `USC Tuition - ${semester.name} #${installment.id}`,
      amount: installment.amount,
      category: 'Tuition',
      date: new Date().toISOString().split('T')[0],
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
      alert("Error: Could not create the tuition expense.");
    }
  };
  const handleUpdateInstallmentDate = (semesterId: string, installmentId: number, newDate: string) => {
      let expenseToUpdateId: string | undefined;
      setSemesters(prevSemesters => prevSemesters.map(s => {
              if (s.id === semesterId) { return { ...s, installments: s.installments.map(i => { if (i.id === installmentId) { expenseToUpdateId = i.expenseId; return { ...i, paidDate: newDate }; } return i; }) }; }
              return s;
          })
      );
      setIsSemestersDirty(true);
      if (expenseToUpdateId) { const expenseId = expenseToUpdateId; setExpenses(prevExpenses => prevExpenses.map(exp => exp.id === expenseId ? { ...exp, date: newDate } : exp)); }
  };

  const handleUpdateInstallmentCount = (semesterId: string, count: number) => {
  setSemesters(prevSemesters =>
    prevSemesters.map(semester => {
      if (semester.id === semesterId) {
        // 1. Calculate the new split amount
        const newAmount = semester.totalTuition > 0 ? semester.totalTuition / count : 0;
        
        // 2. Build the new dynamic array
        const newInstallments = Array.from({ length: count }, (_, i) => {
          const existing = semester.installments[i];
          return {
            id: i + 1,
            amount: newAmount,
            status: existing ? existing.status : 'unpaid',
            expenseId: existing ? existing.expenseId : undefined,
            paidDate: existing ? existing.paidDate : undefined,
          };
        });

        return { ...semester, installments: newInstallments };
      }
      return semester;
    })
  );
  
  // 3. Mark as dirty so the Auto-Save logic sends it to your database
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
                    <div className="lg:col-gen-span-1">
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
                    <div className="lg:col-gen-span-1">
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
              />
            )}
            {isIncomeModalOpen && (
              <IncomeModal 
                isOpen={isIncomeModalOpen} 
                onClose={() => setIsIncomeModalOpen(false)} 
                onSave={editingIncome ? handleUpdateIncome : handleAddIncome} 
                income={editingIncome} 
                displayCurrency={displayCurrency} 
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
                budgets={budgets} 
                onImport={handleImportExpenses} 
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