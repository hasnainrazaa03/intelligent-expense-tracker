import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Expense, Income } from '../types';
import Header from '../components/Header';
import IncomeSummary from '../components/IncomeSummary';
import SectionSkeleton from '../components/SectionSkeleton';
import type { DateRange } from '../components/DateRangeFilter';
import SideNav from '../components/shell/SideNav';
import MobileNav from '../components/shell/MobileNav';
import SectionTabs from '../components/shell/SectionTabs';
import { DataLoadBanner, OnboardingCard } from '../components/shell/Banners';
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
import { parseAppPath, pathFor, PATHS, routeLabel, type AppRoute } from './routes';
import { createExpense } from '../services/api';
import type { PendingExpense } from '../utils/offlineQueue';
import { updateSettings } from '../utils/settingsStore';
import { notify } from '../utils/notifications';
import * as Screens from './screens';
import type { EntryDraft, SaveOptions } from '../components/entryDraft';

/**
 * The signed-in app: composes the data hooks and lays out the shell (header,
 * navigation, the active screen, dialogs). The hooks own the behaviour:
 *   useAllData       — the data, and the "not loaded yet" guard (C2)
 *   useTransactions  — saving expenses, incomes, budgets (C4, optimistic edits)
 *   useTuition       — semesters and payments (5d-1)
 *   useRecurringSuggestions, useDataTransfer, useHubData
 */
const HOME: AppRoute = { place: 'home' };

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
  // The screen comes from the address (U2a): Back, Forward, reload and
  // bookmarks all work. An address the app doesn't have goes home.
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = useMemo(() => parseAppPath(location.pathname), [location.pathname]);
  const route: AppRoute = parsed ?? HOME;
  const canonicalPath = pathFor(route);
  const isIncomeList = route.place === 'transactions' && route.type === 'income';
  const isIncomeOverview = route.place === 'insights' && route.section === 'income';
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [incomeDateRange, setIncomeDateRange] = useState<DateRange>('this_month');
  // Header debounces the search input; only the settled term lands here (APP-H5).
  const [search, setSearch] = useState('');
  const [clearSearchSignal, setClearSearchSignal] = useState(0);

  // `draft` carries title, amount and date when a new entry switches kind (U4).
  const [expenseForm, setExpenseForm] = useState<{ open: boolean; editing: Expense | null; draft?: EntryDraft }>({ open: false, editing: null });
  const [incomeForm, setIncomeForm] = useState<{ open: boolean; editing: Income | null; draft?: EntryDraft }>({ open: false, editing: null });
  const [isStatementImportOpen, setIsStatementImportOpen] = useState(false);

  const openExpenseForm = (editing: Expense | null = null) => setExpenseForm({ open: true, editing });
  const openIncomeForm = (editing: Income | null = null) => setIncomeForm({ open: true, editing });
  // Ctrl/Cmd+N adds income where income is on show, an expense everywhere else.
  const openNewEntry = () => (isIncomeList || isIncomeOverview ? openIncomeForm() : openExpenseForm());
  const openStatementImport = () => setIsStatementImportOpen(true);

  const hideTuition = useSetting('hideTuition') ?? false;
  const onboardingDismissed = useSetting('onboardingDismissed') === true;
  const { hub, incomeHub, knownAccounts, listExpenses, listIncomes } = useHubData({
    expenses,
    incomes,
    dateRange,
    incomeDateRange,
    hideTuition,
    search,
  });

  useIdlePrefetch(isAuthenticated, [
    Screens.TransactionsList, Screens.ExpenseModal, Screens.IncomeModal, Screens.BudgetManagerModal,
    Screens.CategoryManagerModal, Screens.AiAnalyst, Screens.USCPaymentTracker, Screens.PivotAnalysis, Screens.SettingsPage,
    Screens.BudgetsPage, Screens.Reports,
  ]);
  // Not while a form is open: it would replace what's being typed.
  useNewEntryShortcut(isAuthenticated && !expenseForm.open && !incomeForm.open, openNewEntry);

  // A list emptied by the search or the period says so, with a way out,
  // instead of "No expenses yet" for an account full of them (improvement 14).
  const clearSearch = () => setClearSearchSignal((n) => n + 1);

  // Not on Settings: "add your first expense" has no place there.
  const showOnboarding = hasServerSnapshot && !isLoadingData && !onboardingDismissed && expenses.length === 0 && incomes.length === 0 && route.place !== 'settings';

  const liveRegionMessage = useMemo(() => {
    if (isLoadingData) return 'Loading your financial data.';
    const n = recurring.pending.length;
    if (n > 0) return `${n} recurring expense suggestion${n > 1 ? 's are' : ' is'} ready to review.`;
    return `Viewing ${routeLabel(route)}.`;
  }, [isLoadingData, recurring.pending.length, route]);

  // Forms close only when the save succeeded (C4), and not after "Save & add another".
  const saveExpense = async (expense: Expense | Omit<Expense, 'id'>, options?: SaveOptions) => {
    const ok = expenseForm.editing ? await tx.updateExpense(expense as Expense) : await tx.addExpense(expense);
    if (ok && !options?.keepOpen) setExpenseForm({ open: false, editing: null });
    return ok;
  };
  const saveIncome = async (income: Income | Omit<Income, 'id'>, options?: SaveOptions) => {
    const ok = incomeForm.editing ? await tx.updateIncome(income as Income) : await tx.addIncome(income);
    if (ok && !options?.keepOpen) setIncomeForm({ open: false, editing: null });
    return ok;
  };

  const transactionsScreen = (type: 'all' | 'expenses' | 'income') => (
    <Screens.TransactionsList
      type={type}
      expenses={listExpenses}
      incomes={listIncomes}
      hasAnyExpenses={expenses.length > 0}
      hasAnyIncomes={incomes.length > 0}
      isLoading={isLoadingData}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      search={search}
      onClearSearch={clearSearch}
      onEditExpense={(e) => openExpenseForm(e)}
      onEditIncome={(i) => openIncomeForm(i)}
      onQuickSaveExpense={async (e) => { await tx.updateExpense(e, { inForm: false }); }}
      onQuickSaveIncome={async (i) => { await tx.updateIncome(i, { inForm: false }); }}
      onDeleteExpense={async (id) => { await tx.deleteExpense(id); }}
      onDeleteIncome={async (id) => { await tx.deleteIncome(id); }}
      onBulkChanged={data.invalidate}
      onImportStatement={openStatementImport}
      onCreate={type === 'income' ? () => openIncomeForm() : () => openExpenseForm()}
    />
  );

  const renderInsights = (section: 'reports' | 'breakdown' | 'income' | 'ask') => {
    switch (section) {
      case 'reports': return <Screens.Reports allExpenses={hub.allExpenses} budgets={budgets} isLoading={isLoadingData} />;
      case 'breakdown': return <Screens.PivotAnalysis expenses={hub.allExpenses} />;
      case 'ask': return <Screens.AiAnalyst expenses={expenses} incomes={incomes} initialQuestion={(location.state as { ask?: string } | null)?.ask} />;
      case 'income':
        return isLoadingData
          ? <SectionSkeleton title="Loading income" rows={4} />
          : <IncomeSummary
              incomes={incomeHub.incomes}
              previousPeriodIncomes={incomeHub.previousIncomes}
              comparisonCutoff={incomeHub.comparisonCutoff}
              allIncomes={hub.allIncomes}
              allExpenses={hub.allExpenses}
              selectedRange={incomeDateRange}
              onDateRangeChange={setIncomeDateRange}
            />;
    }
  };

  const renderPlace = () => {
    switch (route.place) {
      case 'home':
        return (
          <Suspense fallback={<SectionSkeleton title="Loading your overview" rows={4} />}>
            <Screens.HomeOverview
              expenses={hub.expenses}
              incomes={hub.incomes}
              previousExpenses={hub.previousExpenses}
              previousIncomes={hub.previousIncomes}
              comparisonCutoff={hub.comparisonCutoff}
              allExpenses={hub.allExpenses}
              allIncomes={hub.allIncomes}
              budgets={budgets}
              semesters={semesters}
              hideTuition={hideTuition}
              selectedRange={dateRange}
              onDateRangeChange={setDateRange}
              recurring={recurring}
              isLoading={isLoadingData}
              onEditExpense={(e) => openExpenseForm(e)}
              onEditIncome={(i) => openIncomeForm(i)}
              onAddExpense={() => openExpenseForm()}
              onImportStatement={openStatementImport}
            />
          </Suspense>
        );
      case 'transactions':
        return (
          <Suspense fallback={<SectionSkeleton title="Loading transactions" rows={4} />}>
            {transactionsScreen(route.type)}
          </Suspense>
        );
      case 'budgets':
        return (
          <Suspense fallback={<SectionSkeleton title="Loading budgets" rows={4} />}>
            {route.editing
              ? (
                <Screens.BudgetManagerModal
                  asPage
                  isOpen
                  onClose={() => navigate(PATHS.budgets)}
                  onSave={async (list) => { if (await tx.saveBudgets(list)) navigate(PATHS.budgets); }}
                  currentBudgets={budgets}
                />
              )
              : <Screens.BudgetsPage expenses={hub.allExpenses} incomes={hub.allIncomes} budgets={budgets} isLoading={isLoadingData} onEdit={() => navigate(PATHS.budgetsEdit)} />}
          </Suspense>
        );
      case 'insights':
        return (
          <>
            <SectionTabs
              label="Insights sections"
              tabs={[
                { label: 'Reports', to: PATHS.insights('reports'), active: route.section === 'reports' },
                { label: 'Breakdown', to: PATHS.insights('breakdown'), active: route.section === 'breakdown' },
                { label: 'Income', to: PATHS.insights('income'), active: route.section === 'income' },
                { label: 'Ask AI', to: PATHS.insights('ask'), active: route.section === 'ask' },
              ]}
            />
            <Suspense fallback={<SectionSkeleton title="Loading insights" rows={4} />}>{renderInsights(route.section)}</Suspense>
          </>
        );
      case 'tuition':
        return (
          <Suspense fallback={<SectionSkeleton title="Loading tuition" rows={4} />}>
            <Screens.USCPaymentTracker
              semesters={semesters}
              onUpdateTuition={tuition.updateTotal}
              onUpdateInstallmentCount={tuition.updateInstallmentCount}
              onMarkAsPaid={tuition.markPaid}
              onUpdateDate={tuition.updatePaidDate}
            />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<SectionSkeleton title="Loading settings" rows={4} />}>
            {route.section === 'categories' ? (
              <Screens.CategoryManagerModal asPage isOpen onClose={() => navigate(PATHS.settings)} />
            ) : route.section === 'households' ? (
              <Screens.HouseholdsPage onBack={() => navigate(PATHS.settings)} />
            ) : route.section === 'data' ? (
              <Screens.DataModal
                asPage
                isOpen
                onClose={() => navigate(PATHS.settings)}
                allExpenses={expenses}
                allIncomes={incomes}
                budgets={budgets}
                semesters={semesters}
                onImport={transfer.importTransactions}
                onOpenStatementImport={() => { navigate(PATHS.settings); openStatementImport(); }}
                onRestoreBackup={transfer.restoreBackup}
                onWipeAll={async () => { if (await transfer.wipeAll()) navigate(PATHS.settings); }}
              />
            ) : (
              <Screens.SettingsPage
                onOpenData={() => navigate(PATHS.settingsData)}
                onManageCategories={() => navigate(PATHS.settingsCategories)}
                onManageBudgets={() => navigate(PATHS.budgetsEdit)}
                onOpenHouseholds={() => navigate(PATHS.settingsHouseholds)}
              />
            )}
          </Suspense>
        );
    }
  };

  // After every hook: an unknown address goes home, and /app/insights or a
  // trailing slash becomes the one address each screen has.
  if (parsed === null) return <Navigate to={PATHS.home} replace />;
  if (canonicalPath !== location.pathname) return <Navigate to={canonicalPath} replace />;

  const isAsk = route.place === 'insights' && route.section === 'ask';

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
        userEmail={userEmail}
        onLogout={logout}
        onAddExpense={() => openExpenseForm()}
        onAddIncome={() => openIncomeForm()}
        onScanStatement={openStatementImport}
        hideTuition={hideTuition}
        onToggleHideTuition={() => updateSettings({ hideTuition: !hideTuition })}
        onSearch={setSearch}
        clearSearchSignal={clearSearchSignal}
        offlineStatus={{ isOnline: offline.isOnline, pendingCount: offline.pendingCount, syncing: offline.syncing }}
        expenses={expenses}
        incomes={incomes}
        onSelectTransaction={(hit) => {
          if (hit.type === 'expense') {
            navigate(PATHS.transactions);
            openExpenseForm(hit.item);
          } else {
            navigate(PATHS.transactionsIncome);
            openIncomeForm(hit.item);
          }
        }}
      />

      <div className="flex flex-1 overflow-hidden gap-4 md:gap-6">
        <SideNav place={route.place} />

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pr-1 md:pr-2 custom-scrollbar relative bg-transparent focus:outline-none">
          <div className={`w-full max-w-full overflow-hidden space-y-5 md:space-y-7 ${isAsk ? 'pb-24 md:pb-4' : 'pb-28 md:pb-10'}`}>
            {data.dataLoadFailed && (
              <DataLoadBanner hasPartialData={Boolean(data.query.data)} retrying={data.query.isFetching} onRetry={() => { void data.query.refetch(); }} />
            )}
            {showOnboarding && (
              <OnboardingCard onAddExpense={() => openExpenseForm()} onAddIncome={() => openIncomeForm()} onDismiss={() => updateSettings({ onboardingDismissed: true })} />
            )}
            {renderPlace()}
          </div>
        </main>
      </div>

      <MobileNav place={route.place} onAddExpense={() => openExpenseForm()} onAddIncome={() => openIncomeForm()} onScanStatement={openStatementImport} />

      {/* Dialogs */}
      {expenseForm.open && (
        <Suspense fallback={null}>
          <Screens.ExpenseModal
            // One dialog per record: the form takes the record as its initial
            // state, so opening another one (header search) must start afresh.
            key={expenseForm.editing?.id ?? 'new'}
            isOpen
            onClose={() => setExpenseForm({ open: false, editing: null })}
            onSave={saveExpense}
            expense={expenseForm.editing}
            draft={expenseForm.draft}
            pastExpenses={expenses}
            onSwitchKind={(draft) => { setExpenseForm({ open: false, editing: null }); setIncomeForm({ open: true, editing: null, draft }); }}
            knownAccounts={knownAccounts}
          />
        </Suspense>
      )}
      {incomeForm.open && (
        <Suspense fallback={null}>
          <Screens.IncomeModal
            key={incomeForm.editing?.id ?? 'new'}
            isOpen
            onClose={() => setIncomeForm({ open: false, editing: null })}
            onSave={saveIncome}
            income={incomeForm.editing}
            draft={incomeForm.draft}
            pastIncomes={incomes}
            onSwitchKind={(draft) => { setIncomeForm({ open: false, editing: null }); setExpenseForm({ open: true, editing: null, draft }); }}
            knownAccounts={knownAccounts}
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
            onImport={transfer.importTransactions}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Screens.MobileInstallPrompt />
      </Suspense>
    </div>
  );
};

export default AppDashboard;
