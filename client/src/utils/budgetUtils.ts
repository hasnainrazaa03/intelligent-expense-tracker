import { Expense } from '../types';
import { getEffectiveSubToMain } from './categories';

/**
 * Single source of truth for "which budget does this expense count toward?".
 *
 * Budgets can be set on a subcategory ("Groceries") or a main category ("Food").
 * The budget editor presents a main-category budget as "General Food" and adds
 * it to the subcategory budgets, so that is the rule everywhere:
 *   - a subcategory budget covers that subcategory;
 *   - a main-category budget covers the main category itself and every one of
 *     its subcategories that has NO budget of its own.
 * Each expense therefore counts toward exactly one budget (or none), and the
 * per-budget figures add up to the total. Before, a main-category budget also
 * counted its children's spend while the totals added the children's budgets on
 * top, so Food showed 170% "over" while the overall gauge read 61% (F14).
 *
 * Subcategory → main category uses the user's custom categories too, so a
 * custom "Boba" under Food rolls up to a Food budget (C8, F17).
 */
export const budgetForExpense = (expenseCategory: string, budgetCategories: Iterable<string>): string | null => {
  const budgeted = budgetCategories instanceof Set ? (budgetCategories as Set<string>) : new Set(budgetCategories);
  if (budgeted.has(expenseCategory)) return expenseCategory;
  const main = getEffectiveSubToMain()[expenseCategory];
  return main && budgeted.has(main) ? main : null;
};

/** Does an expense in `expenseCategory` count toward `budgetCategory`, given all budgets? */
export const expenseMatchesBudget = (
  expenseCategory: string,
  budgetCategory: string,
  budgetCategories: Iterable<string>
): boolean => budgetForExpense(expenseCategory, budgetCategories) === budgetCategory;

/** Spend attributable to one budget, given all budgets. */
export const computeBudgetSpend = (
  budgetCategory: string,
  expenses: Pick<Expense, 'category' | 'amount'>[],
  budgetCategories: Iterable<string>
): number => {
  const budgeted = new Set(budgetCategories);
  return expenses
    .filter((e) => budgetForExpense(e.category, budgeted) === budgetCategory)
    .reduce((sum, e) => sum + e.amount, 0);
};

/** Spend across all budgets — each expense counted once. Equals the sum of computeBudgetSpend. */
export const computeTotalBudgetedSpend = (
  budgetCategories: Iterable<string>,
  expenses: Pick<Expense, 'category' | 'amount'>[]
): number => {
  const budgeted = new Set(budgetCategories);
  return expenses
    .filter((e) => budgetForExpense(e.category, budgeted) !== null)
    .reduce((sum, e) => sum + e.amount, 0);
};

/** Display name for a budget: a main-category budget that sits alongside budgets
 *  on some of its subcategories only covers the rest, so say so ("Food (other)"). */
export const budgetLabel = (budgetCategory: string, budgetCategories: Iterable<string>): string => {
  const subToMain = getEffectiveSubToMain();
  for (const c of budgetCategories) {
    if (c !== budgetCategory && subToMain[c] === budgetCategory) return `${budgetCategory} (other)`;
  }
  return budgetCategory;
};
