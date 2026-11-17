// localStorage for data that belongs to ONE account. Each key is namespaced by
// the signed-in email, so on a shared machine nobody sees anyone else's.
//
// Settings and planning data (goals, accounts, categories, …) now live on the
// server (see settingsStore); this holds that store's offline cache and unsent
// changes, plus the old keys below until they've been uploaded once.

/** Keys that held one account's data before settings moved to the server. */
export const USER_SCOPED_KEYS = [
  'savingsGoalsV2',
  'investmentAccounts',
  'pausedRecurringTemplates',
  'merchantCategoryMap',
  'customCategories',
  'deletedSubcategories',
  'recurringReminderSnoozeUntil',
  'onboardingDismissed',
] as const;

const LEGACY_CLAIMED_KEY = 'userStorageLegacyClaimedBy';
// Retired: the statement importer no longer remembers the last account.
const RETIRED_KEYS = ['stmtLastAccount'];

let currentUser: string | null = null;
const userChangeListeners = new Set<() => void>();

/** The account storage is scoped to (normalised email), or null when signed out. */
export const getStorageUser = (): string | null => currentUser;

/** Run `fn` whenever the signed-in account changes. */
export const onStorageUserChange = (fn: () => void): (() => void) => {
  userChangeListeners.add(fn);
  return () => userChangeListeners.delete(fn);
};

const scoped = (key: string) => (currentUser ? `${key}::${currentUser}` : null);

/** Called by AuthContext whenever the signed-in account changes. */
export const setStorageUser = (email: string | null) => {
  const next = email ? email.trim().toLowerCase() : null;
  if (next === currentUser) return;
  currentUser = next;
  if (next) claimLegacyData(next);
  userChangeListeners.forEach((fn) => fn());
};

// Data saved before scoping existed has no owner recorded. Give it to the first
// account that signs in after the upgrade (almost always the device's owner),
// once, and never to anyone after that.
const claimLegacyData = (email: string) => {
  try {
    if (localStorage.getItem(LEGACY_CLAIMED_KEY)) return;
    for (const key of USER_SCOPED_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy !== null && localStorage.getItem(`${key}::${email}`) === null) {
        localStorage.setItem(`${key}::${email}`, legacy);
      }
      localStorage.removeItem(key);
    }
    for (const key of RETIRED_KEYS) localStorage.removeItem(key);
    localStorage.setItem(LEGACY_CLAIMED_KEY, email);
  } catch {
    // Storage unavailable: nothing to migrate.
  }
};

/** Signed out (or not yet known): reads return null and writes are dropped. */
export const userStorage = {
  getItem(key: string): string | null {
    const k = scoped(key);
    if (!k) return null;
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    const k = scoped(key);
    if (!k) return;
    try { localStorage.setItem(k, value); } catch { /* storage full or blocked */ }
  },
  removeItem(key: string): void {
    const k = scoped(key);
    if (!k) return;
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};
