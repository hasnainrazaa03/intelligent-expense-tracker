export type Category = string;

export interface Expense {
  id: string;
  title:string;
  amount: number;
  category: Category;
  date: string; // ISO string format: YYYY-MM-DD
  paymentMethod?: string;
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  isRecurring?: boolean;
  tags?: string[];
  metadata?: Record<string, string>;
  taxCategory?: string;
  isTaxDeductible?: boolean;
  splitParticipants?: string[];
  splitShares?: number[];
  receiptText?: string;
  receiptFileName?: string;
  /** Which real-world account/card this came from (e.g. "Discover"). Distinct
   *  from paymentMethod, which is HOW it was paid. */
  account?: string;
  /** Optional: tags this expense to a shared household. */
  householdId?: string | null;
  /** Idempotency key for offline-queued creates (dedupes replays). */
  clientRequestId?: string;
}

export interface Income {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string; // ISO string format: YYYY-MM-DD
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  /** Which real-world account this landed in. Mirrors Expense.account. */
  account?: string;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  type: 'cash' | 'brokerage' | 'crypto' | 'retirement' | 'loan' | 'other';
  value: number;
  asOf: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  /** USD, like every stored amount. */
  target: number;
  saved: number;
  /** Optional target date (YYYY-MM-DD). */
  deadline?: string;
}

/** main category → subcategories */
export type CategoryMap = Record<string, string[]>;

/**
 * Per-account settings and planning data, stored on the server
 * (GET/PATCH /api/settings, and `settings` in /data/all). Unset keys are absent.
 */
export interface UserSettings {
  displayCurrency?: string;
  hideTuition?: boolean;
  onboardingDismissed?: boolean;
  /** Epoch ms until which the recurring-charges reminder stays hidden. */
  recurringSnoozeUntil?: number;
  /** Push notifications (5e-2): which ones, on every browser that has them on. */
  notifyBudgets?: boolean;
  notifyBills?: boolean;
  notifyMonthlySummary?: boolean;
  /** IANA time zone, so notifications arrive in the daytime and months are the user's. */
  timeZone?: string;
  /** Subcategories the user added to the built-in categories. */
  customCategories?: CategoryMap;
  /** Built-in subcategories the user removed. */
  deletedSubcategories?: CategoryMap;
  /** Learned "merchant words → category" from the user's own choices. */
  merchantMap?: Record<string, string>;
  /** Recurring templates ("title|category|amount") the user paused. */
  pausedRecurring?: Record<string, boolean>;
  savingsGoals?: SavingsGoal[];
  investmentAccounts?: InvestmentAccount[];
}

/** A change to some settings: each key replaces the stored value, `null` clears it. */
export type SettingsPatch = { [K in keyof UserSettings]?: UserSettings[K] | null };

export interface Budget {
  category: string;
  amount: number;
}

export interface TuitionInstallment {
  /** A database id (string) once saved; a temporary number until then. */
  id: number;
  amount: number;
  status: 'paid' | 'unpaid';
  expenseId?: string;
  paidDate?: string;
}

export interface Semester {
  id: string; // e.g., 'fall-2025'
  name: string;
  totalTuition: number;
  installments: TuitionInstallment[];
  /** The server's version of this semester's structure; sent back with every
   *  save so a stale copy is refused instead of overwriting newer edits. */
  version?: number;
}
