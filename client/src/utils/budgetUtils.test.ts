import { describe, expect, it } from 'vitest';
import { expenseMatchesBudget, computeBudgetSpend, computeTotalBudgetedSpend } from './budgetUtils';

// These rely on SUBCATEGORY_TO_CATEGORY_MAP from constants; "Groceries" rolls up
// to "Food" in the app's category taxonomy.
describe('budgetUtils', () => {
  const expenses = [
    { category: 'Groceries', amount: 100 },
    { category: 'Dining Out', amount: 40 },
    { category: 'Rent', amount: 800 },
  ];

  it('matches a subcategory budget only to that subcategory', () => {
    expect(expenseMatchesBudget('Groceries', 'Groceries')).toBe(true);
    expect(expenseMatchesBudget('Dining Out', 'Groceries')).toBe(false);
  });

  it('matches a main-category budget to all its subcategories', () => {
    expect(expenseMatchesBudget('Groceries', 'Food')).toBe(true);
    expect(expenseMatchesBudget('Dining Out', 'Food')).toBe(true);
    expect(expenseMatchesBudget('Rent', 'Food')).toBe(false);
  });

  it('computes per-budget spend for a subcategory budget', () => {
    expect(computeBudgetSpend('Groceries', expenses)).toBe(100);
  });

  it('aggregates a main-category budget across subcategories', () => {
    expect(computeBudgetSpend('Food', expenses)).toBe(140);
  });

  it('counts each expense once in the total across overlapping budgets', () => {
    // "Food" (aggregates Groceries+Dining) and "Groceries" overlap; total must not double-count.
    expect(computeTotalBudgetedSpend(['Food', 'Groceries'], expenses)).toBe(140);
  });
});
