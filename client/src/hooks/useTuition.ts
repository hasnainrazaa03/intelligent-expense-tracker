import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { saveSemesters, payInstallment, ApiError } from '../services/api';
import type { Expense, Semester } from '../types';
import type { AllData } from './useAllData';
import { USC_SEMESTERS } from '../constants';
import { distributeAmount } from '../utils/currencyUtils';
import { notify } from '../utils/notifications';

// Shown to a new account until its first tuition edit saves them. Version -1
// means "not saved yet": if another tab saved these semesters meanwhile, the
// server refuses this copy (it has version 0+) instead of overwriting it.
const buildDefaultSemesters = (): Semester[] =>
  USC_SEMESTERS.map((s) => ({
    ...s,
    version: -1,
    totalTuition: 0,
    installments: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, amount: 0, status: 'unpaid' as const })),
  }));

/**
 * Tuition: semester structure (totals, installment count) is edited locally
 * and autosaved; payments are server operations (5d-1).
 */
export const useTuition = ({
  data,
  isAuthenticated,
  updateExpense,
}: {
  data: AllData;
  isAuthenticated: boolean;
  /** For a paid date: the date belongs to the payment's expense. */
  updateExpense: (expense: Expense, options?: { inForm?: boolean }) => Promise<boolean>;
}) => {
  const { semesters, expenses, setSemesters, hasServerSnapshot, refuseUntilLoaded, semestersDirtyRef, query } = data;

  const [isSemestersDirty, setIsSemestersDirty] = useState(false);
  // Bumped on every local edit. A save clears the dirty flag only if no edit
  // happened while it was in flight (C3).
  const editVersion = useRef(0);
  const markDirty = useCallback(() => {
    editVersion.current += 1;
    semestersDirtyRef.current = true;
    setIsSemestersDirty(true);
  }, [semestersDirtyRef]);
  // Latest semesters, for a save that runs after waiting for an earlier one.
  // Updated after each render (layout effect: before any click can read it).
  const semestersRef = useRef<Semester[]>([]);
  useLayoutEffect(() => { semestersRef.current = semesters; }, [semesters]);
  const saveInFlight = useRef<Promise<unknown> | null>(null);
  const failures = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  // A new account has no semesters: show the defaults, once per fresh load.
  const didFillDefaults = useRef(false);
  useEffect(() => {
    // Only real server data: on a failed load `data` can be a patch on an empty
    // base, and defaults there would later be saved over the real semesters.
    if (!query.data || !hasServerSnapshot) {
      didFillDefaults.current = false;
      return;
    }
    if (didFillDefaults.current) return;
    didFillDefaults.current = true;
    if (query.data.semesters.length === 0) setSemesters(buildDefaultSemesters());
  }, [query.data, hasServerSnapshot, setSemesters]);
  /** After "delete all my data": fill in the defaults again on the next load. */
  const resetForFreshLoad = useCallback(() => { didFillDefaults.current = false; }, []);

  // Save STRUCTURE. One save at a time. Resolves the saved list (with real
  // installment ids), or null when it failed or was refused as stale.
  const saveNow = async (): Promise<Semester[] | null> => {
    while (saveInFlight.current) await saveInFlight.current.catch(() => undefined);
    if (!semestersDirtyRef.current) return semestersRef.current; // already saved
    const version = editVersion.current;
    const request = saveSemesters(semestersRef.current);
    saveInFlight.current = request;
    try {
      const saved = await request;
      if (failures.current > 0) notify.success('Tuition changes saved.');
      failures.current = 0;
      if (editVersion.current === version) {
        // Nothing changed while saving: adopt the server's copy (real ids, new versions).
        semestersDirtyRef.current = false;
        setSemesters(saved);
        setIsSemestersDirty(false);
      } else {
        // A newer edit is pending; its own timer saves it. Take only the new
        // versions now, or that save would be refused as stale.
        setSemesters((prev) => prev.map((s) => {
          const fresh = saved.find((x) => x.id === s.id);
          return fresh ? { ...s, version: fresh.version } : s;
        }));
      }
      return saved;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Another tab or device changed tuition since this copy loaded (S12).
        const latest = (err.data as { semesters?: Semester[] } | undefined)?.semesters;
        if (latest) {
          semestersDirtyRef.current = false;
          setSemesters(latest);
          setIsSemestersDirty(false);
        }
        failures.current = 0;
        notify.info('Tuition was changed in another tab or on another device, so this is the latest version. Redo your change if you still need it.');
        return null;
      }
      console.error('Failed to auto-save semesters:', err);
      failures.current += 1;
      if (failures.current === 1) notify.error("Couldn't save your tuition changes. Retrying…");
      const backoffMs = Math.min(30_000, 2_000 * 2 ** (failures.current - 1));
      setTimeout(() => setRetryTick((t) => t + 1), backoffMs);
      return null;
    } finally {
      saveInFlight.current = null;
    }
  };

  // Autosave 800ms after the last change; never before the real list loaded.
  const autosave = useEffectEvent(() => { void saveNow(); });
  useEffect(() => {
    if (!isAuthenticated || !isSemestersDirty || !hasServerSnapshot) return;
    const timer = setTimeout(autosave, 800);
    return () => clearTimeout(timer);
  }, [semesters, isAuthenticated, isSemestersDirty, hasServerSnapshot, retryTick]);

  const updateTotal = (semesterId: string, totalTuition: number) => {
    // A stray blur (empty, NaN, negative) must never wipe the total.
    if (!Number.isFinite(totalTuition) || totalTuition < 0) return;
    setSemesters((prev) => prev.map((semester) => {
      if (semester.id !== semesterId) return semester;
      // Paid installments are locked; the rest of the balance is split over
      // the unpaid ones, cent-accurately.
      const paidSum = semester.installments.reduce((sum, i) => (i.status === 'paid' ? sum + i.amount : sum), 0);
      const unpaidSlots = semester.installments.filter((i) => i.status !== 'paid').length;
      const splits = distributeAmount(Math.max(0, totalTuition - paidSum), unpaidSlots);
      let k = 0;
      return { ...semester, totalTuition, installments: semester.installments.map((i) => (i.status === 'paid' ? i : { ...i, amount: splits[k++] ?? 0 })) };
    }));
    markDirty();
  };

  const updateInstallmentCount = (semesterId: string, count: number) => {
    setSemesters((prev) => prev.map((semester) => {
      if (semester.id !== semesterId) return semester;
      const paid = semester.installments.filter((i) => i.status === 'paid');
      const paidSum = paid.reduce((sum, i) => sum + i.amount, 0);
      const unpaidSlots = count - paid.length;
      if (unpaidSlots < 0) return semester; // can't drop below the paid ones
      const splits = distributeAmount(semester.totalTuition - paidSum, unpaidSlots);
      let k = 0;
      const installments = Array.from({ length: count }, (_, i) => {
        const existing = semester.installments[i];
        if (existing && existing.status === 'paid') return existing; // locked
        return { id: i + 1, amount: splits[k++] ?? 0, status: 'unpaid' as const, expenseId: undefined, paidDate: undefined };
      });
      return { ...semester, installments };
    }));
    markDirty();
  };

  // Installments with a payment in flight: a double-click is ignored here too
  // (the server also returns the same expense for a repeat).
  const payingNow = useRef(new Set<string>());
  const markPaid = async (semesterId: string, installmentId: number, paymentDate: string) => {
    const key = `${semesterId}:${installmentId}`;
    if (payingNow.current.has(key)) return;
    payingNow.current.add(key);
    try {
      const before = semestersRef.current.find((s) => s.id === semesterId);
      const position = before ? before.installments.findIndex((i) => i.id === installmentId) : -1;
      const target = before?.installments[position];
      if (!before || !target || target.status === 'paid' || target.amount <= 0) return;
      if (refuseUntilLoaded('the payment')) return;

      // The installment has to exist on the server with its current amount:
      // save pending tuition edits first.
      let list: Semester[] | null = semestersRef.current;
      if (semestersDirtyRef.current || saveInFlight.current) list = await saveNow();
      const saved = list?.find((s) => s.id === semesterId)?.installments[position];
      if (!saved || typeof (saved.id as unknown) !== 'string') {
        notify.error("Your tuition changes couldn't be saved, so the payment wasn't recorded. Try again.");
        return;
      }
      if (saved.status === 'paid') return; // paid in another tab meanwhile

      try {
        const { semester, expense } = await payInstallment(semesterId, String(saved.id), paymentDate);
        if (expense) {
          data.setExpenses((prev) => (prev.some((e) => e.id === expense.id) ? prev.map((e) => (e.id === expense.id ? expense : e)) : [...prev, expense]));
        }
        setSemesters((prev) => prev.map((s) => (s.id === semesterId ? semester : s)));
      } catch (error) {
        console.error('Failed to mark installment as paid:', error);
        notify.error(error instanceof ApiError ? error.message : 'Could not record the tuition payment.');
      }
    } finally {
      payingNow.current.delete(key);
    }
  };

  // A paid installment's date is its expense's date: change that, and the
  // server moves the installment's date with it.
  /** Resolves false when nothing changed because of an error (the form stays open). */
  const updatePaidDate = async (semesterId: string, installmentId: number, newDate: string): Promise<boolean> => {
    const installment = semesters.find((s) => s.id === semesterId)?.installments.find((i) => i.id === installmentId);
    const expense = installment?.expenseId ? expenses.find((e) => e.id === installment.expenseId) : undefined;
    if (!expense) {
      notify.error("This payment has no tuition expense linked to it, so its date can't be changed here.");
      return false;
    }
    if (expense.date === newDate) return true;
    return updateExpense({ ...expense, date: newDate }, { inForm: false });
  };

  return { updateTotal, updateInstallmentCount, markPaid, updatePaidDate, resetForFreshLoad };
};
