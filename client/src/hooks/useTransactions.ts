import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as api from '../services/api';
import type { Budget, Expense, Income } from '../types';
import type { AllData } from './useAllData';
import { enqueueExpense } from '../utils/offlineQueue';
import { replaceById, removeById, restoreAt } from '../utils/listCache';
import { budgetForExpense, computeBudgetSpend, budgetLabel } from '../utils/budgetUtils';
import { startOfMonth, endOfMonth, isWithinRange } from '../utils/dateUtils';
import { notify } from '../utils/notifications';

/**
 * Saving expenses, incomes and budgets, through React Query mutations.
 *
 * - Adds wait for the server: a failure keeps the form open with what was
 *   typed (C4), and nothing half-saved appears in the list.
 * - Edits, quick saves and deletes apply at once (optimistic). If the server
 *   refuses, that one item goes back as it was and a toast says so.
 * - Every function resolves true/false, so a form closes only on success.
 */
export const useTransactions = ({
  data,
  userEmail,
  refreshOfflineCount,
}: {
  data: AllData;
  userEmail: string | null;
  refreshOfflineCount: () => Promise<unknown>;
}) => {
  const { budgets, setExpenses, setIncomes, setBudgets, setSemesters, current, refuseUntilLoaded } = data;

  // Warn when an expense takes its budget near or over the monthly limit.
  const checkBudgetAlert = useCallback((category: string, allExpenses: Expense[]) => {
    // The budget this expense counts toward: its own subcategory budget, else
    // its main category's (C8).
    const budgetCategories = budgets.map((b) => b.category);
    const target = budgetForExpense(category, budgetCategories);
    const budget = budgets.find((b) => b.category === target);
    if (!budget || budget.amount <= 0) return;
    const monthExpenses = allExpenses.filter((e) => isWithinRange(e.date, startOfMonth(), endOfMonth()));
    const monthlySpent = computeBudgetSpend(budget.category, monthExpenses, budgetCategories);
    const pct = (monthlySpent / budget.amount) * 100;
    const name = budgetLabel(budget.category, budgetCategories);
    const amounts = `$${monthlySpent.toFixed(0)} of $${budget.amount.toFixed(0)} (${pct.toFixed(0)}%)`;
    if (pct >= 100) notify.error(`Budget exceeded: ${name} ${amounts}`);
    else if (pct >= 80) notify.warning(`Budget warning: ${name} ${amounts}`);
  }, [budgets]);

  // The server keeps a tuition payment's installment in step with its expense
  // (5d-1); these mirror what it did, so no semester save is needed.
  const mirrorTuitionPayment = useCallback((expense: Expense) => {
    if (!current().semesters.some((s) => s.installments.some((i) => i.expenseId === expense.id))) return;
    setSemesters((prev) => prev.map((s) => ({
      ...s,
      installments: s.installments.map((i) => (i.expenseId === expense.id ? { ...i, paidDate: expense.date, amount: expense.amount } : i)),
    })));
  }, [current, setSemesters]);
  const mirrorTuitionUnlink = useCallback((expenseId: string) => {
    if (!current().semesters.some((s) => s.installments.some((i) => i.expenseId === expenseId))) return;
    setSemesters((prev) => prev.map((s) => ({
      ...s,
      installments: s.installments.map((i) => (i.expenseId === expenseId ? { ...i, status: 'unpaid' as const, expenseId: undefined, paidDate: undefined } : i)),
    })));
  }, [current, setSemesters]);

  // --- Expenses ---------------------------------------------------------------
  const createExpense = useMutation({
    mutationFn: (expense: Omit<Expense, 'id'>) => api.createExpense(expense),
    onSuccess: (saved) => {
      setExpenses((list) => [...list, saved]);
      // After the update, not inside it (APP-H1): the alert reads the new list.
      checkBudgetAlert(saved.category, current().expenses);
    },
  });
  const updateExpenseM = useMutation({
    mutationFn: (expense: Expense) => api.updateExpense(expense),
    onMutate: (expense) => {
      const previous = current().expenses.find((e) => e.id === expense.id);
      setExpenses((list) => replaceById(list, expense));
      return { previous };
    },
    onError: (_error, _expense, ctx) => { if (ctx?.previous) setExpenses((list) => replaceById(list, ctx.previous!)); },
    onSuccess: (saved) => {
      setExpenses((list) => replaceById(list, saved));
      checkBudgetAlert(saved.category, current().expenses);
      mirrorTuitionPayment(saved);
    },
  });
  const deleteExpenseM = useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onMutate: (id) => {
      const { removed, index } = removeById(current().expenses, id);
      setExpenses((list) => removeById(list, id).list);
      return { removed, index };
    },
    onError: (_error, _id, ctx) => { if (ctx?.removed) setExpenses((list) => restoreAt(list, ctx.removed!, ctx.index)); },
    onSuccess: (_result, id) => mirrorTuitionUnlink(id),
  });

  const addExpense = async (expense: Omit<Expense, 'id'>): Promise<boolean> => {
    // Offline: queue it in IndexedDB and show it (temp id) so nothing is lost;
    // it replays automatically on reconnect.
    if (!navigator.onLine) {
      try {
        const item = await enqueueExpense(expense, userEmail);
        setExpenses((list) => [...list, { ...expense, id: item.clientId } as Expense]);
        checkBudgetAlert(expense.category, current().expenses);
        await refreshOfflineCount();
        notify.info('Saved offline — will sync when you reconnect.');
        return true;
      } catch (error) {
        console.error('Failed to queue expense offline:', error);
        notify.error('Could not save offline. Your entry is still in the form.');
        return false;
      }
    }
    try {
      await createExpense.mutateAsync(expense);
      return true;
    } catch (error) {
      console.error('Failed to add expense:', error);
      notify.error('Could not add expense. Your entry is still in the form.');
      return false;
    }
  };

  /** From the form (`inForm`, the default) or an inline quick edit. */
  const updateExpense = async (expense: Expense, { inForm = true } = {}): Promise<boolean> => {
    try {
      await updateExpenseM.mutateAsync(expense);
      return true;
    } catch (error) {
      console.error('Failed to update expense:', error);
      notify.error(inForm ? 'Could not update expense. Your changes are still in the form.' : "Couldn't save that change, so it was undone.");
      return false;
    }
  };

  const deleteExpense = async (id: string): Promise<boolean> => {
    try {
      await deleteExpenseM.mutateAsync(id);
      return true;
    } catch (error) {
      console.error('Failed to delete expense:', error);
      notify.error("Couldn't delete the expense, so it's back in the list.");
      return false;
    }
  };

  // --- Incomes ----------------------------------------------------------------
  const createIncome = useMutation({
    mutationFn: (income: Omit<Income, 'id'>) => api.createIncome(income),
    onSuccess: (saved) => setIncomes((list) => [...list, saved]),
  });
  const updateIncomeM = useMutation({
    mutationFn: (income: Income) => api.updateIncome(income),
    onMutate: (income) => {
      const previous = current().incomes.find((i) => i.id === income.id);
      setIncomes((list) => replaceById(list, income));
      return { previous };
    },
    onError: (_error, _income, ctx) => { if (ctx?.previous) setIncomes((list) => replaceById(list, ctx.previous!)); },
    onSuccess: (saved) => setIncomes((list) => replaceById(list, saved)),
  });
  const deleteIncomeM = useMutation({
    mutationFn: (id: string) => api.deleteIncome(id),
    onMutate: (id) => {
      const { removed, index } = removeById(current().incomes, id);
      setIncomes((list) => removeById(list, id).list);
      return { removed, index };
    },
    onError: (_error, _id, ctx) => { if (ctx?.removed) setIncomes((list) => restoreAt(list, ctx.removed!, ctx.index)); },
  });

  const addIncome = async (income: Omit<Income, 'id'>): Promise<boolean> => {
    try {
      await createIncome.mutateAsync(income);
      return true;
    } catch (error) {
      console.error('Failed to add income:', error);
      notify.error('Could not add income. Your entry is still in the form.');
      return false;
    }
  };

  const updateIncome = async (income: Income, { inForm = true } = {}): Promise<boolean> => {
    try {
      await updateIncomeM.mutateAsync(income);
      return true;
    } catch (error) {
      console.error('Failed to update income:', error);
      notify.error(inForm ? 'Could not update income. Your changes are still in the form.' : "Couldn't save that change, so it was undone.");
      return false;
    }
  };

  const deleteIncome = async (id: string): Promise<boolean> => {
    try {
      await deleteIncomeM.mutateAsync(id);
      return true;
    } catch (error) {
      console.error('Failed to delete income:', error);
      notify.error("Couldn't delete the income, so it's back in the list.");
      return false;
    }
  };

  // --- Budgets ----------------------------------------------------------------
  const saveBudgetsM = useMutation({
    mutationFn: (list: Budget[]) => api.saveBudgets(list),
    onSuccess: (saved) => setBudgets(saved),
  });
  /** A full replace (the server deletes any budget not in the list), so never before the data loaded. */
  const saveBudgets = async (list: Budget[]): Promise<boolean> => {
    if (refuseUntilLoaded('your budgets')) return false;
    try {
      await saveBudgetsM.mutateAsync(list);
      return true;
    } catch (error) {
      console.error('Failed to save budgets:', error);
      notify.error('Could not save budgets.');
      return false;
    }
  };

  return { addExpense, updateExpense, deleteExpense, addIncome, updateIncome, deleteIncome, saveBudgets };
};

export type Transactions = ReturnType<typeof useTransactions>;
