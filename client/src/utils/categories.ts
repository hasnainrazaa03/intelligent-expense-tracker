import { getSetting, updateSettings, subscribeSettings } from './settingsStore';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

// Single source of truth for the EFFECTIVE category map: the built-in defaults
// plus the user's custom additions, minus their deletions. Previously this merge
// lived only inside CategoryManagerModal, so custom subcategories never reached
// the expense dropdown or the color/main-category resolution (CMP-M24).

export type CategoryMap = Record<string, string[]>;

// The user's additions and deletions are account settings (settingsStore),
// stored on the server since 5b; they used to be per-browser localStorage.

// Cache the built map so the hot-path color/grouping lookups don't rebuild it on
// every call. Dropped whenever settings change (an edit here, another device's
// edit arriving, a different account signing in).
export interface CategoriesSnapshot {
  /** Main category → its subcategories (defaults + custom − deleted). */
  categories: CategoryMap;
  /** Subcategory → main category, custom ones included. */
  subToMain: Record<string, string>;
  /** Every subcategory, in order: what an expense can be filed under. */
  allSubcategories: string[];
}

let cache: CategoriesSnapshot | null = null;
// The two settings the cache was built from: either one changing means a
// rebuild, whichever settings listener happens to run first. Other settings
// changing keep the same snapshot (and spare useCategories a re-render).
let builtFrom: [unknown, unknown] = [undefined, undefined];

const build = (): CategoriesSnapshot => {
  const categories: CategoryMap = JSON.parse(JSON.stringify(CATEGORIES));

  const custom = getSetting('customCategories');
  if (custom) {
    for (const main of Object.keys(custom)) {
      const additions = Array.isArray(custom[main]) ? custom[main] : [];
      categories[main] = categories[main]
        ? Array.from(new Set([...categories[main], ...additions]))
        : [...additions];
    }
  }

  const deleted = getSetting('deletedSubcategories');
  if (deleted) {
    for (const main of Object.keys(deleted)) {
      if (categories[main]) categories[main] = categories[main].filter((s) => !deleted[main].includes(s));
    }
  }

  const subToMain: Record<string, string> = { ...SUBCATEGORY_TO_CATEGORY_MAP };
  for (const main of Object.keys(categories)) {
    for (const sub of categories[main]) subToMain[sub] = main;
  }

  return { categories, subToMain, allSubcategories: Object.values(categories).flat() };
};

const getCache = (): CategoriesSnapshot => {
  const custom = getSetting('customCategories');
  const deleted = getSetting('deletedSubcategories');
  if (!cache || builtFrom[0] !== custom || builtFrom[1] !== deleted) {
    cache = build();
    builtFrom = [custom, deleted];
  }
  return cache;
};

/** The effective main→subcategories map (defaults + custom − deleted). */
export const getEffectiveCategories = (): CategoryMap => JSON.parse(JSON.stringify(getCache().categories));

/** The effective subcategory→main map, including custom subcategories. */
export const getEffectiveSubToMain = (): Record<string, string> => getCache().subToMain;

/**
 * The effective categories, read-only. The same object until categories change,
 * so it works as a useSyncExternalStore snapshot (see hooks/useCategories).
 */
export const getCategoriesSnapshot = (): Readonly<CategoriesSnapshot> => getCache();

/** Drop the cache so the next lookup rebuilds from the current settings. */
export const invalidateCategoriesCache = (): void => {
  cache = null;
};
subscribeSettings(invalidateCategoriesCache);

/** Persist the full effective map by diffing it against the built-in defaults,
 *  storing only additions/deletions, then invalidating the cache. */
export const saveCategories = (categories: CategoryMap): void => {
  const defaults = CATEGORIES as CategoryMap;
  const additions: CategoryMap = {};
  const deletions: CategoryMap = {};

  for (const main of Object.keys(categories)) {
    const base = defaults[main] || [];
    const added = categories[main].filter((s) => !base.includes(s));
    if (added.length) additions[main] = added;
  }
  for (const main of Object.keys(defaults)) {
    const removed = defaults[main].filter((s) => !categories[main]?.includes(s));
    if (removed.length) deletions[main] = removed;
  }

  updateSettings({ customCategories: additions, deletedSubcategories: deletions });
  invalidateCategoriesCache();
};
