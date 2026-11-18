import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Expense, Income } from '../types';
import Header from '../components/Header';
import IncomeSummary from '../components/IncomeSummary';
import SectionSkeleton from '../components/SectionSkeleton';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import SideNav from '../components/shell/SideNav';
import MobileNav from '../components/shell/MobileNav';
import QuickActions from '../components/shell/QuickActions';
import { DataLoadBanner, OnboardingCard, RecurringReview, HubTabs } from '../components/shell/Banners';
import { useAuth } from '../contexts/AuthContext';
import { useAllData } from '../hooks/useAllData';
import { useTransactions } from '../hooks/useTransactions';
import { useTuition } from '../hooks/useTuition';
import { useRecurringSuggestions } from '../hooks/useRecurringSuggestions';
import { useDataTransfer } from '../hooks/useDataTransfer';
import { useHubData } from '../hooks/useHubData';
import { useIdlePrefetch, useNewEntryShortcut } from '../hooks/useAppEffects';
import { useSetting } from '../hooks/useSetting';
import useOfflineQueue from '../hooks/useOfflineQueue';
import { useActiveView } from './useActiveView';
import { createExpense } from '../services/api';
import type { PendingExpense } from '../utils/offlineQueue';
import { updateSettings } from '../utils/settingsStore';
import { notify } from '../utils/notifications';
import * as Screens from './screens';

/**
 * The signed-in app: composes the data hooks and lays out the shell (header,
 * navigation, the active screen, dialogs). The hooks own the behaviour:
 *   useAllData       — the data, and the "not loaded yet" guard (C2)
 *   useTransactions  — saving expenses, incomes, budgets (C4, optimistic edits)
 *   useTuition       — semesters and payments (5d-1)
 *   useRecurringSuggestions, useDataTransfer, useHubData
 */
const AppDashboard: React.FC = () => {
  const { isAuthenticated, userEmail, logout } = useAuth();
  const data = useAllData({ isAuthenticated, onAuthError: logout });
  const { expenses, incomes, budgets, semesters, isLoadingData, hasServerSnapshot } = data;

  // Offline queue: replay each queued create (its clientId is the idempotency
  // key, so a replay after a crash returns the existing row), then refetch.
  const offline = useOfflineQueue({
    ownerId: isAuthenticated ? userEmail : null,
    process: useCallback(async (item: PendingExpense) => { await createExpense({ ...item.payload, clientRequestId: item.clientId }); }, []),
    onSynced: data.invalidate,
    onDropped: useCallback((item: PendingExpense, message: string) => {
      notify.error(`Couldn't sync "${item.payload.title}" (${message}). Please add it again.`);
    }, []),
  });

  const tx = useTransactions({ data, userEmail, refreshOfflineCount: offline.refreshCount });
  const tuition = useTuition({ data, isAuthenticated, updateExpense: tx.updateExpense });
  const recurring = useRecurringSuggestions({ data });
  const transfer = useDataTransfer({
    data,
    onFreshLoad: () => { recurring.resetForFreshLoad(); tuition.resetForFreshLoad(); },
    onRestored: recurring.clear,
  });

  // --- UI state ---------------------------------------------------------------
  const [activeView, setActiveView] = useActiveView();
  const [hubTab, setHubTab] = useState<'overview' | 'list'>('overview');
  useEffect(() => { setHubTab('overview'); }, [activeView]);
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [incomeDateRange, setIncomeDateRange] = useState<DateRange>('this_month');
  // Header debounces the search input; only the settled term lands here (APP-H5).
  const [search, setSearch] = useState('');

  const [expenseForm, setExpenseForm] = useState<{ open: boolean; editing: Expense | null }>({ open: false, editing: null });
  const [incomeForm, setIncomeForm] = useState<{ open: boolean; editing: Income | null }>({ open: false, editing: null });
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isStatementImportOpen, setIsStatementImportOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const openExpenseForm = (editing: Expense | null = null) => setExpenseForm({ open: true, editing });
  const openIncomeForm = (editing: Income | null = null) => setIncomeForm({ open: true, editing });
  const openNewEntry = () => (activeView === 'income' ? openIncomeForm() : openExpenseForm());
  const openStatementImport = () => setIsStatementImportOpen(true);

  const hideTuition = useSetting('hideTuition') ?? false;
  const onboardingDismissed = useSetting('onboardingDismissed') === true;
  const { hub, incomeHub, knownAccounts, listItems } = useHubData({
    expenses,
    incomes,
    dateRange,
    incomeDateRange,
    hideTuition,
    listView: activeView === 'income' ? 'income' : 'expenses',
    search,
  });

  useIdlePrefetch(isAuthenticated, [
    Screens.ExpenseList, Screens.IncomeList, Screens.ExpenseModal, Screens.IncomeModal, Screens.BudgetManagerModal,
    Screens.CategoryManagerModal, Screens.AiAnalyst, Screens.USCPaymentTracker, Screens.PivotAnalysis, Screens.SettingsPage,
  ]);
  useNewEntryShortcut(isAuthenticated, openNewEntry);

  // Not on Settings: "add your first expense" has no place there.
  const showOnboarding = hasServerSnapshot && !isLoadingData && !onboardingDismissed && expenses.length === 0 && incomes.length === 0 && activeView !== 'settings';

  const liveRegionMessage = useMemo(() => {
    if (isLoadingData) return 'Loading your financial data.';
    const n = recurring.pending.length;
    if (n > 0) return `${n} recurring expense suggestion${n > 1 ? 's are' : ' is'} ready to review.`;
    return `Viewing ${activeView}.`;
  }, [isLoadingData, recurring.pending.length, activeView]);

  // Forms close only when the save succeeded (C4).
  const saveExpense = async (expense: Expense | Omit<Expense, 'id'>) => {
    const ok = expenseForm.editing ? await tx.updateExpense(expense as Expense) : await tx.addExpense(expense);
    if (ok) setExpenseForm({ open: false, editing: null });
    return ok;
  };
  const saveIncome = async (income: Income | Omit<Income, 'id'>) => {
    const ok = incomeForm.editing ? await tx.updateIncome(income as Income) : await tx.addIncome(income);
    if (ok) setIncomeForm({ open: false, editing: null });
    return ok;
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'expenses':
        return (
          <Screens.ExpenseList
            expenses={listItems as Expense[]}
            onEdit={(e) => openExpenseForm(e)}
            onQuickSave={async (e) => { await tx.updateExpense(e, { inForm: false }); }}
            onDelete={async (id) => { await tx.deleteExpense(id); }}
            onCreate={openNewEntry}
            isLoading={isLoadingData}
            dateFilter={<DateRangeFilter selectedRange={dateRange} onChange={setDateRange} />}
          />
        );
      case 'income':
        return (
          <Screens.IncomeList
            incomes={listItems as Income[]}
            onEdit={(i) => openIncomeForm(i)}
            onQuickSave={async (i) => { await tx.updateIncome(i, { inForm: false }); }}
            onDelete={async (id) => { await tx.deleteIncome(id); }}
            onCreate={openNewEntry}
            isLoading={isLoadingData}
            dateFilter={<DateRangeFilter selectedRange={incomeDateRange} onChange={setIncomeDateRange} />}
          />
        );
      case 'ai':
        return <Screens.AiAnalyst expenses={expenses} incomes={incomes} />;
      case 'pivot':
        return <Screens.PivotAnalysis expenses={hub.allExpenses} />;
      case 'usc':
        return (
          <Screens.USCPaymentTracker
            semesters={semesters}
            onUpdateTuition={tuition.updateTotal}
            onUpdateInstallmentCount={tuition.updateInstallmentCount}
            onMarkAsPaid={tuition.markPaid}
            onUpdateDate={tuition.updatePaidDate}
          />
        );
      case 'reports':
        return <Screens.Reports allExpenses={hub.allExpenses} budgets={budgets} isLoading={isLoadingData} />;
      case 'settings':
        return (
          <Screens.SettingsPage
            onOpenData={() => setIsDataModalOpen(true)}
            onManageCategories={() => setIsCategoryModalOpen(true)}
            onManageBudgets={() => setIsBudgetModalOpen(true)}
          />
        );
      default:
        return null;
    }
  };

  const isHub = activeView === 'expenses' || activeView === 'income';

  return (
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

      <Header
        onLogout={logout}
        onManageBudgets={() => setIsBudgetModalOpen(true)}
        onManageCategories={() => setIsCategoryModalOpen(true)}
        onDataAction={() => setIsDataModalOpen(true)}
        onOpenSettings={() => setActiveView('settings')}
        settingsActive={activeView === 'settings'}
        hideTuition={hideTuition}
        onToggleHideTuition={() => updateSettings({ hideTuition: !hideTuition })}
        onSearch={setSearch}
        activeView={activeView}
        offlineStatus={{ isOnline: offline.isOnline, pendingCount: offline.pendingCount, syncing: offline.syncing }}
        expenses={expenses}
        incomes={incomes}
        onSelectTransaction={(hit) => {
          if (hit.type === 'expense') {
            setActiveView('expenses');
            openExpenseForm(hit.item);
          } else {
            setActiveView('income');
            openIncomeForm(hit.item);
          }
        }}
      />

      <div className="flex flex-1 overflow-hidden gap-4 md:gap-6">
        <SideNav activeView={activeView} onSelect={setActiveView} />

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pr-1 md:pr-2 custom-scrollbar relative bg-transparent focus:outline-none">
          <div className={`w-full max-w-full overflow-hidden space-y-5 md:space-y-7 ${activeView === 'ai' ? 'pb-28 md:pb-4' : 'pb-56 md:pb-40'}`}>
            {data.dataLoadFailed && (
              <DataLoadBanner hasPartialData={Boolean(data.query.data)} retrying={data.query.isFetching} onRetry={() => { void data.query.refetch(); }} />
            )}
            {showOnboarding && (
              <OnboardingCard onAddExpense={() => openExpenseForm()} onAddIncome={() => openIncomeForm()} onDismiss={() => updateSettings({ onboardingDismissed: true })} />
            )}
            {recurring.pending.length > 0 && <RecurringReview recurring={recurring} />}

            {isHub && <HubTabs value={hubTab} onChange={setHubTab} listLabel={activeView === 'expenses' ? 'Transactions' : 'Income stream'} />}

            {activeView === 'expenses' && hubTab === 'overview' && (
              <Suspense fallback={<SectionSkeleton title="Loading dashboard" rows={4} />}>
                <Screens.Dashboard
                  expenses={hub.expenses}
                  incomes={hub.incomes}
                  allIncomes={hub.allIncomes}
                  allExpenses={hub.allExpenses}
                  previousPeriodExpenses={hub.previousExpenses}
                  comparisonCutoff={hub.comparisonCutoff}
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
                    incomes={incomeHub.incomes}
                    previousPeriodIncomes={incomeHub.previousIncomes}
                    comparisonCutoff={incomeHub.comparisonCutoff}
                    allIncomes={hub.allIncomes}
                    allExpenses={hub.allExpenses}
                    selectedRange={incomeDateRange}
                    onDateRangeChange={setIncomeDateRange}
                  />
            )}

            {/* The list tab, and every screen that isn't a hub */}
            {(!isHub || hubTab === 'list') && (
              <div>
                <Suspense fallback={<SectionSkeleton title="Loading section" rows={4} />}>{renderActiveView()}</Suspense>
              </div>
            )}
          </div>

          <QuickActions onAddExpense={() => openExpenseForm()} onAddIncome={() => openIncomeForm()} onScanStatement={openStatementImport} />
          <MobileNav activeView={activeView} onSelect={setActiveView} />
        </main>
      </div>

      {/* Dialogs */}
      {expenseForm.open && (
        <Suspense fallback={null}>
          <Screens.ExpenseModal
            isOpen
            onClose={() => setExpenseForm({ open: false, editing: null })}
            onSave={saveExpense}
            expense={expenseForm.editing}
            onImportStatement={() => { setExpenseForm({ open: false, editing: null }); openStatementImport(); }}
            knownAccounts={knownAccounts}
          />
        </Suspense>
      )}
      {incomeForm.open && (
        <Suspense fallback={null}>
          <Screens.IncomeModal
            isOpen
            onClose={() => setIncomeForm({ open: false, editing: null })}
            onSave={saveIncome}
            income={incomeForm.editing}
            onImportStatement={() => { setIncomeForm({ open: false, editing: null }); openStatementImport(); }}
            knownAccounts={knownAccounts}
          />
        </Suspense>
      )}
      {isBudgetModalOpen && (
        <Suspense fallback={null}>
          <Screens.BudgetManagerModal
            isOpen
            onClose={() => setIsBudgetModalOpen(false)}
            onSave={async (list) => { if (await tx.saveBudgets(list)) setIsBudgetModalOpen(false); }}
            currentBudgets={budgets}
          />
        </Suspense>
      )}
      {isStatementImportOpen && (
        <Suspense fallback={null}>
          <Screens.StatementImportModal
            isOpen
            onClose={() => setIsStatementImportOpen(false)}
            existingExpenses={expenses}
            existingIncomes={incomes}
            onImport={transfer.importStatement}
          />
        </Suspense>
      )}
      {isDataModalOpen && (
        <Suspense fallback={null}>
          <Screens.DataModal
            isOpen
            onClose={() => setIsDataModalOpen(false)}
            allExpenses={expenses}
            allIncomes={incomes}
            budgets={budgets}
            semesters={semesters}
            onImport={transfer.importExpenses}
            onOpenStatementImport={() => { setIsDataModalOpen(false); openStatementImport(); }}
            onRestoreBackup={transfer.restoreBackup}
            onWipeAll={async () => { if (await transfer.wipeAll()) setIsDataModalOpen(false); }}
          />
        </Suspense>
      )}
      {isCategoryModalOpen && (
        <Suspense fallback={null}>
          <Screens.CategoryManagerModal isOpen onClose={() => setIsCategoryModalOpen(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Screens.MobileInstallPrompt />
      </Suspense>
    </div>
  );
};

export default AppDashboard;
