import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Expense, Income } from '../types';
import Header from '../components/Header';
import IncomeSummary from '../components/IncomeSummary';
import SectionSkeleton from '../components/SectionSkeleton';
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter';
import SideNav from '../components/shell/SideNav';
import MobileNav from '../components/shell/MobileNav';
import SectionTabs from '../components/shell/SectionTabs';
import { DataLoadBanner, OnboardingCard, RecurringNotice } from '../components/shell/Banners';
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

  const [expenseForm, setExpenseForm] = useState<{ open: boolean; editing: Expense | null }>({ open: false, editing: null });
  const [incomeForm, setIncomeForm] = useState<{ open: boolean; editing: Income | null }>({ open: false, editing: null });
  const [isStatementImportOpen, setIsStatementImportOpen] = useState(false);

  const openExpenseForm = (editing: Expense | null = null) => setExpenseForm({ open: true, editing });
  const openIncomeForm = (editing: Income | null = null) => setIncomeForm({ open: true, editing });
  // Ctrl/Cmd+N adds income where income is on show, an expense everywhere else.
  const openNewEntry = () => (isIncomeList || isIncomeOverview ? openIncomeForm() : openExpenseForm());
  const openStatementImport = () => setIsStatementImportOpen(true);

  const hideTuition = useSetting('hideTuition') ?? false;
  const onboardingDismissed = useSetting('onboardingDismissed') === true;
  const { hub, incomeHub, knownAccounts, listItems } = useHubData({
    expenses,
    incomes,
    dateRange,
    incomeDateRange,
    hideTuition,
    listView: isIncomeList ? 'income' : 'expenses',
    search,
  });

  useIdlePrefetch(isAuthenticated, [
    Screens.ExpenseList, Screens.IncomeList, Screens.ExpenseModal, Screens.IncomeModal, Screens.BudgetManagerModal,
    Screens.CategoryManagerModal, Screens.AiAnalyst, Screens.USCPaymentTracker, Screens.PivotAnalysis, Screens.SettingsPage,
    Screens.BudgetsPage, Screens.Reports,
  ]);
  // Not while a form is open: it would replace what's being typed.
  useNewEntryShortcut(isAuthenticated && !expenseForm.open && !incomeForm.open, openNewEntry);

  // A list emptied by the search or the period says so, with a way out,
  // instead of "No expenses yet" for an account full of them (improvement 14).
  const periodLabel = (range: DateRange) =>
    range === 'all_time' ? null : range === 'this_month' ? 'This month' : range === 'last_month' ? 'Last month' : 'The last 90 days';
  const clearSearch = () => setClearSearchSignal((n) => n + 1);
  const expenseFilters = { hasAny: expenses.length > 0, search, onClearSearch: clearSearch, periodLabel: periodLabel(dateRange), onShowAllTime: () => setDateRange('all_time') };
  const incomeFilters = { hasAny: incomes.length > 0, search, onClearSearch: clearSearch, periodLabel: periodLabel(incomeDateRange), onShowAllTime: () => setIncomeDateRange('all_time') };

  // Not on Settings: "add your first expense" has no place there.
  const showOnboarding = hasServerSnapshot && !isLoadingData && !onboardingDismissed && expenses.length === 0 && incomes.length === 0 && route.place !== 'settings';

  const liveRegionMessage = useMemo(() => {
    if (isLoadingData) return 'Loading your financial data.';
    const n = recurring.pending.length;
    if (n > 0) return `${n} recurring expense suggestion${n > 1 ? 's are' : ' is'} ready to review.`;
    return `Viewing ${routeLabel(route)}.`;
  }, [isLoadingData, recurring.pending.length, route]);

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

  const expenseListScreen = (
    <Screens.ExpenseList
      expenses={listItems as Expense[]}
      onEdit={(e) => openExpenseForm(e)}
      onQuickSave={async (e) => { await tx.updateExpense(e, { inForm: false }); }}
      onDelete={async (id) => { await tx.deleteExpense(id); }}
      onCreate={openNewEntry}
      isLoading={isLoadingData}
      dateFilter={<DateRangeFilter selectedRange={dateRange} onChange={setDateRange} />}
      filters={expenseFilters}
    />
  );
  const incomeListScreen = (
    <Screens.IncomeList
      incomes={listItems as Income[]}
      onEdit={(i) => openIncomeForm(i)}
      onQuickSave={async (i) => { await tx.updateIncome(i, { inForm: false }); }}
      onDelete={async (id) => { await tx.deleteIncome(id); }}
      onCreate={openNewEntry}
      isLoading={isLoadingData}
      dateFilter={<DateRangeFilter selectedRange={incomeDateRange} onChange={setIncomeDateRange} />}
      filters={incomeFilters}
    />
  );

  const renderInsights = (section: 'reports' | 'breakdown' | 'income' | 'ask') => {
    switch (section) {
      case 'reports': return <Screens.Reports allExpenses={hub.allExpenses} budgets={budgets} isLoading={isLoadingData} />;
      case 'breakdown': return <Screens.PivotAnalysis expenses={hub.allExpenses} />;
      case 'ask': return <Screens.AiAnalyst expenses={expenses} incomes={incomes} />;
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
          <>
            {/* Only on Home: it used to sit on top of every screen. */}
            {recurring.pending.length > 0 && <RecurringNotice recurring={recurring} />}
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
          </>
        );
      case 'transactions':
        return (
          <>
            <SectionTabs
              label="Transaction type"
              tabs={[
                { label: 'Expenses', to: PATHS.transactions, active: !isIncomeList },
                { label: 'Income', to: PATHS.transactionsIncome, active: isIncomeList },
              ]}
            />
            <Suspense fallback={<SectionSkeleton title="Loading transactions" rows={4} />}>
              {isIncomeList ? incomeListScreen : expenseListScreen}
            </Suspense>
          </>
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
              : <Screens.BudgetsPage expenses={hub.allExpenses} budgets={budgets} isLoading={isLoadingData} onEdit={() => navigate(PATHS.budgetsEdit)} />}
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
            onImportStatement={() => { setExpenseForm({ open: false, editing: null }); openStatementImport(); }}
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
            onImportStatement={() => { setIncomeForm({ open: false, editing: null }); openStatementImport(); }}
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
