import { QueryClient } from '@tanstack/react-query';

/**
 * Single QueryClient for the app. Replaces the hand-rolled 15s response cache /
 * in-flight dedupe in services/api.ts with React Query's cache, which is keyed
 * per query (not by a constant string) — closing the cross-user cache bug
 * (APP-M6) where a stale entry could survive a failed logout.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000, // matches the previous read-cache TTL
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Query keys, centralized so hooks and manual cache patches stay in sync. */
export const queryKeys = {
  allData: ['allData'] as const,
  session: ['session'] as const,
};
