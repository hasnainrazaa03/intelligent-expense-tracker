import { useCallback, useRef, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';

export const UNDO_WINDOW_MS = 5000;
// The toast must outlive the deletion window, or the UNDO button can vanish at
// the exact instant the delete fires (CMP-M19).
const TOAST_DURATION_MS = UNDO_WINDOW_MS + 600;

// Pending deletes live at module level, not in the list component. They used to
// be timers owned by ExpenseList/IncomeList and cleared on unmount, so switching
// tabs within the undo window silently cancelled a delete the toast had just
// called "scheduled". The delete handler (App's) outlives the list, so firing
// after the list is gone is fine.
interface PendingDelete {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<void>;
  firing: boolean;
}
const pending = new Map<string, PendingDelete>();

// A tiny external store so lists can hide rows while their delete is pending.
let pendingIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const emit = () => {
  pendingIds = new Set(pending.keys());
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const fire = (id: string) => {
  const entry = pending.get(id);
  if (!entry || entry.firing) return;
  entry.firing = true;
  clearTimeout(entry.timer);
  void entry.run();
};

/** Run every pending delete now instead of when its timer ends. */
export const flushPendingDeletes = () => {
  // Snapshot the ids first: fire() removes each entry from `pending`.
  for (const id of Array.from(pending.keys())) fire(id);
};

// A hidden or closing page may never get its timers back (mobile browsers
// discard background tabs), so commit pending deletes when the page goes away.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingDeletes);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingDeletes();
  });
}

/** Ids whose delete is scheduled or in flight; lists hide these rows. */
export const usePendingDeleteIds = (): ReadonlySet<string> =>
  useSyncExternalStore(subscribe, () => pendingIds, () => pendingIds);

/**
 * Schedules a delete after a short undo window and shows an UNDO toast. Shared by
 * ExpenseList and IncomeList:
 * - the delete survives the list unmounting (tab switches) and runs early if
 *   the page is hidden or closed;
 * - the row is hidden at once and comes back on UNDO (or if the delete fails);
 * - the toast outlives the window;
 * - deletions are keyed by id, so a second delete doesn't silently no-op.
 */
export default function useUndoableDelete(onDelete: (id: string) => Promise<void> | void) {
  // The latest handler, so a delete that fires after a re-render (or after the
  // list unmounted) uses current state rather than a stale closure.
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  return useCallback((id: string, message = 'Scheduled for deletion.') => {
    // Collapse a re-scheduled delete of the same id.
    const existing = pending.get(id);
    if (existing?.firing) return;
    if (existing) clearTimeout(existing.timer);

    const handler = onDeleteRef;
    const entry: PendingDelete = {
      firing: false,
      timer: setTimeout(() => fire(id), UNDO_WINDOW_MS),
      run: async () => {
        try {
          await handler.current(id);
        } catch {
          // Errors are surfaced by the caller's onDelete (toasts); nothing to do here.
        } finally {
          // Keep the row hidden until the delete settles, so it doesn't flash
          // back in before the data update removes it (or reappears on failure).
          if (pending.get(id) === entry) pending.delete(id);
          emit();
        }
      },
    };
    pending.set(id, entry);
    emit();

    toast(
      (t) => (
        <div className="font-mono text-xs uppercase flex items-center gap-2">
          <span>{message}</span>
          <button
            onClick={() => {
              const active = pending.get(id);
              if (active && !active.firing) {
                clearTimeout(active.timer);
                pending.delete(id);
                emit();
              }
              toast.dismiss(t.id);
            }}
            className="border border-white px-2 py-0.5 font-bold"
          >
            UNDO
          </button>
        </div>
      ),
      { duration: TOAST_DURATION_MS }
    );
  }, []);
}
