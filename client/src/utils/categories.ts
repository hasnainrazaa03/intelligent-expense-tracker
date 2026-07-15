import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

// Single source of truth for the EFFECTIVE category map: the built-in defaults
// plus the user's custom additions, minus their deletions. Previously this merge
// lived only inside CategoryManagerModal, so custom subcategories never reached
// the expense dropdown or the color/main-category resolution (CMP-M24).

export const CUSTOM_CATEGORIES_KEY = 'customCategories';
export const DELETED_SUBCATEGORIES_KEY = 'deletedSubcategories';

export type CategoryMap = Record<string, string[]>;

const readJson = <T,>(key: string): T | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

// Cache the built map so the hot-path color/grouping lookups don't re-parse
// localStorage on every call. Invalidated whenever the user edits categories.
let cache: { categories: CategoryMap; subToMain: Record<string, string> } | null = null;

const build = (): { categories: CategoryMap; subToMain: Record<string, string> } => {
  const categories: CategoryMap = JSON.parse(JSON.stringify(CATEGORIES));

  const custom = readJson<CategoryMap>(CUSTOM_CATEGORIES_KEY);
  if (custom) {
    for (const main of Object.keys(custom)) {
      const additions = Array.isArray(custom[main]) ? custom[main] : [];
      categories[main] = categories[main]
        ? Array.from(new Set([...categories[main], ...additions]))
        : [...additions];
    }
  }

  const deleted = readJson<CategoryMap>(DELETED_SUBCATEGORIES_KEY);
  if (deleted) {
    for (const main of Object.keys(deleted)) {
      if (categories[main]) categories[main] = categories[main].filter((s) => !deleted[main].includes(s));
    }
  }

  const subToMain: Record<string, string> = { ...SUBCATEGORY_TO_CATEGORY_MAP };
  for (const main of Object.keys(categories)) {
    for (const sub of categories[main]) subToMain[sub] = main;
  }

  return { categories, subToMain };
};

const getCache = () => (cache ??= build());

/** The effective main→subcategories map (defaults + custom − deleted). */
export const getEffectiveCategories = (): CategoryMap => JSON.parse(JSON.stringify(getCache().categories));

/** The effective subcategory→main map, including custom subcategories. */
export const getEffectiveSubToMain = (): Record<string, string> => getCache().subToMain;

/** Drop the cache so the next lookup rebuilds from localStorage (after edits). */
export const invalidateCategoriesCache = (): void => {
  cache = null;
};

/** Persist the full effective map by diffing it against the built-in defaults,
 *  storing only additions/deletions, then invalidating the cache. */
export const saveCategories = (categories: CategoryMap): void => {
  if (typeof localStorage === 'undefined') return;
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

  if (Object.keys(additions).length) localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(additions));
  else localStorage.removeItem(CUSTOM_CATEGORIES_KEY);

  if (Object.keys(deletions).length) localStorage.setItem(DELETED_SUBCATEGORIES_KEY, JSON.stringify(deletions));
  else localStorage.removeItem(DELETED_SUBCATEGORIES_KEY);

  invalidateCategoriesCache();
};
