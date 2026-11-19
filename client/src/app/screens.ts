import { lazyWithReload } from '../lib/lazyWithReload';

// Every screen and dialog is its own chunk, loaded on first use (and prefetched
// while idle, see useIdlePrefetch).
export const HomeOverview = lazyWithReload(() => import('../components/home/HomeOverview'));
export const TransactionsList = lazyWithReload(() => import('../components/transactions/TransactionsList'));
export const ExpenseModal = lazyWithReload(() => import('../components/ExpenseModal'));
export const IncomeModal = lazyWithReload(() => import('../components/IncomeModal'));
export const BudgetManagerModal = lazyWithReload(() => import('../components/BudgetManagerModal'));
export const CategoryManagerModal = lazyWithReload(() => import('../components/CategoryManagerModal'));
export const DataModal = lazyWithReload(() => import('../components/ExportModal'));
export const StatementImportModal = lazyWithReload(() => import('../components/StatementImportModal'));
export const AiAnalyst = lazyWithReload(() => import('../components/AiAnalyst'));
export const Auth = lazyWithReload(() => import('../components/Auth'));
export const VerifyOTP = lazyWithReload(() => import('../components/VerifyOTP'));
export const LandingPage = lazyWithReload(() => import('../components/LandingPage'));
export const KnowledgeBase = lazyWithReload(() => import('../components/KnowledgeBase'));
export const MobileInstallPrompt = lazyWithReload(() => import('../components/MobileInstallPrompt'));
export const USCPaymentTracker = lazyWithReload(() => import('../components/USCPaymentTracker'));
export const PivotAnalysis = lazyWithReload(() => import('../components/PivotAnalysis'));
export const Reports = lazyWithReload(() => import('../components/Reports'));
export const SettingsPage = lazyWithReload(() => import('../components/SettingsPage'));
export const BudgetsPage = lazyWithReload(() => import('../components/BudgetsPage'));
export const HouseholdsPage = lazyWithReload(() => import('../components/HouseholdsPage'));
export const PrivacyPolicy = lazyWithReload(() => import('../components/legal/PrivacyPolicy'));
export const TermsOfUse = lazyWithReload(() => import('../components/legal/TermsOfUse'));
