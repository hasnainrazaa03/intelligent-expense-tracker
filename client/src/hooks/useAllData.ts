import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllData, isAuthError } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import type { AllDataResponse } from '../types/api';
import type { Budget, Expense, Income, Semester } from '../types';
import { hydrateSettings } from '../utils/settingsStore';
import { notify } from '../utils/notifications';

export const EMPTY_ALL_DATA: AllDataResponse = { expenses: [], incomes: [], budgets: [], semesters: [] };

/**
 * The signed-in user's data: React Query's ['allData'] entry, loaded from
 * /data/all, plus setters that patch it in place.
 *
 * C2: a failed load used to look like an empty account, and a later budget or
 * tuition save then replaced the real data with it. `hasServerSnapshot` is
 * true only once /data/all has really loaded this session; anything that saves
 * a FULL list back (budgets, semesters, imports that de-duplicate against the
 * data) must check `refuseUntilLoaded` first.
 */
export const useAllData = ({ isAuthenticated, onAuthError }: { isAuthenticated: boolean; onAuthError: () => void }) => {
  const queryClient = useQueryClient();
  const [hasServerSnapshot, setHasServerSnapshot] = useState(false);
  // Set by useTuition while semester edits are unsaved: a refetch then keeps
  // the local semesters instead of replacing them (the autosave writes them).
  const semestersDirtyRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.allData,
    queryFn: async () => {
      const data = await getAllData();
      // Goals, accounts, categories, preferences: before the render that uses the data.
      hydrateSettings(data.settings);
      setHasServerSnapshot(true);
      if (semestersDirtyRef.current) {
        const local = queryClient.getQueryData<AllDataResponse>(queryKeys.allData)?.semesters;
        if (local) return { ...data, semesters: local };
      }
      return data;
    },
    enabled: isAuthenticated,
  });

  useEffect(() => { if (!isAuthenticated) setHasServerSnapshot(false); }, [isAuthenticated]);

  // A 401/403 on load means the session is gone (keyed off the status, APP-H2).
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;
  useEffect(() => {
    if (query.error && isAuthError(query.error)) onAuthErrorRef.current();
  }, [query.error]);

  // Retry as soon as the connection comes back.
  const refetch = query.refetch;
  useEffect(() => {
    if (!isAuthenticated || hasServerSnapshot) return;
    const retry = () => { void refetch(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [isAuthenticated, hasServerSnapshot, refetch]);

  const refuseUntilLoaded = useCallback((what: string): boolean => {
    if (hasServerSnapshot) return false;
    notify.error(`Your data hasn't loaded yet, so ${what} wasn't saved (it would overwrite what's on the server). Retry loading first.`);
    return true;
  }, [hasServerSnapshot]);

  const patch = useCallback(
    <K extends keyof AllDataResponse>(key: K, updater: React.SetStateAction<AllDataResponse[K]>) => {
      queryClient.setQueryData<AllDataResponse>(queryKeys.allData, (old) => {
        const base = old ?? EMPTY_ALL_DATA;
        const next = typeof updater === 'function' ? (updater as (p: AllDataResponse[K]) => AllDataResponse[K])(base[key]) : updater;
        return { ...base, [key]: next };
      });
    },
    [queryClient]
  );
  const setExpenses = useCallback((u: React.SetStateAction<Expense[]>) => patch('expenses', u), [patch]);
  const setIncomes = useCallback((u: React.SetStateAction<Income[]>) => patch('incomes', u), [patch]);
  const setBudgets = useCallback((u: React.SetStateAction<Budget[]>) => patch('budgets', u), [patch]);
  const setSemesters = useCallback((u: React.SetStateAction<Semester[]>) => patch('semesters', u), [patch]);

  /** The cache as it is right now (not as of the last render). */
  const current = useCallback(() => queryClient.getQueryData<AllDataResponse>(queryKeys.allData) ?? EMPTY_ALL_DATA, [queryClient]);
  const replaceAll = useCallback((data: AllDataResponse) => queryClient.setQueryData<AllDataResponse>(queryKeys.allData, data), [queryClient]);
  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.allData }), [queryClient]);

  const data = query.data;
  return {
    query,
    expenses: data?.expenses ?? EMPTY_ALL_DATA.expenses,
    incomes: data?.incomes ?? EMPTY_ALL_DATA.incomes,
    budgets: data?.budgets ?? EMPTY_ALL_DATA.budgets,
    semesters: data?.semesters ?? EMPTY_ALL_DATA.semesters,
    hasServerSnapshot,
    /** Load failed (or never landed): show a banner with Retry, not an empty account. */
    dataLoadFailed: isAuthenticated && !hasServerSnapshot && (query.isError || query.isSuccess),
    /** Nothing loaded at all: skeletons rather than $0 totals. */
    isLoadingData: isAuthenticated && (query.isPending || (!hasServerSnapshot && !data)),
    refuseUntilLoaded,
    patch,
    setExpenses,
    setIncomes,
    setBudgets,
    setSemesters,
    current,
    replaceAll,
    invalidate,
    semestersDirtyRef,
  };
};

export type AllData = ReturnType<typeof useAllData>;
