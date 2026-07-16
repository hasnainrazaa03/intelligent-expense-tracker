import { useCallback, useEffect, useState } from 'react';
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

  const refreshCount = useCallback(async () => {
    try { setPendingCount(await countPendingExpenses()); } catch { /* ignore */ }
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    let items: PendingExpense[] = [];
    try { items = await allPendingExpenses(); } catch { return; }
    if (items.length === 0) return;

    setSyncing(true);
    let synced = 0;
    for (const item of items) {
      try {
        await process(item);
        await removePendingExpense(item.clientId);
        synced++;
      } catch {
        break; // stop on first failure; retry on the next online event
      }
    }
    setSyncing(false);
    await refreshCount();
    if (synced > 0) onSynced();
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
