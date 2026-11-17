import { useCallback, useEffect, useRef, useState } from 'react';
import { allPendingExpenses, countPendingExpenses, removePendingExpense, type PendingExpense } from '../utils/offlineQueue';

interface Options {
  /** The signed-in user (session email), or null when signed out. The queue
   *  never flushes without an owner: replaying while signed out returns 401s,
   *  and replaying for someone else would file the expenses under their account. */
  ownerId: string | null;
  /** Replay a single queued item (e.g. POST it to the server). */
  process: (item: PendingExpense) => Promise<void>;
  /** Called once after a flush actually synced ≥1 item (e.g. refetch data). */
  onSynced: () => void;
  /** The server rejected an item as invalid and it was removed from the queue. */
  onDropped?: (item: PendingExpense, message: string) => void;
}

// Statuses that mean "this payload will never be accepted". Everything else —
// offline, 5xx, 429, and auth (401/403/419: the session expired or the CSRF
// token rotated) — stops the flush and keeps the items for the next attempt.
const PERMANENT_STATUSES = new Set([400, 404, 409, 413, 422]);

// One flush at a time across tabs: two tabs replaying the same IndexedDB queue
// would each POST every item. Falls back to running directly where the Web
// Locks API is unavailable (the server's per-key lock still dedupes).
const withCrossTabLock = async (fn: () => Promise<void>): Promise<void> => {
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
    await navigator.locks.request('orbit-offline-flush', { ifAvailable: true }, async (lock) => {
      if (lock) await fn(); // null = another tab is flushing; it will handle the queue
    });
    return;
  }
  await fn();
};

/** Tracks online/offline state + the pending-expense queue, and auto-flushes on
 *  reconnect and on sign-in. Failures stop the flush and leave items queued. */
export default function useOfflineQueue({ ownerId, process, onSynced, onDropped }: Options) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // Re-entrancy guard (a ref, not state — state would be a stale closure): the
  // mount effect and the `online` listener can both call flush concurrently.
  // Set before the first await, or both calls pass the check and replay twice.
  const flushing = useRef(false);

  const refreshCount = useCallback(async () => {
    if (!ownerId) { setPendingCount(0); return; }
    try { setPendingCount(await countPendingExpenses(ownerId)); } catch { /* ignore */ }
  }, [ownerId]);

  const flush = useCallback(async () => {
    if (!ownerId || !navigator.onLine || flushing.current) return;
    flushing.current = true;
    let synced = 0;
    try {
      await withCrossTabLock(async () => {
        const items = await allPendingExpenses(ownerId);
        if (items.length === 0) return;
        setSyncing(true);
        for (const item of items) {
          try {
            await process(item);
            await removePendingExpense(item.clientId);
            synced++;
          } catch (err) {
            const { status, message } = (err ?? {}) as { status?: number; message?: string };
            if (typeof status === 'number' && PERMANENT_STATUSES.has(status)) {
              // A payload the server will never accept would block every later
              // item forever, so drop it — and tell the user which one.
              await removePendingExpense(item.clientId).catch(() => undefined);
              onDropped?.(item, message || `rejected (${status})`);
              continue;
            }
            break;
          }
        }
      });
    } catch {
      // IndexedDB unavailable — nothing to replay.
    } finally {
      flushing.current = false;
      setSyncing(false);
      await refreshCount();
      if (synced > 0) onSynced();
    }
  }, [ownerId, process, onSynced, onDropped, refreshCount]);

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); void flush(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Also runs when ownerId changes, so signing in replays that user's queue.
    void refreshCount();
    void flush();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush, refreshCount]);

  return { isOnline, pendingCount, syncing, refreshCount, flush };
}
