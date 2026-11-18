// Categories on the server: the built-in ones, as in client/src/constants.ts
// (keep the two in step), plus each user's own additions and removals
// (UserSettings). The same effective list as the app's, so a budget on "Food"
// covers a custom "Boba" in alerts (C8), and the AI files a receipt or a
// statement line under "Boba" too (A3).
import { prisma } from '../db';

export const BUILT_IN_CATEGORIES: Record<string, string[]> = {
  Education: ['Tuition', 'Books & Supplies', 'Course Fees', 'Technology', 'Supplies', 'Visa Fees'],
  Housing: ['Rent', 'Utilities', 'Internet', 'Renters Insurance', 'Furniture', 'Household Items'],
  Healthcare: ['Insurance Premium', 'Medical Expenses', 'Dental & Vision', 'Prescriptions'],
  Food: ['Groceries', 'Dining Out', 'Coffee & Snacks', 'Meal Plan'],
  Transportation: ['Public Transit', 'Fuel', 'Car Insurance', 'Maintenance', 'Rideshare', 'Parking'],
  Personal: ['Phone', 'Clothing', 'Entertainment', 'Fitness', 'Personal Care', 'Subscriptions'],
  Travel: ['Home Visits', 'Local Travel', 'Airfare', 'Accommodation'],
  Miscellaneous: ['Emergency Fund', 'Gifts', 'Other'],
};

/** Income categories, as in client/src/constants.ts. */
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Rental Income', 'Loan', 'Other'];

type CategoryMap = Record<string, string[]>;
const isMap = (v: unknown): v is CategoryMap => !!v && typeof v === 'object' && !Array.isArray(v);

/** One user's main category → subcategories (built-ins + custom − deleted). */
export const effectiveCategories = (custom: unknown, deleted: unknown): CategoryMap => {
  const categories: CategoryMap = Object.fromEntries(Object.entries(BUILT_IN_CATEGORIES).map(([k, v]) => [k, [...v]]));
  if (isMap(custom)) {
    for (const [main, subs] of Object.entries(custom)) {
      if (Array.isArray(subs)) categories[main] = Array.from(new Set([...(categories[main] ?? []), ...subs]));
    }
  }
  if (isMap(deleted)) {
    for (const [main, subs] of Object.entries(deleted)) {
      if (categories[main] && Array.isArray(subs)) categories[main] = categories[main].filter((s) => !subs.includes(s));
    }
  }
  return categories;
};

/** Subcategory → main category for one user (built-ins + custom − deleted). */
export const subToMainFor = (custom: unknown, deleted: unknown): Record<string, string> => {
  const categories = effectiveCategories(custom, deleted);
  const map: Record<string, string> = {};
  for (const [main, subs] of Object.entries(categories)) for (const sub of subs) map[sub] = main;
  return map;
};

/**
 * The budget an expense counts toward, as in the app (client budgetUtils): a
 * subcategory budget covers that subcategory; a main-category budget covers the
 * main category and each subcategory without a budget of its own (F14).
 */
export const budgetForExpense = (category: string, budgeted: Set<string>, subToMain: Record<string, string>): string | null => {
  if (budgeted.has(category)) return category;
  const main = subToMain[category];
  return main && budgeted.has(main) ? main : null;
};

/**
 * What one user's expenses can be filed under: every effective subcategory,
 * with "Other" always last as the fallback (even if they removed it).
 */
export const expenseCategoriesFor = (custom: unknown, deleted: unknown): string[] => {
  const all = Object.values(effectiveCategories(custom, deleted)).flat().filter((c) => c !== 'Other');
  return [...new Set(all), 'Other'];
};

/** expenseCategoriesFor, from the user's saved settings. */
export const expenseCategoriesForUser = async (userId: string): Promise<string[]> => {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { customCategories: true, deletedSubcategories: true },
  });
  return expenseCategoriesFor(settings?.customCategories, settings?.deletedSubcategories);
};
