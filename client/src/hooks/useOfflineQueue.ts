import { useCallback, useEffect, useRef, useState } from 'react';
import { allPendingExpenses, countPendingExpenses, removePendingExpense, type PendingExpense } from '../utils/offlineQueue';

interface Options {
  /** Replay a single queued item (e.g. POST it to the server). */
  process: (item: PendingExpense) => Promise<void>;
  /** Called once after a flush actually synced ≥1 item (e.g. refetch data). */
  onSynced: () => void;
}

/** Tracks online/offline state + the pending-expense queue, and auto-flushes on
 *  reconnect. Failures stop the flush and leave items queued to retry later. */
export default function useOfflineQueue({ process, onSynced }: Options) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // Re-entrancy guard (a ref, not state — state would be a stale closure): the
  // mount effect and the `online` listener can both call flush concurrently, and
  // without this each would replay every item → duplicate creates.
  const flushing = useRef(false);

  const refreshCount = useCallback(async () => {
    try { setPendingCount(await countPendingExpenses()); } catch { /* ignore */ }
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine || flushing.current) return;
    let items: PendingExpense[] = [];
    try { items = await allPendingExpenses(); } catch { return; }
    if (items.length === 0) return;

    flushing.current = true;
    setSyncing(true);
    let synced = 0;
    try {
      for (const item of items) {
        try {
          await process(item);
          await removePendingExpense(item.clientId);
          synced++;
        } catch (err) {
          const status = (err as { status?: number })?.status;
          // Permanent client error (bad payload) → drop the poison item so it
          // can't block every later queued expense forever. Transient
          // (offline/5xx/429) → stop and retry on the next reconnect.
          if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
            await removePendingExpense(item.clientId).catch(() => undefined);
            continue;
          }
          break;
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
      await refreshCount();
      if (synced > 0) onSynced();
    }
  }, [process, onSynced, refreshCount]);

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); void flush(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    void refreshCount();
    void flush();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush, refreshCount]);

  return { isOnline, pendingCount, syncing, refreshCount, flush };
}
