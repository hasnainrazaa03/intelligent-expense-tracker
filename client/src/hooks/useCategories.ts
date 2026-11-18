import { useSyncExternalStore } from 'react';
import { subscribeSettings } from '../utils/settingsStore';
import { getCategoriesSnapshot, type CategoriesSnapshot } from '../utils/categories';

/**
 * The effective categories (built-in + the user's additions − deletions), and
 * a re-render whenever they change: an edit in the category manager, another
 * device's edit arriving, or a different account signing in. Every list a
 * user picks a category from reads this, not the built-in constants (A3).
 */
export const useCategories = (): Readonly<CategoriesSnapshot> =>
  useSyncExternalStore(subscribeSettings, getCategoriesSnapshot, getCategoriesSnapshot);
