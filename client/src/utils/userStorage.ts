// localStorage for data that belongs to ONE account (savings goals, investment
// accounts, custom categories, the merchant map, a few per-user preferences).
//
// These used to sit under fixed keys, so on a shared machine the next person to
// sign in saw the previous person's goals and accounts. Deleting them at logout
// isn't an option yet — they aren't stored on the server, so the owner would
// lose them too. Instead each key is namespaced by the signed-in email: nothing
// is deleted, and nobody sees anyone else's.

import { invalidateCategoriesCache } from './categories';

/** Keys whose values belong to a single account. */
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

const scoped = (key: string) => (currentUser ? `${key}::${currentUser}` : null);

/** Called by AuthContext whenever the signed-in account changes. */
export const setStorageUser = (email: string | null) => {
  const next = email ? email.trim().toLowerCase() : null;
  if (next === currentUser) return;
  currentUser = next;
  if (next) claimLegacyData(next);
  // Category lookups are cached from storage; rebuild them for this account.
  invalidateCategoriesCache();
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
