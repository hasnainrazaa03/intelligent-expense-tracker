import { Expense } from '../types';
import { SUBCATEGORY_TO_CATEGORY_MAP } from '../constants';

/**
 * Single source of truth for "does this expense count toward this budget?".
 *
 * Budgets can be set on a subcategory (e.g. "Groceries") or a main category
 * (e.g. "Food"). Expenses are stored by subcategory. An expense matches a budget
 * when it is that exact category OR its subcategory rolls up to that main
 * category — so a "Food" budget aggregates all its subcategories, while a
 * "Groceries" budget matches only Groceries. Previously three components each
 * computed this differently, so the same budget showed different utilization in
 * different places (CMP-H4).
 */
export const expenseMatchesBudget = (expenseCategory: string, budgetCategory: string): boolean =>
  expenseCategory === budgetCategory ||
  SUBCATEGORY_TO_CATEGORY_MAP[expenseCategory] === budgetCategory;

/** Total spend attributable to a single budget category. */
export const computeBudgetSpend = (
  budgetCategory: string,
  expenses: Pick<Expense, 'category' | 'amount'>[]
): number =>
  expenses
    .filter((e) => expenseMatchesBudget(e.category, budgetCategory))
    .reduce((sum, e) => sum + e.amount, 0);

/**
 * Total spend across all budgeted categories, counting each expense at most once
 * (so overlapping parent/child budgets don't double-count the aggregate total).
 */
export const computeTotalBudgetedSpend = (
  budgetCategories: string[],
  expenses: Pick<Expense, 'category' | 'amount'>[]
): number =>
  expenses
    .filter((e) => budgetCategories.some((c) => expenseMatchesBudget(e.category, c)))
    .reduce((sum, e) => sum + e.amount, 0);
