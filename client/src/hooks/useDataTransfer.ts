import { createBulkExpenses, createBulkIncomes, restoreAllData, wipeAllData } from '../services/api';
import type { Budget, Expense, Income, Semester, SettingsPatch } from '../types';
import type { AllData } from './useAllData';
import { hydrateSettings } from '../utils/settingsStore';
import { notify } from '../utils/notifications';

/** Idempotency key for one bulk-import batch, so a retry is recognised and
 *  rejected server-side instead of duplicating the whole import. */
const newBatchId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Imports, backup restore and "delete all my data". Each resolves true when it fully succeeded. */
export const useDataTransfer = ({
  data,
  onFreshLoad,
  onRestored,
}: {
  data: AllData;
  /** After a wipe: treat the next load like a first one (defaults, recurring). */
  onFreshLoad: () => void;
  onRestored: () => void;
}) => {
  const { refuseUntilLoaded, invalidate, replaceAll } = data;

  const importExpenses = async (rows: Omit<Expense, 'id'>[]): Promise<boolean> => {
    // Duplicate detection compares against the loaded data.
    if (refuseUntilLoaded('the import')) return false;
    try {
      await createBulkExpenses(rows, newBatchId());
      notify.success(`${rows.length} expenses successfully imported.`);
      await invalidate(); // new server ids
      return true;
    } catch (error) {
      console.error('Failed to import expenses:', error);
      notify.error('Could not import expenses.');
      return false;
    }
  };

  // A statement has debits AND credits: expenses and incomes in one pass. True
  // only when everything landed; the importer stays open otherwise, and
  // importing again is safe (same batch key, B5).
  const importStatement = async (payload: { expenses: Omit<Expense, 'id'>[]; incomes: Omit<Income, 'id'>[]; batchId?: string }): Promise<boolean> => {
    const { expenses, incomes } = payload;
    if (expenses.length === 0 && incomes.length === 0) return false;
    if (refuseUntilLoaded('the import')) return false;

    // Two requests: the second can fail after the first landed. Track what
    // did, and ALWAYS refetch, or the saved rows stay invisible (B4).
    let expensesSaved = 0;
    let incomesSaved = 0;
    let failure: unknown = null;
    const batchId = payload.batchId || newBatchId();
    try {
      if (expenses.length > 0) { await createBulkExpenses(expenses, `${batchId}-exp`); expensesSaved = expenses.length; }
      if (incomes.length > 0) { await createBulkIncomes(incomes, `${batchId}-inc`); incomesSaved = incomes.length; }
    } catch (error) {
      failure = error;
      console.error('Failed to import statement:', error);
    }
    if (expensesSaved > 0 || incomesSaved > 0) await invalidate();

    const parts: string[] = [];
    if (expensesSaved > 0) parts.push(`${expensesSaved} expense${expensesSaved === 1 ? '' : 's'}`);
    if (incomesSaved > 0) parts.push(`${incomesSaved} income`);
    if (!failure) {
      notify.success(`Imported ${parts.join(' and ')}.`);
      return true;
    }
    notify.error(parts.length > 0
      ? `Imported ${parts.join(' and ')}, but the rest failed. Press Import again to finish — nothing will be duplicated.`
      : 'Could not import the statement. Nothing was saved — your review is still here, try Import again.');
    return false;
  };

  /** Throws on failure (the data dialog shows the error and stays open). */
  const restoreBackup = async (payload: {
    expenses: Omit<Expense, 'id'>[];
    incomes: Omit<Income, 'id'>[];
    budgets: Budget[];
    semesters: Semester[];
    settings?: SettingsPatch;
  }): Promise<void> => {
    try {
      const restored = await restoreAllData(payload);
      // The backup's settings replace the local ones, including unsent changes.
      hydrateSettings(restored.settings, { authoritative: true });
      replaceAll({
        expenses: restored.expenses,
        incomes: restored.incomes,
        budgets: restored.budgets,
        semesters: restored.semesters,
        settings: restored.settings,
      });
      onRestored();
      notify.success('Backup restored successfully.');
    } catch (error) {
      console.error('Failed to restore backup:', error);
      notify.error('Could not restore backup. Please verify the file format.');
      throw error;
    }
  };

  const wipeAll = async (): Promise<boolean> => {
    try {
      const { deleted, settings } = await wipeAllData('DELETE');
      // Goals, account balances and paused charges went too; preferences stay.
      hydrateSettings(settings, { authoritative: true });
      const total = Object.values(deleted).reduce((s, n) => s + n, 0);
      notify.success(`Deleted ${total} record${total === 1 ? '' : 's'}. Your data is now empty.`);
      // Like a first load (C14): the recurring banner kept offering deleted
      // expenses, and Tuition stayed empty without its default semesters.
      onFreshLoad();
      await invalidate();
      return true;
    } catch (error) {
      console.error('Failed to wipe data:', error);
      notify.error('Could not delete your data.');
      return false;
    }
  };

  return { importExpenses, importStatement, restoreBackup, wipeAll };
};
