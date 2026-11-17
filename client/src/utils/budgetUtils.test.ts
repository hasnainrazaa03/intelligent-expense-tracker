import { describe, expect, it, beforeEach } from 'vitest';
import { budgetForExpense, expenseMatchesBudget, computeBudgetSpend, computeTotalBudgetedSpend, budgetLabel } from './budgetUtils';
import { invalidateCategoriesCache } from './categories';

// "Groceries" and "Dining Out" roll up to "Food" in the default taxonomy.
describe('budgetUtils', () => {
  beforeEach(() => invalidateCategoriesCache());
  const expenses = [
    { category: 'Groceries', amount: 100 },
    { category: 'Dining Out', amount: 40 },
    { category: 'Rent', amount: 800 },
  ];

  it('a subcategory budget covers only that subcategory', () => {
    expect(expenseMatchesBudget('Groceries', 'Groceries', ['Groceries'])).toBe(true);
    expect(expenseMatchesBudget('Dining Out', 'Groceries', ['Groceries'])).toBe(false);
  });

  it('a main-category budget alone covers all of its subcategories', () => {
    expect(computeBudgetSpend('Food', expenses, ['Food'])).toBe(140);
    expect(expenseMatchesBudget('Rent', 'Food', ['Food'])).toBe(false);
  });

  it('with a subcategory budget too, the main budget covers only the rest ("General Food")', () => {
    const budgets = ['Food', 'Groceries'];
    expect(budgetForExpense('Groceries', budgets)).toBe('Groceries');
    expect(budgetForExpense('Dining Out', budgets)).toBe('Food');
    expect(computeBudgetSpend('Groceries', expenses, budgets)).toBe(100);
    expect(computeBudgetSpend('Food', expenses, budgets)).toBe(40);
  });

  it('per-budget spend adds up to the total (each expense counted once)', () => {
    const budgets = ['Food', 'Groceries', 'Rent'];
    const sum = budgets.reduce((s, b) => s + computeBudgetSpend(b, expenses, budgets), 0);
    expect(computeTotalBudgetedSpend(budgets, expenses)).toBe(940);
    expect(sum).toBe(940);
  });

  it('labels a main budget that sits beside subcategory budgets', () => {
    expect(budgetLabel('Food', ['Food', 'Groceries'])).toBe('Food (other)');
    expect(budgetLabel('Food', ['Food', 'Rent'])).toBe('Food');
    expect(budgetLabel('Groceries', ['Food', 'Groceries'])).toBe('Groceries');
  });
});
