
import { CATEGORY_COLORS } from '../constants';
import { getEffectiveSubToMain } from './categories';

/**
 * Resolves any stored category value to its MAIN category for grouping.
 * Expenses may be stored as a subcategory ("Groceries") OR already as a main
 * category ("Food"), so callers must not assume one or the other. Uses the
 * EFFECTIVE subcategory→main map (defaults + custom), so a user's custom
 * subcategory resolves to its real main category instead of "Miscellaneous".
 */
export const getMainCategory = (categoryOrSubcategory: string): string => {
  if (CATEGORY_COLORS[categoryOrSubcategory]) return categoryOrSubcategory; // already a main category
  return getEffectiveSubToMain()[categoryOrSubcategory] || 'Miscellaneous';
};

/**
 * Gets a color for a given category or subcategory.
 * If the input is a main category, its color is returned.
 * If it's a subcategory, its main category is found, and that color is returned.
 * @param categoryOrSubcategory The name of the category or subcategory.
 * @returns A hex color string.
 */
export const getCategoryColor = (categoryOrSubcategory: string): string => {
  // Check if it's a main category first
  if (CATEGORY_COLORS[categoryOrSubcategory]) {
    return CATEGORY_COLORS[categoryOrSubcategory];
  }

  // Assume it's a subcategory and find its main category (custom-aware)
  const mainCategory = getEffectiveSubToMain()[categoryOrSubcategory] || 'Miscellaneous';

  return CATEGORY_COLORS[mainCategory] || CATEGORY_COLORS['Miscellaneous'];
};
