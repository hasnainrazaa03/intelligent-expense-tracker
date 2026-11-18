/**
 * Every screen of the signed-in app has its own address (U2a), so Back and
 * Forward move between screens, a reload keeps you where you were, and a
 * screen can be bookmarked or linked from an email.
 *
 *   /app                      Home
 *   /app/transactions         Transactions: expenses
 *   /app/transactions/income  Transactions: income
 *   /app/budgets              Budgets
 *   /app/budgets/edit         Budgets: set or change them
 *   /app/insights/<section>   Insights: reports, breakdown, income, ask
 *   /app/tuition              Tuition
 *   /app/settings             Settings
 *   /app/settings/categories  Settings: categories
 *   /app/settings/data        Settings: export, import and back up
 */
export type Place = 'home' | 'transactions' | 'budgets' | 'insights' | 'tuition' | 'settings';
export const INSIGHT_SECTIONS = ['reports', 'breakdown', 'income', 'ask'] as const;
export type InsightSection = (typeof INSIGHT_SECTIONS)[number];
export type TransactionType = 'expenses' | 'income';
export type SettingsSection = 'categories' | 'data';

export type AppRoute =
  | { place: 'home' }
  | { place: 'transactions'; type: TransactionType }
  | { place: 'budgets'; editing?: boolean }
  | { place: 'insights'; section: InsightSection }
  | { place: 'tuition' }
  | { place: 'settings'; section?: SettingsSection };

export const PATHS = {
  home: '/app',
  transactions: '/app/transactions',
  transactionsIncome: '/app/transactions/income',
  budgets: '/app/budgets',
  budgetsEdit: '/app/budgets/edit',
  insights: (section: InsightSection = 'reports') => `/app/insights/${section}`,
  tuition: '/app/tuition',
  settings: '/app/settings',
  settingsCategories: '/app/settings/categories',
  settingsData: '/app/settings/data',
} as const;

export const pathFor = (route: AppRoute): string => {
  switch (route.place) {
    case 'home': return PATHS.home;
    case 'transactions': return route.type === 'income' ? PATHS.transactionsIncome : PATHS.transactions;
    case 'budgets': return route.editing ? PATHS.budgetsEdit : PATHS.budgets;
    case 'insights': return PATHS.insights(route.section);
    case 'tuition': return PATHS.tuition;
    case 'settings': return route.section ? `${PATHS.settings}/${route.section}` : PATHS.settings;
  }
};

/**
 * The route for a pathname, or null for an address the app doesn't have (the
 * caller sends those home). `/app/insights` alone opens Reports. A trailing
 * slash is ignored.
 */
export const parseAppPath = (pathname: string): AppRoute | null => {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] !== 'app') return null;
  const [, place, sub, ...rest] = parts;
  if (rest.length) return null;
  if (!place) return { place: 'home' };
  switch (place) {
    case 'transactions':
      if (!sub) return { place: 'transactions', type: 'expenses' };
      return sub === 'income' ? { place: 'transactions', type: 'income' } : null;
    case 'insights':
      if (!sub) return { place: 'insights', section: 'reports' };
      return (INSIGHT_SECTIONS as readonly string[]).includes(sub) ? { place: 'insights', section: sub as InsightSection } : null;
    case 'budgets':
      if (!sub) return { place: 'budgets' };
      return sub === 'edit' ? { place: 'budgets', editing: true } : null;
    case 'settings':
      if (!sub) return { place: 'settings' };
      return sub === 'categories' || sub === 'data' ? { place: 'settings', section: sub } : null;
    case 'tuition':
      return sub ? null : { place };
    default:
      return null;
  }
};

/** What a screen reader hears after moving to a screen. */
export const routeLabel = (route: AppRoute): string => {
  switch (route.place) {
    case 'home': return 'Home';
    case 'transactions': return route.type === 'income' ? 'Transactions, income' : 'Transactions, expenses';
    case 'budgets': return route.editing ? 'Budgets, edit' : 'Budgets';
    case 'insights': return `Insights, ${({ reports: 'reports', breakdown: 'breakdown', income: 'income', ask: 'Ask AI' } as const)[route.section]}`;
    case 'tuition': return 'Tuition';
    case 'settings': return route.section === 'categories' ? 'Settings, categories' : route.section === 'data' ? 'Settings, export, import and back up' : 'Settings';
  }
};
