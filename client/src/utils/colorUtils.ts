
import { CATEGORY_COLORS, SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

/**
 * Resolves any stored category value to its MAIN category for grouping.
 * Expenses may be stored as a subcategory ("Groceries") OR already as a main
 * category ("Food"), so callers must not assume one or the other — mapping a
 * main category straight through `SUBCATEGORY_TO_CATEGORY_MAP` misses (it only
 * keys subcategories) and wrongly collapses everything into "Miscellaneous".
 */
export const getMainCategory = (categoryOrSubcategory: string): string => {
  if (CATEGORY_COLORS[categoryOrSubcategory]) return categoryOrSubcategory; // already a main category
  return SUBCATEGORY_TO_CATEGORY_MAP[categoryOrSubcategory] || 'Miscellaneous';
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

  // Assume it's a subcategory and find its main category
  const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[categoryOrSubcategory] || 'Miscellaneous';
  
  return CATEGORY_COLORS[mainCategory] || CATEGORY_COLORS['Miscellaneous'];
};
