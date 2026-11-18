import { useCallback, useEffect, useRef, useState } from 'react';
import { createBulkExpenses } from '../services/api';
import type { Expense } from '../types';
import type { AllData } from './useAllData';
import { computeDueRecurring } from '../utils/recurrence';
import { todayCalendar } from '../utils/dateUtils';
import { getSetting, updateSettings } from '../utils/settingsStore';
import { notify } from '../utils/notifications';

/**
 * F3: recurring charges that are due again, offered once per fresh load for
 * the user to tick and add (each dated at its next due date).
 */
export const useRecurringSuggestions = ({ data }: { data: AllData }) => {
  const [pending, setPending] = useState<Omit<Expense, 'id'>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const didProcess = useRef(false);
  const loaded = data.query.data;
  useEffect(() => {
    // Only real server data (see useAllData), once per load.
    if (!loaded || !data.hasServerSnapshot) {
      didProcess.current = false;
      return;
    }
    if (didProcess.current) return;
    didProcess.current = true;
    const due = computeDueRecurring(loaded.expenses, todayCalendar());
    const snoozeUntil = getSetting('recurringSnoozeUntil') ?? 0;
    if (due.length === 0 || (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil)) {
      setPending([]);
      return;
    }
    setPending(due);
    setSelected(new Set(due.map((_, i) => i)));
  }, [loaded, data.hasServerSnapshot]);

  const clear = useCallback(() => {
    setPending([]);
    setSelected(new Set());
  }, []);
  /** After "delete all my data": look again on the next load (C14). */
  const resetForFreshLoad = useCallback(() => {
    didProcess.current = false;
    clear();
  }, [clear]);

  const toggle = (index: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  const accept = async () => {
    const toAdd = pending.filter((_, i) => selected.has(i));
    if (toAdd.length === 0) return;
    try {
      await createBulkExpenses(toAdd);
      await data.invalidate(); // the bulk insert created server ids
      clear();
      updateSettings({ recurringSnoozeUntil: null });
      notify.success(`${toAdd.length} recurring expense(s) added.`);
    } catch (error) {
      console.error('Failed to create recurring expenses:', error);
      notify.error('Could not create recurring expenses.');
    }
  };

  const snooze = () => {
    updateSettings({ recurringSnoozeUntil: Date.now() + 24 * 60 * 60 * 1000 });
    clear();
    notify.info('Recurring reminder snoozed for 24 hours.');
  };

  return { pending, selected, toggle, accept, dismiss: clear, snooze, clear, resetForFreshLoad };
};

export type RecurringSuggestions = ReturnType<typeof useRecurringSuggestions>;
